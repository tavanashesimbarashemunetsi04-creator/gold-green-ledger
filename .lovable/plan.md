## EcoCash Open Day & Close Day Workflow

Add an independent operational day for the EcoCash desk. When a teller opens an EcoCash Day, they become the EcoCash Teller and are locked out of every other transaction module until they close the EcoCash Day.

---

### 1. Database (single migration)

New table `public.ecocash_sessions` (mirrors `teller_sessions` shape):
- `id`, `session_code` (`EC-YYMMDDHHMMSS-XXXX`), `user_id`, `branch_id`
- `opened_at`, `opened_float_amount`, `opened_device`, `opened_ip`
- `closed_at`, `closing_cash_at_hand`, `physical_usd`, `expected_usd`, `variance_usd`, `variance_reason`
- `closed_device`, `closed_ip`, `status` enum (`open`|`closed`)

Add `mode` column to `public.teller_sessions` (text default `'standard'`, values `'standard'|'ecocash'`) so we can also detect ecocash-mode via the existing day session if needed.

Mutually-exclusive rule enforced in RPCs:
- A teller cannot have BOTH an open `teller_sessions` row and an open `ecocash_sessions` row.
- A second open ecocash session by anyone is allowed (multiple tellers can run their own ecocash day).

New `SECURITY DEFINER` RPCs:
- `open_ecocash_day(_float, _branch, _device, _ip)` — validates: approved float exists (uses same `ready_to_open_day` flag), no open standard or ecocash session for user. Creates ecocash session row + audit log.
- `close_ecocash_day(_physical_usd, _expected_usd, _variance_reason, _device, _ip)` — closes row, snapshots variance, audit log. Variance reason required if mismatch.

RLS: SELECT for owner/admin/manager/finance_manager; writes via RPCs only.

Enable realtime on `ecocash_sessions`.

---

### 2. Server functions — `src/lib/ecocash-day.functions.ts`

- `getEcocashDashboardState()` — returns: profile, current ecocash session, pending float, opening float row, totals (inflows/outflows from `user_internal_transactions` + ecocash_transactions since session open).
- `openEcocashDay({ floatAmount, branchId })`
- `closeEcocashDay({ physicalUsd, expectedUsd, varianceReason })`
- `getEcocashEndDaySummary()` — categorized inflows/outflows for balancing.

---

### 3. Global lock — restrict other modules when EcoCash day is open

Extend `getDashboardState` in `teller-day.functions.ts` to also return `ecocashSession` so the existing `useDashboardState` hook exposes `isEcocashMode`.

Update `enforce_day_open()` trigger (or add a sibling trigger `enforce_not_in_ecocash_mode()`) on `payments`, `cash_advance`, `cash_swipes`, and non-ecocash `user_internal_transactions` inserts — reject if caller has an open `ecocash_sessions` row.

Frontend gates:
- `TellerSidebar`: when `ecocashSession` is open, disable Payments / Withdrawals / Cash Swipes / Cash Advance / Internal Transactions menu items, show "EcoCash Mode" badge.
- `src/routes/payments.tsx`, `withdrawals.tsx`, `changes-refunds.tsx`, `internal-transactions.tsx`, `end-day.tsx`: top guard — if `ecocashSession` open, render lock screen with warning copy and a button back to `/ecocash`.
- Conversely on `/ecocash`: if standard `teller_sessions` is open, show lock screen explaining standard-mode active.

---

### 4. UI — extend `src/components/EcocashModule.tsx`

Add a top "EcoCash Status" card with three states:
1. **Idle (no float)** — message: assign/approve float first.
2. **Ready (float approved, day closed)** — `OPEN ECOCASH DAY` button → modal confirming float amount + device.
3. **Open** — EcoCash Teller badge, session code, opened time, opening float, live totals, `CLOSE ECOCASH DAY` button → balancing modal.

Add `EcocashBalancingPanel`:
- Inflows: Opening Float, Internal Transfers Received, EcoCash Deposits, EcoCash Collections.
- Outflows: EcoCash Cash Outs, Transfers Sent, Float Returns.
- Totals (read-only), Expected Cash, Physical Count input, Variance (color: green=0, amber=positive, red=negative), variance reason field (required if non-zero).
- Pending transfer requests blocker — close disabled if any pending teller_transfers for user.
- Printable report + Export PDF (jsPDF + autotable, same pattern as end-day route).

Add `EcocashInternalTransfersTable` — auto-pulls approved `teller_transfers` and `user_internal_transactions` for the open ecocash session window.

Keep existing manual entry form but disable when no ecocash session open.

---

### 5. Realtime + audit
- Subscribe to `ecocash_sessions`, `teller_transfers`, `user_internal_transactions`, `ecocash_transactions` channels in the module.
- Every open/close writes an `audit_logs` row with module=`ecocash_day`, amounts, variance, device, ip, branch.

---

### Out of scope
- Multi-currency for ecocash balancing (USD only per spec).
- Reassignment of ecocash teller mid-day.
- Reopening a closed ecocash day.

### Files
- migration (new table + RPCs + trigger update)
- new: `src/lib/ecocash-day.functions.ts`, `src/components/EcocashBalancingPanel.tsx`, `src/components/EcocashStatusCard.tsx`
- edited: `src/components/EcocashModule.tsx`, `src/lib/teller-day.functions.ts` (expose ecocashSession), `src/hooks/useDashboardState.ts`, `src/components/TellerSidebar.tsx`, `src/routes/payments.tsx`, `withdrawals.tsx`, `changes-refunds.tsx`, `internal-transactions.tsx`, `end-day.tsx`, `ecocash.tsx`

After approval I'll run the migration first, then write the code in one batch.
