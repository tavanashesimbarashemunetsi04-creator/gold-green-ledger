
-- Currency rates (singleton row, key = 'global')
CREATE TABLE public.currency_rates (
  key text PRIMARY KEY,
  payments_rate numeric(18,6) NOT NULL DEFAULT 0,
  withdrawals_rate numeric(18,6) NOT NULL DEFAULT 0,
  payments_updated_at timestamptz NOT NULL DEFAULT now(),
  withdrawals_updated_at timestamptz NOT NULL DEFAULT now(),
  payments_updated_by uuid REFERENCES auth.users(id),
  withdrawals_updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.currency_rates TO authenticated;
GRANT ALL ON public.currency_rates TO service_role;
ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read rates" ON public.currency_rates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage rates" ON public.currency_rates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER currency_rates_set_updated
  BEFORE UPDATE ON public.currency_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.currency_rates (key) VALUES ('global');

-- Rate history (admin changes)
CREATE TABLE public.currency_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('payments','withdrawals')),
  old_rate numeric(18,6),
  new_rate numeric(18,6) NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.currency_rate_history TO authenticated;
GRANT ALL ON public.currency_rate_history TO service_role;
ALTER TABLE public.currency_rate_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read rate history" ON public.currency_rate_history
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins insert rate history" ON public.currency_rate_history
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Per-transaction code overrides
CREATE TABLE public.code_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  transaction_type text NOT NULL CHECK (transaction_type IN ('payment','withdrawal')),
  original_rate numeric(18,6) NOT NULL,
  edited_rate numeric(18,6) NOT NULL,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.code_overrides TO authenticated;
GRANT ALL ON public.code_overrides TO service_role;
ALTER TABLE public.code_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert their own overrides" ON public.code_overrides
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read their own overrides" ON public.code_overrides
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
