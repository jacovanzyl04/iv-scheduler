import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { BRANCHES, DAYS_OF_WEEK } from '../data/initialData';

export function exportScheduleToExcel(schedule, weekStartDate, staff) {
  const wb = XLSX.utils.book_new();

  // === Schedule Sheet ===
  const scheduleData = [];

  // Header row
  scheduleData.push(['', ...DAYS_OF_WEEK]);

  BRANCHES.forEach(branch => {
    // Nurse row
    const nurseRow = [`${branch.name} - Nurse`];
    DAYS_OF_WEEK.forEach(day => {
      const cell = schedule[day]?.[branch.id];
      const nurses = cell?.nurses?.map(n => n.name).join(', ') || '-';
      nurseRow.push(nurses);
    });
    scheduleData.push(nurseRow);

    // Receptionist row
    const recRow = [`${branch.name} - Receptionist`];
    DAYS_OF_WEEK.forEach(day => {
      const cell = schedule[day]?.[branch.id];
      const recs = cell?.receptionists?.map(r => r.name).join(', ') || '-';
      recRow.push(recs);
    });
    scheduleData.push(recRow);

    // Empty row between branches
    scheduleData.push([]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(scheduleData);

  // Set column widths
  ws1['!cols'] = [
    { wch: 28 },
    ...DAYS_OF_WEEK.map(() => ({ wch: 18 }))
  ];

  XLSX.utils.book_append_sheet(wb, ws1, 'Weekly Schedule');

  // === Staff Hours Sheet ===
  const hoursData = [['Staff Member', 'Role', 'Type', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Total Shifts', 'Total Hours']];

  staff.forEach(member => {
    const row = [member.name, member.role, member.employmentType];
    let totalShifts = 0;
    let totalHours = 0;

    DAYS_OF_WEEK.forEach(day => {
      let assignment = '-';
      BRANCHES.forEach(branch => {
        const cell = schedule[day]?.[branch.id];
        if (cell?.nurses?.some(n => n.id === member.id) || cell?.receptionists?.some(r => r.id === member.id)) {
          assignment = branch.name;
          totalShifts++;
          const branchData = BRANCHES.find(b => b.id === branch.id);
          totalHours += branchData?.hours[day]?.shiftHours || 0;
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
