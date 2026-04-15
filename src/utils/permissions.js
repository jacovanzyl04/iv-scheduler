/**
 * Per-user permission model.
 *
 * Effective permission = override (users/{uid}.permissions[key]) ?? role default.
 *
 * Admin edits a user's permissions by storing just the OVERRIDES in
 * users/{uid}.permissions. Changing the role doesn't touch overrides; admin
 * can hit "Reset to role defaults" to clear them.
 *
 * Values:
 *   'full'  — read + write
 *   'view'  — read only
 *   false   — hidden / no access
 */

export const PERMISSION_KEYS = [
  'Weekly Schedule',
  'Monthly Calendar',
  'Staff Details',
  'Availability',
  'Pay Cycle Hours',
  'Timesheets',
  'Documents',
  'Vial Stock',
  'Stock Take',
  'Transfers',
  'Audit Log',
  'Manage Accounts',
];

// Sidebar page id → permission key.
// Pages mapped to `null` are always accessible (home / landing pages).
export const PAGE_TO_PERMISSION = {
  'dashboard':         null,
  'my-dashboard':      null,
  'schedule':          'Weekly Schedule',
  'full-schedule':     'Weekly Schedule',
  'calendar':          'Monthly Calendar',
  'staff':             'Staff Details',
  'availability':      'Availability',
  'my-availability':   'Availability',
  'hours':             'Pay Cycle Hours',
  'timesheets':        'Timesheets',
  'my-timesheet':      'Timesheets',
  'documents':         'Documents',
  'vial-stock':        'Vial Stock',
  'consumables-stock': 'Stock Take',
  'transfers':         'Transfers',
  'audit-log':         'Audit Log',
  'accounts':          'Manage Accounts',
};

export const ROLE_PERMISSIONS = {
  admin: {
    'Weekly Schedule':  'full',
    'Monthly Calendar': 'full',
    'Staff Details':    'full',
    'Availability':     'full',
    'Pay Cycle Hours':  'full',
    'Timesheets':       'full',
    'Documents':        'full',
    'Vial Stock':       'full',
    'Stock Take':       'full',
    'Transfers':        'full',
    'Audit Log':        'full',
    'Manage Accounts':  'full',
  },
  hr: {
    'Weekly Schedule':  'view',
    'Monthly Calendar': 'view',
    'Staff Details':    'view',
    'Availability':     false,
    'Pay Cycle Hours':  'full',
    'Timesheets':       'full',
    'Documents':        'full',
    'Vial Stock':       'view',
    'Stock Take':       'view',
    'Transfers':        'view',
    'Audit Log':        'full',
    'Manage Accounts':  false,
  },
  staff: {
    'Weekly Schedule':  'view',
    'Monthly Calendar': false,
    'Staff Details':    false,
    'Availability':     'full',
    'Pay Cycle Hours':  false,
    'Timesheets':       'full',
    'Documents':        'view',
    'Vial Stock':       'full',
    'Stock Take':       'full',
    'Transfers':        'full',
    'Audit Log':        false,
    'Manage Accounts':  false,
  },
};

export const ACCESS_LEVELS = [
  { id: false,   label: 'None',  text: 'text-d4l-dim',    bg: 'bg-d4l-hover/40', activeBg: 'bg-d4l-bg', activeText: 'text-d4l-muted' },
  { id: 'view',  label: 'View',  text: 'text-amber-400',  bg: 'bg-amber-500/10', activeBg: 'bg-amber-500/20', activeText: 'text-amber-300' },
  { id: 'full',  label: 'Full',  text: 'text-green-400',  bg: 'bg-green-500/10', activeBg: 'bg-green-500/20', activeText: 'text-green-300' },
];

export function getEffectivePermissions(user) {
  if (!user) return {};
  const roleDefaults = ROLE_PERMISSIONS[user.role] || {};
  const overrides = user.permissions || {};
  const out = { ...roleDefaults };
  for (const k of PERMISSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, k)) {
      out[k] = overrides[k];
    }
  }
  return out;
}

/** True if the page should be visible/navigable for this user. */
export function hasAccessToPage(user, pageId) {
  const key = PAGE_TO_PERMISSION[pageId];
  if (key === null || key === undefined) return true;
  return getEffectivePermissions(user)[key] !== false;
}

/** Equality helper that tolerates false vs. 'false' / undefined. */
export function sameAccess(a, b) {
  const norm = (v) => (v === false || v == null ? false : v);
  return norm(a) === norm(b);
}

/** Compute the minimal override map relative to role defaults. */
export function buildOverrides(role, effective) {
  const base = ROLE_PERMISSIONS[role] || {};
  const out = {};
  for (const k of PERMISSION_KEYS) {
    if (!sameAccess(effective[k], base[k])) {
      out[k] = effective[k] === false ? false : effective[k];
    }
  }
  return out;
}
