## Admin Settings — Fully Editable Configuration Center

Build a comprehensive Admin Settings page where every business rule, limit, threshold, bank, currency, and policy is editable through the UI and persisted to the database. No hardcoded values.

### 1. Database (one migration)

**`app_settings`** — JSON-based key/value store so new settings can be added without migrations.
- `key` (text, unique) — e.g. `organization.company_name`, `limits.high_value_threshold`
- `category` (text) — tab grouping (organization, currencies, banks, limits, float, sessions, security, users, approvals, notifications, reports, audit, system)
- `value` (jsonb) — the setting payload (string, number, object, array)
- `value_type` (text) — string | number | boolean | json | array
- `description` (text)
- `validation` (jsonb) — min/max/regex/options for client+server validation
- `last_modified_by` (uuid → auth.users)
- `last_modified_at` (timestamptz)

**`app_setting_history`** — full change log per setting.
- `setting_key`, `old_value` (jsonb), `new_value` (jsonb), `changed_by`, `changed_at`, `change_reason`

**`feature_flags`** — boolean toggles.
- `key` (unique), `enabled` (bool), `description`, `last_modified_by`, `last_modified_at`

**RLS:** admins read+write; everyone authenticated reads `app_settings` and `feature_flags` (so app code can consume them); only admins read `app_setting_history`. Trigger on `app_settings` UPDATE writes a history row and an `audit_logs` entry automatically.

Seed every setting listed in the request with sensible defaults so the UI has content on first load.

### 2. Server functions (`src/lib/admin-settings.functions.ts`)

All gated with `requireSupabaseAuth` + admin role check via `has_role`.

- `listSettings({ category? })` — fetch grouped settings
- `updateSetting({ key, value, reason? })` — validate against `validation` jsonb, write, trigger history+audit
- `bulkUpdateSettings({ updates[] })` — transactional save-all
- `getSettingHistory({ key, limit })`
- `forceLogoutAllUsers()` — admin-only danger action (revokes sessions via admin client)
- `toggleMaintenanceMode({ enabled, message? })`
- `exportConfiguration()` — returns JSON dump of all settings + flags
- `importConfiguration({ json })` — validates and applies

### 3. UI (`src/routes/_authenticated/admin/settings.tsx` + components)

A single page with:
- **Top bar:** global search across all settings, "Unsaved changes" badge, **Save All** button, **Cancel All**
- **Left tabs** (vertical on desktop, accordion on mobile): Organization · Currencies · Banks · Limits · Float · Sessions · Security · Users · Approvals · Notifications · Reports · Audit · System · **Danger Zone**
- **Per-setting card** (`SettingRow` component):
  - Label + description
  - **Current Value** display
  - **Edit** → switches to inline input matching `value_type` (text/number/switch/select/JSON editor/currency-rate table/bank table)
  - **Save** (per-row) and **Cancel** (per-row) buttons
  - "No Limit" toggle on numeric limit fields
  - **Last Modified By** + **Last Modified Date** shown beneath
  - **History** popover → last 20 changes from `app_setting_history`
  - Inline validation errors from the `validation` jsonb
- **Section-level Save** button beside each tab header (saves all dirty rows in that section)
- **Bulk Save All** in the top bar (commits every dirty row across tabs)
- Unsaved-changes warning on navigation (router `blocker`)

Specialized editors:
- **Currencies tab:** CRUD table + two sub-tables for *Payment Exchange Rates* and *Withdrawal Exchange Rates* managed independently; "Default Currency" radio.
- **Banks tab:** CRUD table with Enable/Disable, Delete, Bank Codes column.
- **Limits tab:** global limits + branch-override table (per branch × per limit type); each cell supports "No Limit"; "Effective Date" picker; admin-override switch; history modal.
- **Float tab:** opening defaults, teller/branch limits, variance tolerance, all with "No Limit" default option.
- **Sessions tab:** session timeout, auto-close switch + time picker (default 22:00), day-reopening rule explainer, multi-login policy.
- **Security tab:** password length/complexity, login attempts, lockout duration, idle timeout select (5/7/10/15/30/60, default 7), session expiry.
- **Users / Approvals / Notifications / Reports / Audit:** straightforward field editors.
- **System:** Maintenance Mode switch + announcement banner editor + backup config.
- **Danger Zone:** Force Logout All, Lock System, Export Config (download JSON), Import Config (upload JSON), Restore Defaults — each with a confirm dialog typing the action name.

Design: matches existing portal styling (semantic tokens, dark-mode aware, professional banking dashboard); responsive 1-column on mobile, 2-column setting grid on desktop.

### 4. Consumption

Add `src/hooks/useAppSetting.ts` that reads a setting by key via TanStack Query so the rest of the app can replace hardcoded constants over time (out of scope to refactor every caller in this pass — the request is to build the settings center).

### Out of scope

- Refactoring existing modules to consume every new setting (separate pass).
- Real cron-based auto-close execution (we store the config + expose it; wiring the scheduler is a follow-up).

Confirm and I'll build it.
