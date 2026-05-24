
-- Enum
do $$ begin
  create type public.teller_session_status as enum ('open','closed');
exception when duplicate_object then null; end $$;

-- Table
create table if not exists public.teller_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  branch_id uuid,
  session_code text not null default ('S-' || to_char(now(),'YYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::text,1,4)),
  opened_at timestamptz not null default now(),
  opened_float_amount numeric not null,
  opened_device text,
  opened_ip text,
  closed_at timestamptz,
  closing_cash_at_hand numeric,
  closed_device text,
  closed_ip text,
  status public.teller_session_status not null default 'open',
  created_at timestamptz not null default now()
);

create unique index if not exists teller_sessions_one_open_per_user
  on public.teller_sessions(user_id) where status = 'open';

create index if not exists teller_sessions_user_idx on public.teller_sessions(user_id, opened_at desc);

alter table public.teller_sessions enable row level security;

drop policy if exists teller_sessions_read on public.teller_sessions;
create policy teller_sessions_read on public.teller_sessions
  for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'finance_manager'));

-- writes only via SECURITY DEFINER RPCs; no insert/update policies

-- Open day RPC
create or replace function public.open_teller_day(_float numeric, _branch uuid, _device text, _ip text default null)
returns public.teller_sessions
language plpgsql security definer set search_path = public
as $$
declare v_caller uuid := auth.uid(); v_row public.teller_sessions; v_ready boolean;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if _float is null or _float < 0 then raise exception 'Invalid float amount'; end if;
  if exists (select 1 from public.teller_sessions where user_id = v_caller and status = 'open') then
    raise exception 'An operational day is already open';
  end if;
  select ready_to_open_day into v_ready from public.profiles where user_id = v_caller;
  if coalesce(v_ready,false) = false and not public.has_role(v_caller,'admin') then
    raise exception 'Float has not been approved yet';
  end if;

  insert into public.teller_sessions(user_id, branch_id, opened_float_amount, opened_device, opened_ip)
    values (v_caller, _branch, _float, _device, _ip)
    returning * into v_row;

  update public.profiles set day_open = true where user_id = v_caller;

  insert into public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, branch_id)
    values (v_caller,'open_day','teller_sessions', v_row.id,
            jsonb_build_object('session_code', v_row.session_code, 'device', _device, 'float', _float),
            'teller_day', _float, _branch);
  return v_row;
end $$;

-- Close day RPC
create or replace function public.close_teller_day(_cash_at_hand numeric, _device text, _ip text default null)
returns public.teller_sessions
language plpgsql security definer set search_path = public
as $$
declare v_caller uuid := auth.uid(); v_row public.teller_sessions;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_row from public.teller_sessions where user_id = v_caller and status = 'open' for update;
  if not found then raise exception 'No open operational day to close'; end if;

  update public.teller_sessions
    set status='closed', closed_at=now(), closing_cash_at_hand=_cash_at_hand,
        closed_device=_device, closed_ip=_ip
    where id = v_row.id returning * into v_row;

  update public.profiles set day_open = false, ready_to_open_day = false where user_id = v_caller;

  insert into public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, branch_id)
    values (v_caller,'close_day','teller_sessions', v_row.id,
            jsonb_build_object('session_code', v_row.session_code,'device', _device,'cash_at_hand',_cash_at_hand),
            'teller_day', _cash_at_hand, v_row.branch_id);
  return v_row;
end $$;

-- Enforcement trigger: block transactions unless day is open
create or replace function public.enforce_day_open()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return new; end if; -- service-role bypass
  if public.has_role(v_uid,'admin') then return new; end if;
  if not exists (select 1 from public.teller_sessions where user_id = v_uid and status='open') then
    raise exception 'Operational day is not open. Open your day before transacting.';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_day_open_payments on public.payments;
create trigger trg_enforce_day_open_payments before insert on public.payments
  for each row execute function public.enforce_day_open();

drop trigger if exists trg_enforce_day_open_cash_swipes on public.cash_swipes;
create trigger trg_enforce_day_open_cash_swipes before insert on public.cash_swipes
  for each row execute function public.enforce_day_open();

drop trigger if exists trg_enforce_day_open_cash_advance on public.cash_advance;
create trigger trg_enforce_day_open_cash_advance before insert on public.cash_advance
  for each row execute function public.enforce_day_open();

drop trigger if exists trg_enforce_day_open_ecocash on public.ecocash_transactions;
create trigger trg_enforce_day_open_ecocash before insert on public.ecocash_transactions
  for each row execute function public.enforce_day_open();

drop trigger if exists trg_enforce_day_open_itx on public.internal_transactions;
create trigger trg_enforce_day_open_itx before insert on public.internal_transactions
  for each row execute function public.enforce_day_open();
