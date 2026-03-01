import { useState, useCallback, Fragment } from 'react';
import { BRANCHES, DAYS_OF_WEEK, isBranchOpen, getShiftHours, isScheduleRole } from '../data/initialData';
import { autoSchedule, validateSchedule, calculateWeeklyHours, timesOverlap, timeToMinutes } from '../utils/scheduler';
import { exportScheduleToExcel } from '../utils/exportExcel';
import { ChevronLeft, ChevronRight, Wand2, Download, AlertTriangle, AlertCircle, X, Plus, Lock, Unlock, Trash2, GripVertical, Stethoscope, Headphones, Clock } from 'lucide-react';

const STAFF_COLOR_MAP = {
  red: '#ef4444', orange: '#f97316', amber: '#f59e0b', green: '#22c55e',
  teal: '#14b8a6', blue: '#3b82f6', purple: '#8b5cf6', pink: '#ec4899',
};

// Format "HH:MM" → short hour display: "9", "13", "17"
function fmtHour(t) {
  if (!t) return '';
  return String(parseInt(t.split(':')[0], 10));
}

// Format shift time range for badge display: "9-1" or "1-5"
function fmtShiftRange(n, branchId, day) {
  if (!n.shiftStart && !n.shiftEnd) return null;
  const branch = BRANCHES.find(b => b.id === branchId);
  const hrs = branch?.hours[day];
  const start = n.shiftStart || hrs?.open;
  const end = n.shiftEnd || hrs?.close;
  return `${fmtHour(start)}-${fmtHour(end)}`;
}

