
-- 1. Add ecocash_related flag to internal_transactions
ALTER TABLE public.internal_transactions
  ADD COLUMN IF NOT EXISTS ecocash_related boolean NOT NULL DEFAULT false;

-- 2. Create source enum
DO $$ BEGIN
  CREATE TYPE public.ecocash_source AS ENUM ('manual_entry','internal_transaction');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ecocash_tx_type AS ENUM ('inflow','outflow');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Ecocash transactions table
CREATE TABLE IF NOT EXISTS public.ecocash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  transaction_type public.ecocash_tx_type NOT NULL,
  inflow_amount numeric(14,2) NOT NULL DEFAULT 0,
  outflow_amount numeric(14,2) NOT NULL DEFAULT 0,
  source public.ecocash_source NOT NULL DEFAULT 'manual_entry',
  created_by uuid,
  created_by_label text,
  imported_transaction_id uuid UNIQUE,
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ecocash_tx_created_at_idx ON public.ecocash_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS ecocash_tx_source_idx ON public.ecocash_transactions (source);
CREATE INDEX IF NOT EXISTS ecocash_tx_type_idx ON public.ecocash_transactions (transaction_type);

-- 4. RLS
ALTER TABLE public.ecocash_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ecocash_read ON public.ecocash_transactions;
CREATE POLICY ecocash_read ON public.ecocash_transactions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ecocash_insert ON public.ecocash_transactions;
CREATE POLICY ecocash_insert ON public.ecocash_transactions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS ecocash_update_admin ON public.ecocash_transactions;
CREATE POLICY ecocash_update_admin ON public.ecocash_transactions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS ecocash_delete_admin ON public.ecocash_transactions;
CREATE POLICY ecocash_delete_admin ON public.ecocash_transactions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Realtime
ALTER TABLE public.ecocash_transactions REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='ecocash_transactions';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.ecocash_transactions';
  END IF;
END $$;

-- 6. Auto-import trigger on internal_transactions
CREATE OR REPLACE FUNCTION public.import_ecocash_internal_tx()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type public.ecocash_tx_type; v_label text;
BEGIN
  IF NEW.status::text = 'approved' AND COALESCE(NEW.ecocash_related,false) = true THEN
    -- Determine direction: inflow if request_type inflow
    v_type := CASE WHEN NEW.request_type::text = 'inflow' THEN 'inflow' ELSE 'outflow' END::public.ecocash_tx_type;
    SELECT username INTO v_label FROM public.tellers WHERE id = NEW.initiating_teller_id;

    INSERT INTO public.ecocash_transactions
      (description, amount, transaction_type, inflow_amount, outflow_amount,
       source, created_by_label, imported_transaction_id, imported_at)
    VALUES
      ('Internal transaction ' || COALESCE(NEW.notes,''), NEW.amount, v_type,
       CASE WHEN v_type='inflow' THEN NEW.amount ELSE 0 END,
       CASE WHEN v_type='outflow' THEN NEW.amount ELSE 0 END,
       'internal_transaction', COALESCE(v_label,'system'), NEW.id, now())
    ON CONFLICT (imported_transaction_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_import_ecocash_internal_tx ON public.internal_transactions;
CREATE TRIGGER trg_import_ecocash_internal_tx
AFTER INSERT OR UPDATE OF status, ecocash_related ON public.internal_transactions
FOR EACH ROW EXECUTE FUNCTION public.import_ecocash_internal_tx();

-- 7. Auto-fill inflow/outflow amounts on manual inserts
CREATE OR REPLACE FUNCTION public.ecocash_fill_amounts()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.transaction_type = 'inflow' THEN
    NEW.inflow_amount := NEW.amount; NEW.outflow_amount := 0;
  ELSE
    NEW.outflow_amount := NEW.amount; NEW.inflow_amount := 0;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ecocash_fill_amounts ON public.ecocash_transactions;
CREATE TRIGGER trg_ecocash_fill_amounts
BEFORE INSERT OR UPDATE ON public.ecocash_transactions
FOR EACH ROW EXECUTE FUNCTION public.ecocash_fill_amounts();
