
-- Status enum for ecocash sessions
DO $$ BEGIN
  CREATE TYPE public.ecocash_session_status AS ENUM ('open','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ecocash_sessions table
CREATE TABLE IF NOT EXISTS public.ecocash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid,
  session_code text NOT NULL DEFAULT (('EC-' || to_char(now(),'YYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::text,1,4))),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_float_amount numeric(14,2) NOT NULL,
  opened_device text,
  opened_ip text,
  closed_at timestamptz,
  closing_cash_at_hand numeric(14,2),
  physical_usd numeric(14,2),
  expected_usd numeric(14,2),
  variance_usd numeric(14,2),
  variance_reason text,
  closed_device text,
  closed_ip text,
  status public.ecocash_session_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ecocash_sessions_one_open_per_user
  ON public.ecocash_sessions(user_id) WHERE status = 'open';

ALTER TABLE public.ecocash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ecocash_sessions_read ON public.ecocash_sessions;
CREATE POLICY ecocash_sessions_read ON public.ecocash_sessions
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'finance_manager')
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.ecocash_sessions;

-- Open ecocash day RPC
CREATE OR REPLACE FUNCTION public.open_ecocash_day(
  _float numeric, _branch uuid, _device text, _ip text DEFAULT NULL
) RETURNS public.ecocash_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_row public.ecocash_sessions; v_ready boolean;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _float IS NULL OR _float < 0 THEN RAISE EXCEPTION 'Invalid float amount'; END IF;

  IF EXISTS (SELECT 1 FROM public.teller_sessions WHERE user_id = v_caller AND status='open') THEN
    RAISE EXCEPTION 'A standard teller day is already open. Close it before opening an EcoCash day.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ecocash_sessions WHERE user_id = v_caller AND status='open') THEN
    RAISE EXCEPTION 'An EcoCash day is already open';
  END IF;

  SELECT ready_to_open_day INTO v_ready FROM public.profiles WHERE user_id = v_caller;
  IF COALESCE(v_ready,false) = false AND NOT public.has_role(v_caller,'admin') THEN
    RAISE EXCEPTION 'Float has not been approved yet';
  END IF;

  INSERT INTO public.ecocash_sessions(user_id, branch_id, opened_float_amount, opened_device, opened_ip)
    VALUES (v_caller, _branch, _float, _device, _ip)
    RETURNING * INTO v_row;

  UPDATE public.profiles SET day_open = true WHERE user_id = v_caller;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, branch_id, device_ip)
    VALUES (v_caller,'open_ecocash_day','ecocash_sessions', v_row.id,
            jsonb_build_object('session_code', v_row.session_code,'device',_device,'float',_float),
            'ecocash_day', _float, _branch, _ip);
  RETURN v_row;
END $$;

-- Close ecocash day RPC
CREATE OR REPLACE FUNCTION public.close_ecocash_day(
  _physical_usd numeric, _expected_usd numeric,
  _variance_reason text, _device text, _ip text DEFAULT NULL
) RETURNS public.ecocash_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_row public.ecocash_sessions; v_var numeric;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.ecocash_sessions
    WHERE user_id = v_caller AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open EcoCash day to close'; END IF;

  v_var := COALESCE(_physical_usd,0) - COALESCE(_expected_usd,0);
  IF abs(v_var) > 0.005 AND COALESCE(trim(_variance_reason),'') = '' THEN
    RAISE EXCEPTION 'Variance reason is required when physical count does not match expected balance';
  END IF;

  IF EXISTS (SELECT 1 FROM public.teller_transfers
              WHERE (requesting_user_id = v_caller OR sending_user_id = v_caller)
                AND status='pending') THEN
    RAISE EXCEPTION 'Resolve all pending teller transfers before closing';
  END IF;

  UPDATE public.ecocash_sessions
    SET status='closed', closed_at=now(),
        physical_usd=_physical_usd, expected_usd=_expected_usd,
        variance_usd=v_var, variance_reason=NULLIF(trim(_variance_reason),''),
        closing_cash_at_hand=_physical_usd,
        closed_device=_device, closed_ip=_ip
    WHERE id = v_row.id RETURNING * INTO v_row;

  UPDATE public.profiles SET day_open=false, ready_to_open_day=false WHERE user_id = v_caller;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, branch_id, device_ip)
    VALUES (v_caller,'close_ecocash_day','ecocash_sessions', v_row.id,
            jsonb_build_object(
              'session_code',v_row.session_code,'device',_device,
              'physical_usd',_physical_usd,'expected_usd',_expected_usd,
              'variance_usd',v_var,'reason',_variance_reason),
            'ecocash_day', _physical_usd, v_row.branch_id, _ip);
  RETURN v_row;
END $$;

-- Update open_teller_day to refuse if ecocash day is open
CREATE OR REPLACE FUNCTION public.open_teller_day(_float numeric, _branch uuid, _device text, _ip text DEFAULT NULL::text)
 RETURNS teller_sessions
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_caller uuid := auth.uid(); v_row public.teller_sessions; v_ready boolean;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if _float is null or _float < 0 then raise exception 'Invalid float amount'; end if;
  if exists (select 1 from public.teller_sessions where user_id = v_caller and status = 'open') then
    raise exception 'An operational day is already open';
  end if;
  if exists (select 1 from public.ecocash_sessions where user_id = v_caller and status='open') then
    raise exception 'An EcoCash day is already open. Close it before opening a standard day.';
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
end $function$;

-- Update request_teller_transfer to accept ecocash open day
CREATE OR REPLACE FUNCTION public.request_teller_transfer(_sending_user uuid, _amount numeric, _reason text, _device text, _ip text DEFAULT NULL::text)
 RETURNS teller_transfers
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_caller uuid := auth.uid(); v_row public.teller_transfers; v_branch uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _sending_user IS NULL OR _sending_user = v_caller THEN RAISE EXCEPTION 'Invalid sending teller'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.teller_sessions WHERE user_id = v_caller AND status='open')
    OR EXISTS (SELECT 1 FROM public.ecocash_sessions WHERE user_id = v_caller AND status='open')
  ) THEN
    RAISE EXCEPTION 'Your operational day is not open';
  END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.teller_sessions WHERE user_id = _sending_user AND status='open')
    OR EXISTS (SELECT 1 FROM public.ecocash_sessions WHERE user_id = _sending_user AND status='open')
  ) THEN
    RAISE EXCEPTION 'Sending teller does not have an open day';
  END IF;

  SELECT branch_id INTO v_branch FROM public.profiles WHERE user_id = v_caller;

  INSERT INTO public.teller_transfers(
    requesting_user_id, sending_user_id, amount, reason, branch_id,
    request_device, request_ip
  ) VALUES (
    v_caller, _sending_user, _amount, NULLIF(trim(_reason),''), v_branch,
    _device, _ip
  ) RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, target_user_id, branch_id, device_ip)
  VALUES (v_caller,'transfer_request','teller_transfers', v_row.id,
          jsonb_build_object('reference',v_row.reference_code,'amount',_amount,'reason',_reason,'device',_device),
          'teller_transfer', _amount, _sending_user, v_branch, _ip);

  RETURN v_row;
