CREATE OR REPLACE FUNCTION public.guard_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow service-role / server-side calls (no authenticated user)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.teller_id IS DISTINCT FROM OLD.teller_id THEN
    RAISE EXCEPTION 'Not allowed to modify protected profile fields';
  END IF;
  RETURN NEW;
END $function$;