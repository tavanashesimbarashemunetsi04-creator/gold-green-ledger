
ALTER TABLE public.currency_rates DROP CONSTRAINT currency_rates_payments_updated_by_fkey,
  ADD CONSTRAINT currency_rates_payments_updated_by_fkey FOREIGN KEY (payments_updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.currency_rates DROP CONSTRAINT currency_rates_withdrawals_updated_by_fkey,
  ADD CONSTRAINT currency_rates_withdrawals_updated_by_fkey FOREIGN KEY (withdrawals_updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.currency_rate_history DROP CONSTRAINT currency_rate_history_changed_by_fkey,
  ADD CONSTRAINT currency_rate_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.received_cash DROP CONSTRAINT received_cash_received_by_user_id_fkey,
  ADD CONSTRAINT received_cash_received_by_user_id_fkey FOREIGN KEY (received_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
