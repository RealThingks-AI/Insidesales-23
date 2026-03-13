

# Plan: Add New Roles + PageAccessGuard + Update Page Permissions

## Current State

- **DB enum `user_role`**: only `admin`, `manager`, `user`
- **`page_permissions` table**: only has `admin_access`, `manager_access`, `user_access` boolean columns
- **`PermissionsContext`**: fetches role + permissions separately (2 queries), checks access via `hasPageAccess()` but **never enforced in routes**
- **`ChangeRoleModal`**: only shows Admin/User options
- **Edge function `user-admin`**: validates roles as `['admin', 'user']` only
- **`Settings.tsx`**: uses `useUserRole()` to check `isAdmin` for showing admin tabs
- **Sidebar**: shows all menu items to all users — no filtering by access

## New Roles Definition

| Role | DB Value | Pages | Admin Settings |
|------|----------|-------|----------------|
| Super Admin | `super_admin` | All | Yes |
| Admin | `admin` (existing) | All | Yes |
| Sales Head | `sales_head` | All except Administration | No |
| Field Sales | `field_sales` | All except Administration | No |
| Inside Sales | `inside_sales` | Dashboard, Accounts, Contacts, Campaigns, Notifications, Settings (account only) | No |
| User | `user` (existing) | Based on `page_permissions` user_access column | No |

## Changes Required

### 1. Database Migration

**a. Add new enum values:**
```sql
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales_head';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'field_sales';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'inside_sales';
```

**b. Add new columns to `page_permissions`:**
```sql
ALTER TABLE page_permissions
  ADD COLUMN super_admin_access boolean DEFAULT true,
  ADD COLUMN sales_head_access boolean DEFAULT true,
  ADD COLUMN field_sales_access boolean DEFAULT true,
  ADD COLUMN inside_sales_access boolean DEFAULT true;
```

**c. Set correct defaults for Inside Sales** (only Accounts, Contacts, Campaigns, Dashboard, Notifications, Settings):
```sql
UPDATE page_permissions SET inside_sales_access = false WHERE route IN ('/deals', '/action-items');
UPDATE page_permissions SET inside_sales_access = true WHERE route IN ('/accounts', '/contacts', '/campaigns', '/dashboard', '/notifications', '/settings');
```

**d. Add Campaigns to `page_permissions`** (currently missing):
```sql
INSERT INTO page_permissions (page_name, route, description, admin_access, manager_access, user_access, super_admin_access, sales_head_access, field_sales_access, inside_sales_access)
VALUES ('Campaigns', '/campaigns', 'Campaign management', true, true, true, true, true, true, true)
ON CONFLICT (route) DO NOTHING;
```

### 2. Update `PermissionsContext.tsx`

- Update `PagePermission` interface to include new role columns
- Update `hasPageAccess()` switch to handle all 6 roles: `super_admin`, `admin`, `sales_head`, `field_sales`, `inside_sales`, `user`
- Add helper booleans: `isSuperAdmin`, `isSalesHead`, `isFieldSales`, `isInsideSales`
- `isAdmin` should be `true` for both `admin` AND `super_admin` (backward compat)
- Performance: keep the existing React Query caching (5min/10min stale times) — no extra queries needed

### 3. Create `PageAccessGuard` in `App.tsx`

Add a lightweight component inside `ProtectedRoute` that calls `hasPageAccess(location.pathname)`:

```tsx
const PageAccessGuard = ({ children }) => {
  const { pathname } = useLocation();
  const { hasPageAccess, loading } = usePermissions();
  
  if (loading) return <LoadingSpinner />;
  if (!hasPageAccess(pathname)) return <AccessDenied />;
  return <>{children}</>;
};
```

Insert inside `ProtectedRoute` wrapping children inside `FixedSidebarLayout`. This adds zero network requests — it uses already-cached data from `PermissionsContext`.

### 4. Update Sidebar (`AppSidebar.tsx`)

Filter `menuItems` based on `hasPageAccess()` so users only see pages they can access. Import `usePermissions` and filter the array before rendering.

### 5. Update `Settings.tsx`

- Change admin check: `isAdmin` should include `super_admin` 
- Use `usePermissions()` instead of `useUserRole()` for consistency

### 6. Update `ChangeRoleModal.tsx`

- Add all 6 roles to the Select dropdown with appropriate icons and descriptions
- Update permissions description panel for each role

### 7. Update Edge Function `user-admin/index.ts`

- Line 156: expand valid roles: `['admin', 'user', 'super_admin', 'sales_head', 'field_sales', 'inside_sales']`
- Line 63: ensure `super_admin` is treated as admin for authorization checks

### 8. Update `useUserRole.tsx`

- Update `isAdmin` to include `super_admin`: `const isAdmin = userRole === 'admin' || userRole === 'super_admin'`
- Add convenience flags for new roles

### 9. Update `PageAccessSettings.tsx`

- Add columns for all 6 roles in the table header and body
- Each role gets its own Switch toggle

### 10. Update `AdminSettingsPage.tsx`

- Allow `super_admin` access (not just `admin`)

## Performance Impact

- **Zero additional queries** — roles and permissions already fetched once on login via React Query with long cache times
- **PageAccessGuard** is a pure in-memory check against cached data
- **Sidebar filtering** is a simple `.filter()` on a 6-item array
- No change to page load speed for any user role

## Files to Modify

| File | Change |
|------|--------|
| SQL Migration | Add enum values + page_permissions columns |
| `src/contexts/PermissionsContext.tsx` | Add new roles to interface + hasPageAccess |
| `src/App.tsx` | Add PageAccessGuard + AccessDenied component |
| `src/components/AppSidebar.tsx` | Filter menu items by access |
| `src/pages/Settings.tsx` | Use permissions context, expand admin check |
| `src/components/ChangeRoleModal.tsx` | Add all 6 roles |
| `src/components/settings/PageAccessSettings.tsx` | Add 6 role columns |
| `src/components/settings/AdminSettingsPage.tsx` | Allow super_admin |
| `src/hooks/useUserRole.tsx` | Expand isAdmin to include super_admin |
| `supabase/functions/user-admin/index.ts` | Accept new role values |

