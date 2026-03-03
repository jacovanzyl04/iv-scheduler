import { useState, useCallback, useEffect, Fragment } from 'react';
import { BRANCHES, DAYS_OF_WEEK, isBranchOpen, getShiftHours, isScheduleRole } from '../data/initialData';
import { autoSchedule, validateSchedule, calculateWeeklyHours, timesOverlap, timeToMinutes } from '../utils/scheduler';
import { exportScheduleToExcel } from '../utils/exportExcel';
import { exportScheduleToPdf } from '../utils/exportPdf';
import { ChevronLeft, ChevronRight, Wand2, Download, FileText, AlertTriangle, AlertCircle, X, Plus, Lock, Unlock, Trash2, Clock, MoreHorizontal } from 'lucide-react';

// Format "HH:MM" -> short hour display: "9", "13", "17"
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

function hasStaffTimeConflict(staffId, day, proposedStart, proposedEnd, schedule, excludeBranchId) {
  const assignments = getStaffDayAssignments(staffId, day, schedule);
  return assignments.some(a => {
    if (excludeBranchId && a.branchId === excludeBranchId) return false;
    return timesOverlap(proposedStart, proposedEnd, a.start, a.end);
  });
}

export default function WeeklySchedule({
  staff, schedule, setSchedule, weekStartDate, currentWeekStart,
  availability, shiftRequests, goToPrevWeek, goToNextWeek, goToToday,
  readOnly
}) {
  const [assignModal, setAssignModal] = useState(null); // { day, branchId, role }
  const [timePickerModal, setTimePickerModal] = useState(null); // { day, branchId, role, staffMember, slots }
  const [customTimeMode, setCustomTimeMode] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [showHours, setShowHours] = useState(false);

  const { warnings, errors } = validateSchedule(schedule, staff);
  const weeklyHours = calculateWeeklyHours(schedule, staff);

  useEffect(() => {
    if (!showActionsMenu) return;
    const close = () => setShowActionsMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showActionsMenu]);

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

  const handleExportPdf = () => {
    exportScheduleToPdf(schedule, weekStartDate, staff);
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

  const renderStaffChip = (person, role, day, branchId) => {
    const timeRange = fmtShiftRange(person, branchId, day);
    const isNurse = role === 'nurse';

    return (
      <div
        key={person.id}
        draggable={!readOnly && !person.locked}
        onDragStart={(e) => handleDragStart(e, person.id, person.name, role, day, branchId)}
        onDragEnd={handleDragEnd}
        className={`group relative flex items-center gap-1.5 px-2 py-1 rounded-md border-l-2
          ${isNurse ? 'border-l-blue-400' : 'border-l-pink-400'}
          bg-d4l-raised/60 ${isNurse ? 'hover:bg-blue-500/8' : 'hover:bg-pink-500/8'}
          ${!readOnly && !person.locked ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
          transition-colors text-[12px]`}
      >
        <span className="flex-1 truncate text-d4l-text2 font-medium leading-tight">
          {person.name}
        </span>
        {timeRange && (
          <span className="text-[10px] text-d4l-dim shrink-0">{timeRange}</span>
        )}
        {person.locked && (
          <span className="w-1.5 h-1.5 rounded-full bg-d4l-gold/60 shrink-0" title="Locked" />
        )}
        {!readOnly && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); toggleLock(day, branchId, role, person.id); }}
              className="hidden group-hover:flex absolute -left-1 -top-1 p-0.5 rounded-full bg-d4l-bg border border-d4l-border shadow-sm hover:bg-d4l-gold/20 hover:border-d4l-gold/30 text-d4l-dim hover:text-d4l-gold transition-colors z-10"
              title={person.locked ? 'Unlock' : 'Lock'}
            >
              {person.locked ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); removeAssignment(day, branchId, role, person.id); }}
              className="hidden group-hover:flex absolute -right-1 -top-1 p-0.5 rounded-full bg-d4l-bg border border-d4l-border shadow-sm hover:bg-red-500/20 hover:border-red-500/30 text-d4l-dim hover:text-red-400 transition-colors z-10"
              title="Remove"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </>
        )}
      </div>
    );
  };

  const renderMergedCell = (branch, day, dayIndex) => {
    const open = isBranchOpen(branch.id, day);

    if (!open) {
      return (
        <div key={day} className="bg-d4l-bg/80 p-2 flex items-center justify-center min-h-[76px]">
          <span className="text-[11px] text-d4l-dim/50">Closed</span>
        </div>
      );
    }

    const cell = schedule[day]?.[branch.id];
    const nurses = cell?.nurses || [];
    const receptionists = cell?.receptionists || [];
    const maxNurses = (branch.id === 'parkview' && day === 'Saturday') ? 2 : 1;
    const needsNurse = nurses.length < maxNurses;
    const needsReceptionist = !branch.isClinic && receptionists.length === 0;
    const hasAloneNurse = cell?.nurses?.some(n => {
      const s = staff.find(st => st.id === n.id);
      return s?.canWorkAlone;
    });

    const isMissingCritical = needsNurse;
    const isMissingMinor = needsReceptionist && !hasAloneNurse;
    const todayBg = isToday(dayIndex) ? 'bg-d4l-gold/[0.03]' : 'bg-d4l-surface';
    const nurseDropActive = isDropTarget(day, branch.id, 'nurse');
    const recDropActive = isDropTarget(day, branch.id, 'receptionist');

    return (
      <div
        key={day}
        className={`${todayBg} p-1.5 min-h-[76px] flex flex-col transition-colors
          ${isMissingCritical ? 'ring-1 ring-inset ring-red-500/20' : ''}
          ${!isMissingCritical && isMissingMinor ? 'ring-1 ring-inset ring-amber-500/15' : ''}`}
      >
        {/* Nurse section */}
        <div
          className={`flex-1 flex flex-col gap-1 rounded-md p-0.5 transition-colors
            ${nurseDropActive ? 'bg-d4l-gold/10 ring-1 ring-d4l-gold/40 ring-inset' : ''}`}
          onDragOver={(e) => handleDragOver(e, day, branch.id, 'nurse')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, day, branch.id, 'nurse')}
        >
          {nurses.map(n => renderStaffChip(n, 'nurse', day, branch.id))}
          {!readOnly && needsNurse && !dragging && (
            <button
              onClick={() => setAssignModal({ day, branchId: branch.id, role: 'nurse' })}
              className="w-full flex items-center justify-center gap-1 text-[11px] text-d4l-dim hover:text-blue-400 hover:bg-blue-500/5 rounded-md py-0.5 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Nurse</span>
            </button>
          )}
          {needsNurse && dragging?.role === 'nurse' && nurseDropActive && (
            <div className="rounded-md border border-dashed border-d4l-gold/40 py-0.5 text-center text-[11px] text-d4l-gold/60">Drop</div>
          )}
        </div>

        {/* Divider */}
        {!branch.isClinic && (nurses.length > 0 || receptionists.length > 0) && (
          <div className="border-t border-d4l-border/40 my-1" />
        )}

        {/* Receptionist section (skip for clinic) */}
        {!branch.isClinic && (
          <div
            className={`flex-1 flex flex-col gap-1 rounded-md p-0.5 transition-colors
              ${recDropActive ? 'bg-d4l-gold/10 ring-1 ring-d4l-gold/40 ring-inset' : ''}`}
            onDragOver={(e) => handleDragOver(e, day, branch.id, 'receptionist')}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, day, branch.id, 'receptionist')}
          >
            {receptionists.map(r => renderStaffChip(r, 'receptionist', day, branch.id))}
            {receptionists.length === 0 && hasAloneNurse && !dragging && (
              <div className="text-[11px] text-d4l-dim/60 italic text-center">Solo</div>
            )}
            {!readOnly && receptionists.length === 0 && !dragging && (
              <button
                onClick={() => setAssignModal({ day, branchId: branch.id, role: 'receptionist' })}
                className="w-full flex items-center justify-center gap-1 text-[11px] text-d4l-dim hover:text-pink-400 hover:bg-pink-500/5 rounded-md py-0.5 transition-colors"
              >
                <Plus className="w-3 h-3" />
                {!hasAloneNurse && <span>Recep.</span>}
              </button>
            )}
            {receptionists.length === 0 && dragging?.role === 'receptionist' && recDropActive && (
              <div className="rounded-md border border-dashed border-d4l-gold/40 py-0.5 text-center text-[11px] text-d4l-gold/60">Drop</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-6">
      {/* === TOOLBAR === */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        {/* Left: Title */}
        <div>
          <h1 className="text-xl font-bold text-d4l-text">{readOnly ? 'Full Schedule' : 'Weekly Schedule'}</h1>
          <p className="text-d4l-muted text-xs">{readOnly ? "View the team's weekly assignments" : 'Drag staff between cells or click + to assign'}</p>
        </div>

        {/* Center: Week nav in a pill */}
        <div className="flex items-center gap-1 bg-d4l-surface rounded-xl border border-d4l-border px-1 py-1">
          <button onClick={goToPrevWeek} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goToToday} className="px-3 py-1.5 text-xs font-semibold text-d4l-gold hover:bg-d4l-gold/10 rounded-lg transition-colors">
            Today
          </button>
          <span className="text-sm font-medium text-d4l-text2 min-w-[170px] text-center select-none">
            {formatWeekRange(currentWeekStart)}
          </span>
          <button onClick={goToNextWeek} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Actions (admin only) */}
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button onClick={handleAutoSchedule}
              className="flex items-center gap-2 px-4 py-2 bg-d4l-gold text-black text-sm font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow">
              <Wand2 className="w-4 h-4" />
              Auto Schedule
            </button>

            {/* More actions dropdown */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowActionsMenu(!showActionsMenu); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-d4l-surface border border-d4l-border text-d4l-text2 text-sm rounded-lg hover:bg-d4l-hover transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showActionsMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-d4l-surface border border-d4l-border rounded-xl shadow-xl z-40 py-1 animate-fade-in">
                  <button onClick={() => { handleClearSchedule(); setShowActionsMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-d4l-text2 hover:bg-d4l-hover flex items-center gap-2.5 transition-colors">
                    <Trash2 className="w-4 h-4" /> Clear Schedule
                  </button>
                  <button onClick={() => { handleExport(); setShowActionsMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-d4l-text2 hover:bg-d4l-hover flex items-center gap-2.5 transition-colors">
                    <Download className="w-4 h-4" /> Export Excel
                  </button>
                  <button onClick={() => { handleExportPdf(); setShowActionsMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-d4l-text2 hover:bg-d4l-hover flex items-center gap-2.5 transition-colors">
                    <FileText className="w-4 h-4" /> Export PDF
                  </button>
                </div>
              )}
            </div>

            {/* Issues badge */}
            <button onClick={() => setShowValidation(!showValidation)}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                errors.length > 0 ? 'text-red-400 hover:bg-red-500/10' :
                warnings.length > 0 ? 'text-amber-400 hover:bg-amber-500/10' :
                'text-green-400 hover:bg-green-500/10'
              }`}>
              {errors.length > 0 ? <AlertCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <span className="font-medium">{errors.length + warnings.length}</span>
            </button>
          </div>
        )}
      </div>

      {/* === VALIDATION PANEL === */}
      {showValidation && (errors.length > 0 || warnings.length > 0) && (
        <div className="bg-d4l-surface rounded-xl border border-d4l-border p-4 mb-4 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-d4l-text2 text-sm">Schedule Validation</h3>
            <button onClick={() => setShowValidation(false)} className="text-d4l-dim hover:text-d4l-text2">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {errors.map((err, i) => (
              <div key={`e-${i}`} className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 p-2 rounded">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {err}
              </div>
            ))}
            {warnings.map((warn, i) => (
              <div key={`w-${i}`} className="flex items-start gap-2 text-sm text-amber-400 bg-amber-500/10 p-2 rounded">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {warn}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === COLLAPSIBLE UNASSIGNED POOL (above grid) === */}
      {!readOnly && (
        <div className="mb-3">
          <button
            onClick={() => setShowUnassigned(!showUnassigned)}
            className="flex items-center gap-2 text-sm text-d4l-muted hover:text-d4l-text2 transition-colors mb-2"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${showUnassigned ? 'rotate-90' : ''}`} />
            <span className="font-medium">Unassigned Staff</span>
            <span className="text-xs text-d4l-dim">
              ({DAYS_OF_WEEK.reduce((sum, day) => sum + getUnassignedForDay(day).length, 0)} across week)
            </span>
          </button>
          {showUnassigned && (
            <div className="bg-d4l-surface rounded-xl border border-d4l-border p-3 animate-fade-in">
              <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(7, 1fr)', gap: '8px' }}>
                <div className="text-xs text-d4l-dim self-start pt-1">Drag to assign</div>
                {DAYS_OF_WEEK.map(day => {
                  const unassigned = getUnassignedForDay(day);
                  return (
                    <div key={day} className="space-y-1 max-h-28 overflow-y-auto">
                      {unassigned.map(member => (
                        <div
                          key={member.id}
                          draggable
                          onDragStart={(e) => handlePoolDragStart(e, member, day)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]
                            cursor-grab active:cursor-grabbing border-l-2
                            ${member.role === 'nurse' ? 'border-l-blue-400' : 'border-l-pink-400'}
                            bg-d4l-bg hover:bg-d4l-hover text-d4l-muted hover:text-d4l-text2 transition-colors`}
                        >
                          <span className="truncate">{member.name}</span>
                        </div>
                      ))}
                      {unassigned.length === 0 && (
                        <span className="text-[10px] text-d4l-dim/50">&mdash;</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === SCHEDULE GRID (CSS Grid) === */}
      <div className="overflow-x-auto">
        <div className="min-w-[900px]" style={{
          display: 'grid',
          gridTemplateColumns: '140px repeat(7, 1fr)',
          gap: '1px',
          backgroundColor: 'var(--color-d4l-border)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}>
          {/* Header row */}
          <div className="bg-d4l-raised p-3 flex items-end">
            <span className="text-xs font-semibold text-d4l-dim uppercase tracking-wider">Branch</span>
          </div>
          {DAYS_OF_WEEK.map((day, i) => (
            <div key={day} className={`bg-d4l-raised p-3 text-center ${isToday(i) ? 'border-b-2 border-d4l-gold' : ''}`}>
              <div className={`text-sm font-semibold ${isToday(i) ? 'text-d4l-gold' : 'text-d4l-text2'}`}>
                {day.slice(0, 3)}
              </div>
              <div className={`text-xs mt-0.5 ${isToday(i) ? 'text-d4l-gold/70' : 'text-d4l-dim'}`}>
                {getDayDate(currentWeekStart, i)}
              </div>
            </div>
          ))}

          {/* Branch rows — ONE per branch */}
          {BRANCHES.map(branch => (
            <Fragment key={branch.id}>
              <div className="bg-d4l-surface p-3 flex flex-col justify-center" style={{ borderLeft: `3px solid ${branch.color}` }}>
                <span className="text-sm font-semibold text-d4l-text leading-tight">{branch.name}</span>
                <span className="text-[11px] text-d4l-dim mt-0.5">
                  {branch.isClinic ? 'Nurse only' : 'Nurse + Recep.'}
                </span>
              </div>
              {DAYS_OF_WEEK.map((day, i) => renderMergedCell(branch, day, i))}
            </Fragment>
          ))}
        </div>
      </div>

      {/* === COLLAPSIBLE HOURS SUMMARY === */}
      {!readOnly && (
        <div className="mt-4">
          <button
            onClick={() => setShowHours(!showHours)}
            className="flex items-center gap-2 text-sm text-d4l-muted hover:text-d4l-text2 transition-colors mb-2"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${showHours ? 'rotate-90' : ''}`} />
            <span className="font-medium">Staff Hours This Week</span>
          </button>
          {showHours && (
            <div className="bg-d4l-surface rounded-xl border border-d4l-border p-4 animate-fade-in">
              <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
                {staff.filter(m => weeklyHours[m.id]?.shifts > 0).map(member => (
                  <div key={member.id} className="bg-d4l-bg rounded-lg px-3 py-2">
                    <div className="font-medium text-d4l-text2 text-xs">{member.name}</div>
                    <div className="text-d4l-dim text-[11px]">{weeklyHours[member.id].shifts}s &middot; {weeklyHours[member.id].total}h</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === ASSIGNMENT MODAL === */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setAssignModal(null)}>
          <div className="bg-d4l-surface rounded-xl shadow-xl p-6 w-80 max-h-[80vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-d4l-text text-sm">
                Assign {assignModal.role === 'nurse' ? 'Nurse' : 'Receptionist'}
              </h3>
              <button onClick={() => setAssignModal(null)} className="text-d4l-dim hover:text-d4l-text2">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-d4l-muted mb-3">
              {BRANCHES.find(b => b.id === assignModal.branchId)?.name} &mdash; {assignModal.day}
            </p>
            <div className="space-y-0.5">
              {getAvailableStaff(assignModal.day, assignModal.branchId, assignModal.role).map(member => {
                const isLastResort = member.lastResortBranches?.includes(assignModal.branchId);
                const isMainBranch = member.mainBranch === assignModal.branchId;
                return (
                  <button
                    key={member.id}
                    onClick={() => handleAssignClick(assignModal.day, assignModal.branchId, assignModal.role, member)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-d4l-gold/5 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <span className="font-medium text-d4l-text text-sm">{member.name}</span>
                      {isMainBranch && <span className="ml-2 text-[10px] text-d4l-gold">(Main)</span>}
                      {isLastResort && <span className="ml-2 text-[10px] text-red-400">(Last resort)</span>}
                      {member.canWorkAlone && <span className="ml-2 text-[10px] text-blue-400">(Solo OK)</span>}
                    </div>
                    <span className="text-[10px] text-d4l-dim">
                      {weeklyHours[member.id]?.shifts || 0}s
                    </span>
                  </button>
                );
              })}
              {getAvailableStaff(assignModal.day, assignModal.branchId, assignModal.role).length === 0 && (
                <div className="text-center py-4 text-d4l-dim text-sm">
                  No available {assignModal.role}s
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === TIME PICKER MODAL === */}
      {timePickerModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setTimePickerModal(null)}>
          <div className="bg-d4l-surface rounded-xl shadow-xl p-6 w-72 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-d4l-text text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Select Time Slot
              </h3>
              <button onClick={() => setTimePickerModal(null)} className="text-d4l-dim hover:text-d4l-text2">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-d4l-muted mb-4">
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
                    className="w-full text-left px-4 py-3 rounded-lg border border-d4l-border hover:bg-d4l-gold/5 hover:border-d4l-gold/30 transition-colors"
                  >
                    <div className="font-medium text-d4l-text text-sm">{slot.label}</div>
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
                  className="w-full text-left px-4 py-3 rounded-lg border border-dashed border-d4l-border hover:bg-d4l-bg hover:border-d4l-dim transition-colors"
                >
                  <div className="font-medium text-d4l-muted text-sm">Custom times...</div>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-d4l-text2 w-12">Start</label>
                  <input type="time" value={customStart} onChange={e => setCustomStart(e.target.value)}
                    className="flex-1 px-3 py-2 border border-d4l-border rounded-lg text-sm bg-d4l-bg text-d4l-text focus:outline-none focus:ring-2 focus:ring-d4l-gold/50" />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-d4l-text2 w-12">End</label>
                  <input type="time" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                    className="flex-1 px-3 py-2 border border-d4l-border rounded-lg text-sm bg-d4l-bg text-d4l-text focus:outline-none focus:ring-2 focus:ring-d4l-gold/50" />
                </div>
                {customStart && customEnd && timeToMinutes(customEnd) <= timeToMinutes(customStart) && (
                  <p className="text-xs text-red-400">End time must be after start time</p>
                )}
                {customStart && customEnd && timeToMinutes(customEnd) > timeToMinutes(customStart) &&
                  hasStaffTimeConflict(timePickerModal.staffMember.id, timePickerModal.day, customStart, customEnd, schedule, timePickerModal.branchId) && (
                  <p className="text-xs text-red-400">Conflicts with an existing assignment</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setCustomTimeMode(false)}
                    className="flex-1 px-3 py-2 rounded-lg border border-d4l-border text-sm text-d4l-text2 hover:bg-d4l-bg transition-colors">
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
                    className="flex-1 px-3 py-2 rounded-lg bg-d4l-gold text-black font-semibold text-sm hover:bg-d4l-gold-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
