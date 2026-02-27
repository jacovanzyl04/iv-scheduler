import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { BRANCHES, DAYS_OF_WEEK } from '../data/initialData';

// Staff color hex values (no '#' prefix, for xlsx-js-style)
const STAFF_COLOR_HEX = {
  red: 'EF4444', orange: 'F97316', amber: 'F59E0B', green: '22C55E',
  teal: '14B8A6', blue: '3B82F6', purple: '8B5CF6', pink: 'EC4899',
};

const EXPORT_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBREV = { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' };

// Medium border style for all cells
const BORDER = {
  top: { style: 'medium', color: { rgb: '000000' } },
  bottom: { style: 'medium', color: { rgb: '000000' } },
  left: { style: 'medium', color: { rgb: '000000' } },
  right: { style: 'medium', color: { rgb: '000000' } },
};

// Center alignment for all cells
const CENTER = { horizontal: 'center', vertical: 'center' };
const CENTER_WRAP = { horizontal: 'center', vertical: 'center', wrapText: true };

function formatTime(timeStr) {
  if (!timeStr) return '';
  return String(parseInt(timeStr.split(':')[0], 10));
}

function getTimeRange(branch, day) {
  const hrs = branch.hours[day];
  if (!hrs) return '';
  return `${formatTime(hrs.open)} - ${formatTime(hrs.close)}`;
}

// Get time range for an individual assignment (uses custom times if present, else branch default)
function getAssignmentTimeRange(assignment, branch, day) {
  if (assignment.shiftStart && assignment.shiftEnd) {
    return `${formatTime(assignment.shiftStart)} - ${formatTime(assignment.shiftEnd)}`;
  }
  return getTimeRange(branch, day);
}

// Calculate hours from an assignment (custom or branch default)
function getAssignmentHours(assignment, branch, day) {
  if (assignment.shiftStart && assignment.shiftEnd) {
    const start = parseInt(assignment.shiftStart.split(':')[0], 10);
    const end = parseInt(assignment.shiftEnd.split(':')[0], 10);
    return end - start;
  }
  return branch.hours[day]?.shiftHours || 0;
}

function getDayDate(weekStartDate, dayName) {
  const monday = new Date(weekStartDate + 'T00:00:00');
  const dayOffsets = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: -1 };
  const d = new Date(monday);
  d.setDate(d.getDate() + dayOffsets[dayName]);
  return d.getDate();
}

function getStaffHex(staffId, staffList) {
  const member = staffList.find(s => s.id === staffId);
  return member?.color ? STAFF_COLOR_HEX[member.color] : '000000';
}

function makeCell(value, style) {
  return { v: value, t: typeof value === 'number' ? 'n' : 's', s: style };
}

