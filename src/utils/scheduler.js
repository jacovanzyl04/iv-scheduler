import { BRANCHES, DAYS_OF_WEEK, isBranchOpen, getShiftHours } from '../data/initialData';

/**
 * Auto-scheduler algorithm for IV Therapy staff scheduling.
 *
 * Priority order:
 * 1. Place priority staff (Nneka, Dinah, Ntombi) at requested/main branches
 * 2. Place staff with fixed-day constraints (Jaco Fri-Sun, Trinity weekends, Nomonde weekends)
 * 3. Place permanent staff to help them reach hours targets
 * 4. Fill remaining nurse gaps at main branches
 * 5. Fill remaining receptionist gaps
 * 6. Fill clinic if capacity allows (overflow)
 * 7. Validate: each open branch has at least 1 nurse + 1 receptionist (or nurse who can work alone)
 */
export function autoSchedule(staff, existingSchedule, availability, shiftRequests, weekStartDate) {
  // Clone existing schedule or start fresh
  const schedule = {};

  DAYS_OF_WEEK.forEach(day => {
    schedule[day] = {};
    BRANCHES.forEach(branch => {
      // Preserve any manually locked assignments
      const existing = existingSchedule?.[day]?.[branch.id];
      schedule[day][branch.id] = {
        nurses: existing?.nurses?.filter(n => n.locked) || [],
        receptionists: existing?.receptionists?.filter(r => r.locked) || [],
      };
    });
  });

  // Helper: check if staff member is available on a given day
  function isAvailable(staffMember, day, dateStr) {
    // Check day-of-week restrictions
    if (staffMember.availableDays && !staffMember.availableDays.includes(day)) {
      return false;
    }
    // Check leave/unavailability
    if (availability?.[staffMember.id]?.includes(dateStr)) {
      return false;
    }
    return true;
  }

  // Helper: check if staff is already assigned on a day
  function isAssignedOnDay(staffId, day) {
    for (const branchId of Object.keys(schedule[day])) {
      const cell = schedule[day][branchId];
      if (cell.nurses?.some(n => n.id === staffId)) return true;
      if (cell.receptionists?.some(r => r.id === staffId)) return true;
    }
    return false;
  }

  // Helper: count weekly assignments for a staff member
  function countWeeklyShifts(staffId) {
    let count = 0;
    DAYS_OF_WEEK.forEach(day => {
      if (isAssignedOnDay(staffId, day)) count++;
    });
    return count;
  }

  // Helper: max nurses allowed for a branch on a given day
  function getMaxNurses(branchId, day) {
    return (branchId === 'parkview' && day === 'Saturday') ? 2 : 1;
  }

  // Helper: assign staff to a branch on a day
  // Returns true if assignment was made, false if slot was already full
  function assign(staffMember, branchId, day) {
    const cell = schedule[day][branchId];
    const assignment = { id: staffMember.id, name: staffMember.name, locked: false };
    if (staffMember.role === 'nurse') {
      const maxNurses = getMaxNurses(branchId, day);
      if (cell.nurses.length >= maxNurses) return false;
      if (!cell.nurses.some(n => n.id === staffMember.id)) {
        cell.nurses.push(assignment);
        return true;
      }
      return false;
    } else {
      // MAX 1 receptionist per branch per day
      if (cell.receptionists.length >= 1) return false;
      if (!cell.receptionists.some(r => r.id === staffMember.id)) {
        cell.receptionists.push(assignment);
        return true;
      }
      return false;
    }
  }

  // Helper: does branch need a nurse on this day?
  function branchNeedsNurse(branchId, day) {
    if (!isBranchOpen(branchId, day)) return false;
    const maxNurses = getMaxNurses(branchId, day);
    return schedule[day][branchId].nurses.length < maxNurses;
  }

  // Helper: does branch need a receptionist on this day?
  function branchNeedsReceptionist(branchId, day) {
    if (!isBranchOpen(branchId, day)) return false;
    // Clinic does NOT need receptionists — nurse only
    const branch = BRANCHES.find(b => b.id === branchId);
    if (branch?.isClinic) return false;
    const cell = schedule[day][branchId];
    if (cell.receptionists.length > 0) return false;
    // If there's a nurse who can work alone, receptionist is optional
    const hasAloneNurse = cell.nurses.some(n => {
      const s = staff.find(st => st.id === n.id);
      return s?.canWorkAlone;
    });
    return !hasAloneNurse;
  }

  // Calculate date strings for each day of the week (using local dates, not UTC)
  const dateLookup = {};
  if (weekStartDate) {
    const start = new Date(weekStartDate + 'T12:00:00'); // Noon to avoid timezone edge cases
    DAYS_OF_WEEK.forEach((day, index) => {
      const d = new Date(start);
      d.setDate(d.getDate() + index);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dateLookup[day] = `${year}-${month}-${dd}`;
    });
  }

  // Get non-clinic branches (priority for staffing)
  const mainBranches = BRANCHES.filter(b => !b.isClinic);
  const clinicBranch = BRANCHES.find(b => b.isClinic);

  // === STEP 1: Handle shift requests for priority staff ===
  const priorityStaff = staff.filter(s => s.priority);
  priorityStaff.forEach(member => {
    const requests = shiftRequests?.[member.id] || {};
    DAYS_OF_WEEK.forEach(day => {
      const dateStr = dateLookup[day] || day;
      if (!isAvailable(member, day, dateStr)) return;
      if (isAssignedOnDay(member.id, day)) return;

      // If they have a specific branch request for this day
      if (requests[day]) {
        const branchId = requests[day];
        if (isBranchOpen(branchId, day)) {
          const placed = assign(member, branchId, day);
          if (placed) return;
        }
      }

      // Try main branch first
      const targetBranch = member.mainBranch;
      if (targetBranch && isBranchOpen(targetBranch, day)) {
        const placed = assign(member, targetBranch, day);
        if (placed) return;
      }

      // Try alsoMainBranch (e.g. clinic for Dinah/Ntombi)
      if (member.alsoMainBranch && isBranchOpen(member.alsoMainBranch, day)) {
        const placed = assign(member, member.alsoMainBranch, day);
        if (placed) return;
      }

      // Try any other available branch that still needs a nurse
      for (const branchId of member.branches) {
        if (branchId === targetBranch || branchId === member.alsoMainBranch) continue;
        if (!isBranchOpen(branchId, day)) continue;
        if (branchNeedsNurse(branchId, day)) {
          const placed = assign(member, branchId, day);
          if (placed) return;
        }
      }
    });
  });

  // === STEP 2: Place fixed-day, fixed-branch staff ===
  // Jaco: Parkview Fri/Sat/Sun
  const jaco = staff.find(s => s.id === 'jaco');
  if (jaco) {
    ['Friday', 'Saturday', 'Sunday'].forEach(day => {
      const dateStr = dateLookup[day] || day;
      if (isAvailable(jaco, day, dateStr) && isBranchOpen('parkview', day)) {
        assign(jaco, 'parkview', day);
      }
    });
  }

  // Trinity: Parkview weekends only
  const trinity = staff.find(s => s.id === 'trinity');
  if (trinity) {
    ['Saturday', 'Sunday'].forEach(day => {
      const dateStr = dateLookup[day] || day;
      if (isAvailable(trinity, day, dateStr) && isBranchOpen('parkview', day)) {
        assign(trinity, 'parkview', day);
      }
    });
  }

  // Nomonde: weekends only, must have both days or none
  const nomonde = staff.find(s => s.id === 'nomonde');
  if (nomonde) {
    const satDate = dateLookup['Saturday'] || 'Saturday';
    const sunDate = dateLookup['Sunday'] || 'Sunday';
    const satAvail = isAvailable(nomonde, 'Saturday', satDate);
    const sunAvail = isAvailable(nomonde, 'Sunday', sunDate);

    if (satAvail && sunAvail) {
      // Find a branch that needs a receptionist on both days
      for (const branch of mainBranches) {
        const needsSat = branchNeedsReceptionist(branch.id, 'Saturday') && isBranchOpen(branch.id, 'Saturday');
        const needsSun = branchNeedsReceptionist(branch.id, 'Sunday') && isBranchOpen(branch.id, 'Sunday');
        if (needsSat || needsSun) {
          if (nomonde.branches.includes(branch.id)) {
            if (isBranchOpen(branch.id, 'Saturday')) assign(nomonde, branch.id, 'Saturday');
            if (isBranchOpen(branch.id, 'Sunday')) assign(nomonde, branch.id, 'Sunday');
            break;
          }
        }
      }
    }
  }

  // === STEP 3: Fill nurse gaps at main branches ===
  const nurses = staff.filter(s => s.role === 'nurse' && !s.priority);

  DAYS_OF_WEEK.forEach(day => {
    mainBranches.forEach(branch => {
      if (!branchNeedsNurse(branch.id, day)) return;

      // Find available nurses for this branch, prefer those with it as main branch
      const candidates = nurses
        .filter(n => {
          const dateStr = dateLookup[day] || day;
          if (!isAvailable(n, day, dateStr)) return false;
          if (isAssignedOnDay(n.id, day)) return false;
          // Check if this is a regular or last-resort branch
          if (n.branches.includes(branch.id)) return true;
          if (n.lastResortBranches?.includes(branch.id)) return true;
          return false;
        })
        .sort((a, b) => {
          // Prefer main branch match
          const aMain = a.mainBranch === branch.id ? 0 : 1;
          const bMain = b.mainBranch === branch.id ? 0 : 1;
          if (aMain !== bMain) return aMain - bMain;
          // Prefer regular branch over last-resort
          const aRegular = a.branches.includes(branch.id) ? 0 : 1;
          const bRegular = b.branches.includes(branch.id) ? 0 : 1;
          if (aRegular !== bRegular) return aRegular - bRegular;
          // Prefer those with fewer assignments this week (spread work)
          return countWeeklyShifts(a.id) - countWeeklyShifts(b.id);
        });

      if (candidates.length > 0) {
        assign(candidates[0], branch.id, day);
      }
    });
  });

  // === STEP 4: Fill receptionist slots at ALL main branches ===
  // Always try to assign a receptionist even if nurse can work alone —
  // "can work alone" is a fallback, not the preference.
  const receptionists = staff.filter(s => s.role === 'receptionist' && s.id !== 'nomonde');

  DAYS_OF_WEEK.forEach(day => {
    mainBranches.forEach(branch => {
      if (!isBranchOpen(branch.id, day)) return;
      // Skip if clinic (nurse only)
      const branchData = BRANCHES.find(b => b.id === branch.id);
      if (branchData?.isClinic) return;
      // Skip if already has a receptionist
      const cell = schedule[day][branch.id];
      if (cell.receptionists.length > 0) return;

      const candidates = receptionists
        .filter(r => {
          const dateStr = dateLookup[day] || day;
          if (!isAvailable(r, day, dateStr)) return false;
          if (isAssignedOnDay(r.id, day)) return false;
          if (!r.branches.includes(branch.id)) return false;
          return true;
        })
        .sort((a, b) => {
          // Prefer main branch match
          const aMain = a.mainBranch === branch.id ? 0 : 1;
          const bMain = b.mainBranch === branch.id ? 0 : 1;
          if (aMain !== bMain) return aMain - bMain;
          // Permanent staff get priority to accumulate hours
          const aPerm = a.employmentType === 'permanent' ? 0 : 1;
          const bPerm = b.employmentType === 'permanent' ? 0 : 1;
          if (aPerm !== bPerm) return aPerm - bPerm;
          // Prefer those with fewer assignments (spread work)
          return countWeeklyShifts(a.id) - countWeeklyShifts(b.id);
        });

      if (candidates.length > 0) {
        assign(candidates[0], branch.id, day);
      }
    });
  });

  // === STEP 5: Ensure Ian gets minimum 4 shifts ===
  const ian = staff.find(s => s.id === 'ian');
  if (ian) {
    let ianShifts = countWeeklyShifts('ian');
    if (ianShifts < 4) {
      for (const day of DAYS_OF_WEEK) {
        if (ianShifts >= 4) break;
        const dateStr = dateLookup[day] || day;
        if (!isAvailable(ian, day, dateStr)) continue;
        if (isAssignedOnDay('ian', day)) continue;

        // Find a branch that could use an extra receptionist or needs one
        for (const branch of mainBranches) {
          if (!isBranchOpen(branch.id, day)) continue;
          if (!ian.branches.includes(branch.id)) continue;
          // Either needs a receptionist or could use extra coverage
          if (branchNeedsReceptionist(branch.id, day)) {
            assign(ian, branch.id, day);
            ianShifts++;
            break;
          }
        }
      }
      // If still not enough, add as extra coverage
      if (ianShifts < 4) {
        for (const day of DAYS_OF_WEEK) {
          if (ianShifts >= 4) break;
          const dateStr = dateLookup[day] || day;
          if (!isAvailable(ian, day, dateStr)) continue;
          if (isAssignedOnDay('ian', day)) continue;
          for (const branch of mainBranches) {
            if (!isBranchOpen(branch.id, day)) continue;
            if (!ian.branches.includes(branch.id)) continue;
            assign(ian, branch.id, day);
            ianShifts++;
            break;
          }
        }
      }
    }
  }

  // === STEP 6: Fill clinic if capacity allows ===
  if (clinicBranch) {
    DAYS_OF_WEEK.forEach(day => {
      if (!isBranchOpen('clinic', day)) return;

      // Check if all main branches are covered first
      const allMainCovered = mainBranches.every(b => {
        if (!isBranchOpen(b.id, day)) return true;
        return !branchNeedsNurse(b.id, day);
      });

      if (!allMainCovered) return;

      // Check if clinic already has a nurse
      if (!branchNeedsNurse('clinic', day)) return;

      // Find available nurse for clinic - prefer Dinah/Ntombi
      const clinicCandidates = staff
        .filter(n => {
          if (n.role !== 'nurse') return false;
          const dateStr = dateLookup[day] || day;
          if (!isAvailable(n, day, dateStr)) return false;
          if (isAssignedOnDay(n.id, day)) return false;
          if (!n.branches.includes('clinic')) return false;
          return true;
        })
        .sort((a, b) => {
          // Prefer Dinah/Ntombi for clinic
          const aClinic = (a.alsoMainBranch === 'clinic') ? 0 : 1;
          const bClinic = (b.alsoMainBranch === 'clinic') ? 0 : 1;
          return aClinic - bClinic;
        });

      if (clinicCandidates.length > 0) {
        assign(clinicCandidates[0], 'clinic', day);
      }
    });
  }

  return schedule;
}