function formatWeekRange(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('en-ZA', opts)} - ${end.toLocaleDateString('en-ZA', { ...opts, year: 'numeric' })}`;
}

function getDayDate(weekStart, dayIndex) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  return d.getDate();
}

function getDateStr(weekStart, dayIndex) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get all assignments for a staff member on a specific day across all branches
function getStaffDayAssignments(staffId, day, schedule) {
  const assignments = [];
  BRANCHES.forEach(branch => {
    const cell = schedule[day]?.[branch.id];
    if (!cell) return;
    const hrs = branch.hours[day];
    [...(cell.nurses || []), ...(cell.receptionists || [])].forEach(person => {
      if (person.id === staffId) {
        assignments.push({
          branchId: branch.id,
          start: person.shiftStart || hrs?.open || '09:00',
          end: person.shiftEnd || hrs?.close || '17:00',
        });
      }
    });
  });
  return assignments;
}

// Check if a proposed time range conflicts with existing assignments for a staff member
function hasStaffTimeConflict(staffId, day, proposedStart, proposedEnd, schedule, excludeBranchId) {
  const assignments = getStaffDayAssignments(staffId, day, schedule);
  return assignments.some(a => {
    if (excludeBranchId && a.branchId === excludeBranchId) return false;
    return timesOverlap(proposedStart, proposedEnd, a.start, a.end);
  });
}

export default function WeeklySchedule({
  staff, schedule, setSchedule, weekStartDate, currentWeekStart,
  availability, shiftRequests, goToPrevWeek, goToNextWeek, goToToday
}) {
  const [assignModal, setAssignModal] = useState(null); // { day, branchId, role }
  const [timePickerModal, setTimePickerModal] = useState(null); // { day, branchId, role, staffMember, slots }
  const [customTimeMode, setCustomTimeMode] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [dragging, setDragging] = useState(null);

  const { warnings, errors } = validateSchedule(schedule, staff);
  const weeklyHours = calculateWeeklyHours(schedule, staff);

  // === Time slot helpers (Morning / Afternoon / Full Day) ===

  // Get available time slots for a staff member at a branch on any day
  const getTimeSlots = (day, branchId, staffMember) => {
    const branch = BRANCHES.find(b => b.id === branchId);
    const hrs = branch?.hours[day];
    if (!hrs) return null;

    // Calculate midpoint split (rounded to nearest hour)
    const openMin = timeToMinutes(hrs.open);
    const closeMin = timeToMinutes(hrs.close);
    const midMin = Math.round((openMin + closeMin) / 2 / 60) * 60;
    const splitH = String(Math.floor(midMin / 60)).padStart(2, '0');
    const split = `${splitH}:00`;

    const slots = [];
    if (split !== hrs.open) {
      slots.push({ label: `Morning (${fmtHour(hrs.open)}-${fmtHour(split)})`, start: hrs.open, end: split });
    }
    if (split !== hrs.close) {
      slots.push({ label: `Afternoon (${fmtHour(split)}-${fmtHour(hrs.close)})`, start: split, end: hrs.close });
    }
    slots.push({ label: `Full Day (${fmtHour(hrs.open)}-${fmtHour(hrs.close)})`, start: hrs.open, end: hrs.close });

    // Filter out slots that conflict with the staff member's existing assignments
    return slots.filter(slot => {
      return !hasStaffTimeConflict(staffMember.id, day, slot.start, slot.end, schedule, branchId);
    });
  };

  // === DRAG AND DROP HANDLERS ===

  const handleDragStart = useCallback((e, staffId, staffName, role, fromDay, fromBranchId) => {
    const data = { staffId, staffName, role, fromDay, fromBranchId };
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
    setDragging(data);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragging(null);
    setDragOverTarget(null);
  }, []);

  const canDrop = useCallback((day, branchId, role) => {
    if (!dragging) return false;
    if (dragging.role !== role) return false;
    if (!isBranchOpen(branchId, day)) return false;

    // Check slot capacity
    const cell = schedule[day]?.[branchId];
    const key = role === 'nurse' ? 'nurses' : 'receptionists';
    const existing = cell?.[key] || [];
    const maxSlots = (role === 'nurse' && branchId === 'parkview' && day === 'Saturday') ? 2 : 1;
    if (existing.length >= maxSlots && !existing.some(s => s.id === dragging.staffId)) return false;

    // If same cell, no point dropping
    if (dragging.fromDay === day && dragging.fromBranchId === branchId) return false;

    // Check staff has an available time slot on that day (time-aware)
    if (dragging.fromDay !== day) {
      const branch = BRANCHES.find(b => b.id === branchId);
      const hrs = branch?.hours[day];
      if (hrs) {
        const member = staff.find(s => s.id === dragging.staffId);
        if (member) {
          const slots = getTimeSlots(day, branchId, member);
          if (!slots || slots.length === 0) return false;
        }
      }
    }

    // Check branch compatibility
    const member = staff.find(s => s.id === dragging.staffId);
    if (member && !member.branches.includes(branchId) && !member.lastResortBranches?.includes(branchId)) return false;

    return true;
  }, [dragging, schedule, staff]);

  const handleDragOver = useCallback((e, day, branchId, role) => {
    if (canDrop(day, branchId, role)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverTarget({ day, branchId, role });
    }
  }, [canDrop]);

  const handleDragLeave = useCallback(() => {
    setDragOverTarget(null);
  }, []);

  const handleDrop = useCallback((e, toDay, toBranchId, toRole) => {
    e.preventDefault();
    setDragOverTarget(null);
    setDragging(null);

    let data;
    try {
      data = JSON.parse(e.dataTransfer.getData('application/json'));
    } catch { return; }

    const { staffId, staffName, role, fromDay, fromBranchId } = data;
    if (role !== toRole) return;

    // If staff already has assignments, auto-pick a non-conflicting partial slot
    const member = staff.find(s => s.id === staffId);
    if (member) {
      const slots = getTimeSlots(toDay, toBranchId, member);
      if (slots && slots.length > 0 && slots.length < 3) {
        // Auto-pick the first available partial slot (prefer partial over full day)
        const branch = BRANCHES.find(b => b.id === toBranchId);
        const hrs = branch?.hours[toDay];
        const partialSlots = slots.filter(s => s.start !== hrs?.open || s.end !== hrs?.close);
        const slot = partialSlots.length > 0 ? partialSlots[0] : slots[0];

        setSchedule(prev => {
          const updated = JSON.parse(JSON.stringify(prev));
          const key = role === 'nurse' ? 'nurses' : 'receptionists';
          if (fromDay && fromBranchId && updated[fromDay]?.[fromBranchId]) {
            updated[fromDay][fromBranchId][key] = updated[fromDay][fromBranchId][key].filter(s => s.id !== staffId);
          }
          if (!updated[toDay]) updated[toDay] = {};
          if (!updated[toDay][toBranchId]) updated[toDay][toBranchId] = { nurses: [], receptionists: [] };
          if (!updated[toDay][toBranchId][key].some(s => s.id === staffId)) {
            updated[toDay][toBranchId][key].push({
              id: staffId, name: staffName, locked: false,
              shiftStart: slot.start, shiftEnd: slot.end,
            });
          }
          return updated;
        });
        return;
      }
    }

    // Default drop (full day, no conflicts)
    setSchedule(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const key = role === 'nurse' ? 'nurses' : 'receptionists';
      if (fromDay && fromBranchId && updated[fromDay]?.[fromBranchId]) {
        updated[fromDay][fromBranchId][key] = updated[fromDay][fromBranchId][key].filter(s => s.id !== staffId);
      }
      if (!updated[toDay]) updated[toDay] = {};
      if (!updated[toDay][toBranchId]) updated[toDay][toBranchId] = { nurses: [], receptionists: [] };
      if (!updated[toDay][toBranchId][key].some(s => s.id === staffId)) {
        updated[toDay][toBranchId][key].push({ id: staffId, name: staffName, locked: false });
      }
      return updated;
    });
  }, [setSchedule, schedule, staff]);

  // Pool drag start (from unassigned staff panel)
  const handlePoolDragStart = useCallback((e, member, day) => {
    const data = { staffId: member.id, staffName: member.name, role: member.role, fromDay: null, fromBranchId: null, poolDay: day };
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
    setDragging(data);
  }, []);

  // === HANDLERS ===

  const handleAutoSchedule = () => {
    const result = autoSchedule(staff, schedule, availability, shiftRequests, weekStartDate);
    setSchedule(result);
  };

  const handleClearSchedule = () => {
    if (window.confirm('Clear the entire schedule for this week? Locked assignments will be kept.')) {
      const cleared = {};
      DAYS_OF_WEEK.forEach(day => {
        cleared[day] = {};
        BRANCHES.forEach(branch => {
          const existing = schedule[day]?.[branch.id];
          cleared[day][branch.id] = {
            nurses: existing?.nurses?.filter(n => n.locked) || [],
            receptionists: existing?.receptionists?.filter(r => r.locked) || [],
          };
        });
      });
      setSchedule(cleared);
    }
  };

  const handleExport = () => {
    exportScheduleToExcel(schedule, weekStartDate, staff);
  };

  const removeAssignment = (day, branchId, role, staffId) => {
    setSchedule(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (!updated[day]?.[branchId]) return prev;
      const key = role === 'nurse' ? 'nurses' : 'receptionists';
      updated[day][branchId][key] = updated[day][branchId][key].filter(s => s.id !== staffId);
      return updated;
    });
  };

  const toggleLock = (day, branchId, role, staffId) => {
    setSchedule(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (!updated[day]?.[branchId]) return prev;
      const key = role === 'nurse' ? 'nurses' : 'receptionists';
      const person = updated[day][branchId][key].find(s => s.id === staffId);
      if (person) person.locked = !person.locked;
      return updated;
    });
  };

  // Add assignment — show time picker (Morning / Afternoon / Full Day)
  const handleAssignClick = (day, branchId, role, staffMember) => {
    const slots = getTimeSlots(day, branchId, staffMember);
    if (slots && slots.length === 1) {
      // Only one option — assign directly with that slot
      addAssignmentWithTime(day, branchId, role, staffMember, slots[0].start, slots[0].end);
      return;
    }
    if (slots && slots.length > 1) {
      // Show time picker
      setTimePickerModal({ day, branchId, role, staffMember, slots });
      setCustomTimeMode(false);
      setCustomStart('');
      setCustomEnd('');
      setAssignModal(null);
      return;
    }
    // Fallback: direct assign
    addAssignmentWithTime(day, branchId, role, staffMember, null, null);
  };

  const addAssignmentWithTime = (day, branchId, role, staffMember, shiftStart, shiftEnd) => {
    setSchedule(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (!updated[day]) updated[day] = {};
      if (!updated[day][branchId]) updated[day][branchId] = { nurses: [], receptionists: [] };
      const key = role === 'nurse' ? 'nurses' : 'receptionists';
      if (!updated[day][branchId][key].some(s => s.id === staffMember.id)) {
        const assignment = { id: staffMember.id, name: staffMember.name, locked: false };
        if (shiftStart) assignment.shiftStart = shiftStart;
        if (shiftEnd) assignment.shiftEnd = shiftEnd;
        updated[day][branchId][key].push(assignment);
      }
      return updated;
    });
    setAssignModal(null);
    setTimePickerModal(null);
  };

  const getAvailableStaff = (day, branchId, role) => {
    const dayIndex = DAYS_OF_WEEK.indexOf(day);
    const dateStr = getDateStr(currentWeekStart, dayIndex);

    return staff.filter(s => {
      if (s.role !== role && !(s.alsoManager && role === 'receptionist')) return false;
      if (s.availableDays && !s.availableDays.includes(day)) return false;
      if (availability[s.id]?.includes(dateStr)) return false;
      if (!s.branches.includes(branchId) && !s.lastResortBranches?.includes(branchId)) return false;
      // Check if already in this specific cell
      const cell = schedule[day]?.[branchId];
      const key = role === 'nurse' ? 'nurses' : 'receptionists';
      if (cell?.[key]?.some(p => p.id === s.id)) return false;
      // Check if they have an available time slot
      const slots = getTimeSlots(day, branchId, s);
      if (!slots || slots.length === 0) return false;
      return true;
    });
  };

  // Get unassigned staff for a given day (staff with only partial assignments still show)
  const getUnassignedForDay = (day) => {
    const dayIndex = DAYS_OF_WEEK.indexOf(day);
    const dateStr = getDateStr(currentWeekStart, dayIndex);

    const fullyAssigned = new Set();
    BRANCHES.forEach(b => {
      const cell = schedule[day]?.[b.id];
      [...(cell?.nurses || []), ...(cell?.receptionists || [])].forEach(person => {
        // Full-day assignment (no custom times = full day)
        if (!person.shiftStart && !person.shiftEnd) {
          fullyAssigned.add(person.id);
        }
      });
    });

    return staff.filter(s => {
      if (!isScheduleRole(s.role)) return false; // Support staff don't appear in schedule
      if (fullyAssigned.has(s.id)) return false;
      if (s.availableDays && !s.availableDays.includes(day)) return false;
      if (availability[s.id]?.includes(dateStr)) return false;
      // Show staff with no assignments OR only partial-day assignments
      let hasFullDay = false;
      BRANCHES.forEach(b => {
        const cell = schedule[day]?.[b.id];
        [...(cell?.nurses || []), ...(cell?.receptionists || [])].forEach(person => {
          if (person.id === s.id && !person.shiftStart && !person.shiftEnd) hasFullDay = true;
        });
      });
      return !hasFullDay;
    });
  };

  const isToday = (dayIndex) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + dayIndex);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  };

  const isDropTarget = (day, branchId, role) => {
    return dragOverTarget?.day === day && dragOverTarget?.branchId === branchId && dragOverTarget?.role === role;
  };

  // === RENDER HELPERS ===

  const getStaffColor = (staffId) => {
    const member = staff.find(s => s.id === staffId);
    return member?.color ? STAFF_COLOR_MAP[member.color] : null;
  };

  const colorStyle = (hex) => {
    if (!hex) return undefined;
    return { backgroundColor: `${hex}30`, borderColor: hex, color: '#1f2937' };
  };

  const renderNurseBadge = (n, day, branchId) => {
    const staffColor = getStaffColor(n.id);
    const timeRange = fmtShiftRange(n, branchId, day);
    return (
    <div
      key={n.id}
      draggable={!n.locked}
      onDragStart={(e) => handleDragStart(e, n.id, n.name, 'nurse', day, branchId)}
      onDragEnd={handleDragEnd}
      className={`group relative nurse-badge pr-1 ${!n.locked ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      style={colorStyle(staffColor)}
    >
      {!n.locked && <GripVertical className="w-3 h-3 shrink-0 opacity-30 group-hover:opacity-60" />}
      <Stethoscope className="w-3 h-3 shrink-0 text-blue-500" />
      <span className="flex-1 truncate text-center">
        {n.name}
        {timeRange && <span className="text-[10px] text-gray-500 ml-0.5">({timeRange})</span>}
      </span>
      {n.locked && <Lock className="w-3 h-3 shrink-0 opacity-40" />}
      <div className="hidden group-hover:flex items-center gap-0.5 absolute right-0 top-0 bottom-0 bg-blue-100 rounded-r-full pl-1 pr-1">
        <button
          onClick={() => toggleLock(day, branchId, 'nurse', n.id)}
          className="p-0.5 rounded hover:bg-blue-200"
          title={n.locked ? 'Unlock' : 'Lock'}
        >
          {n.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
        <button
          onClick={() => removeAssignment(day, branchId, 'nurse', n.id)}
          className="p-0.5 rounded hover:bg-red-200 text-red-600"
          title="Remove"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  ); };

  const renderReceptionistBadge = (r, day, branchId) => {
    const staffColor = getStaffColor(r.id);
    return (
    <div
      key={r.id}
      draggable={!r.locked}
      onDragStart={(e) => handleDragStart(e, r.id, r.name, 'receptionist', day, branchId)}
      onDragEnd={handleDragEnd}
      className={`group relative receptionist-badge pr-1 ${!r.locked ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      style={colorStyle(staffColor)}
    >
      {!r.locked && <GripVertical className="w-3 h-3 shrink-0 opacity-30 group-hover:opacity-60" />}
      <Headphones className="w-3 h-3 shrink-0 text-pink-500" />
      <span className="flex-1 truncate text-center">{r.name}</span>
      {r.locked && <Lock className="w-3 h-3 shrink-0 opacity-40" />}
      <div className="hidden group-hover:flex items-center gap-0.5 absolute right-0 top-0 bottom-0 bg-pink-100 rounded-r-full pl-1 pr-1">
        <button
          onClick={() => toggleLock(day, branchId, 'receptionist', r.id)}
          className="p-0.5 rounded hover:bg-pink-200"
          title={r.locked ? 'Unlock' : 'Lock'}
        >
          {r.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
        <button
          onClick={() => removeAssignment(day, branchId, 'receptionist', r.id)}
          className="p-0.5 rounded hover:bg-red-200 text-red-600"
          title="Remove"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  ); };

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Weekly Schedule</h1>
          <p className="text-gray-500 text-sm">Drag staff between cells or click + to assign</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={goToPrevWeek} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={goToToday} className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700">
            Today
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
            {formatWeekRange(currentWeekStart)}
          </span>
          <button onClick={goToNextWeek} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoSchedule}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-sm"
          >
            <Wand2 className="w-4 h-4" />
            Auto Schedule
          </button>
          <button
            onClick={handleClearSchedule}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <button
            onClick={() => setShowValidation(!showValidation)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              errors.length > 0 ? 'bg-red-100 text-red-700 hover:bg-red-200' :
              warnings.length > 0 ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' :
              'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {errors.length > 0 ? <AlertCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {errors.length + warnings.length} Issues
          </button>
        </div>
      </div>

      {/* Validation panel */}
      {showValidation && (errors.length > 0 || warnings.length > 0) && (
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-4 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-700">Schedule Validation</h3>
            <button onClick={() => setShowValidation(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {errors.map((err, i) => (
              <div key={`e-${i}`} className="flex items-start gap-2 text-sm text-red-700 bg-red-50 p-2 rounded">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {err}
              </div>
            ))}
            {warnings.map((warn, i) => (
              <div key={`w-${i}`} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 p-2 rounded">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {warn}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th className="w-32 p-2 text-left text-sm font-semibold text-gray-600 bg-gray-100 rounded-tl-lg">Branch</th>
              {DAYS_OF_WEEK.map((day, i) => (
                <th key={day} className={`p-2 text-center text-sm font-semibold bg-gray-100 ${i === 6 ? 'rounded-tr-lg' : ''} ${isToday(i) ? 'bg-teal-100 text-teal-800' : 'text-gray-600'}`}>
                  <div>{day.slice(0, 3)}</div>
                  <div className="text-xs font-normal text-gray-400">{getDayDate(currentWeekStart, i)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BRANCHES.map(branch => (
              <Fragment key={branch.id}>
                {/* Nurse row */}
                <tr key={`${branch.id}-nurse`} className="border-b border-gray-100">
                  <td className="p-2 text-sm" style={{ borderLeft: `4px solid ${branch.color}` }}>
                    <div className="font-medium text-gray-800">{branch.name}</div>
                    <div className="text-xs text-blue-600 font-medium">Nurse</div>
                  </td>
                  {DAYS_OF_WEEK.map((day, i) => {
                    const open = isBranchOpen(branch.id, day);
                    const cell = schedule[day]?.[branch.id];
                    const nurses = cell?.nurses || [];

                    if (!open) {
                      return (
                        <td key={day} className="p-1 text-center bg-gray-50">
                          <span className="text-xs text-gray-400">Closed</span>
                        </td>
                      );
                    }

                    const isDrop = isDropTarget(day, branch.id, 'nurse');
                    const maxNurses = (branch.id === 'parkview' && day === 'Saturday') ? 2 : 1;
                    const needsMore = nurses.length < maxNurses;

                    return (
                      <td
                        key={day}
                        className={`p-1 schedule-cell transition-colors ${isToday(i) ? 'bg-teal-50/50' : ''} ${needsMore && !dragging ? 'bg-red-50/50' : ''} ${isDrop ? 'bg-teal-100 ring-2 ring-teal-400 ring-inset' : ''} ${dragging?.role === 'nurse' && needsMore ? 'bg-teal-50/30' : ''}`}
                        onDragOver={(e) => handleDragOver(e, day, branch.id, 'nurse')}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, day, branch.id, 'nurse')}
                      >
                        <div className="space-y-1">
                          {nurses.map(n => renderNurseBadge(n, day, branch.id))}
                          {needsMore && !dragging && (
                            <button
                              onClick={() => setAssignModal({ day, branchId: branch.id, role: 'nurse' })}
                              className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded p-1 transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              Assign
                            </button>
                          )}
                          {needsMore && dragging?.role === 'nurse' && (
                            <div className="text-xs text-teal-400 text-center p-1">Drop here</div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Receptionist row — skip for clinic */}
                {!branch.isClinic && (
                <tr key={`${branch.id}-rec`} className="border-b-2 border-gray-200">
                  <td className="p-2 text-sm" style={{ borderLeft: `4px solid ${branch.color}` }}>
                    <div className="text-xs text-pink-600 font-medium">Receptionist</div>
                  </td>
                  {DAYS_OF_WEEK.map((day, i) => {
                    const open = isBranchOpen(branch.id, day);
                    const cell = schedule[day]?.[branch.id];
                    const receptionists = cell?.receptionists || [];

                    if (!open) {
                      return <td key={day} className="p-1 text-center bg-gray-50"></td>;
                    }

                    const hasAloneNurse = cell?.nurses?.some(n => {
                      const s = staff.find(st => st.id === n.id);
                      return s?.canWorkAlone;
                    });

                    const isDrop = isDropTarget(day, branch.id, 'receptionist');

                    return (
                      <td
                        key={day}
                        className={`p-1 schedule-cell transition-colors ${isToday(i) ? 'bg-teal-50/50' : ''} ${receptionists.length === 0 && !hasAloneNurse && !dragging ? 'bg-amber-50/50' : ''} ${isDrop ? 'bg-teal-100 ring-2 ring-teal-400 ring-inset' : ''} ${dragging?.role === 'receptionist' && receptionists.length === 0 ? 'bg-teal-50/30' : ''}`}
                        onDragOver={(e) => handleDragOver(e, day, branch.id, 'receptionist')}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, day, branch.id, 'receptionist')}
                      >
                        <div className="space-y-1">
                          {receptionists.map(r => renderReceptionistBadge(r, day, branch.id))}
                          {receptionists.length === 0 && hasAloneNurse && !dragging && (
                            <div className="text-xs text-gray-400 italic text-center">Nurse alone</div>
                          )}
                          {receptionists.length === 0 && !dragging && (
                            <button
                              onClick={() => setAssignModal({ day, branchId: branch.id, role: 'receptionist' })}
                              className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded p-1 transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              {!hasAloneNurse ? 'Assign' : ''}
                            </button>
                          )}
                          {receptionists.length === 0 && dragging?.role === 'receptionist' && (
                            <div className="text-xs text-teal-400 text-center p-1">Drop here</div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                )}
                {branch.isClinic && (
                  <tr key={`${branch.id}-rec`} className="border-b-2 border-gray-200">
                    <td className="p-2 text-sm" style={{ borderLeft: `4px solid ${branch.color}` }}>
                      <div className="text-xs text-gray-400 italic">Nurse only</div>
                    </td>
                    {DAYS_OF_WEEK.map((day) => (
                      <td key={day} className="p-1 text-center bg-gray-50/50">
                        <span className="text-xs text-gray-300">&mdash;</span>
                      </td>
                    ))}
                  </tr>
                )}
              </Fragment>
            ))}

            {/* Unassigned Staff Pool Row */}
            <tr className="border-t-2 border-teal-200">
              <td className="p-2 text-sm bg-teal-50 font-medium text-teal-700 align-top" style={{ borderLeft: '4px solid #14b8a6' }}>
                Unassigned
                <div className="text-xs font-normal text-teal-500">Drag to schedule</div>
              </td>
              {DAYS_OF_WEEK.map((day) => {
                const unassigned = getUnassignedForDay(day);
                const unassignedNurses = unassigned.filter(s => s.role === 'nurse');
                const unassignedRecs = unassigned.filter(s => s.role === 'receptionist');

                return (
                  <td key={day} className="p-1 align-top bg-teal-50/30">
                    <div className="space-y-0.5 max-h-36 overflow-y-auto">
                      {unassignedNurses.map(member => {
                        const sc = member.color ? STAFF_COLOR_MAP[member.color] : null;
                        return (
                        <div
                          key={member.id}
                          draggable
                          onDragStart={(e) => handlePoolDragStart(e, member, day)}
                          onDragEnd={handleDragEnd}
                          className="nurse-badge cursor-grab active:cursor-grabbing opacity-60 hover:opacity-100 transition-opacity"
                          style={colorStyle(sc)}
                        >
                          <GripVertical className="w-3 h-3 shrink-0 opacity-40" />
                          <Stethoscope className="w-3 h-3 shrink-0 text-blue-500" />
                          <span className="flex-1 truncate text-center">{member.name}</span>
                        </div>
                        );
                      })}
                      {unassignedRecs.map(member => {
                        const sc = member.color ? STAFF_COLOR_MAP[member.color] : null;
                        return (
                        <div
                          key={member.id}
                          draggable
                          onDragStart={(e) => handlePoolDragStart(e, member, day)}
                          onDragEnd={handleDragEnd}
                          className="receptionist-badge cursor-grab active:cursor-grabbing opacity-60 hover:opacity-100 transition-opacity"
                          style={colorStyle(sc)}
                        >
                          <GripVertical className="w-3 h-3 shrink-0 opacity-40" />
                          <Headphones className="w-3 h-3 shrink-0 text-pink-500" />
                          <span className="flex-1 truncate text-center">{member.name}</span>
                        </div>
                        );
                      })}
                      {unassigned.length === 0 && (
                        <span className="text-xs text-gray-300">All assigned</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Weekly hours summary */}
      <div className="mt-6 bg-white rounded-xl shadow-sm border p-4">
        <h3 className="font-semibold text-gray-700 mb-3">Staff Hours This Week</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {staff.map(member => {
            const hrs = weeklyHours[member.id];
            if (!hrs || hrs.shifts === 0) return null;
            return (
              <div key={member.id} className="bg-gray-50 rounded-lg p-2 text-sm">
                <div className="font-medium text-gray-700">{member.name}</div>
                <div className="text-gray-500 text-xs">{hrs.shifts} shifts &middot; {hrs.total}h</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Assignment Modal (staff list) */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setAssignModal(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-96 max-h-[80vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">
                Assign {assignModal.role === 'nurse' ? 'Nurse' : 'Receptionist'}
              </h3>
              <button onClick={() => setAssignModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              {BRANCHES.find(b => b.id === assignModal.branchId)?.name} &mdash; {assignModal.day}
              <span className="ml-1 text-xs text-teal-600">(time slots available)</span>
            </p>
            <div className="space-y-1">
              {getAvailableStaff(assignModal.day, assignModal.branchId, assignModal.role).map(member => {
                const isLastResort = member.lastResortBranches?.includes(assignModal.branchId);
                const isMainBranch = member.mainBranch === assignModal.branchId;
                return (
                  <button
                    key={member.id}
                    onClick={() => handleAssignClick(assignModal.day, assignModal.branchId, assignModal.role, member)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-teal-50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <span className="font-medium text-gray-800">{member.name}</span>
                      {isMainBranch && <span className="ml-2 text-xs text-teal-600">(Main branch)</span>}
                      {isLastResort && <span className="ml-2 text-xs text-red-500">(Last resort)</span>}
                      {member.canWorkAlone && <span className="ml-2 text-xs text-blue-500">(Can work alone)</span>}
                    </div>
                    <span className="text-xs text-gray-400">
                      {weeklyHours[member.id]?.shifts || 0} shifts
                    </span>
                  </button>
                );
              })}
              {getAvailableStaff(assignModal.day, assignModal.branchId, assignModal.role).length === 0 && (
                <div className="text-center py-4 text-gray-400 text-sm">
                  No available {assignModal.role}s for this slot
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Time Picker Modal */}
      {timePickerModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setTimePickerModal(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Select Time Slot
              </h3>
              <button onClick={() => setTimePickerModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {timePickerModal.staffMember.name} &mdash; {BRANCHES.find(b => b.id === timePickerModal.branchId)?.name}
            </p>
            {!customTimeMode ? (
              <div className="space-y-2">
                {timePickerModal.slots.map((slot, i) => (
                  <button
                    key={i}
                    onClick={() => addAssignmentWithTime(
                      timePickerModal.day, timePickerModal.branchId,
                      timePickerModal.role, timePickerModal.staffMember,
                      slot.start, slot.end
                    )}
                    className="w-full text-left px-4 py-3 rounded-lg border hover:bg-teal-50 hover:border-teal-300 transition-colors"
                  >
                    <div className="font-medium text-gray-800">{slot.label}</div>
                  </button>
                ))}
                <button
                  onClick={() => {
                    const branch = BRANCHES.find(b => b.id === timePickerModal.branchId);
                    const hrs = branch?.hours[timePickerModal.day];
                    setCustomStart(hrs?.open || '09:00');
                    setCustomEnd(hrs?.close || '17:00');
                    setCustomTimeMode(true);
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg border border-dashed hover:bg-gray-50 hover:border-gray-400 transition-colors"
                >
                  <div className="font-medium text-gray-500">Custom times...</div>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 w-12">Start</label>
                  <input
                    type="time"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 w-12">End</label>
                  <input
                    type="time"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                {customStart && customEnd && timeToMinutes(customEnd) <= timeToMinutes(customStart) && (
                  <p className="text-xs text-red-500">End time must be after start time</p>
                )}
                {customStart && customEnd && timeToMinutes(customEnd) > timeToMinutes(customStart) &&
                  hasStaffTimeConflict(timePickerModal.staffMember.id, timePickerModal.day, customStart, customEnd, schedule, timePickerModal.branchId) && (
                  <p className="text-xs text-red-500">Conflicts with an existing assignment</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setCustomTimeMode(false)}
                    className="flex-1 px-3 py-2 rounded-lg border text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      if (customStart && customEnd && timeToMinutes(customEnd) > timeToMinutes(customStart) &&
                          !hasStaffTimeConflict(timePickerModal.staffMember.id, timePickerModal.day, customStart, customEnd, schedule, timePickerModal.branchId)) {
                        addAssignmentWithTime(
                          timePickerModal.day, timePickerModal.branchId,
                          timePickerModal.role, timePickerModal.staffMember,
                          customStart, customEnd
                        );
                      }
                    }}
                    disabled={!customStart || !customEnd || timeToMinutes(customEnd) <= timeToMinutes(customStart) ||
                      hasStaffTimeConflict(timePickerModal.staffMember.id, timePickerModal.day, customStart, customEnd, schedule, timePickerModal.branchId)}
                    className="flex-1 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Assign
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
