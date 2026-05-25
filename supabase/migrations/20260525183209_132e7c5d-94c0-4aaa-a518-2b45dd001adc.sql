
-- Enum
DO $$ BEGIN
  CREATE TYPE public.balancing_status AS ENUM ('pending','in_review','balanced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.teller_balancing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teller_user_id uuid NOT NULL,
  branch_id uuid,
  business_date date NOT NULL,
  teller_session_id uuid,
  ecocash_session_id uuid,
  status public.balancing_status NOT NULL DEFAULT 'pending',
  balanced_by_user_id uuid,
  balanced_at timestamptz,
  manager_comments text,
  expected_usd numeric,
  physical_usd numeric,
  variance_usd numeric,
  reviewed_tx_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teller_user_id, business_date)
);

ALTER TABLE public.teller_balancing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teller_balancing_read ON public.teller_balancing;
CREATE POLICY teller_balancing_read ON public.teller_balancing
  FOR SELECT TO authenticated
  USING (
    auth.uid() = teller_user_id
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'finance_manager')
  );

CREATE TRIGGER teller_balancing_set_updated_at
  BEFORE UPDATE ON public.teller_balancing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.teller_balancing;

-- RPC: save review (in-progress)
CREATE OR REPLACE FUNCTION public.manager_save_review(
  _teller_user_id uuid,
  _business_date date,
  _reviewed_refs jsonb,
  _comments text
) RETURNS public.teller_balancing
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_caller uuid := auth.uid(); v_row public.teller_balancing; v_branch uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_caller,'manager') OR public.has_role(v_caller,'admin')) THEN
    RAISE EXCEPTION 'Only managers can review';
  END IF;

  SELECT branch_id INTO v_branch FROM public.profiles WHERE user_id = _teller_user_id;

  INSERT INTO public.teller_balancing(teller_user_id, business_date, branch_id, status, reviewed_tx_refs, manager_comments)
  VALUES (_teller_user_id, _business_date, v_branch, 'in_review', COALESCE(_reviewed_refs,'[]'::jsonb), NULLIF(trim(_comments),''))
  ON CONFLICT (teller_user_id, business_date) DO UPDATE
    SET reviewed_tx_refs = COALESCE(EXCLUDED.reviewed_tx_refs, public.teller_balancing.reviewed_tx_refs),
        manager_comments = COALESCE(EXCLUDED.manager_comments, public.teller_balancing.manager_comments),
        status = CASE WHEN public.teller_balancing.status = 'balanced' THEN public.teller_balancing.status ELSE 'in_review' END,
        updated_at = now()
  RETURNING * INTO v_row;

  IF v_row.status = 'balanced' THEN
    RAISE EXCEPTION 'Day is already balanced and locked';
  END IF;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, target_user_id, branch_id)
    VALUES (v_caller,'manager_review','teller_balancing', v_row.id,
            jsonb_build_object('refs_count', jsonb_array_length(COALESCE(_reviewed_refs,'[]'::jsonb)),'comments',_comments,'business_date',_business_date),
            'manager_portal', _teller_user_id, v_branch);

  RETURN v_row;
END $fn$;

-- RPC: balance teller (lock)
CREATE OR REPLACE FUNCTION public.manager_balance_teller(
  _teller_user_id uuid,
  _business_date date,
  _physical_usd numeric,
  _expected_usd numeric,
  _comments text,
  _device text,
  _ip text DEFAULT NULL
) RETURNS public.teller_balancing
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_caller uuid := auth.uid(); v_row public.teller_balancing; v_branch uuid; v_var numeric;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_caller,'manager') OR public.has_role(v_caller,'admin')) THEN
    RAISE EXCEPTION 'Only managers can balance';
  END IF;

  v_var := COALESCE(_physical_usd,0) - COALESCE(_expected_usd,0);
  SELECT branch_id INTO v_branch FROM public.profiles WHERE user_id = _teller_user_id;

  INSERT INTO public.teller_balancing(
    teller_user_id, business_date, branch_id, status,
    balanced_by_user_id, balanced_at, manager_comments,
    expected_usd, physical_usd, variance_usd
  ) VALUES (
    _teller_user_id, _business_date, v_branch, 'balanced',
    v_caller, now(), NULLIF(trim(_comments),''),
    _expected_usd, _physical_usd, v_var
  )
  ON CONFLICT (teller_user_id, business_date) DO UPDATE
    SET status = 'balanced',
        balanced_by_user_id = v_caller,
        balanced_at = now(),
        manager_comments = COALESCE(EXCLUDED.manager_comments, public.teller_balancing.manager_comments),
        expected_usd = EXCLUDED.expected_usd,
        physical_usd = EXCLUDED.physical_usd,
        variance_usd = EXCLUDED.variance_usd,
        updated_at = now()
  RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, target_user_id, branch_id, device_ip)
    VALUES (v_caller,'manager_balance','teller_balancing', v_row.id,
            jsonb_build_object('business_date',_business_date,'physical_usd',_physical_usd,'expected_usd',_expected_usd,'variance_usd',v_var,'comments',_comments,'device',_device),
            'manager_portal', _physical_usd, _teller_user_id, v_branch, _ip);

  RETURN v_row;
END $fn$;
