## Daily Teller Role Assignment

Add a mandatory **Daily Role** to every float assignment that controls which modules, sessions, and routes a teller can access for that business day. Enforce it across UI, router, server functions, RPCs, and the database.

### 1. Database (migration)

New enum + table:

```text
CREATE TYPE public.daily_teller_role AS ENUM
  ('Ecocash_Teller','Agency_Banking_Teller','Dual_Role_Teller');

CREATE TABLE public.daily_teller_assignments (
  id uuid PK default gen_random_uuid(),
  teller_user_id uuid NOT NULL REFERENCES auth.users(id),
  branch_id uuid NULL REFERENCES branches(id),
  float_assignment_id uuid NULL REFERENCES float_assignments(id),
  assigned_role daily_teller_role NOT NULL,
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamptz default now(),
  business_date date NOT NULL default (now() AT TIME ZONE 'UTC')::date,
  status text NOT NULL default 'active',  -- active | superseded | revoked
  UNIQUE (teller_user_id, business_date, status)  -- 1 active role per teller per day
);
```

Add GRANTs + RLS (select for self / admin / finance_manager; insert/update only via SECURITY DEFINER RPCs).

Alter `float_assignments` → add column `assigned_role daily_teller_role NULL` (nullable for legacy rows; new inserts via RPC require it).

RPCs (SECURITY DEFINER):
- `assign_daily_role(_teller, _role, _branch, _float_assignment_id)` — admin/finance only; blocks change if transactions exist for that teller's current business date (checks payments, withdrawals, ecocash_transactions, internal_transactions).
- Extend `approve_float_assignment` to also copy `assigned_role` into a `daily_teller_assignments` row when the teller approves their float.
- Extend `open_teller_day` to require role ∈ {Agency_Banking_Teller, Dual_Role_Teller}.
- Extend `open_ecocash_day` to require role ∈ {Ecocash_Teller, Dual_Role_Teller}.
- All write audit_logs entries.

### 2. Server functions

- `assignFloat` (src/lib/float.functions.ts): add required `assigned_role` to zod schema; insert into `float_assignments`.
- New `changeDailyRole` server fn → calls `assign_daily_role` RPC.
- New `getMyDailyRole` server fn → returns today's active row for the current user.

### 3. UI

**Admin float form** (`src/routes/admin.float.tsx`): add required `<Select>` for Daily Role (Ecocash / Agency Banking / Dual Role). Disable Submit until chosen. Show current role on each teller row with "Change Role" button (calls `changeDailyRole`, surfaces the "Role assignment cannot be changed after transactions have been recorded" error from RPC).

**Teller sidebar** (`src/components/TellerSidebar.tsx`): fetch today's role via `getMyDailyRole`; build allowed-modules set:

```text
Ecocash_Teller        → Dashboard, My Float, Ecocash, Internal Tx, End Day, My Account, Settings
Agency_Banking_Teller → Dashboard, My Float, Payments, Withdrawals, End Day, My Account, Settings
Dual_Role_Teller      → all of the above
```

Hide blocked items entirely (admins still see all). Show role badge under user email.

**Open-day modal** (extend `useDashboardState` consumer): for Dual Role show "Select Session To Open" with three buttons — Open Agency Banking Day, Open Ecocash Day, Open Both. "Both" calls `open_teller_day` then `open_ecocash_day` sequentially. Single-role tellers see only their one option.

**Dashboard session status card**: for Dual Role, show two independent Open/Closed badges and per-session open/close buttons.

**End Day**: for Dual Role require both sessions balanced before "Close Business Day" enables.

### 4. Route protection

Add a `<RoleGate>` wrapper used inside each protected route (`payments`, `withdrawals`, `ecocash`, `internal-transactions`). It calls `getMyDailyRole` and redirects to `/` with a toast if the route isn't in the allowed set. Admin bypasses. This complements the sidebar-hide so URL typing is blocked.

### 5. Reports / audit

- Float Assignment table, End Day Summary, Manager balancing views, Audit Logs list → display `assigned_role` column (label "Ecocash Teller" / "Agency Banking Teller" / "Dual Role Teller").
- Every RPC writes `audit_logs` with `module='daily_role'` and action `role_assigned` / `role_changed` / `session_opened`.

### 6. Security checklist

- DB: enum + RLS + SECURITY DEFINER RPCs are the source of truth.
- RPCs reject role changes when transactions exist.
- Server fns re-check role via `has_role` for admin/finance writes.
- Router gate + sidebar hide + RPC reject = defense in depth.

### Scope notes

This is a large change touching ~12 files plus a migration. I'll implement it end-to-end in one pass after you approve. Legacy float assignments without a role will be treated as `Agency_Banking_Teller` by default so existing tellers aren't locked out.