/**
 * Validate a schedule and return warnings/errors
 */
export function validateSchedule(schedule, staff) {
  const warnings = [];
  const errors = [];

  DAYS_OF_WEEK.forEach(day => {
    BRANCHES.forEach(branch => {
      if (!isBranchOpen(branch.id, day)) return;
      if (branch.isClinic) return; // Clinic is optional — nurse only, no receptionist needed

      const cell = schedule[day]?.[branch.id];
      const nurses = cell?.nurses || [];
      const receptionists = cell?.receptionists || [];
      const maxNurses = (branch.id === 'parkview' && day === 'Saturday') ? 2 : 1;
      if (!cell || nurses.length === 0) {
        errors.push(`${branch.name} has no nurse on ${day}`);
      }

      // Check for too many nurses
      if (cell && nurses.length > maxNurses) {
        warnings.push(`${branch.name} has ${nurses.length} nurses on ${day} (max ${maxNurses})`);
      }

      if (cell && receptionists.length === 0) {
        // Check if there's a nurse who can work alone
        const hasAloneNurse = cell?.nurses?.some(n => {
          const s = staff.find(st => st.id === n.id);
          return s?.canWorkAlone;
        });
        if (!hasAloneNurse) {
          errors.push(`${branch.name} has no receptionist and no nurse who can work alone on ${day}`);
        } else {
          warnings.push(`${branch.name} has no receptionist on ${day} (nurse working alone)`);
        }
      }
    });

    // Check for double-booking
    const assignedToday = {};
    BRANCHES.forEach(branch => {
      const cell = schedule[day]?.[branch.id];
      if (!cell) return;
      [...(cell.nurses || []), ...(cell.receptionists || [])].forEach(person => {
        if (assignedToday[person.id]) {
          errors.push(`${person.name} is double-booked on ${day}: ${assignedToday[person.id]} and ${branch.name}`);
        }
        assignedToday[person.id] = branch.name;
      });
    });
  });

  // Check Ian's minimum shifts
  const ian = staff.find(s => s.id === 'ian');
  if (ian) {
    let ianShifts = 0;
    DAYS_OF_WEEK.forEach(day => {
      BRANCHES.forEach(branch => {
        const cell = schedule[day]?.[branch.id];
        if (cell?.receptionists?.some(r => r.id === 'ian')) ianShifts++;
      });
    });
    if (ianShifts < 4) {
      warnings.push(`Ian has only ${ianShifts} shifts this week (minimum 4 required)`);
    }
  }

  // Check Nomonde's both-days rule
  const nomonde = staff.find(s => s.id === 'nomonde');
  if (nomonde) {
    let satAssigned = false, sunAssigned = false;
    BRANCHES.forEach(branch => {
      if (schedule['Saturday']?.[branch.id]?.receptionists?.some(r => r.id === 'nomonde')) satAssigned = true;
      if (schedule['Sunday']?.[branch.id]?.receptionists?.some(r => r.id === 'nomonde')) sunAssigned = true;
    });
    if (satAssigned !== sunAssigned) {
      errors.push(`Nomonde must work both Saturday and Sunday, or neither (currently: Sat=${satAssigned}, Sun=${sunAssigned})`);
    }
  }

  return { warnings, errors };
}

/**
 * Calculate hours worked for each staff member in a schedule
 */
export function calculateWeeklyHours(schedule, staff) {
  const hours = {};
  staff.forEach(s => { hours[s.id] = { total: 0, shifts: 0, details: [] }; });

  DAYS_OF_WEEK.forEach(day => {
    BRANCHES.forEach(branch => {
      const cell = schedule[day]?.[branch.id];
      if (!cell) return;
      const shiftHrs = getShiftHours(branch.id, day);

      [...(cell.nurses || []), ...(cell.receptionists || [])].forEach(person => {
        if (hours[person.id]) {
          hours[person.id].total += shiftHrs;
          hours[person.id].shifts += 1;
          hours[person.id].details.push({ day, branch: branch.name, hours: shiftHrs });
        }
      });
    });
  });

  return hours;
}
