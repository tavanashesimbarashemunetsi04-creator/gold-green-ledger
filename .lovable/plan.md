# Admin Settings — Editable Configuration Center

A full configuration center at `/admin/settings` where admins edit every business rule, limit, bank, currency, and policy through the UI. All values persist in the database; nothing is hardcoded. Every change is audited.

---

## 1. Database (single migration)

### `app_settings`
JSON-backed key-value store so new settings need no migrations.
- `key text PK` (e.g. `org.company_name`, `limits.high_value_threshold`)
- `category text` (organization | currencies | banks | limits | float | sessions | security | users | approvals | notifications | reports | audit | system)
- `value jsonb NOT NULL` — flexible payload
- `value_type text` (string | number | boolean | json | time | enum)
- `validation jsonb` — `{ min, max, regex, enum, required }`
- `description text`, `is_sensitive boolean default false`
- `updated_by uuid references auth.users(id)`, `updated_at timestamptz default now()`
- RLS: SELECT for authenticated, write only via RPC `admin_update_setting`

### `app_setting_history`
- `id uuid PK`, `setting_key text`, `old_value jsonb`, `new_value jsonb`
- `changed_by uuid`, `changed_at timestamptz default now()`, `change_reason text`
- RLS: SELECT for admin only

### `feature_flags`
- `key text PK`, `enabled boolean default false`, `rollout jsonb` (e.g. `{ branches: [], roles: [] }`)
- `updated_by`, `updated_at`
- RLS: SELECT authenticated, write via RPC

### Domain tables (proper relational storage for repeating items)
- `currencies` — `code PK`, `name`, `symbol`, `is_default boolean`, `disabled boolean`
- `currency_rates` — `id`, `from_code`, `to_code`, `rate numeric`, `rate_kind enum('payment','withdrawal')`, `effective_from date`, `effective_to date`, `created_by`, `created_at` — independent payment vs withdrawal rates
- `bank_directory` — `id`, `name`, `code`, `swift`, `disabled boolean`, `branch_specific jsonb`
- `branch_limits` — `id`, `branch_id`, `limit_type enum('transaction','withdrawal','cash_advance','ecocash','float')`, `amount numeric NULL` (NULL = no limit), `currency`, `effective_from date`, `created_by`

### RPCs (SECURITY DEFINER, admin-gated)
- `admin_update_setting(_key text, _new_value jsonb, _reason text)` — validates, upserts, logs to `app_setting_history` + `audit_logs` (action='setting_update', module='admin_settings')
- `admin_bulk_update_settings(_changes jsonb)` — array of `{key, value, reason}`
- `admin_restore_defaults(_category text)` — resets category to defaults defined in setting `system.defaults`
- `admin_force_logout_all()` — invalidates all sessions, audit-logged
- `admin_lock_system(_locked boolean, _reason text)` — toggles maintenance mode

### Seeded defaults (in migration)
All settings listed in the request seeded with sensible defaults. Examples:
- `sessions.auto_logout_minutes` → `7`, validation `{ enum: [5,7,10,15,30,60] }`
- `sessions.auto_close_time` → `"22:00"`
- `sessions.allow_one_reopen` → `true`
- `limits.high_value_threshold` → `null` (no limit), etc.

---

## 2. Server functions — `src/lib/admin-settings.functions.ts`

All gated with `requireSupabaseAuth` + admin role check.

- `listSettings(category?)` → returns settings grouped by category with metadata
- `updateSetting({ key, value, reason })` → calls RPC
- `bulkUpdateSettings(changes[])` → calls RPC
- `getSettingHistory(key, limit?)` → joined with profile name
- `listCurrencies()` / `upsertCurrency()` / `deleteCurrency(code)`
- `listRates(kind)` / `upsertRate()` / `deleteRate(id)`
- `listBanks()` / `upsertBank()` / `deleteBank(id)` / `toggleBankDisabled(id)`
- `listBranchLimits()` / `upsertBranchLimit()` / `deleteBranchLimit(id)`
- `forceLogoutAll()` / `lockSystem(boolean, reason)`
- `exportConfiguration()` → JSON dump of settings + domain tables
- `importConfiguration(json)` → validates then bulk-applies
- `restoreDefaults(category)`

---

## 3. Routes & UI

- `src/routes/admin.settings.tsx` — page with sidebar tabs, search bar, sticky save bar
- `src/components/admin/settings/`
  - `SettingsLayout.tsx` — tab nav (14 tabs), global search, unsaved-changes indicator, "Save all changes" button
  - `SettingField.tsx` — generic field: shows current value, Edit / Save / Cancel buttons, validation errors, "Last modified by X on Y", history popover (last 10 changes)
  - `SectionSaveBar.tsx` — per-section save
  - Tab panels: `OrganizationTab`, `CurrenciesTab` (sub-tabs: list, payment rates, withdrawal rates), `BanksTab`, `LimitsTab` (global + branch-specific table), `FloatTab`, `SessionsTab`, `SecurityTab`, `UsersTab`, `ApprovalsTab`, `NotificationsTab`, `ReportsTab`, `AuditTab`, `SystemTab`, `DangerZoneTab`
  - `HistoryDrawer.tsx` — full change history for any setting
  - `ConfirmDestructive.tsx` — typed-confirmation modal for Danger Zone actions
  - "No Limit" toggle on every numeric limit field
  - Effective-date picker on limit changes
  - Inline editing, optimistic save, toast feedback

### UX details
- Search filters settings across all tabs by key/description
- Unsaved changes tracked in a context provider; warn on tab change and beforeunload
- Bulk save calls `bulkUpdateSettings` in a single RPC
- Responsive (mobile collapses tab nav to dropdown)
- Dark mode via existing theme tokens

---

## 4. Audit & history

Every mutation:
1. Writes to `app_setting_history` (old/new value, who, when, reason)
2. Writes to `audit_logs` with `module='admin_settings'`, `action='setting_update'`, `new_data={key, old, new, reason}`

`HistoryDrawer` reads from `app_setting_history` joined with `profiles` for display.

---

## 5. Integration

Settings are read by other modules through a thin client hook `useSetting(key)` that subscribes via realtime to `app_settings`. Existing hardcoded constants (e.g. `IDLE_TIMEOUT`, `AUTO_CLOSE_TIME`) get migrated to setting reads in a follow-up pass — for this turn, the settings page itself is the deliverable; module rewiring beyond the settings page is out of scope and tracked as a TODO.

---

## Files

**New**
- migration (3 system tables + 4 domain tables + RPCs + seeds)
- `src/lib/admin-settings.functions.ts`
- `src/routes/admin.settings.tsx`
- `src/components/admin/settings/*` (~16 files)
- `src/hooks/useSetting.ts`

**Edited**
- `src/components/AdminSidebar.tsx` — Settings link already exists; no change

---

## Out of scope (this turn)
- Rewiring every existing module to read from `app_settings` (separate pass)
- Email template editor UI
- Role-permission matrix editor (Users tab will list default role + workflows; full RBAC matrix is large enough to be its own feature)
- Backup execution (config UI only; actual backup job is platform-level)

Approve and I'll run the migration first, then ship the code in one batch.
