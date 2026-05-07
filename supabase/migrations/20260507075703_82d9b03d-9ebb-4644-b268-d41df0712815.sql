
ALTER TABLE public.payments              ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE public.cash_swipes           ADD COLUMN IF NOT EXISTS failure_reason text, ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.cash_advance          ADD COLUMN IF NOT EXISTS failure_reason text, ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.internal_transactions ADD COLUMN IF NOT EXISTS failure_reason text, ADD COLUMN IF NOT EXISTS notes text;
