
DROP FUNCTION IF EXISTS public.self_assign_float(numeric, uuid, text);

-- 1. Categories enum
DO $$ BEGIN
  CREATE TYPE public.finance_tx_category AS ENUM (
    'cash_update','opening_finance_float','float_issued_to_teller',
    'float_received_from_teller','adjustment','self_float_legacy'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.internal_tx_kind NOT NULL,
  category public.finance_tx_category NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  reference text,
  notes text,
  related_float_assignment_id uuid REFERENCES public.float_assignments(id) ON DELETE SET NULL,
  related_uit_id uuid,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ft_user ON public.finance_transactions(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.finance_transactions TO authenticated;
GRANT ALL ON public.finance_transactions TO service_role;

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ft_read ON public.finance_transactions;
CREATE POLICY ft_read ON public.finance_transactions FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'finance_manager')
  );

DROP POLICY IF EXISTS ft_insert ON public.finance_transactions;
CREATE POLICY ft_insert ON public.finance_transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'finance_manager')
  );

CREATE OR REPLACE VIEW public.finance_balances
WITH (security_invoker = on) AS
SELECT user_id,
  COALESCE(SUM(CASE WHEN kind='inflow' THEN amount ELSE -amount END),0)::numeric(14,2) AS balance
FROM public.finance_transactions
GROUP BY user_id;

GRANT SELECT ON public.finance_balances TO authenticated;

CREATE OR REPLACE FUNCTION public.add_finance_cash(_amount numeric, _reference text, _notes text)
RETURNS public.finance_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_row public.finance_transactions;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_caller,'finance_manager') OR public.has_role(v_caller,'admin')) THEN
    RAISE EXCEPTION 'Only finance managers can update finance cash';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;

  INSERT INTO public.finance_transactions(user_id, kind, category, amount, reference, notes, created_by_user_id)
  VALUES (v_caller,'inflow','cash_update',_amount, NULLIF(trim(_reference),''), NULLIF(trim(_notes),''), v_caller)
  RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, target_user_id)
  VALUES (v_caller,'finance_cash_update','finance_transactions', v_row.id,
          jsonb_build_object('amount',_amount,'reference',_reference,'notes',_notes,
                             'source_ledger','external','destination_ledger','finance'),
          'finance_ledger', _amount, v_caller);
  RETURN v_row;
END $$;

-- Reclassify history
INSERT INTO public.finance_transactions(user_id, kind, category, amount, related_float_assignment_id, created_by_user_id, notes, created_at)
SELECT user_id, 'inflow', 'self_float_legacy', amount, related_float_assignment_id, created_by_user_id, notes, created_at
FROM public.user_internal_transactions WHERE category::text = 'self_float';
DELETE FROM public.user_internal_transactions WHERE category::text = 'self_float';

INSERT INTO public.finance_transactions(user_id, kind, category, amount, related_float_assignment_id, created_by_user_id, notes, created_at)
SELECT user_id, 'outflow', 'float_issued_to_teller', amount, related_float_assignment_id, created_by_user_id, notes, created_at
FROM public.user_internal_transactions WHERE category::text = 'float_assignment';
DELETE FROM public.user_internal_transactions WHERE category::text = 'float_assignment';

CREATE OR REPLACE FUNCTION public.approve_float_assignment(_assignment_id uuid)
 RETURNS float_assignments
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  INSERT INTO public.finance_transactions(user_id,kind,category,amount,related_float_assignment_id,created_by_user_id,notes)
    VALUES (v_row.assigned_by_user_id,'outflow','float_issued_to_teller',v_row.amount,v_row.id,v_caller,
            'Float issued to teller (assignment ' || v_row.id::text || ')');

  UPDATE public.float_assignments SET status='approved', approved_at=now() WHERE id=v_row.id RETURNING * INTO v_row;
  UPDATE public.profiles SET ready_to_open_day=true WHERE user_id=v_row.assigned_to_user_id;

  IF (v_row.assigned_role IS NOT NULL) THEN
    INSERT INTO public.daily_teller_assignments
      (teller_user_id, branch_id, float_assignment_id, assigned_role, assigned_by, business_date)
    VALUES
      (v_row.assigned_to_user_id, v_row.branch_id, v_row.id, v_row.assigned_role::public.daily_role, v_row.assigned_by_user_id, v_today)
    ON CONFLICT (teller_user_id, business_date)
    DO UPDATE SET assigned_role = EXCLUDED.assigned_role,
                  float_assignment_id = EXCLUDED.float_assignment_id;
  END IF;

  INSERT INTO public.audit_logs(actor_user_id,action,table_name,record_id,new_data,module,amount,target_user_id,branch_id)
    VALUES (v_caller,'float_approve','float_assignments',v_row.id,
            jsonb_build_object('amount',v_row.amount,'source_ledger','finance','destination_ledger','teller'),
            'float',v_row.amount,v_row.assigned_by_user_id,v_row.branch_id);
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.self_assign_float(_amount numeric, _branch_id uuid, _reference text)
 RETURNS public.finance_transactions
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_caller uuid := auth.uid(); v_row public.finance_transactions;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_caller,'finance_manager') OR public.has_role(v_caller,'admin')) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  INSERT INTO public.finance_transactions(user_id,kind,category,amount,reference,created_by_user_id)
    VALUES (v_caller,'inflow','adjustment',_amount,_reference,v_caller) RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(actor_user_id,action,table_name,record_id,new_data,module,amount,target_user_id,branch_id)
    VALUES (v_caller,'self_float','finance_transactions',v_row.id,
            jsonb_build_object('reference',_reference,'destination_ledger','finance'),
            'finance_ledger',_amount,v_caller,_branch_id);
  RETURN v_row;
END $$;
