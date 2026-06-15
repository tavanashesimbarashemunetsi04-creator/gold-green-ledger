
-- ============================================================
-- Admin Settings: app_settings, app_setting_history, feature_flags
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  category text NOT NULL,
  label text NOT NULL,
  description text,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  value_type text NOT NULL DEFAULT 'string',
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  last_modified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_modified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.app_setting_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  change_reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.app_setting_history TO authenticated;
GRANT ALL ON public.app_setting_history TO service_role;
ALTER TABLE public.app_setting_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read history" ON public.app_setting_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin insert history" ON public.app_setting_history FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS app_setting_history_key_idx ON public.app_setting_history (setting_key, changed_at DESC);

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  last_modified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_modified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read flags" ON public.feature_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write flags" ON public.feature_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- History + audit trigger on settings update
CREATE OR REPLACE FUNCTION public.app_settings_log_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.value IS DISTINCT FROM OLD.value THEN
    INSERT INTO public.app_setting_history (setting_key, old_value, new_value, changed_by)
      VALUES (NEW.key, OLD.value, NEW.value, NEW.last_modified_by);
    INSERT INTO public.audit_logs (actor_user_id, action, table_name, record_id, old_data, new_data)
      VALUES (NEW.last_modified_by, 'setting_update', 'app_settings', NEW.id,
              jsonb_build_object('key', NEW.key, 'value', OLD.value),
              jsonb_build_object('key', NEW.key, 'value', NEW.value));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER app_settings_log_change AFTER UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.app_settings_log_change();

-- ============================================================
-- Seed defaults
-- ============================================================
INSERT INTO public.app_settings (key, category, label, description, value, value_type, validation, sort_order) VALUES
-- Organization
('organization.company_name','organization','Company Name','Legal company name','""'::jsonb,'string','{"required":true,"max":120}'::jsonb,10),
('organization.trading_name','organization','Trading Name','Public trading name','""'::jsonb,'string','{"max":120}'::jsonb,20),
('organization.logo_url','organization','Logo URL','Public URL to company logo','""'::jsonb,'string','{"max":500}'::jsonb,30),
('organization.email','organization','Email','Primary contact email','""'::jsonb,'string','{"format":"email","max":255}'::jsonb,40),
('organization.phone','organization','Phone','Primary contact phone','""'::jsonb,'string','{"max":40}'::jsonb,50),
('organization.address','organization','Address','Registered office address','""'::jsonb,'string','{"max":500}'::jsonb,60),
('organization.website','organization','Website','Public website URL','""'::jsonb,'string','{"max":255}'::jsonb,70),

-- Currencies
('currencies.list','currencies','Currencies','Supported currencies (code, name, symbol)','[{"code":"USD","name":"US Dollar","symbol":"$","enabled":true},{"code":"ZWG","name":"Zimbabwe Gold","symbol":"ZWG","enabled":true}]'::jsonb,'array','{}'::jsonb,10),
('currencies.default','currencies','Default Currency','Default currency code','"USD"'::jsonb,'string','{"max":10}'::jsonb,20),
('currencies.payment_rates','currencies','Payment Exchange Rates','Rates used for payments (relative to default)','[{"from":"USD","to":"ZWG","rate":40.0}]'::jsonb,'array','{}'::jsonb,30),
('currencies.withdrawal_rates','currencies','Withdrawal Exchange Rates','Rates used for withdrawals (relative to default)','[{"from":"USD","to":"ZWG","rate":40.0}]'::jsonb,'array','{}'::jsonb,40),

-- Banks
('banks.list','banks','Banks','Supported banks (name, code, enabled)','[{"name":"CBZ","code":"CBZ","enabled":true},{"name":"Stanbic","code":"STAN","enabled":true},{"name":"FBC","code":"FBC","enabled":true}]'::jsonb,'array','{}'::jsonb,10),

