import { useState, useEffect, useCallback, useRef } from 'react';
import { INITIAL_STAFF, BRANCHES, DAYS_OF_WEEK } from './data/initialData';
import { STORAGE_KEYS, loadFromStorage, saveToStorage, saveLocal, saveFirebase, saveFirebaseChild, removeFirebaseChild, subscribeToFirebase, isConfigured } from './utils/storage';
import { auth, db, ref, set, onValue, onAuthStateChanged, signOut } from './utils/firebase';
import Sidebar, { useIsMobile } from './components/Sidebar';
import LoginPage from './components/LoginPage';
import MonthlyCalendar from './components/MonthlyCalendar';
import WeeklySchedule from './components/WeeklySchedule';
import StaffManager from './components/StaffManager';
import AvailabilityManager from './components/AvailabilityManager';
import MonthlyHours from './components/MonthlyHours';
import Dashboard from './components/Dashboard';
import TimesheetTracker from './components/TimesheetTracker';
import StaffDashboard from './components/StaffDashboard';
import AccountManager from './components/AccountManager';
import VialStockReport from './components/VialStockReport';
import ConsumablesStockReport from './components/ConsumablesStockReport';
import BranchTransfers from './components/BranchTransfers';
import Documents from './components/Documents';
import AuditLog from './components/AuditLog';
import { AuditProvider } from './contexts/AuditContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { logAudit } from './utils/audits';
import { hasAccessToPage } from './utils/permissions';
import ErrorBoundary from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function App() {
  // Auth state
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);       // 'admin' | 'hr' | 'staff'
  const [linkedStaffId, setLinkedStaffId] = useState(null);
  const [userPermissions, setUserPermissions] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [activePage, setActivePage] = useState('schedule');
  const [staff, setStaff] = useState(() =>
    loadFromStorage(STORAGE_KEYS.STAFF, INITIAL_STAFF)
  );
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getMonday(new Date()));
  const [schedules, setSchedules] = useState(() =>
    loadFromStorage(STORAGE_KEYS.SCHEDULES, {})
  );
  const [availability, setAvailability] = useState(() =>
    loadFromStorage(STORAGE_KEYS.AVAILABILITY, {})
  );
  const [shiftRequests, setShiftRequests] = useState(() =>
    loadFromStorage(STORAGE_KEYS.SHIFT_REQUESTS, {})
  );
  const [timesheets, setTimesheets] = useState(() =>
    loadFromStorage(STORAGE_KEYS.TIMESHEETS, {})
  );
  const [vialStock, setVialStock] = useState(() =>
    loadFromStorage(STORAGE_KEYS.VIAL_STOCK, { vials: null, stock: {}, history: [] })
  );
  const [consumablesStock, setConsumablesStock] = useState(() =>
    loadFromStorage(STORAGE_KEYS.CONSUMABLES_STOCK, { items: null, stock: {}, history: [] })
  );
  const [branchTransfers, setBranchTransfers] = useState(() =>
    loadFromStorage(STORAGE_KEYS.BRANCH_TRANSFERS, { history: [] })
  );
  const [payCycleExtras, setPayCycleExtras] = useState(() =>
    loadFromStorage(STORAGE_KEYS.PAY_CYCLE_EXTRAS, {})
  );
  const [payCycleOvertime, setPayCycleOvertime] = useState(() =>
    loadFromStorage(STORAGE_KEYS.PAY_CYCLE_OVERTIME, {})
  );
  const [publishedSchedules, setPublishedSchedules] = useState(() =>
    loadFromStorage(STORAGE_KEYS.PUBLISHED_SCHEDULES, {})
  );
  const [scheduleStatus, setScheduleStatus] = useState(() =>
    loadFromStorage(STORAGE_KEYS.SCHEDULE_STATUS, {})
  );
  const [documents, setDocuments] = useState(() =>
    loadFromStorage(STORAGE_KEYS.DOCUMENTS, {})
  );
  const [documentAudits, setDocumentAudits] = useState(() =>
    loadFromStorage(STORAGE_KEYS.DOCUMENT_AUDITS, {})
  );
  const [audits, setAudits] = useState(() =>
    loadFromStorage(STORAGE_KEYS.AUDITS, {})
  );
  const [todoTemplates, setTodoTemplates] = useState(() =>
    loadFromStorage(STORAGE_KEYS.TODO_TEMPLATES, null)
  );
  const [todoCompletions, setTodoCompletions] = useState(() =>
    loadFromStorage(STORAGE_KEYS.TODO_COMPLETIONS, {})
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();

  // Auth state listener
  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }

    let userNodeUnsub = null;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Clean up any previous user-node listener on auth change
      if (userNodeUnsub) { userNodeUnsub(); userNodeUnsub = null; }
      if (user) {
        setCurrentUser(user);
        // Subscribe live to users/{uid} so role AND permissions changes
        // propagate without requiring a reload.
        const userRef = ref(db, `users/${user.uid}`);
        let firstSnapshot = true;
        userNodeUnsub = onValue(userRef, (snapshot) => {
          const userData = snapshot.val();
          if (userData) {
            setUserRole(userData.role);
            setLinkedStaffId(userData.staffId);
            setUserPermissions(userData.permissions || null);
            if (firstSnapshot) {
              setActivePage(userData.role === 'admin' ? 'schedule' : userData.role === 'hr' ? 'schedule' : 'my-dashboard');
            }
          } else {
            setUserRole(null);
            setLinkedStaffId(null);
            setUserPermissions(null);
          }
          if (firstSnapshot) {
            firstSnapshot = false;
            setAuthLoading(false);
          }
        });
      } else {
        setCurrentUser(null);
        setUserRole(null);
        setLinkedStaffId(null);
        setUserPermissions(null);
        setAuthLoading(false);
      }
    });

    return () => {
      if (userNodeUnsub) userNodeUnsub();
      unsubscribe();
    };
  }, []);

  // Track whether updates are from Firebase (to avoid write-back loops)
  const fromFirebase = useRef(false);
  const firebaseLoaded = useRef(new Set());
  const canSave = (key) => !isConfigured || firebaseLoaded.current.has(key);

  // Persist state changes
  useEffect(() => { if (canSave(STORAGE_KEYS.STAFF) && !fromFirebase.current) saveToStorage(STORAGE_KEYS.STAFF, staff); }, [staff]);
  useEffect(() => { if (canSave(STORAGE_KEYS.SCHEDULES) && !fromFirebase.current) saveToStorage(STORAGE_KEYS.SCHEDULES, schedules); }, [schedules]);
  useEffect(() => { if (canSave(STORAGE_KEYS.AVAILABILITY) && !fromFirebase.current) saveToStorage(STORAGE_KEYS.AVAILABILITY, availability); }, [availability]);
  useEffect(() => { if (canSave(STORAGE_KEYS.SHIFT_REQUESTS) && !fromFirebase.current) saveToStorage(STORAGE_KEYS.SHIFT_REQUESTS, shiftRequests); }, [shiftRequests]);
  useEffect(() => { if (canSave(STORAGE_KEYS.TIMESHEETS) && !fromFirebase.current) saveToStorage(STORAGE_KEYS.TIMESHEETS, timesheets); }, [timesheets]);
  useEffect(() => { if (canSave(STORAGE_KEYS.VIAL_STOCK) && !fromFirebase.current) saveToStorage(STORAGE_KEYS.VIAL_STOCK, vialStock); }, [vialStock]);
  useEffect(() => { if (canSave(STORAGE_KEYS.CONSUMABLES_STOCK) && !fromFirebase.current) saveToStorage(STORAGE_KEYS.CONSUMABLES_STOCK, consumablesStock); }, [consumablesStock]);
  useEffect(() => { if (canSave(STORAGE_KEYS.BRANCH_TRANSFERS) && !fromFirebase.current) saveToStorage(STORAGE_KEYS.BRANCH_TRANSFERS, branchTransfers); }, [branchTransfers]);
  useEffect(() => { if (canSave(STORAGE_KEYS.PAY_CYCLE_EXTRAS) && !fromFirebase.current) saveToStorage(STORAGE_KEYS.PAY_CYCLE_EXTRAS, payCycleExtras); }, [payCycleExtras]);
  useEffect(() => { if (canSave(STORAGE_KEYS.PAY_CYCLE_OVERTIME) && !fromFirebase.current) saveToStorage(STORAGE_KEYS.PAY_CYCLE_OVERTIME, payCycleOvertime); }, [payCycleOvertime]);
  useEffect(() => { if (canSave(STORAGE_KEYS.PUBLISHED_SCHEDULES) && !fromFirebase.current) saveToStorage(STORAGE_KEYS.PUBLISHED_SCHEDULES, publishedSchedules); }, [publishedSchedules]);
  useEffect(() => { if (canSave(STORAGE_KEYS.SCHEDULE_STATUS) && !fromFirebase.current) saveToStorage(STORAGE_KEYS.SCHEDULE_STATUS, scheduleStatus); }, [scheduleStatus]);
  // Documents: always cache locally; echo to Firebase only after initial
  // sync so we don't overwrite remote data with a stale initial state.
  useEffect(() => {
    if (fromFirebase.current) return;
    saveLocal(STORAGE_KEYS.DOCUMENTS, documents);
    if (canSave(STORAGE_KEYS.DOCUMENTS)) saveFirebase(STORAGE_KEYS.DOCUMENTS, documents);
  }, [documents]);

  // Audits are append-only and are written directly to Firebase as single
  // children by pushAudit (see Documents.jsx). Never write the full audits
  // object back to Firebase here — a stale snapshot would clobber audits
  // added concurrently by another client. Local caching only.
  useEffect(() => {
    if (fromFirebase.current) return;
    saveLocal(STORAGE_KEYS.DOCUMENT_AUDITS, documentAudits);
  }, [documentAudits]);
  useEffect(() => {
    if (fromFirebase.current) return;
    saveLocal(STORAGE_KEYS.AUDITS, audits);
  }, [audits]);
  // Todo templates: admin-edited, low frequency — full state replace is fine.
  useEffect(() => {
    if (fromFirebase.current) return;
    saveLocal(STORAGE_KEYS.TODO_TEMPLATES, todoTemplates);
    if (canSave(STORAGE_KEYS.TODO_TEMPLATES)) saveFirebase(STORAGE_KEYS.TODO_TEMPLATES, todoTemplates);
  }, [todoTemplates]);
  // Completions: written directly via saveFirebaseChild when a staff
  // ticks a box, so here we only mirror to localStorage.
  useEffect(() => {
    if (fromFirebase.current) return;
    saveLocal(STORAGE_KEYS.TODO_COMPLETIONS, todoCompletions);
  }, [todoCompletions]);

  // Subscribe to real-time Firebase updates
  useEffect(() => {
    if (!isConfigured) return;

    const unsubs = [];
    const markLoaded = (key) => () => { firebaseLoaded.current.add(key); };

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.STAFF, (data) => {
      fromFirebase.current = true;
      const arr = Array.isArray(data) ? data : [];
      // Merge payCycleType from defaults for staff that have it
      const merged = arr.map(s => {
        if (!s.payCycleType) {
          const def = INITIAL_STAFF.find(d => d.id === s.id);
          if (def?.payCycleType) return { ...s, payCycleType: def.payCycleType };
        }
        return s;
      });
      setStaff(merged);
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.STAFF)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.SCHEDULES, (data) => {
      fromFirebase.current = true;
      setSchedules(normalizeSchedules(data));
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.SCHEDULES)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.AVAILABILITY, (data) => {
      fromFirebase.current = true;
      setAvailability(data || {});
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.AVAILABILITY)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.SHIFT_REQUESTS, (data) => {
      fromFirebase.current = true;
      setShiftRequests(data || {});
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.SHIFT_REQUESTS)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.TIMESHEETS, (data) => {
      fromFirebase.current = true;
      setTimesheets(data || {});
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.TIMESHEETS)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.VIAL_STOCK, (data) => {
      fromFirebase.current = true;
      setVialStock(data || { vials: null, stock: {}, history: [] });
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.VIAL_STOCK)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.CONSUMABLES_STOCK, (data) => {
      fromFirebase.current = true;
      setConsumablesStock(data || { items: null, stock: {}, history: [] });
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.CONSUMABLES_STOCK)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.BRANCH_TRANSFERS, (data) => {
      fromFirebase.current = true;
      setBranchTransfers(data || { history: [] });
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.BRANCH_TRANSFERS)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.PAY_CYCLE_EXTRAS, (data) => {
      fromFirebase.current = true;
      setPayCycleExtras(data || {});
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.PAY_CYCLE_EXTRAS)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.PAY_CYCLE_OVERTIME, (data) => {
      fromFirebase.current = true;
      setPayCycleOvertime(data || {});
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.PAY_CYCLE_OVERTIME)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.PUBLISHED_SCHEDULES, (data) => {
      fromFirebase.current = true;
      setPublishedSchedules(normalizeSchedules(data));
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.PUBLISHED_SCHEDULES)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.SCHEDULE_STATUS, (data) => {
      fromFirebase.current = true;
      setScheduleStatus(data || {});
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.SCHEDULE_STATUS)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.DOCUMENTS, (data) => {
      fromFirebase.current = true;
      setDocuments(data || {});
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.DOCUMENTS)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.DOCUMENT_AUDITS, (data) => {
      fromFirebase.current = true;
      // Audits are append-only: merge incoming data into existing state so a
      // partial/late snapshot from Firebase can never wipe entries we already
      // know about locally. Deletions are intentionally not supported.
      setDocumentAudits(prev => ({ ...(prev || {}), ...(data || {}) }));
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.DOCUMENT_AUDITS)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.AUDITS, (data) => {
      fromFirebase.current = true;
      // Same merge pattern as documentAudits — append-only log.
      setAudits(prev => ({ ...(prev || {}), ...(data || {}) }));
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.AUDITS)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.TODO_TEMPLATES, (data) => {
      fromFirebase.current = true;
      setTodoTemplates(data || null);
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.TODO_TEMPLATES)));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.TODO_COMPLETIONS, (data) => {
      fromFirebase.current = true;
      // Per-staff per-day per-item map. Merge by top-level date key so we
      // never wipe earlier days when only today's node comes through.
      setTodoCompletions(prev => ({ ...(prev || {}), ...(data || {}) }));
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }, markLoaded(STORAGE_KEYS.TODO_COMPLETIONS)));

    return () => unsubs.forEach(fn => fn && fn());
  }, []);

  function normalizeSchedules(data) {
    if (!data || typeof data !== 'object') return {};
    const result = {};
    for (const [weekKey, weekData] of Object.entries(data)) {
      if (!weekData || typeof weekData !== 'object') { result[weekKey] = weekData; continue; }
      result[weekKey] = {};
      for (const [day, dayData] of Object.entries(weekData)) {
        if (!dayData || typeof dayData !== 'object') { result[weekKey][day] = dayData; continue; }
        result[weekKey][day] = {};
        for (const [branchId, cell] of Object.entries(dayData)) {
          const nurses = Array.isArray(cell?.nurses) ? cell.nurses.map(n => {
            const norm = { id: n.id, name: n.name, locked: !!n.locked };
            if (n.shiftStart) norm.shiftStart = n.shiftStart;
            if (n.shiftEnd) norm.shiftEnd = n.shiftEnd;
            return norm;
          }) : [];
          const receptionists = Array.isArray(cell?.receptionists) ? cell.receptionists.map(r => {
            const norm = { id: r.id, name: r.name, locked: !!r.locked };
            if (r.shiftStart) norm.shiftStart = r.shiftStart;
            if (r.shiftEnd) norm.shiftEnd = r.shiftEnd;
            return norm;
          }) : [];
          result[weekKey][day][branchId] = { nurses, receptionists };
        }
      }
    }
    return result;
  }

  const weekKey = formatDate(currentWeekStart);
  const currentSchedule = schedules[weekKey] || {};

  const setCurrentSchedule = useCallback((newSchedule) => {
    setSchedules(prev => ({
      ...prev,
      [weekKey]: typeof newSchedule === 'function' ? newSchedule(prev[weekKey] || {}) : newSchedule,
    }));
  }, [weekKey]);

  const goToPrevWeek = () => {
    const prev = new Date(currentWeekStart);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekStart(prev);
  };

  const goToNextWeek = () => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + 7);
    setCurrentWeekStart(next);
  };

  const goToToday = () => {
    setCurrentWeekStart(getMonday(new Date()));
  };

  // Schedule publish system
  const isWeekPublished = !!scheduleStatus[weekKey]?.publishedAt;
  const hasDraftChanges = isWeekPublished &&
    JSON.stringify(schedules[weekKey] || {}) !== JSON.stringify(publishedSchedules[weekKey] || {});
  const staffCurrentSchedule = publishedSchedules[weekKey] || {};

  const publishSchedule = useCallback((targetWeekKey) => {
    const scheduleData = schedules[targetWeekKey];
    if (!scheduleData) return;
    const statusData = {
      publishedAt: new Date().toISOString(),
      publishedBy: currentUser?.uid || 'unknown',
    };
    setPublishedSchedules(prev => ({ ...prev, [targetWeekKey]: scheduleData }));
    setScheduleStatus(prev => ({ ...prev, [targetWeekKey]: statusData }));
    // Direct Firebase writes for atomicity
    if (isConfigured && db) {
      set(ref(db, `publishedSchedules/${targetWeekKey}`), scheduleData).catch(console.error);
      set(ref(db, `scheduleStatus/${targetWeekKey}`), statusData).catch(console.error);
    }
    // Audit
    const linkedStaff = linkedStaffId ? staff.find(s => s.id === linkedStaffId) : null;
    logAudit({
      domain: 'schedule',
      action: 'published',
      targetId: targetWeekKey,
      targetLabel: `Week of ${targetWeekKey}`,
    }, {
      currentUser,
      staffName: linkedStaff?.name || null,
      userRole,
    });
  }, [schedules, currentUser, linkedStaffId, staff, userRole]);

  // Staff sub-path write wrappers (write only their own data to Firebase)
  const staffSetAvailability = useCallback((updater) => {
    setAvailability(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (isConfigured && db && linkedStaffId) {
        set(ref(db, `availability/${linkedStaffId}`), next[linkedStaffId] || null).catch(console.error);
      }
      try { localStorage.setItem(STORAGE_KEYS.AVAILABILITY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [linkedStaffId]);

  const staffSetShiftRequests = useCallback((updater) => {
    setShiftRequests(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (isConfigured && db && linkedStaffId) {
        set(ref(db, `shiftRequests/${linkedStaffId}`), next[linkedStaffId] || null).catch(console.error);
      }
      try { localStorage.setItem(STORAGE_KEYS.SHIFT_REQUESTS, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [linkedStaffId]);

  const staffSetTimesheets = useCallback((updater) => {
    setTimesheets(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Timesheets are keyed by cycle then staffId — write each cycle's staffId sub-path
      if (isConfigured && db && linkedStaffId) {
        for (const [cycleKey, cycleData] of Object.entries(next)) {
          if (cycleData?.[linkedStaffId] !== undefined) {
            set(ref(db, `timesheets/${cycleKey}/${linkedStaffId}`), cycleData[linkedStaffId]).catch(console.error);
          }
        }
      }
      try { localStorage.setItem(STORAGE_KEYS.TIMESHEETS, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [linkedStaffId]);

  const staffSetVialStock = useCallback((updater) => {
    setVialStock(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (isConfigured && db) {
        set(ref(db, 'vialStock'), next).catch(console.error);
      }
      try { localStorage.setItem(STORAGE_KEYS.VIAL_STOCK, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const staffSetConsumablesStock = useCallback((updater) => {
    setConsumablesStock(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (isConfigured && db) {
        set(ref(db, 'consumablesStock'), next).catch(console.error);
      }
      try { localStorage.setItem(STORAGE_KEYS.CONSUMABLES_STOCK, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const staffSetBranchTransfers = useCallback((updater) => {
    setBranchTransfers(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (isConfigured && db) {
        set(ref(db, 'branchTransfers'), next).catch(console.error);
      }
      try { localStorage.setItem(STORAGE_KEYS.BRANCH_TRANSFERS, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Resolve staff name for current user
  const currentStaffName = linkedStaffId ? (staff.find(s => s.id === linkedStaffId)?.name || null) : null;

  // Toggle a single todo item completion for a staff on a given date.
  // Uses a child-path write so two people ticking boxes at the same time
  // never clobber each other. Writes null to Firebase when unchecking.
  const toggleTodoCompletion = useCallback((dateStr, staffId, itemId, done) => {
    const entry = done
      ? { at: Date.now(), byName: (staffId === linkedStaffId ? currentStaffName : null) || currentUser?.email?.split('@')[0] || 'Unknown' }
      : null;

    setTodoCompletions(prev => {
      const next = { ...(prev || {}) };
      const dayMap = { ...(next[dateStr] || {}) };
      const staffMap = { ...(dayMap[staffId] || {}) };
      if (done) staffMap[itemId] = entry;
      else delete staffMap[itemId];
      if (Object.keys(staffMap).length) dayMap[staffId] = staffMap;
      else delete dayMap[staffId];
      if (Object.keys(dayMap).length) next[dateStr] = dayMap;
      else delete next[dateStr];
      return next;
    });

    if (done) {
      saveFirebaseChild('todoCompletions', `${dateStr}/${staffId}/${itemId}`, entry);
    } else {
      removeFirebaseChild('todoCompletions', `${dateStr}/${staffId}/${itemId}`);
    }
  }, [currentUser, currentStaffName, linkedStaffId]);

  // Bounce the user off any page they've lost access to. Must sit with the
  // other hooks (before any early return) so React sees the same hook order
  // on every render — moving this below the auth/login guards triggers
  // Minified React Error #310.
  useEffect(() => {
    if (!userRole) return;
    const permCheckUser = { role: userRole, permissions: userPermissions || {} };
    if (!hasAccessToPage(permCheckUser, activePage)) {
      setActivePage(userRole === 'admin' ? 'dashboard' : userRole === 'hr' ? 'schedule' : 'my-dashboard');
    }
  }, [userRole, userPermissions, activePage]);

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-d4l-bg flex">
        {/* Skeleton sidebar (desktop) */}
        <div className="hidden md:block w-64 bg-d4l-surface border-r border-d4l-border p-4">
          <div className="skeleton w-8 h-8 rounded-lg mb-6" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-9 rounded-lg mb-2" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        {/* Skeleton main content */}
        <div className="flex-1 p-6">
          <div className="skeleton h-8 w-48 mb-6 rounded-lg" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-xl" style={{ animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
          <div className="skeleton h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  // Not authenticated — show login
  if (!currentUser) {
    return <LoginPage />;
  }

  // Authenticated but no RTDB user record — account not set up yet
  if (!userRole) {
    return (
      <div className="min-h-screen bg-d4l-bg flex items-center justify-center">
        <div className="text-center bg-d4l-surface p-8 rounded-xl border border-d4l-border max-w-sm">
          <p className="text-d4l-text font-medium mb-2">Account not configured</p>
          <p className="text-d4l-muted text-sm mb-4">Your login exists but hasn't been linked to a staff profile yet. Contact your admin.</p>
          <button
            onClick={() => signOut(auth)}
            className="px-4 py-2 bg-d4l-hover text-d4l-text2 rounded-lg hover:bg-d4l-active transition-colors text-sm"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const isAdmin = userRole === 'admin';
  const isHR = userRole === 'hr';

  return (
    <PermissionsProvider role={userRole} permissions={userPermissions}>
    <AuditProvider currentUser={currentUser} staffName={currentStaffName} userRole={userRole} audits={audits}>
    <div className={`flex h-screen bg-d4l-bg ${isMobile ? 'flex-col' : ''}`}>
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        userRole={userRole}
        userPermissions={userPermissions}
        currentUser={currentUser}
        onLogout={() => signOut(auth)}
      />

      <main id="main-content" className={`flex-1 overflow-auto transition-all duration-300 ${isMobile ? 'mobile-main-content' : sidebarOpen ? 'ml-64' : 'ml-[68px]'}`}>
        <ErrorBoundary>
        <div key={activePage} className="page-enter">
        {/* === ADMIN PAGES === */}
        {isAdmin && activePage === 'dashboard' && (
          <Dashboard
            schedule={currentSchedule}
            staff={staff}
            weekStartDate={weekKey}
            currentWeekStart={currentWeekStart}
            goToPrevWeek={goToPrevWeek}
            goToNextWeek={goToNextWeek}
            goToToday={goToToday}
            todoTemplates={todoTemplates}
            setTodoTemplates={setTodoTemplates}
            todoCompletions={todoCompletions}
            toggleTodoCompletion={toggleTodoCompletion}
            userRole={userRole}
          />
        )}

        {isAdmin && activePage === 'schedule' && (
          <WeeklySchedule
            staff={staff}
            schedule={currentSchedule}
            setSchedule={setCurrentSchedule}
            weekStartDate={weekKey}
            currentWeekStart={currentWeekStart}
            availability={availability}
            shiftRequests={shiftRequests}
            goToPrevWeek={goToPrevWeek}
            goToNextWeek={goToNextWeek}
            goToToday={goToToday}
            onPublish={publishSchedule}
            publishStatus={{ isPublished: isWeekPublished, hasDraftChanges, publishedAt: scheduleStatus[weekKey]?.publishedAt }}
          />
        )}

        {isAdmin && activePage === 'staff' && (
          <StaffManager
            staff={staff}
            setStaff={setStaff}
          />
        )}

        {isAdmin && activePage === 'availability' && (
          <AvailabilityManager
            staff={staff}
            availability={availability}
            setAvailability={setAvailability}
            shiftRequests={shiftRequests}
            setShiftRequests={setShiftRequests}
            currentWeekStart={currentWeekStart}
            weekKey={weekKey}
            goToPrevWeek={goToPrevWeek}
            goToNextWeek={goToNextWeek}
            goToToday={goToToday}
          />
        )}

        {isAdmin && activePage === 'calendar' && (
          <MonthlyCalendar
            schedules={schedules}
            staff={staff}
          />
        )}

        {isAdmin && activePage === 'hours' && (
          <MonthlyHours
            staff={staff}
            schedules={schedules}
            payCycleExtras={payCycleExtras}
            setPayCycleExtras={setPayCycleExtras}
            payCycleOvertime={payCycleOvertime}
            setPayCycleOvertime={setPayCycleOvertime}
          />
        )}

        {isAdmin && activePage === 'timesheets' && (
          <TimesheetTracker
            staff={staff}
            schedules={schedules}
            timesheets={timesheets}
            setTimesheets={setTimesheets}
          />
        )}

        {isAdmin && activePage === 'accounts' && (
          <AccountManager staff={staff} />
        )}

        {isAdmin && activePage === 'vial-stock' && (
          <VialStockReport
            vialStock={vialStock}
            setVialStock={setVialStock}
            userRole={userRole}
            currentUser={currentUser}
            staffName={currentStaffName}
          />
        )}

        {isAdmin && activePage === 'consumables-stock' && (
          <ConsumablesStockReport
            consumablesStock={consumablesStock}
            setConsumablesStock={setConsumablesStock}
            userRole={userRole}
            currentUser={currentUser}
            staffName={currentStaffName}
          />
        )}

        {isAdmin && activePage === 'transfers' && (
          <BranchTransfers
            branchTransfers={branchTransfers}
            setBranchTransfers={setBranchTransfers}
            vialStock={vialStock}
            consumablesStock={consumablesStock}
            userRole={userRole}
            currentUser={currentUser}
            staffName={currentStaffName}
          />
        )}

        {isAdmin && activePage === 'documents' && (
          <Documents
            documents={documents}
            setDocuments={setDocuments}
            documentAudits={documentAudits}
            setDocumentAudits={setDocumentAudits}
            userRole={userRole}
            currentUser={currentUser}
            staffName={currentStaffName}
          />
        )}

        {/* === HR PAGES === */}
        {isHR && activePage === 'schedule' && (
          <WeeklySchedule
            staff={staff}
            schedule={staffCurrentSchedule}
            setSchedule={setCurrentSchedule}
            weekStartDate={weekKey}
            currentWeekStart={currentWeekStart}
            availability={availability}
            shiftRequests={shiftRequests}
            goToPrevWeek={goToPrevWeek}
            goToNextWeek={goToNextWeek}
            goToToday={goToToday}
            readOnly
            isPublished={isWeekPublished}
          />
        )}

        {isHR && activePage === 'calendar' && (
          <MonthlyCalendar
            schedules={publishedSchedules}
            staff={staff}
          />
        )}

        {isHR && activePage === 'staff' && (
          <StaffManager
            staff={staff}
            setStaff={setStaff}
            readOnly
          />
        )}

        {isHR && activePage === 'hours' && (
          <MonthlyHours
            staff={staff}
            schedules={schedules}
            payCycleExtras={payCycleExtras}
            setPayCycleExtras={setPayCycleExtras}
            payCycleOvertime={payCycleOvertime}
            setPayCycleOvertime={setPayCycleOvertime}
          />
        )}

        {isHR && activePage === 'timesheets' && (
          <TimesheetTracker
            staff={staff}
            schedules={schedules}
            timesheets={timesheets}
            setTimesheets={setTimesheets}
          />
        )}

        {isHR && activePage === 'vial-stock' && (
          <VialStockReport
            vialStock={vialStock}
            setVialStock={setVialStock}
            userRole={userRole}
            currentUser={currentUser}
            staffName={currentStaffName}
          />
        )}

        {isHR && activePage === 'consumables-stock' && (
          <ConsumablesStockReport
            consumablesStock={consumablesStock}
            setConsumablesStock={setConsumablesStock}
            userRole={userRole}
            currentUser={currentUser}
            staffName={currentStaffName}
          />
        )}

        {isHR && activePage === 'transfers' && (
          <BranchTransfers
            branchTransfers={branchTransfers}
            setBranchTransfers={setBranchTransfers}
            vialStock={vialStock}
            consumablesStock={consumablesStock}
            userRole={userRole}
            currentUser={currentUser}
            staffName={currentStaffName}
          />
        )}

        {isHR && activePage === 'documents' && (
          <Documents
            documents={documents}
            setDocuments={setDocuments}
            documentAudits={documentAudits}
            setDocumentAudits={setDocumentAudits}
            userRole={userRole}
            currentUser={currentUser}
            staffName={currentStaffName}
          />
        )}

        {/* === STAFF PAGES === */}
        {!isAdmin && activePage === 'my-dashboard' && (
          <StaffDashboard
            staffId={linkedStaffId}
            staff={staff}
            schedules={publishedSchedules}
            currentWeekStart={currentWeekStart}
            weekKey={weekKey}
            goToPrevWeek={goToPrevWeek}
            goToNextWeek={goToNextWeek}
            goToToday={goToToday}
            setActivePage={setActivePage}
            scheduleStatus={scheduleStatus}
            todoTemplates={todoTemplates}
            todoCompletions={todoCompletions}
            toggleTodoCompletion={toggleTodoCompletion}
            userRole={userRole}
          />
        )}

        {!isAdmin && activePage === 'full-schedule' && (
          <WeeklySchedule
            staff={staff}
            schedule={staffCurrentSchedule}
            setSchedule={setCurrentSchedule}
            weekStartDate={weekKey}
            currentWeekStart={currentWeekStart}
            availability={availability}
            shiftRequests={shiftRequests}
            goToPrevWeek={goToPrevWeek}
            goToNextWeek={goToNextWeek}
            goToToday={goToToday}
            readOnly
            isPublished={isWeekPublished}
          />
        )}

        {!isAdmin && activePage === 'my-availability' && (
          <AvailabilityManager
            staff={staff}
            availability={availability}
            setAvailability={staffSetAvailability}
            shiftRequests={shiftRequests}
            setShiftRequests={staffSetShiftRequests}
            currentWeekStart={currentWeekStart}
            weekKey={weekKey}
            goToPrevWeek={goToPrevWeek}
            goToNextWeek={goToNextWeek}
            goToToday={goToToday}
            staffFilter={linkedStaffId}
          />
        )}

        {!isAdmin && activePage === 'my-timesheet' && (
          <TimesheetTracker
            staff={staff}
            schedules={publishedSchedules}
            timesheets={timesheets}
            setTimesheets={staffSetTimesheets}
            staffFilter={linkedStaffId}
          />
        )}

        {!isAdmin && activePage === 'vial-stock' && (
          <VialStockReport
            vialStock={vialStock}
            setVialStock={staffSetVialStock}
            userRole={userRole}
            currentUser={currentUser}
            staffName={currentStaffName}
          />
        )}

        {!isAdmin && activePage === 'consumables-stock' && (
          <ConsumablesStockReport
            consumablesStock={consumablesStock}
            setConsumablesStock={staffSetConsumablesStock}
            userRole={userRole}
            currentUser={currentUser}
            staffName={currentStaffName}
          />
        )}

        {!isAdmin && activePage === 'transfers' && (
          <BranchTransfers
            branchTransfers={branchTransfers}
            setBranchTransfers={staffSetBranchTransfers}
            vialStock={vialStock}
            consumablesStock={consumablesStock}
            userRole={userRole}
            currentUser={currentUser}
            staffName={currentStaffName}
          />
        )}

        {!isAdmin && activePage === 'documents' && (
          <Documents
            documents={documents}
            setDocuments={() => {}}
            documentAudits={{}}
            setDocumentAudits={() => {}}
            userRole={userRole}
            currentUser={currentUser}
            staffName={currentStaffName}
          />
        )}

        {(isAdmin || isHR) && activePage === 'audit-log' && (
          <AuditLog audits={audits} />
        )}
        </div>
        </ErrorBoundary>
      </main>
    </div>
    </AuditProvider>
    </PermissionsProvider>
  );
}