END $function$;

-- Update approve_teller_transfer to accept ecocash open day
CREATE OR REPLACE FUNCTION public.approve_teller_transfer(_id uuid, _device text, _ip text DEFAULT NULL::text)
 RETURNS teller_transfers
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.teller_transfers;
  v_sender_balance numeric;
  v_sender_uit uuid;
  v_receiver_uit uuid;
  v_note text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.teller_transfers WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Transfer already %', v_row.status; END IF;
  IF v_row.sending_user_id <> v_caller THEN RAISE EXCEPTION 'Only the sending teller can approve'; END IF;
  IF v_row.requesting_user_id = v_caller THEN RAISE EXCEPTION 'Cannot approve your own request'; END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.teller_sessions WHERE user_id = v_caller AND status='open')
    OR EXISTS (SELECT 1 FROM public.ecocash_sessions WHERE user_id = v_caller AND status='open')
  ) THEN
    RAISE EXCEPTION 'Your operational day is not open';
  END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.teller_sessions WHERE user_id = v_row.requesting_user_id AND status='open')
    OR EXISTS (SELECT 1 FROM public.ecocash_sessions WHERE user_id = v_row.requesting_user_id AND status='open')
  ) THEN
    RAISE EXCEPTION 'Requesting teller does not have an open day';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN kind='inflow' THEN amount ELSE -amount END),0)
    INTO v_sender_balance
    FROM public.user_internal_transactions
    WHERE user_id = v_caller;

  IF v_sender_balance < v_row.amount THEN
    RAISE EXCEPTION 'Insufficient balance: available %, requested %', v_sender_balance, v_row.amount;
  END IF;

  v_note := 'Teller Transfer ' || v_row.reference_code ||
            COALESCE(' · ' || v_row.reason,'');

  INSERT INTO public.user_internal_transactions(user_id, kind, category, amount, created_by_user_id, notes)
  VALUES (v_caller, 'outflow', 'teller_transfer_sent', v_row.amount, v_caller, v_note)
  RETURNING id INTO v_sender_uit;

  INSERT INTO public.user_internal_transactions(user_id, kind, category, amount, created_by_user_id, notes)
  VALUES (v_row.requesting_user_id, 'inflow', 'teller_transfer_received', v_row.amount, v_caller, v_note)
  RETURNING id INTO v_receiver_uit;

  UPDATE public.teller_transfers
     SET status = 'approved',
         approved_at = now(),
         approval_device = _device,
         approval_ip = _ip,
         sender_uit_id = v_sender_uit,
         receiver_uit_id = v_receiver_uit
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, target_user_id, branch_id, device_ip)
  VALUES (v_caller,'transfer_approve','teller_transfers', v_row.id,
          jsonb_build_object('reference',v_row.reference_code,'amount',v_row.amount,
                             'sender_uit',v_sender_uit,'receiver_uit',v_receiver_uit,'device',_device),
          'teller_transfer', v_row.amount, v_row.requesting_user_id, v_row.branch_id, _ip);

  RETURN v_row;
END $function$;
