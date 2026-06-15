
-- Add status to branches
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- App settings (single-row JSON store, admin-only)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_read_authenticated"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "app_settings_admin_write"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed defaults
INSERT INTO public.app_settings (key, value)
VALUES ('global', jsonb_build_object(
  'transactions', jsonb_build_object(
    'ecocash_enabled', true,
    'agency_banking_enabled', true,
    'internal_transfers_enabled', true,
    'max_transaction_limit', 10000
  ),
  'cash_handling', jsonb_build_object(
    'require_finance_approval_for_float', true,
    'allow_cash_shortages', false,
    'allow_cash_excess', false,
    'require_reason_for_variance', true
  ),
  'security', jsonb_build_object(
    'session_timeout_minutes', 30,
    'login_attempt_limit', 5,
    'two_factor_enabled', false
  ),
  'personalisation', jsonb_build_object(
    'theme', 'light',
    'dashboard_layout', 'standard',
    'default_landing_page', 'dashboard',
    'date_format', 'DD/MM/YYYY',
    'currency_display', 'USD'
  )
))
ON CONFLICT (key) DO NOTHING;
