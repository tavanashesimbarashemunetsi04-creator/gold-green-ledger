# Finance Manager Role + Float Management Redesign

This is a large, multi-layer change. Below is the proposed plan — please confirm before I start building.

## 1. Database Migration

**Enum updates**
- Add `'finance_manager'` to `app_role` enum.
- New enum `float_assignment_status`: `pending`, `approved`, `rejected`, `cancelled`.
- New enum `internal_tx_category`: `opening_float`, `float_assignment`, `self_float`, `other`.

**New tables**
- `float_assignments` — `id, assigned_by_user_id, assigned_to_user_id, amount, branch_id, reference, notes, status, approved_at, rejected_at, rejection_reason, created_at`.
- `user_internal_transactions` — per-user ledger (`user_id, type inflow/outflow, category, amount, related_float_assignment_id, created_by, created_at`). Distinct from existing `internal_transactions` (teller-to-teller) so we don't break the current ecocash flow.
- Extend `audit_logs` with `role`, `module`, `amount`, `target_user_id`, `branch_id`, `device_ip` columns (nullable, additive only).

**Triggers / RPC**
- `approve_float_assignment(assignment_id)` SECURITY DEFINER: validates caller is `assigned_to`, status pending; inserts the two paired `user_internal_transactions`; flips status to `approved`; writes audit log. Atomic.
- `reject_float_assignment(assignment_id, reason)` — similar guards, no ledger writes.
- `assign_float(...)` helper that enforces no negative, no over-balance (computed from manager's ledger), no self-approval, writes audit log.
- View `user_balances` = sum of inflow − outflow per user.

**RLS**
- `float_assignments`: assignee & assigner can SELECT; only finance_manager/admin INSERT; UPDATE only via RPC.
- `user_internal_transactions`: owner + admin/finance_manager SELECT; INSERT only via SECURITY DEFINER functions.
- Admin-only writes on `audit_logs` (already restrictive).

## 2. Backend Server Functions (`src/lib/float.functions.ts`)
All use `requireSupabaseAuth` + admin role check:
- `assignFloat({ teller_user_id, amount, branch_id, reference, notes })`
- `approveFloat({ assignment_id, password })` — re-verifies password via `signInWithPassword` before RPC.
- `rejectFloat({ assignment_id, reason })`
- `selfAssignFloat({ amount, branch_id, reference })` — finance_manager only.
- `listPendingForMe()`, `listAssignedByMe()`, `getMyBalance()`.

## 3. Frontend

**Auth/role plumbing**
- Extend `useAuth` with `isFinanceManager`, helper `canAssignFloat`.
- Add **Mode Switcher** in header: Admin↔Teller for admins, Manager↔Teller for finance managers. Persisted in `localStorage` + audit-logged. Active mode shown as a badge.

**Admin Users page**
- Add `finance_manager` toggle to role controls.

**New routes**
- `/admin/float` — Float Management (assign form + list of assignments by status).
- `/admin/float/pending` — Pending approvals (manager-side view of awaiting tellers).
- `/admin/float/internal` — Internal transactions ledger (all users).
- `/admin/float/liquidity` — Teller liquidity snapshot.
- `/admin/float/reconciliation` — daily float reconciliation.
- `/finance` — Finance Manager dashboard (Available Float, Pending Approvals, Assigned Today, Returned, Teller Statuses, Open/Closed).
- `/teller/float` — Teller "Pending Float" inbox + Approve/Reject with password reconfirm.
- `/teller/open-day` — gated on approved float; flips teller to `READY_TO_OPEN_DAY`.

**Dashboard updates**
- Teller dashboard: Assigned Float, Pending Approval banner, Open Day button (disabled until approved), Current Cash, Internal Tx.
- Finance dashboard cards as listed in spec.

**Sidebars**
- `AdminSidebar`: add Float Management group (4 items).
- `FinanceSidebar` (new): Float Management, Pending Approvals, Internal Tx, Teller Liquidity, Reconciliation.
- `TellerSidebar`: add Pending Float, Approve Opening Float, Open Day items.

## 4. Security
- Password reconfirm modal before any approve/reject/self-float action.
- All RPCs SECURITY DEFINER with explicit caller checks (never trust client role claims).
- Audit log entries written from RPCs, not the client.
- Day-open gated server-side by checking latest approved float for the teller.

## 5. Scope of THIS task
Given the size, I propose shipping in this order in **one** turn:
1. Migration (enum + tables + RPCs + RLS).
2. Server functions.
3. Mode switcher + role wiring.
4. Float Management UI (assign + pending + approve/reject for teller).
5. Audit log surface.

The reconciliation page, liquidity heatmap, and self-float auto-approve toggle can land as a follow-up turn so this one stays reviewable. Confirm and I'll start with the migration.
