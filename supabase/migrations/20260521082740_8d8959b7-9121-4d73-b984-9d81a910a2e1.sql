-- Profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS full_name text;

-- Prevent tellers from changing protected profile columns
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.teller_id IS DISTINCT FROM OLD.teller_id THEN
    RAISE EXCEPTION 'Not allowed to modify protected profile fields';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_profile_self_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

-- Security alerts
CREATE TABLE IF NOT EXISTS public.security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  alert_type text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_alerts_read ON public.security_alerts;
CREATE POLICY security_alerts_read ON public.security_alerts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS security_alerts_insert ON public.security_alerts;
CREATE POLICY security_alerts_insert ON public.security_alerts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS security_alerts_update_self ON public.security_alerts;
CREATE POLICY security_alerts_update_self ON public.security_alerts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_security_alerts_user ON public.security_alerts(user_id, created_at DESC);

-- Login sessions / known devices
CREATE TABLE IF NOT EXISTS public.login_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  device_label text,
  user_agent text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

ALTER TABLE public.login_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS login_sessions_read ON public.login_sessions;
CREATE POLICY login_sessions_read ON public.login_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS login_sessions_insert ON public.login_sessions;
CREATE POLICY login_sessions_insert ON public.login_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS login_sessions_update ON public.login_sessions;
CREATE POLICY login_sessions_update ON public.login_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_login_sessions_user ON public.login_sessions(user_id);