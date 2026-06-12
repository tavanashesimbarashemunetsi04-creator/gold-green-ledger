-- Daily Teller Role Assignment
DO $$ BEGIN
  CREATE TYPE public.daily_teller_role AS ENUM
    ('Ecocash_Teller','Agency_Banking_Teller','Dual_Role_Teller');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add column to float_assignments (nullable for legacy)
ALTER TABLE public.float_assignments
  ADD COLUMN IF NOT EXISTS assigned_role public.daily_teller_role;

-- Daily role assignments table
CREATE TABLE IF NOT EXISTS public.daily_teller_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teller_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  float_assignment_id uuid REFERENCES public.float_assignments(id) ON DELETE SET NULL,
  assigned_role public.daily_teller_role NOT NULL,
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  business_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_daily_role_active
  ON public.daily_teller_assignments(teller_user_id, business_date)
  WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_teller_assignments TO authenticated;
GRANT ALL ON public.daily_teller_assignments TO service_role;

ALTER TABLE public.daily_teller_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dta_self_read" ON public.daily_teller_assignments;
CREATE POLICY "dta_self_read" ON public.daily_teller_assignments
  FOR SELECT TO authenticated
  USING (
    teller_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finance_manager')
    OR public.has_role(auth.uid(), 'manager')
  );

DROP POLICY IF EXISTS "dta_admin_write" ON public.daily_teller_assignments;
CREATE POLICY "dta_admin_write" ON public.daily_teller_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance_manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance_manager'));

-- RPC: assign / change daily role
CREATE OR REPLACE FUNCTION public.assign_daily_role(
  _teller_user_id uuid,
  _role public.daily_teller_role,
  _branch_id uuid DEFAULT NULL,
  _float_assignment_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS public.daily_teller_assignments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_row public.daily_teller_assignments;
  v_tx_count int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'finance_manager')) THEN
    RAISE EXCEPTION 'Only admin or finance manager can assign daily role';
  END IF;

  -- If active row exists for today, ensure no transactions
  IF EXISTS (SELECT 1 FROM public.daily_teller_assignments
             WHERE teller_user_id=_teller_user_id AND business_date=v_today AND status='active') THEN
    SELECT
      (SELECT count(*) FROM public.payments WHERE created_by_user_id=_teller_user_id AND created_at::date=v_today)
      + (SELECT count(*) FROM public.cash_advance WHERE created_by_user_id=_teller_user_id AND created_at::date=v_today)
      + (SELECT count(*) FROM public.cash_swipes WHERE created_by_user_id=_teller_user_id AND created_at::date=v_today)
      + (SELECT count(*) FROM public.ecocash_transactions WHERE created_by_user_id=_teller_user_id AND created_at::date=v_today)
      + (SELECT count(*) FROM public.user_internal_transactions WHERE user_id=_teller_user_id AND created_at::date=v_today)
      INTO v_tx_count;

    IF v_tx_count > 0 THEN
      RAISE EXCEPTION 'Role assignment cannot be changed after transactions have been recorded.';
    END IF;

    UPDATE public.daily_teller_assignments
       SET status='superseded'
     WHERE teller_user_id=_teller_user_id AND business_date=v_today AND status='active';
  END IF;

  INSERT INTO public.daily_teller_assignments
    (teller_user_id, branch_id, float_assignment_id, assigned_role, assigned_by, business_date, notes)
  VALUES
    (_teller_user_id, _branch_id, _float_assignment_id, _role, v_caller, v_today, _notes)
  RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, target_user_id, branch_id)
  VALUES (v_caller, 'daily_role_assigned', 'daily_teller_assignments', v_row.id,
          jsonb_build_object('role', _role, 'business_date', v_today, 'float_assignment_id', _float_assignment_id),
          'daily_role', _teller_user_id, _branch_id);

  RETURN v_row;
END $$;

-- Patch approve_float_assignment to mirror role into daily_teller_assignments
CREATE OR REPLACE FUNCTION public.approve_float_assignment(_assignment_id uuid)
 RETURNS float_assignments
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_caller uuid := auth.uid(); v_row public.float_assignments; v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.float_assignments WHERE id=_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found'; END IF;
  IF v_row.assigned_to_user_id <> v_caller THEN RAISE EXCEPTION 'Only the assigned teller can approve'; END IF;
  IF v_row.assigned_by_user_id = v_caller THEN RAISE EXCEPTION 'Cannot approve your own assignment'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Assignment already %', v_row.status; END IF;

  INSERT INTO public.user_internal_transactions(user_id,kind,category,amount,related_float_assignment_id,created_by_user_id)
    VALUES (v_row.assigned_to_user_id,'inflow','opening_float',v_row.amount,v_row.id,v_caller);
  INSERT INTO public.user_internal_transactions(user_id,kind,category,amount,related_float_assignment_id,created_by_user_id)
    VALUES (v_row.assigned_by_user_id,'outflow','float_assignment',v_row.amount,v_row.id,v_caller);

  UPDATE public.float_assignments SET status='approved', approved_at=now() WHERE id=v_row.id RETURNING * INTO v_row;
  UPDATE public.profiles SET ready_to_open_day=true WHERE user_id=v_row.assigned_to_user_id;

  -- Mirror daily role
  IF v_row.assigned_role IS NOT NULL THEN
    -- Only insert if no active row for today
    IF NOT EXISTS (SELECT 1 FROM public.daily_teller_assignments
                   WHERE teller_user_id=v_row.assigned_to_user_id AND business_date=v_today AND status='active') THEN
      INSERT INTO public.daily_teller_assignments
        (teller_user_id, branch_id, float_assignment_id, assigned_role, assigned_by, business_date)
      VALUES
        (v_row.assigned_to_user_id, v_row.branch_id, v_row.id, v_row.assigned_role, v_row.assigned_by_user_id, v_today);
    END IF;
  END IF;

  INSERT INTO public.audit_logs(actor_user_id,action,table_name,record_id,new_data,module,amount,target_user_id,branch_id)
    VALUES (v_caller,'float_approve','float_assignments',v_row.id,
            jsonb_build_object('amount',v_row.amount,'role',v_row.assigned_role),'float',v_row.amount,v_row.assigned_by_user_id,v_row.branch_id);
  RETURN v_row;
