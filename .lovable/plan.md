## Goal

Make a Finance Manager's Finance wallet completely independent from any Teller wallet on the same account. The two only meet when float is officially transferred from Finance → Teller.

## 1. Database

New table `public.finance_transactions`:
- `id`, `user_id` (finance manager), `kind` (inflow/outflow), `category`, `amount` (USD), `currency` ('USD'), `reference`, `notes`, `related_float_assignment_id`, `related_uit_id`, `created_by_user_id`, `created_at`
- Categories: `cash_update`, `opening_finance_float`, `float_issued_to_teller`, `float_received_from_teller`, `adjustment`, `self_float_legacy`
- RLS: finance_manager/admin read all, only admin/finance_manager can insert (server-side)
- GRANTs to authenticated + service_role

New helper view `public.finance_balances(user_id, balance)` — sum of inflows − outflows per finance manager.

Server-side RPC `add_finance_cash(_amount, _reference, _notes)` — finance_manager/admin only, inserts `cash_update` inflow + audit log.

**Migrate `approve_float_assignment`** so when a finance manager approves an assignment they made (or it's auto-deducted on assignment), the outflow lands in `finance_transactions` (`float_issued_to_teller`) instead of `user_internal_transactions`. Teller inflow stays in `user_internal_transactions` (`opening_float`).

**Migrate `self_assign_float`** to insert into `finance_transactions` (`self_float_legacy`) — it's now only used as a finance-side adjustment, not a teller credit.

**Reclassify history** (one-time data migration in same migration):
- Move every existing `user_internal_transactions` row with category `self_float` → `finance_transactions` (kind=inflow, category=`self_float_legacy`).
- Move every existing `user_internal_transactions` row with category `float_assignment` (outflows by finance) → `finance_transactions` (kind=outflow, category=`float_issued_to_teller`).
- Delete the moved rows from `user_internal_transactions`.
- Teller-side `opening_float` inflows stay untouched.

Result: teller cash-at-hand calculations (which read `user_internal_transactions`) no longer mix in finance activity.

## 2. Teller-portal Self Float

`teller-float.tsx` currently calls `selfAssignFloat`. Change it to a new server fn `tellerSelfFloat` that always writes into `user_internal_transactions` (`opening_float`, kind=inflow) for the calling user — regardless of role. This is what makes a finance manager acting as a teller behave like any other teller.

## 3. Finance Portal — Cash Update tab

- New sidebar item between "Float Management" and "Received Cash".
- New route `src/routes/finance.cash-update.tsx` mirroring the Add Float form layout:
  - Date / Time (auto, read-only)
  - Amount (USD)
  - Currency (USD, locked)
  - Reason / Description
  - Added By (auto from session)
  - Notes (optional)
  - Buttons: **Add to Finance Cash** / **Clear Form**
- Shows current Finance Cash balance card + history table of `finance_transactions` for the logged-in finance manager.

## 4. Finance Portal balance display

`finance.float.tsx` "Your float balance" card now reads from `finance_transactions` (sum) instead of `user_float_balances`. Same for the dashboard.

## 5. Audit

Every write to `finance_transactions` inserts an `audit_logs` row with module=`finance_ledger`, including source/destination ledger, amount, reference.

## Files touched

- `supabase/migrations/<new>.sql` — new table, RLS, GRANTs, RPC, function updates, data move
- `src/lib/finance-ledger.functions.ts` (new) — `addFinanceCash`, `getFinanceBalance`, `listFinanceTransactions`
- `src/lib/float.functions.ts` — split `selfAssignFloat` (finance) from new `tellerSelfFloat`
- `src/components/FinanceSidebar.tsx` — add Cash Update nav item
- `src/routes/finance.cash-update.tsx` (new)
- `src/routes/finance.float.tsx` — read balance from finance ledger
- `src/routes/finance.index.tsx` — same
- `src/routes/teller-float.tsx` — use `tellerSelfFloat`

## Out of scope (calling out so you can confirm)

- ZWG support in the finance ledger (USD-only per your answer).
- Rewriting reports/manager portal — they continue to read `user_internal_transactions`, which now only contains teller activity, so they get more accurate numbers automatically.
- UI for finance manager to manually move cash back from a teller (returns happen through existing teller close-of-day flow).
