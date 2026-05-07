
DROP VIEW IF EXISTS public.end_day_summary CASCADE;
DROP VIEW IF EXISTS public.failed_transactions CASCADE;
DROP VIEW IF EXISTS public.pending_transactions CASCADE;
DROP VIEW IF EXISTS public.inflows CASCADE;
DROP VIEW IF EXISTS public.outflows CASCADE;
DROP VIEW IF EXISTS public.all_transactions CASCADE;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'teller');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE, code text UNIQUE, location text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  teller_id uuid REFERENCES public.tellers(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  display_name text, email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.current_user_has_any_role(VARIADIC _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = ANY(_roles)) $$;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid, actor_label text,
  action text NOT NULL, table_name text NOT NULL, record_id uuid,
  old_data jsonb, new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON public.audit_logs (table_name, record_id);

CREATE TABLE IF NOT EXISTS public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL, record_id uuid NOT NULL,
  approver_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_label text,
  decision text NOT NULL CHECK (decision IN ('approved','declined','pending')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, record_id, approver_user_id)
);
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_approvals_record ON public.approvals (source, record_id);

CREATE TABLE IF NOT EXISTS public.end_day_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teller_id uuid REFERENCES public.tellers(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  business_date date NOT NULL,
  total_inflow_usd numeric NOT NULL DEFAULT 0,
  total_outflow_usd numeric NOT NULL DEFAULT 0,
  total_inflow_zwg numeric NOT NULL DEFAULT 0,
  total_outflow_zwg numeric NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  pending_count integer NOT NULL DEFAULT 0,
  closed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teller_id, business_date)
);
ALTER TABLE public.end_day_summary ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments     ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.payments     ADD COLUMN IF NOT EXISTS teller_id uuid REFERENCES public.tellers(id);
ALTER TABLE public.cash_swipes  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.cash_swipes  ADD COLUMN IF NOT EXISTS teller_id uuid REFERENCES public.tellers(id);
ALTER TABLE public.cash_advance ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.cash_advance ADD COLUMN IF NOT EXISTS teller_id uuid REFERENCES public.tellers(id);

CREATE INDEX IF NOT EXISTS idx_payments_status      ON public.payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_date        ON public.payments (date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_created_at  ON public.payments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_teller      ON public.payments (teller_id);
CREATE INDEX IF NOT EXISTS idx_payments_branch      ON public.payments (branch_id);
CREATE INDEX IF NOT EXISTS idx_swipes_status        ON public.cash_swipes (status);
CREATE INDEX IF NOT EXISTS idx_swipes_date          ON public.cash_swipes (date DESC);
CREATE INDEX IF NOT EXISTS idx_swipes_created_at    ON public.cash_swipes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swipes_teller        ON public.cash_swipes (teller_id);
CREATE INDEX IF NOT EXISTS idx_advance_status       ON public.cash_advance (status);
CREATE INDEX IF NOT EXISTS idx_advance_date         ON public.cash_advance (date DESC);
CREATE INDEX IF NOT EXISTS idx_advance_created_at   ON public.cash_advance (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_advance_teller       ON public.cash_advance (teller_id);
CREATE INDEX IF NOT EXISTS idx_itx_status           ON public.internal_transactions (status);
CREATE INDEX IF NOT EXISTS idx_itx_date             ON public.internal_transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_itx_init_teller      ON public.internal_transactions (initiating_teller_id);
CREATE INDEX IF NOT EXISTS idx_itx_target_teller    ON public.internal_transactions (target_teller_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email))
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'teller')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.log_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old text; v_new text;
BEGIN
  v_old := COALESCE(OLD.status::text, ''); v_new := COALESCE(NEW.status::text, '');
  IF v_old IS DISTINCT FROM v_new THEN
    INSERT INTO public.audit_logs (actor_user_id, action, table_name, record_id, old_data, new_data)
    VALUES (auth.uid(), 'status_change', TG_TABLE_NAME, NEW.id,
            jsonb_build_object('status', v_old), jsonb_build_object('status', v_new));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payments_audit_status ON public.payments;
CREATE TRIGGER payments_audit_status AFTER UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.log_status_change();
DROP TRIGGER IF EXISTS swipes_audit_status ON public.cash_swipes;
CREATE TRIGGER swipes_audit_status AFTER UPDATE ON public.cash_swipes FOR EACH ROW EXECUTE FUNCTION public.log_status_change();
DROP TRIGGER IF EXISTS advance_audit_status ON public.cash_advance;
CREATE TRIGGER advance_audit_status AFTER UPDATE ON public.cash_advance FOR EACH ROW EXECUTE FUNCTION public.log_status_change();
DROP TRIGGER IF EXISTS itx_audit_status ON public.internal_transactions;
CREATE TRIGGER itx_audit_status AFTER UPDATE ON public.internal_transactions FOR EACH ROW EXECUTE FUNCTION public.log_status_change();

