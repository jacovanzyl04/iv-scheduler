import { useState, useMemo } from'react';
import { BRANCHES, DAYS_OF_WEEK, isBranchOpen } from'../data/initialData';
import { ChevronLeft, ChevronRight, Download } from'lucide-react';
import { exportMonthToExcel } from'../utils/exportMonthlyExcel';

const BRANCH_ABBREV = {
 parkview:'PV',
 clearwater:'CW',
 rosebank:'RB',
 clinic:'CC',
};

const BRANCH_COLORS = {
 parkview:'text-blue-600',
 clearwater:'text-purple-600',
 rosebank:'text-pink-600',
 clinic:'text-orange-600',
};

function getMonday(d) {
 const date = new Date(d);
 const day = date.getDay();
 const diff = date.getDate() - day + (day === 0 ? -6 : 1);
 date.setDate(diff);
 date.setHours(0, 0, 0, 0);
 return date;
}

function formatDate(d) {
 const year = d.getFullYear();
 const month = String(d.getMonth() + 1).padStart(2,'0');
 const day = String(d.getDate()).padStart(2,'0');
 return `${year}-${month}-${day}`;
}

const MONTH_NAMES = ['January','February','March','April','May','June',
'July','August','September','October','November','December'];

const WEEKDAY_HEADERS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export default function MonthlyCalendar({ schedules, staff }) {
 const [currentMonth, setCurrentMonth] = useState(() => {
 const now = new Date();
 return new Date(now.getFullYear(), now.getMonth(), 1);
 });

 const year = currentMonth.getFullYear();
 const month = currentMonth.getMonth();

 const goToPrevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
 const goToNextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
 const goToThisMonth = () => {
 const now = new Date();
 setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
 };

 // Build calendar grid: array of weeks, each week is array of 7 day objects
 const calendarWeeks = useMemo(() => {
 const weeks = [];
 // Find the Monday on or before the 1st
 const firstDay = new Date(year, month, 1);
 const startDate = getMonday(firstDay);

 // Build 6 weeks max (covers all months)
 for (let w = 0; w < 6; w++) {
 const week = [];
 for (let d = 0; d < 7; d++) {
 const date = new Date(startDate);
 date.setDate(date.getDate() + w * 7 + d);
 week.push(date);
 }
 // Stop if this entire week is in the next month and we already have data
 if (weeks.length >= 4 && week[0].getMonth() !== month && week[6].getMonth() !== month) break;
 weeks.push(week);
 }
 return weeks;
 }, [year, month]);

 // Get schedule data for a specific date
 const getDayData = (date) => {
 const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
 const weekMonday = getMonday(date);
 const weekKey = formatDate(weekMonday);
 const daySchedule = schedules[weekKey]?.[dayName];

 if (!daySchedule) return null;

 const branches = [];
 BRANCHES.forEach(branch => {
 if (!isBranchOpen(branch.id, dayName)) return;
 const cell = daySchedule[branch.id];
 const nurses = cell?.nurses || [];
 const receptionists = cell?.receptionists || [];
 const hasNurse = nurses.length > 0;
 const hasRec = receptionists.length > 0 || branch.isClinic;

 branches.push({
 id: branch.id,
 abbrev: BRANCH_ABBREV[branch.id],
 nurses,
 receptionists,
 hasNurse,
 hasRec,
 isClinic: branch.isClinic,
 });
 });

 return { branches, dayName };
 };

 const today = new Date();
 const isToday = (date) => date.toDateString() === today.toDateString();
 const isCurrentMonth = (date) => date.getMonth() === month;

 const handleExport = () => {
 exportMonthToExcel(schedules, staff, year, month);
 };

 return (
 <div className="p-6 max-w-7xl mx-auto">
 {/* Header */}
 <div className="flex items-center justify-between mb-6">
 <div>
 <h1 className="text-2xl font-bold text-gray-800">Monthly Calendar</h1>
 <p className="text-gray-500 text-sm">Bird's-eye view of the full month</p>
 </div>
 <div className="flex items-center gap-2">
 <button onClick={goToPrevMonth} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
 <ChevronLeft className="w-5 h-5" />
 </button>
 <button onClick={goToThisMonth} className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
 This Month
 </button>
 <span className="text-sm font-semibold text-gray-700 min-w-[180px] text-center">
 {MONTH_NAMES[month]} {year}
 </span>
 <button onClick={goToNextMonth} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
 <ChevronRight className="w-5 h-5" />
 </button>
 <button
 onClick={handleExport}
 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm ml-2"
 >
 <Download className="w-4 h-4" />
 Export Month
 </button>
 </div>
 </div>

 {/* Legend */}
 <div className="flex items-center gap-4 mb-4 text-xs">
 <div className="flex items-center gap-1.5">
 <div className="w-3 h-3 rounded bg-green-100 border border-green-300" />
 <span className="text-gray-600">Fully staffed</span>
 </div>
 <div className="flex items-center gap-1.5">
 <div className="w-3 h-3 rounded bg-red-100 border border-red-300" />
 <span className="text-gray-600">Missing nurse</span>
 </div>
 <div className="flex items-center gap-1.5">
 <div className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
 <span className="text-gray-600">Missing receptionist</span>
 </div>
 {BRANCHES.map(b => (
 <div key={b.id} className="flex items-center gap-1">
 <span className={`font-bold ${BRANCH_COLORS[b.id]}`}>{BRANCH_ABBREV[b.id]}</span>
 <span className="text-gray-400">{b.name}</span>
 </div>
 ))}
 </div>

 {/* Calendar grid */}
 <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
 {/* Day headers */}
 <div className="grid grid-cols-7 bg-gray-50 border-b">
 {WEEKDAY_HEADERS.map(d => (
 <div key={d} className="p-2 text-center text-sm font-semibold text-gray-600">
 {d}
 </div>
 ))}
 </div>

 {/* Week rows */}
 {calendarWeeks.map((week, wi) => (
 <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
 {week.map((date, di) => {
 const inMonth = isCurrentMonth(date);
 const dayData = getDayData(date);
 const todayHighlight = isToday(date);

 // Determine coverage status
 let coverageClass ='';
 if (dayData && inMonth) {
 const missingNurse = dayData.branches.some(b => !b.hasNurse);
 const missingRec = dayData.branches.some(b => !b.hasRec && !b.isClinic);
 if (missingNurse) coverageClass ='bg-red-50/60';
 else if (missingRec) coverageClass ='bg-amber-50/60';
 else if (dayData.branches.length > 0) coverageClass ='bg-green-50/40';
 }

 return (
 <div
 key={di}
 className={`min-h-[100px] p-1.5 border-r last:border-r-0 ${
 inMonth ?'' :'opacity-40'
 } ${coverageClass} ${
 todayHighlight ?'ring-2 ring-inset ring-teal-400' :''
 }`}
 >
 {/* Day number */}
 <div className={`text-sm font-semibold mb-1 ${
 todayHighlight
 ?'text-teal-700'
 : inMonth
 ?'text-gray-800'
 :'text-gray-400'
 }`}>
 {date.getDate()}
 </div>

 {/* Branch summaries */}
 {dayData && (
 <div className="space-y-0.5">
 {dayData.branches.map(b => (
 <div key={b.id} className="flex items-start gap-0.5 leading-tight">
 <span className={`text-[10px] font-bold ${BRANCH_COLORS[b.id]} shrink-0`}>
 {b.abbrev}
 </span>
 <div className="text-[10px] text-gray-600 truncate">
 {b.nurses.length > 0
 ? b.nurses.map(n => n.name.split('')[0]).join(',')
 : <span className="text-red-500">—</span>
 }
 {!b.isClinic && (
 <>
 {' /'}
 {b.receptionists.length > 0
 ? b.receptionists.map(r => r.name.split('')[0]).join(',')
 : <span className="text-amber-500">—</span>
 }
 </>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 );
 })}
 </div>
 ))}
 </div>
 </div>
 );
}
