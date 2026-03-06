import { BRANCHES, DAYS_OF_WEEK, getShiftHours, getLunchDeduction, isScheduleRole } from '../data/initialData';
import { hoursBetween } from './scheduler';

function formatPayCycleDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Determine which pay cycle a given date falls into.
 * Pay cycle: 25th of month M to 24th of month M+1.
 */
export function getPayCycleForDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  const dayOfMonth = d.getDate();

  if (dayOfMonth >= 25) {
    return formatPayCycleDate(year, month, 25);
  } else {
    const prev = new Date(year, month - 1, 25);
    return formatPayCycleDate(prev.getFullYear(), prev.getMonth(), 25);
  }
}

/**
 * Get the date range and display label for a pay cycle.
 */
export function getPayCycleRange(cycleStartStr) {
  const start = new Date(cycleStartStr + 'T12:00:00');
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setDate(end.getDate() - 1); // 24th of next month

  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  const label = `${start.toLocaleDateString('en-ZA', opts)} \u2014 ${end.toLocaleDateString('en-ZA', opts)}`;

  return { start, end, label };
}

/**
 * Get all week keys (Monday "YYYY-MM-DD" strings) that overlap with the pay cycle.
 */
export function getWeekKeysForPayCycle(cycleStartStr) {
  const { start, end } = getPayCycleRange(cycleStartStr);
  const weekKeys = [];

  // Find the Monday on or before the cycle start
  const current = new Date(start);
  const dow = current.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  current.setDate(current.getDate() + mondayOffset);

  while (current <= end) {
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);

    if (weekEnd >= start && current <= end) {
      const yr = current.getFullYear();
      const mo = String(current.getMonth() + 1).padStart(2, '0');
      const dy = String(current.getDate()).padStart(2, '0');
      weekKeys.push(`${yr}-${mo}-${dy}`);
    }

    current.setDate(current.getDate() + 7);
  }

  return weekKeys;
}

/**
 * Scan schedules for all staff who have at least 1 shift in the pay cycle.
 * Deducts lunch per person per day (<5h=0, 5-7h=0.5h, 7h+=1h).
 * Returns { [staffId]: { name, role, employmentType, shifts, hours } }
 */
export function getScheduledStaffForPayCycle(schedules, staff, cycleStartStr) {
  const stdRange = getPayCycleRange(cycleStartStr);
  const mRange = getMonthlyRangeForCycle(cycleStartStr);

  // Build per-staff range lookup
  const staffRanges = {};
  staff.forEach(s => {
    staffRanges[s.id] = s.payCycleType === 'monthly' ? mRange : stdRange;
  });

  // Get week keys covering union of both ranges
  const stdKeys = getWeekKeysForPayCycle(cycleStartStr);
  const allKeys = new Set(stdKeys);
  const cur = new Date(mRange.start);
  const dow = cur.getDay();
  cur.setDate(cur.getDate() + (dow === 0 ? -6 : 1 - dow));
  while (cur <= mRange.end) {
    const yr = cur.getFullYear();
    const mo = String(cur.getMonth() + 1).padStart(2, '0');
    const dy = String(cur.getDate()).padStart(2, '0');
    allKeys.add(`${yr}-${mo}-${dy}`);
    cur.setDate(cur.getDate() + 7);
  }
  const weekKeys = [...allKeys].sort();

  const result = {};

  weekKeys.forEach(weekKey => {
    const weekSchedule = schedules[weekKey];
    if (!weekSchedule) return;

    DAYS_OF_WEEK.forEach((day, dayIndex) => {
      const weekStart = new Date(weekKey + 'T12:00:00');
      const dayDate = new Date(weekStart);
      dayDate.setDate(dayDate.getDate() + dayIndex);

      // Collect per-person shifts for this day across all branches
      const dayShifts = {}; // { personId: { person, branches: [], totalHours: 0 } }

      BRANCHES.forEach(branch => {
        const cell = weekSchedule[day]?.[branch.id];
        if (!cell) return;

        const defaultHrs = getShiftHours(branch.id, day);

        [...(cell.nurses || []), ...(cell.receptionists || [])].forEach(person => {
          // Per-staff date range check
          const range = staffRanges[person.id] || stdRange;
          if (dayDate < range.start || dayDate > range.end) return;

          if (!dayShifts[person.id]) {
            dayShifts[person.id] = { person, branches: [], totalHours: 0 };
          }

          let shiftHrs = defaultHrs;
          if (person.shiftStart && person.shiftEnd) {
            shiftHrs = hoursBetween(person.shiftStart, person.shiftEnd);
          }

          dayShifts[person.id].branches.push(branch.id);
          dayShifts[person.id].totalHours += shiftHrs;
        });
      });

      // Apply lunch deduction per person (one per day)
      Object.entries(dayShifts).forEach(([personId, data]) => {
        if (!result[personId]) {
          const staffMember = staff.find(s => s.id === personId);
          result[personId] = {
            name: staffMember?.name || data.person.name,
            role: staffMember?.role || 'unknown',
            employmentType: staffMember?.employmentType || 'unknown',
            shifts: 0,
            hours: 0,
          };
        }

        const lunch = getLunchDeduction(day, data.branches, data.totalHours);
        result[personId].shifts += data.branches.length;
        result[personId].hours += data.totalHours - lunch;
      });
    });
  });

  return result;
}

/**
 * Get all support staff (cleaners, etc.) for timesheet tracking.
 * Support staff always appear every pay cycle regardless of schedule.
 * Returns { [staffId]: { name, role, employmentType, shifts: 0, hours: 0 } }
 */
export function getSupportStaffForPayCycle(staff) {
  const result = {};
  staff.forEach(member => {
    if (!isScheduleRole(member.role)) {
      result[member.id] = {
        name: member.name,
        role: member.role,
        employmentType: member.employmentType,
        shifts: 0,
        hours: 0,
      };
    }
  });
  return result;
}

/**
 * For staff with payCycleType === 'monthly', convert the standard 25th-based
 * cycle into the corresponding calendar month range (1st to last day).
 * Standard cycle "25 Feb - 24 Mar" → monthly cycle "1 Mar - 31 Mar".
 */
export function getMonthlyRangeForCycle(cycleStartStr) {
  const d = new Date(cycleStartStr + 'T12:00:00');
  // The standard cycle starts on the 25th of month M, so the
  // corresponding calendar month is M+1
  const monthStart = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 2, 0); // last day of that month
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  const label = `${monthStart.toLocaleDateString('en-ZA', opts)} \u2014 ${monthEnd.toLocaleDateString('en-ZA', opts)}`;
  return { start: monthStart, end: monthEnd, label };
}

export function getPrevPayCycle(cycleStartStr) {
  const d = new Date(cycleStartStr + 'T12:00:00');
  d.setMonth(d.getMonth() - 1);
  return formatPayCycleDate(d.getFullYear(), d.getMonth(), 25);
}

export function getNextPayCycle(cycleStartStr) {
  const d = new Date(cycleStartStr + 'T12:00:00');
  d.setMonth(d.getMonth() + 1);
  return formatPayCycleDate(d.getFullYear(), d.getMonth(), 25);
}
