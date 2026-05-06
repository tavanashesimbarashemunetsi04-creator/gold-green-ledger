CREATE OR REPLACE VIEW public.end_day_summary AS
WITH unioned AS (
  SELECT
    date,
    amount AS amt,
    'internal_inflow'::text AS bucket
  FROM public.internal_transactions
  WHERE request_type = 'inflow' AND status = 'approved'

  UNION ALL

  SELECT
    date,
    COALESCE(usd_amount, zwg_amount) AS amt,
    'payment_inflow'::text AS bucket
  FROM public.payments
  WHERE status = 'successful'

  UNION ALL

  SELECT
    date,
    amount AS amt,
    'internal_outflow'::text AS bucket
  FROM public.internal_transactions
  WHERE request_type = 'outflow' AND status = 'approved'

  UNION ALL

  SELECT
    date,
    COALESCE(usd_amount, zwg_amount) AS amt,
    'swipe_outflow'::text AS bucket
  FROM public.cash_swipes
  WHERE transaction_type = 'withdrawal' AND status = 'successful'

  UNION ALL

  SELECT
    date,
    amount AS amt,
    'advance_outflow'::text AS bucket
  FROM public.cash_advance
  WHERE status = 'successful'
)
SELECT
  date,
  COALESCE(SUM(CASE WHEN bucket = 'internal_inflow'  THEN amt END), 0) AS internal_inflows,
  COALESCE(SUM(CASE WHEN bucket = 'payment_inflow'   THEN amt END), 0) AS payment_inflows,
  COALESCE(SUM(CASE WHEN bucket IN ('internal_inflow','payment_inflow') THEN amt END), 0) AS total_inflows,
  COALESCE(SUM(CASE WHEN bucket = 'internal_outflow' THEN amt END), 0) AS internal_outflows,
  COALESCE(SUM(CASE WHEN bucket = 'swipe_outflow'    THEN amt END), 0) AS swipe_outflows,
  COALESCE(SUM(CASE WHEN bucket = 'advance_outflow'  THEN amt END), 0) AS advance_outflows,
  COALESCE(SUM(CASE WHEN bucket IN ('internal_outflow','swipe_outflow','advance_outflow') THEN amt END), 0) AS total_outflows,
  COALESCE(SUM(CASE WHEN bucket IN ('internal_inflow','payment_inflow') THEN amt END), 0)
    - COALESCE(SUM(CASE WHEN bucket IN ('internal_outflow','swipe_outflow','advance_outflow') THEN amt END), 0) AS balance
FROM unioned
GROUP BY date
ORDER BY date DESC;