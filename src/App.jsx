import { useState, useEffect, useCallback, useRef } from 'react';
import { INITIAL_STAFF, BRANCHES, DAYS_OF_WEEK } from './data/initialData';
import { STORAGE_KEYS, loadFromStorage, saveToStorage, subscribeToFirebase, isConfigured } from './utils/storage';
import Sidebar from './components/Sidebar';
import WeeklySchedule from './components/WeeklySchedule';
import StaffManager from './components/StaffManager';
import AvailabilityManager from './components/AvailabilityManager';
import MonthlyHours from './components/MonthlyHours';
import Dashboard from './components/Dashboard';

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d) {
  // Use local date to avoid UTC timezone shift (important for SAST/UTC+2)
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function App() {
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Track whether updates are from Firebase (to avoid write-back loops)
  const fromFirebase = useRef(false);
  // Skip saving on initial mount (prevents fresh deploy from overwriting Firebase data)
  const hasMounted = useRef(false);
  useEffect(() => { hasMounted.current = true; }, []);

  // Persist state changes (writes to both localStorage and Firebase)
  useEffect(() => { if (hasMounted.current && !fromFirebase.current) saveToStorage(STORAGE_KEYS.STAFF, staff); }, [staff]);
  useEffect(() => { if (hasMounted.current && !fromFirebase.current) saveToStorage(STORAGE_KEYS.SCHEDULES, schedules); }, [schedules]);
  useEffect(() => { if (hasMounted.current && !fromFirebase.current) saveToStorage(STORAGE_KEYS.AVAILABILITY, availability); }, [availability]);
  useEffect(() => { if (hasMounted.current && !fromFirebase.current) saveToStorage(STORAGE_KEYS.SHIFT_REQUESTS, shiftRequests); }, [shiftRequests]);

  // Subscribe to real-time Firebase updates
  useEffect(() => {
    if (!isConfigured) return;

    const unsubs = [];

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.STAFF, (data) => {
      fromFirebase.current = true;
      setStaff(Array.isArray(data) ? data : []);
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.SCHEDULES, (data) => {
      fromFirebase.current = true;
      setSchedules(normalizeSchedules(data));
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.AVAILABILITY, (data) => {
      fromFirebase.current = true;
      setAvailability(data || {});
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }));

    unsubs.push(subscribeToFirebase(STORAGE_KEYS.SHIFT_REQUESTS, (data) => {
      fromFirebase.current = true;
      setShiftRequests(data || {});
      setTimeout(() => { fromFirebase.current = false; }, 0);
    }));

    return () => unsubs.forEach(fn => fn && fn());
  }, []);

  // Firebase drops empty arrays — normalize schedule cells to always have nurses/receptionists
  // Preserves shiftStart/shiftEnd on individual assignments (for Saturday split shifts)
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

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />

      <main className={`flex-1 overflow-auto transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
        {activePage === 'dashboard' && (
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

        {activePage === 'schedule' && (
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

        {activePage === 'staff' && (
          <StaffManager
            staff={staff}
            setStaff={setStaff}
          />
        )}

        {activePage === 'availability' && (
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

        {activePage === 'hours' && (
          <MonthlyHours
            staff={staff}
            schedules={schedules}
          />
        )}
      </main>
    </div>
  );
}
