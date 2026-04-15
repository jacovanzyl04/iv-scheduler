/**
 * Unified audit log.
 *
 * Every call to `logAudit` writes a single entry at `audits/{id}` in Firebase
 * RTDB AND merges the same entry into localStorage synchronously. Two
 * properties together give us a durable, concurrent-safe log:
 *
 *  - Child-path writes: each entry lives at its own key, so parallel writes
 *    from different clients never clobber each other (unlike a full-state
 *    replace).
 *  - Synchronous localStorage merge inside the call: persistence does not
 *    depend on any useEffect firing.
 *
 * The receiving side (App.jsx subscription) merges snapshots into state
 * instead of replacing, so a partial Firebase snapshot cannot wipe entries.
 */

import { saveFirebaseChild } from './storage';

export const AUDIT_DOMAINS = {
  DOCUMENTS:   'documents',
  ACCOUNTS:    'accounts',
  STAFF:       'staff',
  SCHEDULE:    'schedule',
  PAY_CYCLE:   'pay_cycle',
  TIMESHEETS:  'timesheets',
  SYSTEM:      'system',
};

export const DOMAIN_LABELS = {
  documents:   'Documents',
  accounts:    'Accounts',
  staff:       'Staff',
  schedule:    'Schedule',
  pay_cycle:   'Pay Cycle',
  timesheets:  'Timesheets',
  system:      'System',
};

// Tailwind classes for domain chips on the viewer
export const DOMAIN_STYLES = {
  documents:   { color: 'text-purple-300', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  accounts:    { color: 'text-orange-300', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  staff:       { color: 'text-sky-300',    bg: 'bg-sky-500/10',    border: 'border-sky-500/30' },
  schedule:    { color: 'text-emerald-300',bg: 'bg-emerald-500/10',border: 'border-emerald-500/30' },
  pay_cycle:   { color: 'text-amber-300',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30' },
  timesheets:  { color: 'text-rose-300',   bg: 'bg-rose-500/10',   border: 'border-rose-500/30' },
  system:      { color: 'text-d4l-muted',  bg: 'bg-d4l-hover/40',  border: 'border-d4l-border' },
};

// Short action labels per domain (extend as new actions are added)
export const ACTION_LABELS = {
  // Documents (reserved — Documents has its own dedicated tab; included here
  // so the Audit Log viewer renders a consistent label if ever used)
  'documents.uploaded':   'Uploaded',
  'documents.edited':     'Edited',
  'documents.deleted':    'Deleted',
  'documents.downloaded': 'Downloaded',
  'documents.pinned':     'Pinned',
  'documents.unpinned':   'Unpinned',
  // Accounts
  'accounts.created':       'Account created',
  'accounts.deleted':       'Account deleted',
  'accounts.role_changed':  'Role changed',
  'accounts.updated':       'Account updated',
  'accounts.password_reset':'Password reset',
  // Staff
  'staff.created': 'Staff added',
  'staff.updated': 'Staff updated',
  'staff.deleted': 'Staff removed',
  // Schedule
  'schedule.published':      'Schedule published',
  'schedule.auto_generated': 'Auto-scheduled',
  'schedule.cleared':        'Schedule cleared',
  // Pay cycle
  'pay_cycle.extra_added':     'Extra day added',
  'pay_cycle.extra_removed':   'Extra day removed',
  'pay_cycle.overtime_added':  'Overtime added',
  'pay_cycle.overtime_removed':'Overtime removed',
  // Timesheets
  'timesheets.status_changed': 'Status changed',
  'timesheets.file_uploaded':  'File uploaded',
  'timesheets.file_removed':   'File removed',
};

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Log one audit entry.
 *
 * @param {Object} entry
 * @param {string} entry.domain       — AUDIT_DOMAINS value
 * @param {string} entry.action       — short action identifier, e.g. 'created'
 * @param {string} [entry.targetId]
 * @param {string} [entry.targetLabel]— human-readable label
 * @param {string[]} [entry.details]  — bullet-list lines
 * @param {Array<{field,from,to}>} [entry.changes] — field diffs
 *
 * @param {Object} context
 * @param {Object} [context.currentUser]
 * @param {string} [context.staffName]
 * @param {string} [context.userRole]
 */
export function logAudit(entry, context = {}) {
  const { currentUser, staffName, userRole } = context;
  const id = genId();

  const actor = {
    byUid:   currentUser?.uid || null,
    byName:  staffName || currentUser?.email?.split('@')[0] || 'System',
    byEmail: currentUser?.email || null,
    byRole:  userRole || null,
  };

  const newEntry = {
    id,
    at: Date.now(),
    ...actor,
    ...entry,
  };

  // 1. Firebase child-write (concurrent-safe, append-only)
  saveFirebaseChild('audits', id, newEntry);

  // 2. LocalStorage merge (sync, no dependency on useEffect)
  try {
    const existing = JSON.parse(localStorage.getItem('iv-scheduler-audits') || '{}');
    existing[id] = newEntry;
    localStorage.setItem('iv-scheduler-audits', JSON.stringify(existing));
  } catch (err) {
    console.warn('[logAudit] localStorage cache failed', err);
  }

  return newEntry;
}

export function formatRelativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatFullTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function dayLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}