CREATE OR REPLACE FUNCTION public.guard_finalized_tx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status::text IN ('successful','approved','declined','failed','rejected')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.status::text <> OLD.status::text THEN
      RAISE EXCEPTION 'Transaction is finalized; status cannot be changed (%, %)', TG_TABLE_NAME, OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payments_guard_final ON public.payments;
CREATE TRIGGER payments_guard_final BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_tx();
DROP TRIGGER IF EXISTS swipes_guard_final ON public.cash_swipes;
CREATE TRIGGER swipes_guard_final BEFORE UPDATE ON public.cash_swipes FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_tx();
DROP TRIGGER IF EXISTS advance_guard_final ON public.cash_advance;
CREATE TRIGGER advance_guard_final BEFORE UPDATE ON public.cash_advance FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_tx();

-- Views (payments has no `name`)
CREATE OR REPLACE VIEW public.failed_transactions AS
SELECT 'payments'::text AS source, id, date, created_at, status::text AS status,
       NULL::text AS name, COALESCE(usd_amount, zwg_amount) AS amount,
       failure_reason, notes, teller_id, branch_id
FROM public.payments WHERE status::text IN ('failed','declined','rejected')
UNION ALL
SELECT 'cash_swipes', id, date, created_at, status::text, name,
       COALESCE(usd_amount, zwg_amount), failure_reason, notes, teller_id, branch_id
FROM public.cash_swipes WHERE status::text IN ('failed','declined','rejected')
UNION ALL
SELECT 'cash_advance', id, date, created_at, status::text, name, amount,
       failure_reason, notes, teller_id, branch_id
FROM public.cash_advance WHERE status::text IN ('failed','declined','rejected')
UNION ALL
SELECT 'internal_transactions', id, date, created_at, status::text,
       NULL::text, amount, failure_reason, notes, NULL::uuid, NULL::uuid
FROM public.internal_transactions WHERE status::text IN ('failed','declined','rejected');

CREATE OR REPLACE VIEW public.inflows AS
SELECT 'payments'::text AS source, id, date, created_at,
       COALESCE(usd_amount, 0) AS usd_amount, COALESCE(zwg_amount, 0) AS zwg_amount,
       teller_id, branch_id
FROM public.payments WHERE status::text IN ('successful','approved')
UNION ALL
SELECT 'cash_swipes', id, date, created_at,
       COALESCE(usd_amount, 0), COALESCE(zwg_amount, 0), teller_id, branch_id
FROM public.cash_swipes WHERE status::text IN ('successful','approved');

CREATE OR REPLACE VIEW public.outflows AS
SELECT 'cash_advance'::text AS source, id, date, created_at,
       COALESCE(amount, 0) AS amount, teller_id, branch_id
FROM public.cash_advance WHERE status::text IN ('successful','approved');

CREATE OR REPLACE VIEW public.all_transactions AS
SELECT 'payments'::text AS source, id, date, created_at, status::text AS status,
       NULL::text AS name, COALESCE(usd_amount, zwg_amount) AS amount, teller_id, branch_id
FROM public.payments
UNION ALL
SELECT 'cash_swipes', id, date, created_at, status::text, name,
       COALESCE(usd_amount, zwg_amount), teller_id, branch_id
FROM public.cash_swipes
UNION ALL
SELECT 'cash_advance', id, date, created_at, status::text, name, amount, teller_id, branch_id
FROM public.cash_advance
UNION ALL
SELECT 'internal_transactions', id, date, created_at, status::text,
       NULL::text, amount, NULL::uuid, NULL::uuid
FROM public.internal_transactions;

DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "roles_self_read" ON public.user_roles;
CREATE POLICY "roles_self_read" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "roles_admin_all" ON public.user_roles;
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "branches_read" ON public.branches;
CREATE POLICY "branches_read" ON public.branches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "branches_admin" ON public.branches;
CREATE POLICY "branches_admin" ON public.branches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "audit_admin_read" ON public.audit_logs;
CREATE POLICY "audit_admin_read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "approvals_read" ON public.approvals;
CREATE POLICY "approvals_read" ON public.approvals FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "approvals_insert" ON public.approvals;
CREATE POLICY "approvals_insert" ON public.approvals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = approver_user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "eod_read" ON public.end_day_summary;
CREATE POLICY "eod_read" ON public.end_day_summary FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "eod_write" ON public.end_day_summary;
CREATE POLICY "eod_write" ON public.end_day_summary FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$ BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.payments'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_swipes'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_advance'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_transactions'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.approvals'; EXCEPTION WHEN others THEN NULL; END $$;
