CREATE OR REPLACE FUNCTION public.set_internal_tx_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('approved','declined') THEN
    IF NEW.initiator_decision <> OLD.initiator_decision
       OR NEW.receiver_decision <> OLD.receiver_decision THEN
      RAISE EXCEPTION 'Transaction is finalised and cannot be modified';
    END IF;
    NEW.status := OLD.status;
    RETURN NEW;
  END IF;

  IF NEW.initiator_decision = 'declined' OR NEW.receiver_decision = 'declined' THEN
    NEW.status := 'declined';
  ELSIF NEW.initiator_decision = 'approved' AND NEW.receiver_decision = 'approved' THEN
    NEW.status := 'approved';
  ELSE
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;