-- Transaction Limits
('limits.high_value_threshold','limits','High Value Threshold','Transactions above this require additional review','1000'::jsonb,'number_or_unlimited','{"min":0}'::jsonb,10),
('limits.fraud_threshold','limits','Fraud Threshold','Trigger fraud alert above this amount','5000'::jsonb,'number_or_unlimited','{"min":0}'::jsonb,20),
('limits.max_withdrawal','limits','Maximum Withdrawal','Per-transaction max withdrawal','2000'::jsonb,'number_or_unlimited','{"min":0}'::jsonb,30),
('limits.max_cash_advance','limits','Maximum Cash Advance','Per-transaction max cash advance','1500'::jsonb,'number_or_unlimited','{"min":0}'::jsonb,40),
('limits.max_ecocash','limits','Maximum Ecocash Amount','Per-transaction max Ecocash','1000'::jsonb,'number_or_unlimited','{"min":0}'::jsonb,50),
('limits.daily_teller_limit','limits','Daily Teller Limit','Total per teller per day','20000'::jsonb,'number_or_unlimited','{"min":0}'::jsonb,60),
('limits.branch_overrides','limits','Branch-Specific Limits','Per-branch overrides for transaction, withdrawal, cash advance, ecocash','[]'::jsonb,'array','{}'::jsonb,70),
('limits.admin_override_enabled','limits','Admin Override for Branch Limits','Allow admins to override branch limits','true'::jsonb,'boolean','{}'::jsonb,80),
('limits.effective_date','limits','Effective Date for Limit Changes','When limit changes take effect','""'::jsonb,'string','{}'::jsonb,90),

-- Float
('float.opening_default','float','Opening Float Default','Default opening float amount','500'::jsonb,'number_or_unlimited','{"min":0}'::jsonb,10),
('float.teller_limit','float','Teller Float Limit','Max float held by a teller','10000'::jsonb,'number_or_unlimited','{"min":0}'::jsonb,20),
('float.branch_limit','float','Branch Float Limit','Max float held by a branch','100000'::jsonb,'number_or_unlimited','{"min":0}'::jsonb,30),
('float.variance_tolerance','float','Variance Tolerance','Allowed variance at close','5'::jsonb,'number_or_unlimited','{"min":0}'::jsonb,40),

-- Teller Sessions
('sessions.session_timeout_minutes','sessions','Session Timeout (minutes)','Auto-close idle teller session','60'::jsonb,'number','{"min":1,"max":1440}'::jsonb,10),
('sessions.auto_close_day','sessions','Auto Close Day','Automatically close operational day','true'::jsonb,'boolean','{}'::jsonb,20),
('sessions.auto_close_time','sessions','Auto Close Time','Time of day to auto-close (24h HH:mm)','"22:00"'::jsonb,'string','{"format":"time"}'::jsonb,30),
('sessions.day_reopen_policy','sessions','Day Reopening Rules','Reopening behavior after first close','"one_reopen_only"'::jsonb,'select','{"options":["never","one_reopen_only","unlimited"]}'::jsonb,40),
('sessions.multi_login_rules','sessions','Multiple Login Rules','How to handle multiple concurrent logins','"deny"'::jsonb,'select','{"options":["allow","deny","warn"]}'::jsonb,50),

-- Security
('security.password_min_length','security','Password Length','Minimum password length','8'::jsonb,'number','{"min":6,"max":64}'::jsonb,10),
('security.password_complexity','security','Password Complexity','Required character classes','{"uppercase":true,"lowercase":true,"number":true,"special":true}'::jsonb,'json','{}'::jsonb,20),
('security.login_attempts','security','Login Attempts','Max failed attempts before lockout','5'::jsonb,'number','{"min":1,"max":20}'::jsonb,30),
('security.lockout_minutes','security','Lockout Duration (minutes)','Lockout after exceeding attempts','15'::jsonb,'number','{"min":1,"max":1440}'::jsonb,40),
('security.idle_timeout_minutes','security','Auto Logout on Inactivity','Idle timeout in minutes','7'::jsonb,'select_number','{"options":[5,7,10,15,30,60]}'::jsonb,50),
('security.session_expiry_hours','security','Session Expiry (hours)','Hard expiry on logged-in session','12'::jsonb,'number','{"min":1,"max":168}'::jsonb,60),

