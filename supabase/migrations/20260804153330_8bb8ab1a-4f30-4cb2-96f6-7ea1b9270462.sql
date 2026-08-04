DROP POLICY IF EXISTS audit_insert ON public.audit_logs;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon;
GRANT ALL ON public.audit_logs TO service_role;