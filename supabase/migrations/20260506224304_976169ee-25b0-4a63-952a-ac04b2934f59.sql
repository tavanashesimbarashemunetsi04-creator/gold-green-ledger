DO $$
DECLARE
  internal_fragment text := '';
  payment_fragment text := '';
  swipe_fragment text := '';
  advance_fragment text := '';
  payment_amount_expr text := NULL;
  swipe_amount_expr text := NULL;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'usd_amount'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'zwg_amount'
  ) THEN
    payment_amount_expr := 'COALESCE(p.usd_amount, p.zwg_amount)';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'usd_amount'
  ) THEN
    payment_amount_expr := 'p.usd_amount';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'zwg_amount'
  ) THEN
    payment_amount_expr := 'p.zwg_amount';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'amount'
  ) THEN
    payment_amount_expr := 'p.amount';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_swipes' AND column_name = 'usd_amount'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_swipes' AND column_name = 'zwg_amount'
  ) THEN
    swipe_amount_expr := 'COALESCE(cs.usd_amount, cs.zwg_amount)';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_swipes' AND column_name = 'usd_amount'
  ) THEN
    swipe_amount_expr := 'cs.usd_amount';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_swipes' AND column_name = 'zwg_amount'
  ) THEN
    swipe_amount_expr := 'cs.zwg_amount';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_swipes' AND column_name = 'amount'
  ) THEN
    swipe_amount_expr := 'cs.amount';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'internal_transactions')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'internal_transactions' AND column_name = 'date')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'internal_transactions' AND column_name = 'amount')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'internal_transactions' AND column_name = 'request_type')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'internal_transactions' AND column_name = 'status') THEN
    internal_fragment := '
      UNION ALL
      SELECT it.date, it.amount::numeric AS amt, ''internal_inflow''::text AS bucket
      FROM public.internal_transactions it
      WHERE it.request_type::text = ''inflow'' AND it.status::text = ''approved''

      UNION ALL
      SELECT it.date, it.amount::numeric AS amt, ''internal_outflow''::text AS bucket
      FROM public.internal_transactions it
      WHERE it.request_type::text = ''outflow'' AND it.status::text = ''approved''';
  END IF;

  IF payment_amount_expr IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'date')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'status') THEN
    payment_fragment := format('
      UNION ALL
      SELECT p.date, %s::numeric AS amt, ''payment_inflow''::text AS bucket
      FROM public.payments p
      WHERE p.status::text = ''successful''', payment_amount_expr);
  END IF;

  IF swipe_amount_expr IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cash_swipes')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cash_swipes' AND column_name = 'date')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cash_swipes' AND column_name = 'status')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cash_swipes' AND column_name = 'transaction_type') THEN
    swipe_fragment := format('
      UNION ALL
      SELECT cs.date, %s::numeric AS amt, ''swipe_outflow''::text AS bucket
      FROM public.cash_swipes cs
      WHERE cs.transaction_type::text = ''withdrawal'' AND cs.status::text = ''successful''', swipe_amount_expr);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cash_advance')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cash_advance' AND column_name = 'date')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cash_advance' AND column_name = 'amount')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cash_advance' AND column_name = 'status') THEN
    advance_fragment := '
      UNION ALL
      SELECT ca.date, ca.amount::numeric AS amt, ''advance_outflow''::text AS bucket
      FROM public.cash_advance ca
      WHERE ca.status::text = ''successful''';
  END IF;

  EXECUTE format($view$
    CREATE OR REPLACE VIEW public.end_day_summary
    WITH (security_invoker = true)
    AS
    WITH unioned AS (
      SELECT NULL::date AS date, 0::numeric AS amt, 'none'::text AS bucket
      WHERE false
      %s
      %s
      %s
      %s
    )
    SELECT
      date,
      COALESCE(SUM(CASE WHEN bucket = 'internal_inflow' THEN amt END), 0) AS internal_inflows,
      COALESCE(SUM(CASE WHEN bucket = 'payment_inflow' THEN amt END), 0) AS payment_inflows,
      COALESCE(SUM(CASE WHEN bucket IN ('internal_inflow', 'payment_inflow') THEN amt END), 0) AS total_inflows,
      COALESCE(SUM(CASE WHEN bucket = 'internal_outflow' THEN amt END), 0) AS internal_outflows,
      COALESCE(SUM(CASE WHEN bucket = 'swipe_outflow' THEN amt END), 0) AS swipe_outflows,
      COALESCE(SUM(CASE WHEN bucket = 'advance_outflow' THEN amt END), 0) AS advance_outflows,
      COALESCE(SUM(CASE WHEN bucket IN ('internal_outflow', 'swipe_outflow', 'advance_outflow') THEN amt END), 0) AS total_outflows,
      COALESCE(SUM(CASE WHEN bucket IN ('internal_inflow', 'payment_inflow') THEN amt END), 0)
        - COALESCE(SUM(CASE WHEN bucket IN ('internal_outflow', 'swipe_outflow', 'advance_outflow') THEN amt END), 0) AS balance
    FROM unioned
    GROUP BY date
    ORDER BY date DESC
  $view$, internal_fragment, payment_fragment, swipe_fragment, advance_fragment);
END $$;