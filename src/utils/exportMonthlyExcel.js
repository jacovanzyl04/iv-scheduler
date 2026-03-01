import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { BRANCHES, DAYS_OF_WEEK } from '../data/initialData';

const STAFF_COLOR_HEX = {
  red: 'EF4444', orange: 'F97316', amber: 'F59E0B', green: '22C55E',
  teal: '14B8A6', blue: '3B82F6', purple: '8B5CF6', pink: 'EC4899',
};

const EXPORT_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ABBREV = { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' };
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const BORDER = {
  top: { style: 'medium', color: { rgb: '000000' } },
  bottom: { style: 'medium', color: { rgb: '000000' } },
  left: { style: 'medium', color: { rgb: '000000' } },
  right: { style: 'medium', color: { rgb: '000000' } },
};

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

function getAssignmentTimeRange(assignment, branch, day) {
  if (assignment.shiftStart && assignment.shiftEnd) {
    return `${formatTime(assignment.shiftStart)} - ${formatTime(assignment.shiftEnd)}`;
  }
  return getTimeRange(branch, day);
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateKey(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDayDate(weekStartDate, dayName) {
  const monday = new Date(weekStartDate + 'T00:00:00');
  const dayOffsets = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };
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

/**
 * Get all unique week keys (Monday dates) that overlap with a given month.
 */
function getWeekKeysForMonth(year, month) {
  const keys = [];
  const seen = new Set();

  // Start from the 1st of the month, go day by day
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const monday = getMonday(date);
    const key = formatDateKey(monday);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Export all weeks in a month to Excel, one sheet per week.
 */
export function exportMonthToExcel(schedules, staff, year, month) {
  const wb = XLSX.utils.book_new();
  const weekKeys = getWeekKeysForMonth(year, month);

  weekKeys.forEach((weekKey, weekIndex) => {
    const schedule = schedules[weekKey] || {};
    const ws = {};
    const merges = [];
    let row = 0;

    BRANCHES.forEach((branch, bi) => {
      const isClinic = !!branch.isClinic;
      const colCount = isClinic ? 4 : 6;

      // Branch header
      for (let c = 0; c < colCount; c++) {
        ws[XLSX.utils.encode_cell({ r: row, c })] = makeCell(c === 0 ? branch.name : '', {
          font: { bold: true, sz: 14, color: { rgb: '000000' } },
          alignment: CENTER,
          border: BORDER,
        });
      }
      merges.push({ s: { r: row, c: 0 }, e: { r: row, c: colCount - 1 } });
      row++;

      // Column headers
      const headers = isClinic ? ['Day', 'Date', 'RN', 'Times'] : ['Day', 'Date', 'RN', 'Times', 'Receptionist', 'Times'];
      headers.forEach((h, c) => {
        ws[XLSX.utils.encode_cell({ r: row, c })] = makeCell(h, {
          font: { bold: true, sz: 11, color: { rgb: '000000' } },
          alignment: CENTER,
          border: BORDER,
          fill: { fgColor: { rgb: 'FFFF00' } },
        });
      });
      row++;

      // Data rows
      EXPORT_DAYS.forEach(day => {
        const dateNum = getDayDate(weekKey, day);
        const hrs = branch.hours[day];
        const sc = schedule[day]?.[branch.id];
        const nurses = sc?.nurses || [];
        const recs = sc?.receptionists || [];
        const timeRange = hrs ? getTimeRange(branch, day) : '';

        const hasCustomNurseTimes = nurses.some(n => n.shiftStart && n.shiftEnd);
        const hasCustomRecTimes = recs.some(r => r.shiftStart && r.shiftEnd);

        const noNurse = nurses.length === 0 && hrs;
        const nurseStr = noNurse ? 'None' : nurses.map(n => n.name).join(hasCustomNurseTimes ? '\n' : ', ');
        const nurseTimesStr = hrs
          ? (hasCustomNurseTimes
            ? nurses.map(n => getAssignmentTimeRange(n, branch, day)).join('\n')
            : timeRange)
          : '';
        const nurseColor = noNurse ? 'FF0000' : (nurses.length > 0 ? getStaffHex(nurses[0].id, staff) : '000000');
        const nurseAlign = hasCustomNurseTimes ? CENTER_WRAP : CENTER;

        const noRec = recs.length === 0 && hrs;
        const recStr = noRec ? 'None' : recs.map(r => r.name).join(hasCustomRecTimes ? '\n' : ', ');
        const recTimesStr = hrs
          ? (hasCustomRecTimes
            ? recs.map(r => getAssignmentTimeRange(r, branch, day)).join('\n')
            : timeRange)
          : '';
        const recColor = noRec ? 'FF0000' : (recs.length > 0 ? getStaffHex(recs[0].id, staff) : '000000');
        const recAlign = hasCustomRecTimes ? CENTER_WRAP : CENTER;

        ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = makeCell(DAY_ABBREV[day], {
          font: { bold: true, sz: 12, color: { rgb: '000000' } },
          alignment: CENTER,
          border: BORDER,
        });

        ws[XLSX.utils.encode_cell({ r: row, c: 1 })] = makeCell(dateNum, {
          font: { bold: true, sz: 12, color: { rgb: '000000' } },
          alignment: CENTER,
          border: BORDER,
        });

        ws[XLSX.utils.encode_cell({ r: row, c: 2 })] = makeCell(nurseStr, {
          font: { sz: 11, color: { rgb: nurseColor } },
          alignment: nurseAlign,
          border: BORDER,
        });

        ws[XLSX.utils.encode_cell({ r: row, c: 3 })] = makeCell(nurseTimesStr, {
          font: { sz: 9, color: { rgb: '000000' } },
          alignment: nurseAlign,
          border: BORDER,
        });

        if (!isClinic) {
          ws[XLSX.utils.encode_cell({ r: row, c: 4 })] = makeCell(recStr, {
            font: { sz: 11, color: { rgb: recColor } },
            alignment: recAlign,
            border: BORDER,
          });

          ws[XLSX.utils.encode_cell({ r: row, c: 5 })] = makeCell(recTimesStr, {
            font: { sz: 9, color: { rgb: '000000' } },
            alignment: recAlign,
            border: BORDER,
          });
        }

        row++;
      });

      if (bi < BRANCHES.length - 1) row += 2;
    });

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row - 1, c: 5 } });
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 8 }, { wch: 8 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 12 },
    ];

    // Sheet name: "Week 1 (Mar 3)" format
    const weekStart = new Date(weekKey + 'T00:00:00');
    const sheetName = `Week ${weekIndex + 1} (${weekStart.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })})`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const monthName = MONTH_NAMES[month];
  saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `IV_Schedule_${monthName}_${year}.xlsx`);
}
