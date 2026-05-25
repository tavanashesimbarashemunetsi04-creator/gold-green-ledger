## Internal Teller Transfer Control – Implementation Plan

### Scope
Replace the current "anyone can record an internal inflow/outflow" flow with a controlled **transfer request → sending teller approval → linked dual ledger entries** workflow, with realtime notifications, audit logs, and End-Day Summary integration. USD only.

---

### 1. Database (single migration)

New table `public.teller_transfers`:
- `id`, `reference_code` (auto unique like `TT-YYMMDDHHMMSS-XXXX`)
- `requesting_user_id` (uuid) — teller who NEEDS cash
- `sending_user_id` (uuid) — teller who will OUTFLOW cash (the approver)
- `currency` text default `'USD'`
- `amount` numeric(14,2) > 0
- `reason` text
- `status` enum `transfer_status`: `pending | approved | rejected | cancelled`
- `requested_at`, `approved_at`, `rejected_at`, `rejection_reason`
- `request_device`, `request_ip`, `approval_device`, `approval_ip`
- `branch_id`
- `sending_inflow_uit_id` / `receiving_inflow_uit_id` (link to created `user_internal_transactions` rows on approval)

RLS:
- SELECT: requester, sender, admin, manager, finance_manager
- All writes go through SECURITY DEFINER RPCs (no direct INSERT/UPDATE policies)

New RPCs (SECURITY DEFINER):
- `request_teller_transfer(_sending_user uuid, _amount numeric, _reason text, _device text, _ip text)` — caller = requester; validates both users are different, both have open day, amount > 0; inserts pending row; writes audit log.
- `approve_teller_transfer(_id uuid, _device text, _ip text)` — caller must equal `sending_user_id`; verifies sending teller has sufficient cash-at-hand (lifetime UIT inflows – outflows for sender ≥ amount); verifies both tellers still have open day; creates two `user_internal_transactions` rows sharing the same reference in `notes`:
  - sender: `kind='outflow'`, `category='teller_transfer_sent'`
  - receiver: `kind='inflow'`, `category='teller_transfer_received'`
  - Marks transfer `approved`; writes audit log.
- `reject_teller_transfer(_id uuid, _reason text, _device text, _ip text)` — caller must be sender; sets `rejected`; no balance changes; audit log.
- `cancel_teller_transfer(_id uuid)` — caller must be requester AND status `pending`; sets `cancelled`; audit log.

Extend enum `internal_tx_category` (if needed) to include `teller_transfer_sent` and `teller_transfer_received`. (Will check current enum in migration.)

Enable realtime on `teller_transfers`.

---

### 2. Server functions — `src/lib/teller-transfers.functions.ts`
- `listTellers()` — returns active tellers (id, username, display_name) for the dropdown.
- `listTransfers()` — returns rows visible to the caller, with joined usernames.
- `requestTransfer({ sendingUserId, amount, reason })`
- `approveTransfer({ id })`
- `rejectTransfer({ id, reason })`
- `cancelTransfer({ id })`

All use `requireSupabaseAuth`; call new RPCs. Capture `getRequestIP` and `device` header.

---

### 3. End-Day Summary integration
Update `getEndDaySummary` in `src/lib/teller-day.functions.ts` so the new categories `teller_transfer_sent` / `teller_transfer_received` appear in the existing `outflows.internal` / `inflows.internal` arrays with narration "Teller Transfer Sent/Received to/from <username> · <reason>" and the shared reference code. (Already auto-included because they're rows in `user_internal_transactions` — just relabel narration mapping.)

---

### 4. UI

Replace `src/components/InternalTransactionsModule.tsx` with a new `TellerTransfersModule` (keep route `/internal-transactions`):

- **Header**: "Request Transfer" button → modal (Recipient/Sender username = sending teller, amount USD, reason). Status auto = pending.
- **Pending Requests Awaiting My Approval** widget (highlighted) — for transfers where current user = sending teller.
  - Approve / Reject buttons (Reject opens reason modal). Pop-up confirmation showing requester, amount, reason, current balance, balance after.
- **Tabs / Tables**:
  - Pending (mine outgoing requests + awaiting-my-approval)
  - Approved
  - Rejected
- Columns: Reference, Date/Time, Requester, Sender, Amount USD, Reason, Status badge (green/orange/red), Actions.
- Search box + filter by status + date range.
- Realtime subscription to `teller_transfers` — refresh on insert/update.
- Notification bell in topbar (lightweight): badge count of pending approvals for current user; reuses same realtime subscription.
- Printable receipt per approved transfer (print-only stylesheet) + Export history to PDF (jsPDF + autotable, already used pattern or add).

---

### 5. Security & audit
- All status changes go through SECURITY DEFINER RPCs that write to `audit_logs` with actor, action (`transfer_request|approve|reject|cancel`), amounts, branch, device, ip, old/new status.
- Approved/rejected/cancelled rows are immutable — RPCs reject any change attempt; no UPDATE policy on table.
- Self-approval blocked at RPC level (`requesting_user_id <> sending_user_id` constraint + auth.uid check).

---

### 6. Out of scope (will note in response, not implement now)
- Multi-currency (USD-only per spec).
- Mobile app push notifications (web realtime + bell only).
- Custom-branded PDF; use a clean default layout.

---

### Files touched
- migration (new table, enum extension, RPCs, RLS, realtime)
- `src/lib/teller-transfers.functions.ts` (new)
- `src/lib/teller-day.functions.ts` (narration mapping for new categories)
- `src/components/TellerTransfersModule.tsx` (new) + replace usage in `src/routes/internal-transactions.tsx`
- `src/components/TransferNotificationBell.tsx` (new) + mount in `TellerSidebar.tsx`
- delete or archive old `InternalTransactionsModule.tsx`

After approval I'll run the migration first, then write the code in one batch.