export function exportScheduleToExcel(schedule, weekStartDate, staff) {
  const wb = XLSX.utils.book_new();

  // === Schedule Sheet — built cell-by-cell for full styling ===
  const ws = {};
  const merges = [];
  let row = 0;

  BRANCHES.forEach((branch, bi) => {
    // --- Branch header (merged across all 6 columns) ---
    for (let c = 0; c < 6; c++) {
      ws[XLSX.utils.encode_cell({ r: row, c })] = makeCell(c === 0 ? branch.name : '', {
        font: { bold: true, sz: 14, color: { rgb: '000000' } },
        alignment: CENTER,
        border: BORDER,
      });
    }
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: 5 } });
    row++;

    // --- Column headers (yellow background, bold) ---
    ['Day', 'Date', 'RN', 'Times', 'Receptionist', 'Times'].forEach((h, c) => {
      ws[XLSX.utils.encode_cell({ r: row, c })] = makeCell(h, {
        font: { bold: true, sz: 11, color: { rgb: '000000' } },
        alignment: CENTER,
        border: BORDER,
        fill: { fgColor: { rgb: 'FFFF00' } },
      });
    });
    row++;

    // --- Data rows (Sun → Sat) ---
    EXPORT_DAYS.forEach(day => {
      const dateNum = getDayDate(weekStartDate, day);
      const hrs = branch.hours[day];
      const sc = schedule[day]?.[branch.id];
      const nurses = sc?.nurses || [];
      const recs = sc?.receptionists || [];

      // Build per-assignment names and times (supports split shifts)
      const hasCustomNurseTimes = nurses.some(n => n.shiftStart && n.shiftEnd);
      const hasCustomRecTimes = recs.some(r => r.shiftStart && r.shiftEnd);

      const nurseStr = nurses.map(n => n.name).join(hasCustomNurseTimes ? '\n' : ', ');
      const nurseTimesStr = nurses.length > 0
        ? (hasCustomNurseTimes
          ? nurses.map(n => getAssignmentTimeRange(n, branch, day)).join('\n')
          : (hrs ? getTimeRange(branch, day) : ''))
        : '';

      const recStr = recs.map(r => r.name).join(hasCustomRecTimes ? '\n' : ', ');
      const recTimesStr = recs.length > 0
        ? (hasCustomRecTimes
          ? recs.map(r => getAssignmentTimeRange(r, branch, day)).join('\n')
          : (hrs ? getTimeRange(branch, day) : ''))
        : '';

      const nurseAlign = hasCustomNurseTimes ? CENTER_WRAP : CENTER;
      const recAlign = hasCustomRecTimes ? CENTER_WRAP : CENTER;

      // Day column — bold, size 12
      ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = makeCell(DAY_ABBREV[day], {
        font: { bold: true, sz: 12, color: { rgb: '000000' } },
        alignment: CENTER,
        border: BORDER,
      });

      // Date column — bold, size 12
      ws[XLSX.utils.encode_cell({ r: row, c: 1 })] = makeCell(dateNum, {
        font: { bold: true, sz: 12, color: { rgb: '000000' } },
        alignment: CENTER,
        border: BORDER,
      });

      // RN column — size 11, staff color (first nurse's color; multiline if split shifts)
      ws[XLSX.utils.encode_cell({ r: row, c: 2 })] = makeCell(nurseStr, {
        font: { sz: 11, color: { rgb: nurses.length > 0 ? getStaffHex(nurses[0].id, staff) : '000000' } },
        alignment: nurseAlign,
        border: BORDER,
      });

      // Nurse Times column — size 9
      ws[XLSX.utils.encode_cell({ r: row, c: 3 })] = makeCell(nurseTimesStr, {
        font: { sz: 9, color: { rgb: '000000' } },
        alignment: nurseAlign,
        border: BORDER,
      });

      // Receptionist column — size 11, staff color
      ws[XLSX.utils.encode_cell({ r: row, c: 4 })] = makeCell(recStr, {
        font: { sz: 11, color: { rgb: recs.length > 0 ? getStaffHex(recs[0].id, staff) : '000000' } },
        alignment: recAlign,
        border: BORDER,
      });

      // Receptionist Times column — size 9
      ws[XLSX.utils.encode_cell({ r: row, c: 5 })] = makeCell(recTimesStr, {
        font: { sz: 9, color: { rgb: '000000' } },
        alignment: recAlign,
        border: BORDER,
      });

      row++;
    });

    // Spacing between branches
    if (bi < BRANCHES.length - 1) row += 2;
  });

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row - 1, c: 5 } });
  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 8 },   // Day
    { wch: 8 },   // Date
    { wch: 20 },  // RN
    { wch: 12 },  // Times
    { wch: 20 },  // Receptionist
    { wch: 12 },  // Times
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Weekly Schedule');

  // === Staff Hours Sheet ===
  const hoursData = [['Staff Member', 'Role', 'Type', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Total Shifts', 'Total Hours']];

  staff.forEach(member => {
    const dataRow = [member.name, member.role, member.employmentType];
    let totalShifts = 0;
    let totalHours = 0;

    DAYS_OF_WEEK.forEach(day => {
      const branches = [];
      BRANCHES.forEach(b => {
        const cell = schedule[day]?.[b.id];
        const nurseMatch = cell?.nurses?.find(nurse => nurse.id === member.id);
        const recMatch = cell?.receptionists?.find(rec => rec.id === member.id);
        const match = nurseMatch || recMatch;
        if (match) {
          branches.push(b.name);
          totalShifts++;
          totalHours += getAssignmentHours(match, b, day);
        }
      });
      dataRow.push(branches.length > 0 ? branches.join(' + ') : '-');
    });

    dataRow.push(totalShifts);
    dataRow.push(totalHours);
    hoursData.push(dataRow);
  });

  const ws2 = XLSX.utils.aoa_to_sheet(hoursData);
  ws2['!cols'] = [
    { wch: 16 }, { wch: 12 }, { wch: 12 },
    ...DAYS_OF_WEEK.map(() => ({ wch: 16 })),
    { wch: 12 }, { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, ws2, 'Staff Hours');

  // Generate file
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const dateStr = weekStartDate || new Date().toISOString().split('T')[0];
  saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `IV_Schedule_${dateStr}.xlsx`);
}