END $function$;

-- Patch open_teller_day: require Agency_Banking_Teller or Dual_Role_Teller
CREATE OR REPLACE FUNCTION public.open_teller_day(_float numeric, _branch uuid, _device text, _ip text DEFAULT NULL::text)
 RETURNS teller_sessions
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_caller uuid := auth.uid(); v_row public.teller_sessions; v_ready boolean;
  v_role public.daily_teller_role; v_today date := (now() AT TIME ZONE 'UTC')::date;
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

  -- Check daily role unless admin
  if not public.has_role(v_caller,'admin') then
    select assigned_role into v_role
      from public.daily_teller_assignments
     where teller_user_id=v_caller and business_date=v_today and status='active'
     limit 1;
    if v_role is null then
      raise exception 'No daily role assigned for today';
    end if;
    if v_role not in ('Agency_Banking_Teller','Dual_Role_Teller') then
      raise exception 'Your daily role does not permit opening an Agency Banking day';
    end if;
    if v_role = 'Agency_Banking_Teller' and exists (
      select 1 from public.ecocash_sessions where user_id = v_caller and status='open'
    ) then
      raise exception 'An EcoCash day is already open. Close it first.';
    end if;
  end if;

  insert into public.teller_sessions(user_id, branch_id, opened_float_amount, opened_device, opened_ip)
    values (v_caller, _branch, _float, _device, _ip)
    returning * into v_row;

  update public.profiles set day_open = true where user_id = v_caller;

  insert into public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, branch_id)
    values (v_caller,'open_day','teller_sessions', v_row.id,
            jsonb_build_object('session_code', v_row.session_code, 'device', _device, 'float', _float, 'role', v_role),
            'teller_day', _float, _branch);
  return v_row;
end $function$;

-- Patch open_ecocash_day similarly
CREATE OR REPLACE FUNCTION public.open_ecocash_day(_float numeric, _branch uuid, _device text, _ip text DEFAULT NULL::text)
 RETURNS ecocash_sessions
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_caller uuid := auth.uid(); v_row public.ecocash_sessions; v_ready boolean;
  v_role public.daily_teller_role; v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _float IS NULL OR _float < 0 THEN RAISE EXCEPTION 'Invalid float amount'; END IF;

  IF EXISTS (SELECT 1 FROM public.ecocash_sessions WHERE user_id = v_caller AND status='open') THEN
    RAISE EXCEPTION 'An EcoCash day is already open';
  END IF;

  SELECT ready_to_open_day INTO v_ready FROM public.profiles WHERE user_id = v_caller;
  IF COALESCE(v_ready,false) = false AND NOT public.has_role(v_caller,'admin') THEN
    RAISE EXCEPTION 'Float has not been approved yet';
  END IF;

  IF NOT public.has_role(v_caller,'admin') THEN
    SELECT assigned_role INTO v_role
      FROM public.daily_teller_assignments
     WHERE teller_user_id=v_caller AND business_date=v_today AND status='active'
     LIMIT 1;
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'No daily role assigned for today';
    END IF;
    IF v_role NOT IN ('Ecocash_Teller','Dual_Role_Teller') THEN
      RAISE EXCEPTION 'Your daily role does not permit opening an EcoCash day';
    END IF;
    IF v_role = 'Ecocash_Teller' AND EXISTS (
      SELECT 1 FROM public.teller_sessions WHERE user_id = v_caller AND status='open'
    ) THEN
      RAISE EXCEPTION 'A standard teller day is already open. Close it first.';
    END IF;
  END IF;

  INSERT INTO public.ecocash_sessions(user_id, branch_id, opened_float_amount, opened_device, opened_ip)
    VALUES (v_caller, _branch, _float, _device, _ip)
    RETURNING * INTO v_row;

  UPDATE public.profiles SET day_open = true WHERE user_id = v_caller;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, branch_id, device_ip)
    VALUES (v_caller,'open_ecocash_day','ecocash_sessions', v_row.id,
            jsonb_build_object('session_code', v_row.session_code,'device',_device,'float',_float,'role',v_role),
            'ecocash_day', _float, _branch, _ip);
  RETURN v_row;
END $function$;
