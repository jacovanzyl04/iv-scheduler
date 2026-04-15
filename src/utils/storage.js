import { db, ref, set, remove, onValue, isConfigured as firebaseConfigured } from './firebase';

const isConfigured = firebaseConfigured;

const STORAGE_KEYS = {
  STAFF: 'iv-scheduler-staff',
  SCHEDULES: 'iv-scheduler-schedules',
  AVAILABILITY: 'iv-scheduler-availability',
  SHIFT_REQUESTS: 'iv-scheduler-shift-requests',
  TIMESHEETS: 'iv-scheduler-timesheets',
  USERS: 'iv-scheduler-users',
  VIAL_STOCK: 'iv-scheduler-vial-stock',
  CONSUMABLES_STOCK: 'iv-scheduler-consumables-stock',
  BRANCH_TRANSFERS: 'iv-scheduler-branch-transfers',
  PAY_CYCLE_EXTRAS: 'iv-scheduler-pay-cycle-extras',
  PAY_CYCLE_OVERTIME: 'iv-scheduler-pay-cycle-overtime',
  PUBLISHED_SCHEDULES: 'iv-scheduler-published-schedules',
  SCHEDULE_STATUS: 'iv-scheduler-schedule-status',
  DOCUMENTS: 'iv-scheduler-documents',
  DOCUMENT_AUDITS: 'iv-scheduler-document-audits',
  AUDITS: 'iv-scheduler-audits',
  TODO_TEMPLATES: 'iv-scheduler-todo-templates',
  TODO_COMPLETIONS: 'iv-scheduler-todo-completions',
};

// Firebase path mapping
const FIREBASE_PATHS = {
  [STORAGE_KEYS.STAFF]: 'staff',
  [STORAGE_KEYS.SCHEDULES]: 'schedules',
  [STORAGE_KEYS.AVAILABILITY]: 'availability',
  [STORAGE_KEYS.SHIFT_REQUESTS]: 'shiftRequests',
  [STORAGE_KEYS.TIMESHEETS]: 'timesheets',
  [STORAGE_KEYS.USERS]: 'users',
  [STORAGE_KEYS.VIAL_STOCK]: 'vialStock',
  [STORAGE_KEYS.CONSUMABLES_STOCK]: 'consumablesStock',
  [STORAGE_KEYS.BRANCH_TRANSFERS]: 'branchTransfers',
  [STORAGE_KEYS.PAY_CYCLE_EXTRAS]: 'payCycleExtras',
  [STORAGE_KEYS.PAY_CYCLE_OVERTIME]: 'payCycleOvertime',
  [STORAGE_KEYS.PUBLISHED_SCHEDULES]: 'publishedSchedules',
  [STORAGE_KEYS.SCHEDULE_STATUS]: 'scheduleStatus',
  [STORAGE_KEYS.DOCUMENTS]: 'documents',
  [STORAGE_KEYS.DOCUMENT_AUDITS]: 'documentAudits',
  [STORAGE_KEYS.AUDITS]: 'audits',
  [STORAGE_KEYS.TODO_TEMPLATES]: 'todoTemplates',
  [STORAGE_KEYS.TODO_COMPLETIONS]: 'todoCompletions',
};

export function loadFromStorage(key, defaultValue) {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error(`Failed to load ${key} from storage:`, e);
  }
  return defaultValue;
}

// Save only to localStorage (always safe to call).
export function saveLocal(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to save ${key} to storage:`, e);
  }
}

// Strip undefined values (Firebase RTDB rejects them outright).
function stripUndefined(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      const v = stripUndefined(value[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return value;
}

// Save only to Firebase (no-op if Firebase isn't configured).
export function saveFirebase(key, data) {
  if (!isConfigured || !db) return;
  const path = FIREBASE_PATHS[key];
  if (!path) return;
  set(ref(db, path), stripUndefined(data)).catch(e => {
    console.error(`Failed to save ${key} to Firebase:`, e);
  });
}

// Save a single child at a sub-path (e.g. 'documentAudits/abc123').
// Safe for append-only data because it doesn't touch sibling keys —
// avoids clobbering a simultaneous write from another client.
export function saveFirebaseChild(parentPath, childKey, data) {
  if (!isConfigured || !db) return;
  set(ref(db, `${parentPath}/${childKey}`), stripUndefined(data)).catch(e => {
    console.error(`Failed to save ${parentPath}/${childKey}:`, e);
  });
}

// Remove a single child at a sub-path.
export function removeFirebaseChild(parentPath, childKey) {
  if (!isConfigured || !db) return;
  remove(ref(db, `${parentPath}/${childKey}`)).catch(e => {
    console.error(`Failed to remove ${parentPath}/${childKey}:`, e);
  });
}

export function saveToStorage(key, data) {
  saveLocal(key, data);
  saveFirebase(key, data);
}

// Subscribe to real-time updates from Firebase
// Returns an unsubscribe function
// onReady is called on every snapshot (even null) so callers know Firebase has responded
export function subscribeToFirebase(key, callback, onReady) {
  if (!isConfigured || !db) return null;

  const path = FIREBASE_PATHS[key];
  if (!path) return null;

  const dbRef = ref(db, path);
  const unsubscribe = onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    if (onReady) onReady();
    if (data !== null) {
      // Cache in localStorage
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (e) { /* ignore */ }
      callback(data);
    }
  });

  return unsubscribe;
}

export { STORAGE_KEYS, isConfigured };
