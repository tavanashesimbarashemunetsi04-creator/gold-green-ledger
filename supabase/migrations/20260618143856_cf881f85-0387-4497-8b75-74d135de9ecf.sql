
CREATE OR REPLACE FUNCTION public.close_teller_day(_cash_at_hand numeric, _device text, _ip text DEFAULT NULL::text)
 RETURNS teller_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_caller uuid := auth.uid(); v_row public.teller_sessions; v_balance numeric;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_row from public.teller_sessions where user_id = v_caller and status = 'open' for update;
  if not found then raise exception 'No open operational day to close'; end if;

  -- Compute current cash at hand from lifetime inflows/outflows and zero it out
  select coalesce(sum(case when kind='inflow' then amount else -amount end),0)
    into v_balance
    from public.user_internal_transactions
    where user_id = v_caller;

  if v_balance > 0 then
    insert into public.user_internal_transactions(user_id, kind, category, amount, created_by_user_id, notes)
      values (v_caller, 'outflow', 'end_of_day_cashout', v_balance, v_caller,
              'Cash returned at end of day ' || v_row.session_code);
  end if;

  update public.teller_sessions
    set status='closed', closed_at=now(), closing_cash_at_hand=_cash_at_hand,
        closed_device=_device, closed_ip=_ip
    where id = v_row.id returning * into v_row;

  update public.profiles set day_open = false, ready_to_open_day = false where user_id = v_caller;

  insert into public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, branch_id)
    values (v_caller,'close_day','teller_sessions', v_row.id,
            jsonb_build_object('session_code', v_row.session_code,'device', _device,'cash_at_hand',_cash_at_hand,'cashout_recorded',v_balance),
            'teller_day', _cash_at_hand, v_row.branch_id);
  return v_row;
end $function$;

CREATE OR REPLACE FUNCTION public.close_ecocash_day(_physical_usd numeric, _expected_usd numeric, _variance_reason text, _device text, _ip text DEFAULT NULL::text)
 RETURNS ecocash_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_caller uuid := auth.uid(); v_row public.ecocash_sessions; v_var numeric; v_balance numeric;
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

  SELECT COALESCE(SUM(CASE WHEN kind='inflow' THEN amount ELSE -amount END),0)
    INTO v_balance
    FROM public.user_internal_transactions
    WHERE user_id = v_caller;

  IF v_balance > 0 THEN
    INSERT INTO public.user_internal_transactions(user_id, kind, category, amount, created_by_user_id, notes)
      VALUES (v_caller, 'outflow', 'end_of_day_cashout', v_balance, v_caller,
              'Cash returned at end of EcoCash day ' || v_row.session_code);
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
              'variance_usd',v_var,'reason',_variance_reason,'cashout_recorded',v_balance),
            'ecocash_day', _physical_usd, v_row.branch_id, _ip);
  RETURN v_row;
END $function$;
