
-- Extend internal_tx_category enum
ALTER TYPE public.internal_tx_category ADD VALUE IF NOT EXISTS 'teller_transfer_sent';
ALTER TYPE public.internal_tx_category ADD VALUE IF NOT EXISTS 'teller_transfer_received';

-- Transfer status enum
DO $$ BEGIN
  CREATE TYPE public.teller_transfer_status AS ENUM ('pending','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.teller_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code text NOT NULL UNIQUE
    DEFAULT ('TT-' || to_char(now(),'YYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::text,1,4)),
  requesting_user_id uuid NOT NULL,
  sending_user_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text,
  status public.teller_transfer_status NOT NULL DEFAULT 'pending',
  branch_id uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  rejection_reason text,
  request_device text,
  request_ip text,
  approval_device text,
  approval_ip text,
  sender_uit_id uuid,
  receiver_uit_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requesting_user_id <> sending_user_id)
);

CREATE INDEX IF NOT EXISTS idx_teller_transfers_requesting ON public.teller_transfers(requesting_user_id);
CREATE INDEX IF NOT EXISTS idx_teller_transfers_sending ON public.teller_transfers(sending_user_id);
CREATE INDEX IF NOT EXISTS idx_teller_transfers_status ON public.teller_transfers(status);

ALTER TABLE public.teller_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teller_transfers_read ON public.teller_transfers;
CREATE POLICY teller_transfers_read ON public.teller_transfers
  FOR SELECT TO authenticated
  USING (
    auth.uid() = requesting_user_id
    OR auth.uid() = sending_user_id
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'finance_manager')
  );

-- No direct INSERT/UPDATE/DELETE policies; all mutations go through RPCs.

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.teller_transfers;

-- Request transfer
CREATE OR REPLACE FUNCTION public.request_teller_transfer(
  _sending_user uuid, _amount numeric, _reason text, _device text, _ip text DEFAULT NULL
) RETURNS public.teller_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_row public.teller_transfers; v_branch uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _sending_user IS NULL OR _sending_user = v_caller THEN RAISE EXCEPTION 'Invalid sending teller'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;

  -- Both tellers must have an open day
  IF NOT EXISTS (SELECT 1 FROM public.teller_sessions WHERE user_id = v_caller AND status='open') THEN
    RAISE EXCEPTION 'Your operational day is not open';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teller_sessions WHERE user_id = _sending_user AND status='open') THEN
    RAISE EXCEPTION 'Sending teller does not have an open day';
  END IF;

  SELECT branch_id INTO v_branch FROM public.profiles WHERE user_id = v_caller;

  INSERT INTO public.teller_transfers(
    requesting_user_id, sending_user_id, amount, reason, branch_id,
    request_device, request_ip
  ) VALUES (
    v_caller, _sending_user, _amount, NULLIF(trim(_reason),''), v_branch,
    _device, _ip
  ) RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, target_user_id, branch_id, device_ip)
  VALUES (v_caller,'transfer_request','teller_transfers', v_row.id,
          jsonb_build_object('reference',v_row.reference_code,'amount',_amount,'reason',_reason,'device',_device),
          'teller_transfer', _amount, _sending_user, v_branch, _ip);

  RETURN v_row;
END $$;

