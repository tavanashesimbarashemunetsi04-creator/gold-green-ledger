
DO $$ BEGIN CREATE TYPE public.float_assignment_status AS ENUM ('pending','approved','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.internal_tx_kind AS ENUM ('inflow','outflow'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.internal_tx_category AS ENUM ('opening_float','float_assignment','self_float','adjustment','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.float_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_by_user_id uuid NOT NULL,
  assigned_to_user_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  branch_id uuid REFERENCES public.branches(id),
  reference text,
  notes text,
  status public.float_assignment_status NOT NULL DEFAULT 'pending',
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_float_assignments_to ON public.float_assignments(assigned_to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_float_assignments_by ON public.float_assignments(assigned_by_user_id, status);

ALTER TABLE public.float_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "float_assign_read" ON public.float_assignments FOR SELECT TO authenticated
  USING (auth.uid() = assigned_by_user_id OR auth.uid() = assigned_to_user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance_manager'));
CREATE POLICY "float_assign_insert" ON public.float_assignments FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance_manager')) AND assigned_by_user_id = auth.uid() AND assigned_by_user_id <> assigned_to_user_id);

CREATE TABLE IF NOT EXISTS public.user_internal_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.internal_tx_kind NOT NULL,
  category public.internal_tx_category NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  related_float_assignment_id uuid REFERENCES public.float_assignments(id) ON DELETE SET NULL,
  created_by_user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_uit_user ON public.user_internal_transactions(user_id, created_at DESC);
ALTER TABLE public.user_internal_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uit_read" ON public.user_internal_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance_manager') OR public.has_role(auth.uid(),'manager'));

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS target_user_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS device_ip text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ready_to_open_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS day_open boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.user_float_balances AS
SELECT user_id, COALESCE(SUM(CASE WHEN kind='inflow' THEN amount ELSE -amount END),0)::numeric(14,2) AS balance
FROM public.user_internal_transactions GROUP BY user_id;

CREATE OR REPLACE FUNCTION public.approve_float_assignment(_assignment_id uuid)
RETURNS public.float_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_row public.float_assignments;
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

  INSERT INTO public.audit_logs(actor_user_id,action,table_name,record_id,new_data,module,amount,target_user_id,branch_id)
    VALUES (v_caller,'float_approve','float_assignments',v_row.id,jsonb_build_object('amount',v_row.amount),'float',v_row.amount,v_row.assigned_by_user_id,v_row.branch_id);
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.reject_float_assignment(_assignment_id uuid,_reason text)
RETURNS public.float_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_row public.float_assignments;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.float_assignments WHERE id=_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found'; END IF;
  IF v_row.assigned_to_user_id <> v_caller THEN RAISE EXCEPTION 'Only the assigned teller can reject'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Assignment already %', v_row.status; END IF;
  UPDATE public.float_assignments SET status='rejected', rejected_at=now(), rejection_reason=_reason WHERE id=v_row.id RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(actor_user_id,action,table_name,record_id,new_data,module,amount,target_user_id,branch_id)
    VALUES (v_caller,'float_reject','float_assignments',v_row.id,jsonb_build_object('reason',_reason),'float',v_row.amount,v_row.assigned_by_user_id,v_row.branch_id);
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.self_assign_float(_amount numeric,_branch_id uuid,_reference text)
RETURNS public.user_internal_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_row public.user_internal_transactions;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_caller,'finance_manager') OR public.has_role(v_caller,'admin')) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  INSERT INTO public.user_internal_transactions(user_id,kind,category,amount,created_by_user_id,notes)
    VALUES (v_caller,'inflow','self_float',_amount,v_caller,_reference) RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(actor_user_id,action,table_name,record_id,new_data,module,amount,target_user_id,branch_id)
    VALUES (v_caller,'self_float','user_internal_transactions',v_row.id,jsonb_build_object('reference',_reference),'float',_amount,v_caller,_branch_id);
  RETURN v_row;
END $$;
