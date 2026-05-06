
ALTER TABLE public.payments     ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE public.payments     ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.cash_swipes  ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE public.cash_swipes  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.cash_advance ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE public.cash_advance ADD COLUMN IF NOT EXISTS approved_at timestamptz;
