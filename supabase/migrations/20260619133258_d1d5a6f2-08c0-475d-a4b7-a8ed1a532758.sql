
CREATE TABLE public.received_cash (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  session_id UUID NOT NULL,
  session_type TEXT NOT NULL CHECK (session_type IN ('teller','ecocash')),
  business_date DATE NOT NULL DEFAULT (now()::date),
  expected_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  received_amount NUMERIC(14,2) NOT NULL,
  variance_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  variance_reason TEXT,
  notes TEXT,
  received_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, session_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.received_cash TO authenticated;
GRANT ALL ON public.received_cash TO service_role;

ALTER TABLE public.received_cash ENABLE ROW LEVEL SECURITY;

CREATE POLICY "received_cash_read" ON public.received_cash
  FOR SELECT TO authenticated
  USING (
    auth.uid() = teller_user_id
    OR auth.uid() = received_by_user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'finance_manager')
  );

CREATE POLICY "received_cash_insert" ON public.received_cash
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'finance_manager') OR public.has_role(auth.uid(), 'admin'))
    AND auth.uid() = received_by_user_id
  );

CREATE POLICY "received_cash_update" ON public.received_cash
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX received_cash_teller_idx ON public.received_cash (teller_user_id, business_date DESC);
CREATE INDEX received_cash_session_idx ON public.received_cash (session_id);

CREATE TRIGGER received_cash_set_updated_at
  BEFORE UPDATE ON public.received_cash
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
