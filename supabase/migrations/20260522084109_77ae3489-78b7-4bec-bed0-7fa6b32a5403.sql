
DO $$ BEGIN
  CREATE TYPE public.user_account_status AS ENUM ('active','suspended','locked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS status public.user_account_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_temporary_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_password_change boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- Guard: only admins can mutate status/username/is_temporary_password/require_password_change
CREATE OR REPLACE FUNCTION public.guard_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.username IS DISTINCT FROM OLD.username
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.is_temporary_password IS DISTINCT FROM OLD.is_temporary_password
     OR NEW.require_password_change IS DISTINCT FROM OLD.require_password_change THEN
    RAISE EXCEPTION 'Not allowed to modify admin-controlled profile fields';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_guard_profile_admin_fields ON public.profiles;
CREATE TRIGGER trg_guard_profile_admin_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_admin_fields();
