import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BRANCHES, DAYS_OF_WEEK } from '../data/initialData';

const STAFF_COLOR_RGB = {
  red: [239, 68, 68], orange: [249, 115, 22], amber: [245, 158, 11], green: [34, 197, 94],
  teal: [20, 184, 166], blue: [59, 130, 246], purple: [139, 92, 246], pink: [236, 72, 153],
};

const DAY_ABBREV = { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' };

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
  const dayOffsets = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };
  const d = new Date(monday);
  d.setDate(d.getDate() + dayOffsets[dayName]);
  return d.getDate();
}

function getStaffColor(staffId, staffList) {
  const member = staffList.find(s => s.id === staffId);
  return member?.color ? STAFF_COLOR_RGB[member.color] : [0, 0, 0];
}

export function exportScheduleToPdf(schedule, weekStartDate, staff) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Title
  const weekStart = new Date(weekStartDate + 'T00:00:00');
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  const title = `IV Schedule: ${weekStart.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('en-ZA', opts)}`;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 15, { align: 'center' });

  let startY = 22;

  // Per-branch schedule tables
  BRANCHES.forEach((branch) => {
    const isClinic = !!branch.isClinic;
    const columns = isClinic
      ? ['Day', 'Date', 'RN', 'Times']
      : ['Day', 'Date', 'RN', 'Times', 'Receptionist', 'Times'];

    const rows = [];

    DAYS_OF_WEEK.forEach(day => {
      const dateNum = getDayDate(weekStartDate, day);
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
        ? (hasCustomNurseTimes ? nurses.map(n => getAssignmentTimeRange(n, branch, day)).join('\n') : timeRange)
        : '';

      if (isClinic) {
        rows.push([DAY_ABBREV[day], String(dateNum), nurseStr, nurseTimesStr]);
      } else {
        const noRec = recs.length === 0 && hrs;
        const recStr = noRec ? 'None' : recs.map(r => r.name).join(hasCustomRecTimes ? '\n' : ', ');
        const recTimesStr = hrs
          ? (hasCustomRecTimes ? recs.map(r => getAssignmentTimeRange(r, branch, day)).join('\n') : timeRange)
          : '';
        rows.push([DAY_ABBREV[day], String(dateNum), nurseStr, nurseTimesStr, recStr, recTimesStr]);
      }
    });

    // Check if we need a new page (if not enough space)
    if (startY > 160) {
      doc.addPage();
      startY = 15;
    }

    // Branch name header
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(branch.name, 14, startY);
    startY += 2;

    autoTable(doc, {
      startY,
      head: [columns],
      body: rows,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 2,
        halign: 'center',
        valign: 'middle',
        lineWidth: 0.3,
        lineColor: [0, 0, 0],
      },
      headStyles: {
        fillColor: [255, 255, 0],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 9,
      },
      columnStyles: isClinic
        ? { 0: { fontStyle: 'bold', cellWidth: 15 }, 1: { fontStyle: 'bold', cellWidth: 15 }, 2: { cellWidth: 50 }, 3: { cellWidth: 25 } }
        : { 0: { fontStyle: 'bold', cellWidth: 15 }, 1: { fontStyle: 'bold', cellWidth: 15 }, 2: { cellWidth: 40 }, 3: { cellWidth: 22 }, 4: { cellWidth: 40 }, 5: { cellWidth: 22 } },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const rowData = rows[data.row.index];
        if (!rowData) return;

        // Color nurse names (col 2)
        if (data.column.index === 2) {
          if (rowData[2] === 'None') {
            data.cell.styles.textColor = [239, 68, 68];
            data.cell.styles.fontStyle = 'bold';
          } else {
            const dayName = Object.keys(DAY_ABBREV).find(k => DAY_ABBREV[k] === rowData[0]);
            const sc = schedule[dayName]?.[branch.id];
            const nurses = sc?.nurses || [];
            if (nurses.length > 0) {
              data.cell.styles.textColor = getStaffColor(nurses[0].id, staff);
            }
          }
        }

        // Color receptionist names (col 4, non-clinic)
        if (!isClinic && data.column.index === 4) {
          if (rowData[4] === 'None') {
            data.cell.styles.textColor = [239, 68, 68];
            data.cell.styles.fontStyle = 'bold';
          } else {
            const dayName = Object.keys(DAY_ABBREV).find(k => DAY_ABBREV[k] === rowData[0]);
            const sc = schedule[dayName]?.[branch.id];
            const recs = sc?.receptionists || [];
            if (recs.length > 0) {
              data.cell.styles.textColor = getStaffColor(recs[0].id, staff);
            }
          }
        }
      },
    });

    startY = doc.lastAutoTable.finalY + 8;
  });

  // Staff Hours page
  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Staff Hours This Week', pageWidth / 2, 15, { align: 'center' });

  const hoursHead = [['Name', 'Role', 'Type', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Shifts', 'Hours']];
  const hoursBody = [];

  staff.forEach(member => {
    const row = [member.name, member.role, member.employmentType];
    let totalShifts = 0;
    let totalHours = 0;

    DAYS_OF_WEEK.forEach(day => {
      const branches = [];
      BRANCHES.forEach(b => {
        const cell = schedule[day]?.[b.id];
        const match = cell?.nurses?.find(n => n.id === member.id) || cell?.receptionists?.find(r => r.id === member.id);
        if (match) {
          branches.push(b.name.split(' ')[0]); // Short name
          totalShifts++;
          totalHours += getAssignmentHours(match, b, day);
        }
      });
      row.push(branches.length > 0 ? branches.join(', ') : '-');
    });

    row.push(String(totalShifts));
    row.push(`${totalHours}h`);

    if (totalShifts > 0) hoursBody.push(row);
  });

  autoTable(doc, {
    startY: 20,
    head: hoursHead,
    body: hoursBody,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      halign: 'center',
      valign: 'middle',
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [255, 255, 0],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 30 },
      1: { cellWidth: 22 },
      2: { cellWidth: 22 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const rowData = hoursBody[data.row.index];
      if (!rowData) return;

      // Color staff name by their color tag
      if (data.column.index === 0) {
        const member = staff.find(s => s.name === rowData[0]);
        if (member?.color) {
          data.cell.styles.textColor = STAFF_COLOR_RGB[member.color] || [0, 0, 0];
        }
      }
    },
  });

  // Save
  doc.save(`IV_Schedule_${weekStartDate}.pdf`);
}
