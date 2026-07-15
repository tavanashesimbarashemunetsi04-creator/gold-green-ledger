
-- Helper: role check shortcut
-- (has_role and current_user_has_any_role already exist)

-- ============ app_settings ============
DROP POLICY IF EXISTS app_settings_read_authenticated ON public.app_settings;
CREATE POLICY app_settings_read_authenticated ON public.app_settings
  FOR SELECT TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager'));

-- ============ approvals ============
DROP POLICY IF EXISTS approvals_read ON public.approvals;
CREATE POLICY approvals_read ON public.approvals
  FOR SELECT TO authenticated
  USING (
    auth.uid() = approver_user_id
    OR public.current_user_has_any_role('admin','manager','finance_manager')
  );

-- ============ audit_logs ============
DROP POLICY IF EXISTS audit_insert ON public.audit_logs;
CREATE POLICY audit_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

-- ============ branches ============
DROP POLICY IF EXISTS branches_read ON public.branches;
CREATE POLICY branches_read ON public.branches
  FOR SELECT TO authenticated
  USING (
    public.current_user_has_any_role('admin','manager','finance_manager','teller')
  );

-- ============ cash_advance ============
DROP POLICY IF EXISTS cash_advance_all ON public.cash_advance;
CREATE POLICY cash_advance_select ON public.cash_advance
  FOR SELECT TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager','teller'));
CREATE POLICY cash_advance_insert ON public.cash_advance
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role('admin','manager','finance_manager','teller'));
CREATE POLICY cash_advance_update ON public.cash_advance
  FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager','teller'))
  WITH CHECK (public.current_user_has_any_role('admin','manager','finance_manager','teller'));
CREATE POLICY cash_advance_delete ON public.cash_advance
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ cash_swipes ============
DROP POLICY IF EXISTS cash_swipes_all ON public.cash_swipes;
CREATE POLICY cash_swipes_select ON public.cash_swipes
  FOR SELECT TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager','teller'));
CREATE POLICY cash_swipes_insert ON public.cash_swipes
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role('admin','manager','finance_manager','teller'));
CREATE POLICY cash_swipes_update ON public.cash_swipes
  FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager','teller'))
  WITH CHECK (public.current_user_has_any_role('admin','manager','finance_manager','teller'));
CREATE POLICY cash_swipes_delete ON public.cash_swipes
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ currency_rates ============
DROP POLICY IF EXISTS "Authenticated can read rates" ON public.currency_rates;
CREATE POLICY "Authenticated can read rates" ON public.currency_rates
  FOR SELECT TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager','teller'));

-- ============ ecocash_transactions ============
DROP POLICY IF EXISTS ecocash_insert ON public.ecocash_transactions;
CREATE POLICY ecocash_insert ON public.ecocash_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (created_by IS NULL OR created_by = auth.uid())
  );
DROP POLICY IF EXISTS ecocash_read ON public.ecocash_transactions;
CREATE POLICY ecocash_read ON public.ecocash_transactions
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.current_user_has_any_role('admin','manager','finance_manager')
  );

-- ============ end_day_summary ============
DROP POLICY IF EXISTS eod_read ON public.end_day_summary;
DROP POLICY IF EXISTS eod_write ON public.end_day_summary;
CREATE POLICY eod_read ON public.end_day_summary
  FOR SELECT TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager'));
CREATE POLICY eod_insert ON public.end_day_summary
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role('admin','manager','finance_manager'));
CREATE POLICY eod_update ON public.end_day_summary
  FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager'))
  WITH CHECK (public.current_user_has_any_role('admin','manager','finance_manager'));
CREATE POLICY eod_delete ON public.end_day_summary
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ internal_transactions ============
DROP POLICY IF EXISTS itx_insert_all ON public.internal_transactions;
DROP POLICY IF EXISTS itx_read_all ON public.internal_transactions;
DROP POLICY IF EXISTS itx_update_all ON public.internal_transactions;
CREATE POLICY itx_select ON public.internal_transactions
  FOR SELECT TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager','teller'));
CREATE POLICY itx_insert ON public.internal_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role('admin','manager','finance_manager','teller'));
CREATE POLICY itx_update ON public.internal_transactions
  FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager','teller'))
  WITH CHECK (public.current_user_has_any_role('admin','manager','finance_manager','teller'));

-- ============ payments ============
DROP POLICY IF EXISTS payments_all ON public.payments;
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager','teller'));
CREATE POLICY payments_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role('admin','manager','finance_manager','teller'));
CREATE POLICY payments_update ON public.payments
  FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager','teller'))
  WITH CHECK (public.current_user_has_any_role('admin','manager','finance_manager','teller'));
CREATE POLICY payments_delete ON public.payments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ tellers ============
DROP POLICY IF EXISTS tellers_insert_all ON public.tellers;
DROP POLICY IF EXISTS tellers_read_all ON public.tellers;
CREATE POLICY tellers_select ON public.tellers
  FOR SELECT TO authenticated
  USING (public.current_user_has_any_role('admin','manager','finance_manager','teller'));
CREATE POLICY tellers_insert ON public.tellers
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ Revoke public/anon EXECUTE on SECURITY DEFINER functions ============
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC', r.nspname, r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM anon', r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role', r.nspname, r.proname, r.args);
  END LOOP;
END$$;
