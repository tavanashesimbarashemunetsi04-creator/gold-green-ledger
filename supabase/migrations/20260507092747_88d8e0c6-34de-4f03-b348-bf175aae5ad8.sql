
ALTER VIEW public.failed_transactions SET (security_invoker = on);
ALTER VIEW public.inflows             SET (security_invoker = on);
ALTER VIEW public.outflows            SET (security_invoker = on);
ALTER VIEW public.all_transactions    SET (security_invoker = on);
