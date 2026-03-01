import { db, ref, set, onValue, isConfigured as firebaseConfigured } from './firebase';

const isConfigured = firebaseConfigured;

const STORAGE_KEYS = {
  STAFF: 'iv-scheduler-staff',
  SCHEDULES: 'iv-scheduler-schedules',
  AVAILABILITY: 'iv-scheduler-availability',
  SHIFT_REQUESTS: 'iv-scheduler-shift-requests',
  TIMESHEETS: 'iv-scheduler-timesheets',
};

// Firebase path mapping
const FIREBASE_PATHS = {
  [STORAGE_KEYS.STAFF]: 'staff',
  [STORAGE_KEYS.SCHEDULES]: 'schedules',
  [STORAGE_KEYS.AVAILABILITY]: 'availability',
  [STORAGE_KEYS.SHIFT_REQUESTS]: 'shiftRequests',
  [STORAGE_KEYS.TIMESHEETS]: 'timesheets',
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

export function saveToStorage(key, data) {
  // Always save to localStorage as cache
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to save ${key} to storage:`, e);
  }

  // Also save to Firebase if configured
  if (isConfigured && db) {
    const path = FIREBASE_PATHS[key];
    if (path) {
      set(ref(db, path), data).catch(e => {
        console.error(`Failed to save ${key} to Firebase:`, e);
      });
    }
  }
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
