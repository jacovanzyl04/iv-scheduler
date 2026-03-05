import { useState, useEffect, useCallback, useRef } from 'react';
import { INITIAL_STAFF, BRANCHES, DAYS_OF_WEEK } from './data/initialData';
import { STORAGE_KEYS, loadFromStorage, saveToStorage, subscribeToFirebase, isConfigured } from './utils/storage';
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
  const [userRole, setUserRole] = useState(null);       // 'admin' | 'staff'
  const [linkedStaffId, setLinkedStaffId] = useState(null);
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();

  // Auth state listener
  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        // Look up role from users/{uid} in RTDB
        const userRef = ref(db, `users/${user.uid}`);
        onValue(userRef, (snapshot) => {
          const userData = snapshot.val();
          if (userData) {
            setUserRole(userData.role);
            setLinkedStaffId(userData.staffId);
            setActivePage(userData.role === 'admin' ? 'schedule' : 'my-dashboard');
          } else {
            // User exists in Auth but no RTDB record — treat as unlinked
            setUserRole(null);
            setLinkedStaffId(null);
          }
          setAuthLoading(false);
        }, { onlyOnce: true });
      } else {
        setCurrentUser(null);
        setUserRole(null);
        setLinkedStaffId(null);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
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

  // Subscribe to real-time Firebase updates
  useEffect(() => {
    if (!isConfigured) return;

    const unsubs = [];
    const markLoaded = (key) => () => { firebaseLoaded.current.add(key); };

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.STAFF, (data) => {
      fromFirebase.current = true;
      setStaff(Array.isArray(data) ? data : []);
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

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-d4l-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-d4l-gold animate-spin mx-auto mb-3" />
          <p className="text-d4l-muted text-sm">Loading...</p>
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

  return (
    <div className={`flex h-screen bg-d4l-bg ${isMobile ? 'flex-col' : ''}`}>
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        userRole={userRole}
        currentUser={currentUser}
        onLogout={() => signOut(auth)}
      />

      <main className={`flex-1 overflow-auto transition-all duration-300 ${isMobile ? 'mobile-main-content' : sidebarOpen ? 'ml-64' : 'ml-[68px]'}`}>
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

        {/* === STAFF PAGES === */}
        {!isAdmin && activePage === 'my-dashboard' && (
          <StaffDashboard
            staffId={linkedStaffId}
            staff={staff}
            schedules={schedules}
            currentWeekStart={currentWeekStart}
            weekKey={weekKey}
            goToPrevWeek={goToPrevWeek}
            goToNextWeek={goToNextWeek}
            goToToday={goToToday}
            setActivePage={setActivePage}
          />
        )}

        {!isAdmin && activePage === 'full-schedule' && (
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
            readOnly
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
            schedules={schedules}
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
        </div>
      </main>
    </div>
  );
}
