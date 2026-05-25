## Manager Portal & Balancing Control System

A dedicated portal at `/manager/*` accessible only to users with the `manager` or `admin` role. Mirrors the structure of the existing `/admin` portal (separate sidebar, layout, route group).

---

### 1. Database (single migration)

**New table `public.teller_balancing`** — one row per (teller, business_date):
- `id`, `teller_user_id`, `branch_id`, `business_date`
- `teller_session_id` (nullable, link to closed `teller_sessions`)
- `ecocash_session_id` (nullable, link to closed `ecocash_sessions`)
- `status` enum `balancing_status` (`pending` | `in_review` | `balanced`)
- `balanced_by_user_id`, `balanced_at`
- `manager_comments` (text)
- `expected_usd`, `physical_usd`, `variance_usd` (snapshot at balance time)
- `reviewed_tx_refs` (jsonb array of `{table, id, ticked_at}`) — checkbox state
- Unique `(teller_user_id, business_date)`
- RLS: SELECT for owner teller + manager/admin/finance_manager; writes via RPCs only

**New RPCs (SECURITY DEFINER):**
- `manager_save_review(_teller_user_id, _business_date, _reviewed_refs jsonb, _comments text)` — upsert row, status='in_review', log audit
- `manager_balance_teller(_teller_user_id, _business_date, _physical_usd, _expected_usd, _comments, _device, _ip)` — must be manager/admin; locks row to `balanced`, snapshots variance, writes audit log with module='manager_balance'. Rejects if already balanced.

Realtime: enable on `teller_balancing`.

---

### 2. Server functions — `src/lib/manager-portal.functions.ts`

All gated with `requireSupabaseAuth` + role check (`manager` or `admin`).

- `getManagerDashboard()` — returns array of `TellerCard`: profile, open `teller_sessions`/`ecocash_sessions`, current computed balance (sum of `user_internal_transactions`), opening float, last activity timestamp (max of created_at across tx tables), status derived (open_day | ecocash | closed | offline), variance status from latest `teller_balancing`.
- `getManagerBalancingList(businessDate)` — like dashboard but scoped to a date, includes open/close times, ecocash status, balancing status.
- `getTellerDayDetail(tellerUserId, businessDate)` — returns categorized transactions: payments, withdrawals (cash_advance + cash_swipes), internal (teller_transfers + user_internal_transactions), pending, failed, changes_refunds (status changes from audit_logs where action='status_change'), ecocash_transactions, end_day_totals (mirrors existing `getEndDaySummary` shape).
- `saveManagerReview({ tellerUserId, businessDate, reviewedRefs, comments })`
- `balanceTeller({ tellerUserId, businessDate, physicalUsd, expectedUsd, comments })`

---

### 3. Routes & layout

- `src/routes/manager.tsx` — layout route, gates on `isManager`, renders `<ManagerSidebar />` + `<Outlet />`. Wire into `__root.tsx` shell exception list (like `/admin`).
- `src/routes/manager.index.tsx` — Dashboard tab
- `src/routes/manager.balancing.tsx` — Balancing tab (tiles)
- `src/routes/manager.teller.$userId.tsx` — Teller Balancing View (tabbed)
- `src/routes/manager.audit.tsx` — Manager audit feed (filtered audit_logs where module IN manager actions)

---

### 4. UI Components — `src/components/manager/`

- `ManagerSidebar.tsx` — Dashboard / Balancing / Audit / Back to Teller
- `TellerStatusCard.tsx` — tile with status dot (green/orange/red/grey), name, username, balance, opening float, last activity, variance badge
- `TellerBalancingCard.tsx` — balancing tile (links to teller detail)
- `TellerDetailTabs.tsx` — tab nav for the 8 sub-tabs
- `tabs/PaymentsTab.tsx`, `WithdrawalsTab.tsx`, `InternalTab.tsx`, `PendingTab.tsx`, `FailedTab.tsx`, `ChangesRefundsTab.tsx`, `EcocashRecordsTab.tsx`, `EndDaySummaryTab.tsx`
- `EndDaySummaryTab` — full inflow/outflow breakdown + per-row review checkboxes, sticky balance summary, manager comments, BALANCE button (modal with physical count + comments). After balanced: read-only banner "Balanced by [Name] · [Date] · [Branch]", green badge.
- PDF export via jsPDF + autotable (same pattern as `end-day.tsx`)

Filters/search on dashboard & balancing tabs (status, branch, text search).

Realtime subscriptions: `teller_sessions`, `ecocash_sessions`, `user_internal_transactions`, `teller_balancing`, `payments`, `cash_advance`, `cash_swipes`.

---

### 5. Audit logging

Every manager action writes to `audit_logs` with:
- `actor_user_id` (manager), `target_user_id` (teller), `action` (`manager_review` | `manager_balance` | `manager_comment`), `module='manager_portal'`, `branch_id`, `device_ip`, `new_data` (refs reviewed, variance, comments)

Manager audit feed pulls these for display.

---

### Out of scope
- Editing teller transactions (managers are read-only per spec)
- Unbalancing / reopening a balanced day
- Multi-currency in balancing snapshot (USD only, matches existing modules)

### Files
- migration (new table + 2 RPCs + realtime)
- new: `src/lib/manager-portal.functions.ts`, `src/routes/manager.tsx`, `manager.index.tsx`, `manager.balancing.tsx`, `manager.teller.$userId.tsx`, `manager.audit.tsx`, `src/components/manager/*` (sidebar, cards, tabs)
- edited: `src/routes/__root.tsx` (add `/manager` to layout-bypass), `src/components/TellerSidebar.tsx` (optional "Manager Portal" link for managers)

After approval I'll run the migration first, then write the code in one batch.
