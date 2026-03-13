

# Deep QA Report — All Issues Found

## CRITICAL: Database Migration Never Applied

The migration from the previous session (`20260313090451`) **only** dropped `is_current_user_admin_by_metadata()` and recreated RLS policies. The role enum expansion and `page_permissions` column additions **were never included** in any executed migration.

**Current DB state:**
- `user_role` enum: only `admin`, `manager`, `user` — missing `super_admin`, `sales_head`, `field_sales`, `inside_sales`
- `page_permissions` table: only has `admin_access`, `manager_access`, `user_access` — missing all 4 new role columns
- No `Campaigns` row in `page_permissions`
- `is_user_admin()` still checks `= 'admin'` only (not `super_admin`)

**Frontend already references** all new roles and columns (PermissionsContext, ChangeRoleModal, PageAccessSettings, useUserRole). This means:
- Changing a user to `super_admin` will fail (enum doesn't exist)
- PageAccessSettings shows 7 columns but DB only has 3 → queries return `null` for new columns
- `isAdmin` in frontend includes `super_admin` but DB `is_user_admin()` does not

---

## All 18 Issues + Database Fix

### Issue 0 (CRITICAL — BLOCKER): Apply missing DB migration

**SQL migration needed:**

```sql
-- 1. Add new enum values
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales_head';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'field_sales';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'inside_sales';

-- 2. Add new columns to page_permissions
ALTER TABLE page_permissions
  ADD COLUMN IF NOT EXISTS super_admin_access boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sales_head_access boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS field_sales_access boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS inside_sales_access boolean DEFAULT true;

-- 3. Set Inside Sales restrictions
UPDATE page_permissions SET inside_sales_access = false 
WHERE route IN ('/deals', '/action-items');

-- 4. Add missing Campaigns row
INSERT INTO page_permissions (page_name, route, description, admin_access, manager_access, user_access, super_admin_access, sales_head_access, field_sales_access, inside_sales_access)
VALUES ('Campaigns', '/campaigns', 'Campaign management', true, true, true, true, true, true, true)
ON CONFLICT DO NOTHING;

-- 5. Update is_user_admin to include super_admin
CREATE OR REPLACE FUNCTION public.is_user_admin(user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT get_user_role(user_id) IN ('admin', 'super_admin');
$$;

-- 6. Drop disabled triggers (cleanup)
DROP TRIGGER IF EXISTS deal_action_item_notification_trigger ON deal_action_items;
DROP TRIGGER IF EXISTS action_item_notification_trigger ON lead_action_items;

-- 7. Fix validate_deal_dates (allow future dates)
CREATE OR REPLACE FUNCTION public.validate_deal_dates()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.implementation_start_date IS NOT NULL AND (NEW.handoff_status IS NULL OR NEW.handoff_status = '') THEN
    RAISE EXCEPTION 'Handoff status is required when implementation start date is set';
  END IF;
  RETURN NEW;
END;
$$;
```

### Issue 1: Dashboard hardcoded years
**File:** `src/pages/Dashboard.tsx` line 6
**Fix:** Replace `const availableYears = [2023, 2024, 2025, 2026]` with dynamic generation:
```ts
const currentYear = new Date().getFullYear();
const availableYears = Array.from({length: 5}, (_, i) => currentYear - 2 + i);
```
Also change header from "Revenue Analytics" to "Dashboard".

### Issue 2: Delete dead Index.tsx
**File:** `src/pages/Index.tsx` — 285 lines of unreachable dead code. Delete entirely.

### Issue 3: Notification unread count — unbounded SELECT
**File:** `src/hooks/useNotifications.tsx` lines 70-78
**Fix:** Replace `select('id')` with `select('*', { count: 'exact', head: true })`:
```ts
const { count, error: unreadError } = await supabase
  .from('notifications')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .eq('status', 'unread');
if (!unreadError) setUnreadCount(count || 0);
```

### Issue 4: Contacts bulk delete — no confirmation
**File:** `src/pages/Contacts.tsx` line 46-66
**Fix:** Add `AlertDialog` confirmation before executing bulk delete.

### Issue 5: Accounts bulk actions — no delete button
**File:** `src/pages/Accounts.tsx` lines 118-128
**Fix:** Add Delete and bulk action buttons to the bulk selection bar.

### Issue 6: Remove 65 console.logs from DealsPage
**File:** `src/pages/DealsPage.tsx`
**Fix:** Remove all `console.log` debug statements. Keep only `console.error`.

### Issue 7: Notification type badge regex
**File:** `src/pages/Notifications.tsx` line 257
**Fix:** Change `.replace('_', ' ')` to `.replace(/_/g, ' ')`.

### Issue 8: ModuleType missing 'campaigns'
**File:** `src/hooks/useActionItems.tsx` line 10
**Fix:** Change `type ModuleType = 'accounts' | 'contacts' | 'deals'` to include `'campaigns'`.

### Issue 9: Add ErrorBoundary
**New file:** `src/components/ErrorBoundary.tsx`
**Fix:** Create React class component ErrorBoundary. Wrap `<AppRouter />` in `App.tsx`.

### Issue 10: DealForm redundant getUser() call
**File:** `src/components/DealForm.tsx` lines 43-54
**Fix:** Replace `supabase.auth.getUser()` with `useAuth()` hook which is already available.

### Issue 11: Auth.tsx redundant signOut + empty CardDescription
**File:** `src/pages/Auth.tsx`
- Lines 82-88: Remove pre-login `signOut({ scope: 'global' })` — causes unnecessary overhead
- Line 152-153: Empty `<CardDescription>` — add text or remove

### Issue 12: Settings useEffect missing dependency
**File:** `src/pages/Settings.tsx` line 74
**Fix:** The `activeTab` is already in the deps array. This is actually fine — no fix needed.

### Issue 13: AnimatedStageHeaders React.Fragment warning
**File:** `src/components/kanban/AnimatedStageHeaders.tsx` line 71
**Fix:** Console error shows `data-lov-id` prop on `React.Fragment`. This is a Lovable dev-mode issue — harmless in production but should use a `<div>` wrapper instead of `Fragment` if props are needed.

### Issue 14: `page_permissions` INSERT policy missing
The `page_permissions` table has no INSERT policy — admins can't add new page permission rows from the UI. Only UPDATE is allowed.
**Fix:** Add INSERT policy for admins in the migration.

### Issue 15: `is_user_admin()` doesn't recognize super_admin
**DB function:** Currently `get_user_role(user_id) = 'admin'` — super_admin won't pass admin checks in RLS policies.
**Fix:** Already covered in Issue 0 migration.

### Issue 16: Edge function deployed but not re-deployed
The `user-admin` edge function code has `VALID_ROLES` with all 6 roles, but the DB enum only has 3. Calling `update_user_role` RPC with `super_admin` will fail with a cast error until the enum migration runs.

### Issue 17: Hide Reports tab in AdminSettingsPage
**File:** `src/components/settings/AdminSettingsPage.tsx`
No Reports tab exists currently (it was removed). No action needed.

---

## Implementation Plan

### Step 1: SQL Migration (Issues 0, 14, 15)
Single migration with:
- Enum expansion (4 new values)
- `page_permissions` columns (4 new boolean columns)
- Inside Sales defaults
- Campaigns row
- `is_user_admin()` update to include `super_admin`
- Drop disabled triggers
- Fix `validate_deal_dates`
- Add INSERT policy for `page_permissions`

### Step 2: Frontend Fixes (Issues 1-11, 13)
All in parallel:
- `Dashboard.tsx`: dynamic years + header text
- Delete `Index.tsx`
- `useNotifications.tsx`: head:true count
- `Contacts.tsx`: AlertDialog for bulk delete
- `Accounts.tsx`: bulk delete button + confirmation
- `DealsPage.tsx`: remove console.logs
- `Notifications.tsx`: regex fix
- `useActionItems.tsx`: add 'campaigns' to ModuleType
- New `ErrorBoundary.tsx` + wrap in `App.tsx`
- `DealForm.tsx`: use useAuth instead of getUser
- `Auth.tsx`: remove redundant signOut, fix empty description

### Step 3: Redeploy Edge Function (Issue 16)
Redeploy `user-admin` after DB migration so enum values match.

**Total: 16 actionable fixes** (Issues 12 and 17 need no action)