-- Approve transfer
CREATE OR REPLACE FUNCTION public.approve_teller_transfer(
  _id uuid, _device text, _ip text DEFAULT NULL
) RETURNS public.teller_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.teller_transfers;
  v_sender_balance numeric;
  v_sender_uit uuid;
  v_receiver_uit uuid;
  v_note text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.teller_transfers WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Transfer already %', v_row.status; END IF;
  IF v_row.sending_user_id <> v_caller THEN RAISE EXCEPTION 'Only the sending teller can approve'; END IF;
  IF v_row.requesting_user_id = v_caller THEN RAISE EXCEPTION 'Cannot approve your own request'; END IF;

  -- Both tellers must still have an open day
  IF NOT EXISTS (SELECT 1 FROM public.teller_sessions WHERE user_id = v_caller AND status='open') THEN
    RAISE EXCEPTION 'Your operational day is not open';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teller_sessions WHERE user_id = v_row.requesting_user_id AND status='open') THEN
    RAISE EXCEPTION 'Requesting teller does not have an open day';
  END IF;

  -- Sufficient sender balance (lifetime inflows - outflows)
  SELECT COALESCE(SUM(CASE WHEN kind='inflow' THEN amount ELSE -amount END),0)
    INTO v_sender_balance
    FROM public.user_internal_transactions
    WHERE user_id = v_caller;

  IF v_sender_balance < v_row.amount THEN
    RAISE EXCEPTION 'Insufficient balance: available %, requested %', v_sender_balance, v_row.amount;
  END IF;

  v_note := 'Teller Transfer ' || v_row.reference_code ||
            COALESCE(' · ' || v_row.reason,'');

  INSERT INTO public.user_internal_transactions(user_id, kind, category, amount, created_by_user_id, notes)
  VALUES (v_caller, 'outflow', 'teller_transfer_sent', v_row.amount, v_caller, v_note)
  RETURNING id INTO v_sender_uit;

  INSERT INTO public.user_internal_transactions(user_id, kind, category, amount, created_by_user_id, notes)
  VALUES (v_row.requesting_user_id, 'inflow', 'teller_transfer_received', v_row.amount, v_caller, v_note)
  RETURNING id INTO v_receiver_uit;

  UPDATE public.teller_transfers
     SET status = 'approved',
         approved_at = now(),
         approval_device = _device,
         approval_ip = _ip,
         sender_uit_id = v_sender_uit,
         receiver_uit_id = v_receiver_uit
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, target_user_id, branch_id, device_ip)
  VALUES (v_caller,'transfer_approve','teller_transfers', v_row.id,
          jsonb_build_object('reference',v_row.reference_code,'amount',v_row.amount,
                             'sender_uit',v_sender_uit,'receiver_uit',v_receiver_uit,'device',_device),
          'teller_transfer', v_row.amount, v_row.requesting_user_id, v_row.branch_id, _ip);

  RETURN v_row;
END $$;

-- Reject transfer
CREATE OR REPLACE FUNCTION public.reject_teller_transfer(
  _id uuid, _reason text, _device text, _ip text DEFAULT NULL
) RETURNS public.teller_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_row public.teller_transfers;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.teller_transfers WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Transfer already %', v_row.status; END IF;
  IF v_row.sending_user_id <> v_caller THEN RAISE EXCEPTION 'Only the sending teller can reject'; END IF;

  UPDATE public.teller_transfers
     SET status='rejected', rejected_at=now(), rejection_reason=NULLIF(trim(_reason),''),
         approval_device=_device, approval_ip=_ip
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, target_user_id, branch_id, device_ip)
  VALUES (v_caller,'transfer_reject','teller_transfers', v_row.id,
          jsonb_build_object('reference',v_row.reference_code,'reason',_reason,'device',_device),
          'teller_transfer', v_row.amount, v_row.requesting_user_id, v_row.branch_id, _ip);

  RETURN v_row;
END $$;

-- Cancel by requester
CREATE OR REPLACE FUNCTION public.cancel_teller_transfer(
  _id uuid, _device text, _ip text DEFAULT NULL
) RETURNS public.teller_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_row public.teller_transfers;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.teller_transfers WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_row.requesting_user_id <> v_caller THEN RAISE EXCEPTION 'Only the requester can cancel'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Transfer already %', v_row.status; END IF;

  UPDATE public.teller_transfers SET status='cancelled', cancelled_at=now()
   WHERE id = v_row.id RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(actor_user_id, action, table_name, record_id, new_data, module, amount, target_user_id, branch_id, device_ip)
  VALUES (v_caller,'transfer_cancel','teller_transfers', v_row.id,
          jsonb_build_object('reference',v_row.reference_code,'device',_device),
          'teller_transfer', v_row.amount, v_row.sending_user_id, v_row.branch_id, _ip);
  RETURN v_row;
END $$;
