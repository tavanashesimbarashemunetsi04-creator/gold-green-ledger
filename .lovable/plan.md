# Teller Operational Day Dashboard

A complete rebuild of the home dashboard plus the backend rules that enforce operational day status across the app.

## 1. Database (migration)

New table `teller_sessions`:
- `id`, `user_id`, `branch_id`, `session_code` (short readable)
- `opened_at`, `opened_float_amount`, `opened_device`, `opened_ip`
- `closed_at`, `closing_cash_at_hand`, `closed_device`, `closed_ip`
- `status` enum: `open` | `closed`
- Partial unique index: one `open` session per `user_id`

Helper SQL function `current_open_session(uid)` returning the active row.

Server-side enforcement (the critical part):
- New trigger `enforce_day_open()` attached to INSERT on `payments`, `cash_swipes`, `cash_advance`, `ecocash_transactions`, `internal_transactions`. Raises if the acting user (auth.uid()) has no open session. Admins bypass.
- `profiles.day_open` kept in sync via trigger on `teller_sessions`.

RPCs (SECURITY DEFINER):
- `open_teller_day(_float numeric, _branch uuid, _device text)` — verifies `ready_to_open_day = true`, no existing open session, inserts row, sets `profiles.day_open = true`, writes audit_log.
- `close_teller_day(_cash_at_hand numeric, _device text)` — closes the open session, sets `profiles.day_open = false, ready_to_open_day = false`, writes audit_log.

## 2. Server functions (`src/lib/teller-day.functions.ts`)

All guarded by `requireSupabaseAuth`:
- `getDashboardState()` → `{ session, pendingFloat, todayTotals, recent }`
  - `pendingFloat`: latest pending `float_assignments` row for user
  - `todayTotals`: sums of payments / withdrawals (cash_advance) / internal in & out / cash at hand (opening_float + inflows − outflows from `user_internal_transactions` + today's net cash)
  - `recent`: last 20 user transactions across payments/cash_advance/internal merged + sorted
- `openDay({ floatAmount, branchId, device })` → calls `open_teller_day` RPC
- `closeDay({ cashAtHand, device })` → calls `close_teller_day` RPC

## 3. Frontend

### `src/routes/index.tsx` (rebuild)
- Greeting card: time-based hello, username (from profile), full date, branch name
- Status pill: green "Day Open · Session #XYZ" or red "Day Closed"
- Action buttons:
  - If no pending/approved float and no open session → disabled "Open Day" with caption "Waiting for finance float assignment"
  - If pending float → "Review Float" button → opens dialog showing amount + Approve/Reject (calls existing `approveFloat` / `rejectFloat`)
  - If approved float ready → enabled "Open Day" → confirm dialog → opens session
  - If session open → "Close Day" → confirm dialog (asks closing cash at hand) → closes
- 5 summary tiles: Total Payments, Total Withdrawals, Internal Inflow, Internal Outflow, Cash At Hand (highlighted with gradient + larger). Animated count-up.
- Recent Transactions panel with search filter, status badges (successful/pending/failed/reversed)
- Polls `getDashboardState` every 15s via TanStack Query

### `src/components/TellerSidebar.tsx`
- If day not open → render transaction nav items disabled + tooltip "Operational day not opened"
- If day closed today (had session) → "Operational day closed — view only"
- Read state from a shared `useDayStatus()` hook backed by the same query

### `src/hooks/useDayStatus.ts`
- Wraps `useQuery(getDashboardState)`, exposes `isDayOpen`, `canTransact`, `session`

### Transaction routes (`payments.tsx`, `withdrawals.tsx`, `internal-transactions.tsx`, `ecocash.tsx`, `changes-refunds.tsx`)
- Guard at top: if `!canTransact` show banner and disable forms (backend already blocks but frontend should reflect)

## 4. Audit logging
- Open/close RPCs insert into `audit_logs` with module='teller_day', includes amount, branch, session id, device

## Technical notes
- Device string built on client: `${platform} · ${userAgent slice}`; IP collected server-side via `getRequestIP`
- Number animation: simple `useEffect` interpolation, no extra deps
- Tile design tokens use existing `--gradient-primary`, `--gradient-gold`, shadow vars

## Out of scope
- Editing other transaction modules' UI beyond the disabled banner
- Reports module changes
