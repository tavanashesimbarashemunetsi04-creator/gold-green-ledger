-- ENUMs (idempotent)
DO $$ BEGIN
  CREATE TYPE public.tx_record_status AS ENUM ('successful','pending','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bank_enum AS ENUM ('ZB','CBZ','BANCABC','AFC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_type_enum AS ENUM ('cash','transfer','mobile');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cash_tx_type AS ENUM ('withdrawal','deposit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- payments
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank public.bank_enum NOT NULL,
  date date NOT NULL,
  account_number text,
  phone_number text,
  code text,
  payment_type public.payment_type_enum NOT NULL,
  usd_amount numeric CHECK (usd_amount IS NULL OR usd_amount > 0),
  zwg_amount numeric CHECK (zwg_amount IS NULL OR zwg_amount > 0),
  category text,
  notes text,
  status public.tx_record_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_one_amount CHECK (
    (usd_amount IS NOT NULL)::int + (zwg_amount IS NOT NULL)::int = 1
  ),
  CONSTRAINT payments_contact_required CHECK (
    account_number IS NOT NULL OR phone_number IS NOT NULL
  )
);

-- cash_swipes
CREATE TABLE IF NOT EXISTS public.cash_swipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  name text NOT NULL,
  card_last4 text NOT NULL,
  phone_number text,
  id_number text NOT NULL,
  transaction_type public.cash_tx_type NOT NULL,
  code text,
  usd_amount numeric CHECK (usd_amount IS NULL OR usd_amount > 0),
  zwg_amount numeric CHECK (zwg_amount IS NULL OR zwg_amount > 0),
  signature_url text NOT NULL,
  status public.tx_record_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_swipes_one_amount CHECK (
    (usd_amount IS NOT NULL)::int + (zwg_amount IS NOT NULL)::int = 1
  )
);

-- cash_advance
CREATE TABLE IF NOT EXISTS public.cash_advance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  name text NOT NULL,
  card_last4 text NOT NULL,
  phone_number text,
  id_number text NOT NULL,
  transaction_type public.cash_tx_type NOT NULL,
  code text,
  amount numeric NOT NULL CHECK (amount > 0),
  signature_url text NOT NULL,
  status public.tx_record_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_swipes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_advance ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payments' AND policyname='payments_all') THEN
    CREATE POLICY payments_all ON public.payments FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cash_swipes' AND policyname='cash_swipes_all') THEN
    CREATE POLICY cash_swipes_all ON public.cash_swipes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cash_advance' AND policyname='cash_advance_all') THEN
    CREATE POLICY cash_advance_all ON public.cash_advance FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;