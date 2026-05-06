
-- Enums
CREATE TYPE public.request_type AS ENUM ('inflow','outflow');
CREATE TYPE public.tx_status AS ENUM ('pending','approved','declined');
CREATE TYPE public.decision AS ENUM ('pending','approved','declined');

-- Tellers
CREATE TABLE public.tellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Internal transactions
CREATE TABLE public.internal_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  initiating_teller_id UUID NOT NULL REFERENCES public.tellers(id),
  target_teller_id UUID NOT NULL REFERENCES public.tellers(id),
  request_type public.request_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  status public.tx_status NOT NULL DEFAULT 'pending',
  initiator_decision public.decision NOT NULL DEFAULT 'approved',
  receiver_decision public.decision NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT amount_positive CHECK (amount > 0),
  CONSTRAINT different_tellers CHECK (initiating_teller_id <> target_teller_id)
);

-- Trigger: status is system-managed from the two decisions
CREATE OR REPLACE FUNCTION public.set_internal_tx_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.initiator_decision = 'declined' OR NEW.receiver_decision = 'declined' THEN
    NEW.status := 'declined';
  ELSIF NEW.initiator_decision = 'approved' AND NEW.receiver_decision = 'approved' THEN
    NEW.status := 'approved';
  ELSE
    NEW.status := 'pending';
  END IF;

  -- Once finalised, prevent further decision changes
  IF TG_OP = 'UPDATE' AND OLD.status IN ('approved','declined') THEN
    IF NEW.initiator_decision <> OLD.initiator_decision
       OR NEW.receiver_decision <> OLD.receiver_decision THEN
      RAISE EXCEPTION 'Transaction is finalised and cannot be modified';
    END IF;
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_internal_tx_status
BEFORE INSERT OR UPDATE ON public.internal_transactions
FOR EACH ROW EXECUTE FUNCTION public.set_internal_tx_status();

-- RLS
ALTER TABLE public.tellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tellers_read_all" ON public.tellers FOR SELECT USING (true);
CREATE POLICY "tellers_insert_all" ON public.tellers FOR INSERT WITH CHECK (true);

CREATE POLICY "itx_read_all" ON public.internal_transactions FOR SELECT USING (true);
CREATE POLICY "itx_insert_all" ON public.internal_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "itx_update_all" ON public.internal_transactions FOR UPDATE USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tellers;
