DROP TRIGGER IF EXISTS app_settings_log_change ON public.app_settings;
DROP FUNCTION IF EXISTS public.app_settings_log_change() CASCADE;
DROP TABLE IF EXISTS public.app_setting_history CASCADE;
DROP TABLE IF EXISTS public.app_settings CASCADE;
DROP TABLE IF EXISTS public.feature_flags CASCADE;