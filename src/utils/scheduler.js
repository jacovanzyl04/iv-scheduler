import { BRANCHES, DAYS_OF_WEEK, isBranchOpen, getShiftHours } from '../data/initialData';

// Saturday split point — matches Colon Clinic Saturday close time
const SAT_SPLIT = '13:00';

/**
 * Parse "HH:MM" to minutes since midnight for time comparison
 */
function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Calculate hours between two "HH:MM" strings
 */
function hoursBetween(start, end) {
  return (timeToMinutes(end) - timeToMinutes(start)) / 60;
}

/**
 * Check if two time ranges overlap.
 * Ranges are [startA, endA) and [startB, endB) — touching endpoints don't overlap.
 */
function timesOverlap(startA, endA, startB, endB) {
  const a0 = timeToMinutes(startA), a1 = timeToMinutes(endA);
  const b0 = timeToMinutes(startB), b1 = timeToMinutes(endB);
  return a0 < b1 && a1 > b0;
}

/**
 * Auto-scheduler algorithm for IV Therapy staff scheduling.
 *
 * Priority order:
 * 1. Place priority staff (Nneka, Dinah, Ntombi) at requested/main branches
 * 2. Place staff with fixed-day constraints (Jaco Fri-Sun, Trinity weekends, Nomonde weekends)
 * 3. Fill remaining nurse gaps at main branches
 * 4. Fill remaining receptionist gaps
 * 5. Ensure Ian gets minimum 4 shifts
 * 6. Saturday split-shift: Clinic nurse → morning clinic + afternoon main branch
 * 7. Fill clinic on non-Saturday days if capacity allows (overflow)
 * 8. Validate: each open branch has at least 1 nurse + 1 receptionist (or nurse who can work alone)
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
    if (staffMember.availableDays && !staffMember.availableDays.includes(day)) {
      return false;
    }
    if (availability?.[staffMember.id]?.includes(dateStr)) {
      return false;
    }
    return true;
  }

  // Helper: get the effective time range for an assignment
  function getAssignmentTime(assignment, branchId, day) {
    const branch = BRANCHES.find(b => b.id === branchId);
    const hrs = branch?.hours[day];
    return {
      start: assignment.shiftStart || hrs?.open || '09:00',
      end: assignment.shiftEnd || hrs?.close || '17:00',
    };
  }

  // Helper: check if staff has a time conflict on a given day with proposed times
  function hasTimeConflict(staffId, day, proposedStart, proposedEnd) {
    for (const branchId of Object.keys(schedule[day])) {
      const cell = schedule[day][branchId];
      for (const n of (cell.nurses || [])) {
        if (n.id === staffId) {
          const t = getAssignmentTime(n, branchId, day);
          if (timesOverlap(proposedStart, proposedEnd, t.start, t.end)) return true;
        }
      }
      for (const r of (cell.receptionists || [])) {
        if (r.id === staffId) {
          const t = getAssignmentTime(r, branchId, day);
          if (timesOverlap(proposedStart, proposedEnd, t.start, t.end)) return true;
        }
      }
    }
    return false;
  }

  // Helper: check if staff is already assigned on a day (full-day block for non-Saturday)
  function isAssignedOnDay(staffId, day) {
    for (const branchId of Object.keys(schedule[day])) {
      const cell = schedule[day][branchId];
      if (cell.nurses?.some(n => n.id === staffId)) return true;
      if (cell.receptionists?.some(r => r.id === staffId)) return true;
    }
    return false;
  }

  // Helper: count weekly assignments for a staff member (count each branch assignment as 1)
  function countWeeklyShifts(staffId) {
    let count = 0;
    DAYS_OF_WEEK.forEach(day => {
      BRANCHES.forEach(branch => {
        const cell = schedule[day]?.[branch.id];
        if (cell?.nurses?.some(n => n.id === staffId)) count++;
        if (cell?.receptionists?.some(r => r.id === staffId)) count++;
      });
    });
    return count;
  }

  // Helper: max nurses allowed for a branch on a given day
  function getMaxNurses(branchId, day) {
    return (branchId === 'parkview' && day === 'Saturday') ? 2 : 1;
  }

  // Helper: assign staff to a branch on a day with optional custom times
  function assign(staffMember, branchId, day, shiftStart, shiftEnd) {
    const cell = schedule[day][branchId];
    const assignment = { id: staffMember.id, name: staffMember.name, locked: false };
    if (shiftStart) assignment.shiftStart = shiftStart;
    if (shiftEnd) assignment.shiftEnd = shiftEnd;

    if (staffMember.role === 'nurse') {
      const maxNurses = getMaxNurses(branchId, day);
      if (cell.nurses.length >= maxNurses) return false;
      if (!cell.nurses.some(n => n.id === staffMember.id)) {
        cell.nurses.push(assignment);
        return true;
      }
      return false;
    } else {
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
    const branch = BRANCHES.find(b => b.id === branchId);
    if (branch?.isClinic) return false;
    const cell = schedule[day][branchId];
    if (cell.receptionists.length > 0) return false;
    const hasAloneNurse = cell.nurses.some(n => {
      const s = staff.find(st => st.id === n.id);
      return s?.canWorkAlone;
    });
    return !hasAloneNurse;
  }

  // Calculate date strings for each day of the week
  const dateLookup = {};
  if (weekStartDate) {
    const start = new Date(weekStartDate + 'T12:00:00');
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
  // NOTE: alsoMainBranch 'clinic' is SKIPPED here — clinic is lowest priority (filled in Step 6/7)
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

      // Try alsoMainBranch — but SKIP clinic (clinic is filled later as overflow)
      if (member.alsoMainBranch && member.alsoMainBranch !== 'clinic' && isBranchOpen(member.alsoMainBranch, day)) {
        const placed = assign(member, member.alsoMainBranch, day);
        if (placed) return;
      }

      // Try any other available branch that still needs a nurse (exclude clinic)
      for (const branchId of member.branches) {
        if (branchId === targetBranch || branchId === member.alsoMainBranch) continue;
        if (branchId === 'clinic') continue;
        if (!isBranchOpen(branchId, day)) continue;
        if (branchNeedsNurse(branchId, day)) {
          const placed = assign(member, branchId, day);
          if (placed) return;
        }
      }
    });
  });

  // === STEP 2: Place fixed-day, fixed-branch staff ===
  const jaco = staff.find(s => s.id === 'jaco');
  if (jaco) {
    ['Friday', 'Saturday', 'Sunday'].forEach(day => {
      const dateStr = dateLookup[day] || day;
      if (isAvailable(jaco, day, dateStr) && isBranchOpen('parkview', day)) {
        assign(jaco, 'parkview', day);
      }
    });
  }

  const trinity = staff.find(s => s.id === 'trinity');
  if (trinity) {
    ['Saturday', 'Sunday'].forEach(day => {
      const dateStr = dateLookup[day] || day;
      if (isAvailable(trinity, day, dateStr) && isBranchOpen('parkview', day)) {
        assign(trinity, 'parkview', day);
      }
    });
  }

  const nomonde = staff.find(s => s.id === 'nomonde');
  if (nomonde) {
    const satDate = dateLookup['Saturday'] || 'Saturday';
    const sunDate = dateLookup['Sunday'] || 'Sunday';
    const satAvail = isAvailable(nomonde, 'Saturday', satDate);
    const sunAvail = isAvailable(nomonde, 'Sunday', sunDate);

    if (satAvail && sunAvail) {
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
  const nursesNonPriority = staff.filter(s => s.role === 'nurse' && !s.priority);

  DAYS_OF_WEEK.forEach(day => {
    mainBranches.forEach(branch => {
      if (!branchNeedsNurse(branch.id, day)) return;

      const candidates = nursesNonPriority
        .filter(n => {
          const dateStr = dateLookup[day] || day;
          if (!isAvailable(n, day, dateStr)) return false;
          if (isAssignedOnDay(n.id, day)) return false;
          if (n.branches.includes(branch.id)) return true;
          if (n.lastResortBranches?.includes(branch.id)) return true;
          return false;
        })
        .sort((a, b) => {
          const aMain = a.mainBranch === branch.id ? 0 : 1;
          const bMain = b.mainBranch === branch.id ? 0 : 1;
          if (aMain !== bMain) return aMain - bMain;
          const aRegular = a.branches.includes(branch.id) ? 0 : 1;
          const bRegular = b.branches.includes(branch.id) ? 0 : 1;
          if (aRegular !== bRegular) return aRegular - bRegular;
          return countWeeklyShifts(a.id) - countWeeklyShifts(b.id);
        });

      if (candidates.length > 0) {
        assign(candidates[0], branch.id, day);
      }
    });
  });

  // === STEP 4: Fill receptionist slots at ALL main branches ===
  const receptionists = staff.filter(s => s.role === 'receptionist' && s.id !== 'nomonde');

  DAYS_OF_WEEK.forEach(day => {
    mainBranches.forEach(branch => {
      if (!isBranchOpen(branch.id, day)) return;
      const branchData = BRANCHES.find(b => b.id === branch.id);
      if (branchData?.isClinic) return;
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
          const aMain = a.mainBranch === branch.id ? 0 : 1;
          const bMain = b.mainBranch === branch.id ? 0 : 1;
          if (aMain !== bMain) return aMain - bMain;
          const aPerm = a.employmentType === 'permanent' ? 0 : 1;
          const bPerm = b.employmentType === 'permanent' ? 0 : 1;
          if (aPerm !== bPerm) return aPerm - bPerm;
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
        for (const branch of mainBranches) {
          if (!isBranchOpen(branch.id, day)) continue;
          if (!ian.branches.includes(branch.id)) continue;
          if (branchNeedsReceptionist(branch.id, day)) {
            assign(ian, branch.id, day);
            ianShifts++;
            break;
          }
        }
      }
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

  // === STEP 6: Saturday split-shift — Clinic nurse works morning clinic + afternoon main branch ===
  if (clinicBranch && isBranchOpen('clinic', 'Saturday')) {
    const clinicCell = schedule['Saturday']['clinic'];
    const clinicHrs = clinicBranch.hours['Saturday'];

    // Only proceed if clinic doesn't already have a nurse
    if (clinicCell.nurses.length === 0) {
      const parkviewCell = schedule['Saturday']['parkview'];
      const parkviewHrs = BRANCHES.find(b => b.id === 'parkview')?.hours['Saturday'];

      // Strategy: find a nurse assigned to Parkview Saturday who can also work at clinic
      // Prefer those with alsoMainBranch: 'clinic' (Dinah/Ntombi)
      let splitNurse = null;
      let splitNurseIdx = -1;

      if (parkviewCell) {
        const candidates = parkviewCell.nurses
          .map((n, idx) => ({ ...n, idx, staffData: staff.find(s => s.id === n.id) }))
          .filter(n => n.staffData?.branches.includes('clinic'))
          .sort((a, b) => {
            const aClinic = a.staffData?.alsoMainBranch === 'clinic' ? 0 : 1;
            const bClinic = b.staffData?.alsoMainBranch === 'clinic' ? 0 : 1;
            return aClinic - bClinic;
          });

        if (candidates.length > 0) {
          splitNurse = candidates[0];
          splitNurseIdx = candidates[0].idx;
        }
      }

      if (splitNurse) {
        // Remove the nurse from Parkview (full-day assignment)
        parkviewCell.nurses.splice(splitNurseIdx, 1);

        // Assign to Clinic morning
        clinicCell.nurses.push({
          id: splitNurse.id, name: splitNurse.name, locked: false,
          shiftStart: clinicHrs.open, shiftEnd: clinicHrs.close, // 08:00 - 13:00
        });

        // Assign back to Parkview afternoon
        parkviewCell.nurses.push({
          id: splitNurse.id, name: splitNurse.name, locked: false,
          shiftStart: SAT_SPLIT, shiftEnd: parkviewHrs?.close || '17:00', // 13:00 - 17:00
        });

        // Set the remaining Parkview nurse(s) to morning
        parkviewCell.nurses.forEach(n => {
          if (n.id !== splitNurse.id && !n.shiftStart) {
            n.shiftStart = parkviewHrs?.open || '09:00';
            n.shiftEnd = SAT_SPLIT; // 09:00 - 13:00
          }
        });
      } else {
        // No Parkview nurse can split — try unassigned nurses who can work at clinic
        const dateStr = dateLookup['Saturday'] || 'Saturday';
        const unassignedClinic = staff
          .filter(n => {
            if (n.role !== 'nurse') return false;
            if (!isAvailable(n, 'Saturday', dateStr)) return false;
            if (isAssignedOnDay(n.id, 'Saturday')) return false;
            if (!n.branches.includes('clinic')) return false;
            return true;
          })
          .sort((a, b) => {
            const aClinic = a.alsoMainBranch === 'clinic' ? 0 : 1;
            const bClinic = b.alsoMainBranch === 'clinic' ? 0 : 1;
            return aClinic - bClinic;
          });

        if (unassignedClinic.length > 0) {
          const nurse = unassignedClinic[0];
          // Assign to clinic morning only
          clinicCell.nurses.push({
            id: nurse.id, name: nurse.name, locked: false,
            shiftStart: clinicHrs.open, shiftEnd: clinicHrs.close,
          });

          // Also assign to Parkview afternoon if it needs coverage and nurse can work there
          if (parkviewCell && nurse.branches.includes('parkview')) {
            const maxNurses = getMaxNurses('parkview', 'Saturday');
            if (parkviewCell.nurses.length < maxNurses) {
              parkviewCell.nurses.push({
                id: nurse.id, name: nurse.name, locked: false,
                shiftStart: SAT_SPLIT, shiftEnd: parkviewHrs?.close || '17:00',
              });
              // Set existing Parkview nurse(s) to morning
              parkviewCell.nurses.forEach(n => {
                if (n.id !== nurse.id && !n.shiftStart) {
                  n.shiftStart = parkviewHrs?.open || '09:00';
                  n.shiftEnd = SAT_SPLIT;
                }
              });
            }
          }
        }
      }
    }
  }

  // === STEP 7: Fill clinic on NON-Saturday days if capacity allows ===
  if (clinicBranch) {
    DAYS_OF_WEEK.forEach(day => {
      if (day === 'Saturday') return; // Already handled in Step 6
      if (!isBranchOpen('clinic', day)) return;

      const allMainCovered = mainBranches.every(b => {
        if (!isBranchOpen(b.id, day)) return true;
        return !branchNeedsNurse(b.id, day);
      });
      if (!allMainCovered) return;
      if (!branchNeedsNurse('clinic', day)) return;

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

// Export helpers for use in UI and validation
export { timeToMinutes, timesOverlap, hoursBetween, SAT_SPLIT };

/**
 * Validate a schedule and return warnings/errors
 */
