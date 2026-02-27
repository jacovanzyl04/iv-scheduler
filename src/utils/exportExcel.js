import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { BRANCHES, DAYS_OF_WEEK } from '../data/initialData';

// Order days starting from Sunday to match paper format
const EXPORT_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBREV = { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' };

function formatTime(timeStr) {
  if (!timeStr) return '';
  // '09:00' → '9', '18:00' → '18', '13:00' → '13'
  const hour = parseInt(timeStr.split(':')[0], 10);
  return String(hour);
}

function getTimeRange(branch, day) {
  const hrs = branch.hours[day];
  if (!hrs) return '';
  return `${formatTime(hrs.open)} - ${formatTime(hrs.close)}`;
}

function getDayDate(weekStartDate, dayName) {
  // weekStartDate is a Monday date string like '2026-03-02'
  const monday = new Date(weekStartDate + 'T00:00:00');
  const dayOffsets = {
    Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3,
    Friday: 4, Saturday: 5, Sunday: -1,
  };
  const d = new Date(monday);
  d.setDate(d.getDate() + dayOffsets[dayName]);
  return d.getDate();
}

export function exportScheduleToExcel(schedule, weekStartDate, staff) {
  const wb = XLSX.utils.book_new();

  // === Schedule Sheet (all branches on one sheet) ===
  const data = [];

  BRANCHES.forEach((branch, branchIndex) => {
    // Branch header
    data.push([branch.name]);
    // Column headers
    data.push(['Day', 'Date', 'RN', 'Times', 'Receptionist', 'Times']);

    // Data rows (Sun → Sat)
    EXPORT_DAYS.forEach(day => {
      const dateNum = getDayDate(weekStartDate, day);
      const hrs = branch.hours[day];
      const cell = schedule[day]?.[branch.id];

      if (!hrs) {
        // Branch closed on this day
        data.push([DAY_ABBREV[day], dateNum, '', '', '', '']);
      } else {
        const nurses = cell?.nurses?.map(n => n.name).join(', ') || '';
        const recs = cell?.receptionists?.map(r => r.name).join(', ') || '';
        const timeRange = getTimeRange(branch, day);
        const nurseTime = nurses ? timeRange : '';
        const recTime = recs ? timeRange : '';

        data.push([DAY_ABBREV[day], dateNum, nurses, nurseTime, recs, recTime]);
      }
    });

    // Spacing between branches
    if (branchIndex < BRANCHES.length - 1) {
      data.push([]);
      data.push([]);
    }
  });

  const ws1 = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws1['!cols'] = [
    { wch: 6 },   // Day
    { wch: 6 },   // Date
    { wch: 18 },  // RN
    { wch: 10 },  // Times
    { wch: 18 },  // Receptionist
    { wch: 10 },  // Times
  ];

  // Bold the branch name rows and header rows
  // (xlsx-js doesn't support styling in the free version, but the structure is correct)

  XLSX.utils.book_append_sheet(wb, ws1, 'Weekly Schedule');

  // === Staff Hours Sheet (unchanged) ===
  const hoursData = [['Staff Member', 'Role', 'Type', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Total Shifts', 'Total Hours']];

  staff.forEach(member => {
    const row = [member.name, member.role, member.employmentType];
    let totalShifts = 0;
    let totalHours = 0;

    DAYS_OF_WEEK.forEach(day => {
      let assignment = '-';
      BRANCHES.forEach(b => {
        const cell = schedule[day]?.[b.id];
        if (cell?.nurses?.some(n => n.id === member.id) || cell?.receptionists?.some(r => r.id === member.id)) {
          assignment = b.name;
          totalShifts++;
          totalHours += b.hours[day]?.shiftHours || 0;
        }
      });
      row.push(assignment);
    });

    row.push(totalShifts);
    row.push(totalHours);
    hoursData.push(row);
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