-- User Management
('users.default_role','users','Default Role','Role assigned to new users','"teller"'::jsonb,'select','{"options":["teller","manager","finance_manager","admin"]}'::jsonb,10),
('users.role_permissions','users','Role Permissions','Permissions per role','{"teller":["transact"],"manager":["transact","approve"],"finance_manager":["transact","approve","float"],"admin":["all"]}'::jsonb,'json','{}'::jsonb,20),
('users.activation_requires_admin','users','Account Activation Requires Admin','New accounts must be activated by an admin','true'::jsonb,'boolean','{}'::jsonb,30),

-- Approvals
('approvals.threshold','approvals','Approval Threshold','Amount above which approval is required','1000'::jsonb,'number_or_unlimited','{"min":0}'::jsonb,10),
('approvals.always_dual','approvals','Always Require Dual Approval','Two approvers required regardless of amount','false'::jsonb,'boolean','{}'::jsonb,20),
('approvals.escalation_minutes','approvals','Escalation After (minutes)','Escalate pending approvals after','30'::jsonb,'number','{"min":1,"max":1440}'::jsonb,30),

-- Notifications
('notifications.security_alerts','notifications','Security Alerts','Send security alert notifications','true'::jsonb,'boolean','{}'::jsonb,10),
('notifications.fraud_alerts','notifications','Fraud Alerts','Send fraud alert notifications','true'::jsonb,'boolean','{}'::jsonb,20),
('notifications.float_alerts','notifications','Float Alerts','Send float threshold alerts','true'::jsonb,'boolean','{}'::jsonb,30),

-- Reports
('reports.branding','reports','Report Branding','Brand name on reports','""'::jsonb,'string','{"max":120}'::jsonb,10),
('reports.pdf_header','reports','PDF Header','Header text on PDF exports','""'::jsonb,'string','{"max":300}'::jsonb,20),
('reports.pdf_footer','reports','PDF Footer','Footer text on PDF exports','""'::jsonb,'string','{"max":300}'::jsonb,30),
('reports.export_permissions','reports','Export Permissions','Roles allowed to export reports','["admin","finance_manager","manager"]'::jsonb,'array','{}'::jsonb,40),

-- Audit
('audit.audit_retention_days','audit','Audit Retention (days)','How long to keep audit logs','365'::jsonb,'number_or_unlimited','{"min":1}'::jsonb,10),
('audit.security_log_retention_days','audit','Security Log Retention (days)','How long to keep security logs','365'::jsonb,'number_or_unlimited','{"min":1}'::jsonb,20),
('audit.compliance_retention_days','audit','Compliance Retention (days)','How long to keep compliance data','1825'::jsonb,'number_or_unlimited','{"min":1}'::jsonb,30),

-- System
('system.maintenance_mode','system','Maintenance Mode','Block non-admin access','false'::jsonb,'boolean','{}'::jsonb,10),
('system.maintenance_message','system','Maintenance Message','Message shown during maintenance','"We are performing scheduled maintenance. Please check back shortly."'::jsonb,'string','{"max":500}'::jsonb,20),
('system.announcement','system','System Announcement','Banner shown to all users','""'::jsonb,'string','{"max":500}'::jsonb,30),
('system.backup_schedule','system','Backup Schedule','Cron-style schedule for backups','"0 2 * * *"'::jsonb,'string','{"max":64}'::jsonb,40),
('system.backup_retention_days','system','Backup Retention (days)','How long to keep backups','30'::jsonb,'number_or_unlimited','{"min":1}'::jsonb,50),

-- Danger Zone (state flags)
('system.system_locked','system','System Locked','When true, all non-admin sessions blocked','false'::jsonb,'boolean','{}'::jsonb,99)
ON CONFLICT (key) DO NOTHING;