export function validateSchedule(schedule, staff) {
  const warnings = [];
  const errors = [];

  DAYS_OF_WEEK.forEach(day => {
    BRANCHES.forEach(branch => {
      if (!isBranchOpen(branch.id, day)) return;
      if (branch.isClinic) return;

      const cell = schedule[day]?.[branch.id];
      const nurses = cell?.nurses || [];
      const receptionists = cell?.receptionists || [];
      const maxNurses = (branch.id === 'parkview' && day === 'Saturday') ? 2 : 1;
      if (!cell || nurses.length === 0) {
        errors.push(`${branch.name} has no nurse on ${day}`);
      }

      if (cell && nurses.length > maxNurses) {
        warnings.push(`${branch.name} has ${nurses.length} nurses on ${day} (max ${maxNurses})`);
      }

      if (cell && receptionists.length === 0) {
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

    // Check for double-booking (time-aware on Saturday)
    const staffAssignments = {}; // staffId -> [{ branch, start, end }]
    BRANCHES.forEach(branch => {
      const cell = schedule[day]?.[branch.id];
      if (!cell) return;
      const hrs = branch.hours[day];
      [...(cell.nurses || []), ...(cell.receptionists || [])].forEach(person => {
        const start = person.shiftStart || hrs?.open || '09:00';
        const end = person.shiftEnd || hrs?.close || '17:00';
        if (!staffAssignments[person.id]) staffAssignments[person.id] = [];
        staffAssignments[person.id].push({ branch: branch.name, start, end });
      });
    });

    // Check each staff for overlapping assignments
    for (const [staffId, assignments] of Object.entries(staffAssignments)) {
      if (assignments.length <= 1) continue;
      for (let i = 0; i < assignments.length; i++) {
        for (let j = i + 1; j < assignments.length; j++) {
          const a = assignments[i], b = assignments[j];
          if (timesOverlap(a.start, a.end, b.start, b.end)) {
            const name = staff.find(s => s.id === staffId)?.name || staffId;
            errors.push(`${name} has overlapping shifts on ${day}: ${a.branch} (${a.start}-${a.end}) and ${b.branch} (${b.start}-${b.end})`);
          }
        }
      }
    }
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
      const defaultHrs = getShiftHours(branch.id, day);
      const branchHours = branch.hours[day];

      [...(cell.nurses || []), ...(cell.receptionists || [])].forEach(person => {
        if (hours[person.id]) {
          // Use custom shift times if present, otherwise branch default
          let shiftHrs = defaultHrs;
          if (person.shiftStart && person.shiftEnd) {
            shiftHrs = hoursBetween(person.shiftStart, person.shiftEnd);
          }
          hours[person.id].total += shiftHrs;
          hours[person.id].shifts += 1;
          hours[person.id].details.push({ day, branch: branch.name, hours: shiftHrs });
        }
      });
    });
  });

  return hours;
}
