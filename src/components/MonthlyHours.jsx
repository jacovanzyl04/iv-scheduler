import { useState, useMemo } from 'react';
import { BRANCHES, DAYS_OF_WEEK, getShiftHours } from '../data/initialData';
import { Clock, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react';

function getMonthWeeks(year, month) {
  const weeks = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Get the Monday of the first week
  let current = new Date(firstDay);
  const dayOfWeek = current.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  current.setDate(current.getDate() + diff);

  while (current <= lastDay || current.getDay() !== 1) {
    const weekStart = new Date(current);
    const weekKey = weekStart.toISOString().split('T')[0];
    weeks.push(weekKey);
    current.setDate(current.getDate() + 7);
    if (weeks.length > 6) break;
  }

  return weeks;
}

export default function MonthlyHours({ staff, schedules }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const monthName = new Date(currentMonth.year, currentMonth.month).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

  const goToPrevMonth = () => {
    setCurrentMonth(prev => {
      const d = new Date(prev.year, prev.month - 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const goToNextMonth = () => {
    setCurrentMonth(prev => {
      const d = new Date(prev.year, prev.month + 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  // Calculate monthly hours for each staff member
  const monthlyData = useMemo(() => {
    const weekKeys = getMonthWeeks(currentMonth.year, currentMonth.month);
    const data = {};

    staff.forEach(member => {
      data[member.id] = {
        name: member.name,
        role: member.role,
        employmentType: member.employmentType,
        target: member.monthlyHoursTarget,
        totalHours: 0,
        totalShifts: 0,
        weeklyBreakdown: [],
      };
    });

    weekKeys.forEach(weekKey => {
      const weekSchedule = schedules[weekKey];
      if (!weekSchedule) {
        staff.forEach(member => {
          data[member.id].weeklyBreakdown.push({ weekKey, hours: 0, shifts: 0 });
        });
        return;
      }

      const weekHours = {};
      staff.forEach(member => { weekHours[member.id] = { hours: 0, shifts: 0 }; });

      DAYS_OF_WEEK.forEach(day => {
        // Only count days that fall within the target month
        const weekStart = new Date(weekKey);
        const dayIndex = DAYS_OF_WEEK.indexOf(day);
        const dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + dayIndex);

        if (dayDate.getMonth() !== currentMonth.month || dayDate.getFullYear() !== currentMonth.year) {
          return;
        }

        BRANCHES.forEach(branch => {
          const cell = weekSchedule[day]?.[branch.id];
          if (!cell) return;

          const shiftHrs = getShiftHours(branch.id, day);

          [...(cell.nurses || []), ...(cell.receptionists || [])].forEach(person => {
            if (weekHours[person.id]) {
              weekHours[person.id].hours += shiftHrs;
              weekHours[person.id].shifts += 1;
            }
          });
        });
      });

      staff.forEach(member => {
        const wh = weekHours[member.id] || { hours: 0, shifts: 0 };
        data[member.id].totalHours += wh.hours;
        data[member.id].totalShifts += wh.shifts;
        data[member.id].weeklyBreakdown.push({ weekKey, ...wh });
      });
    });

    return data;
  }, [staff, schedules, currentMonth]);

  const permanentStaff = staff.filter(s => s.employmentType === 'permanent');
  const otherStaff = staff.filter(s => s.employmentType !== 'permanent');

  const renderStaffRow = (member) => {
    const info = monthlyData[member.id];
    if (!info) return null;

    const target = info.target;
    const progress = target > 0 ? Math.round((info.totalHours / target) * 100) : null;
    const isOver = progress !== null && progress > 100;
    const isUnder = progress !== null && progress < 80;

    return (
      <tr key={member.id} className="border-b border-gray-100 hover:bg-gray-50">
        <td className="p-3">
          <div className="font-medium text-gray-800 text-sm">{info.name}</div>
          <div className="flex gap-1.5 mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded ${info.role === 'nurse' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>
              {info.role}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${info.employmentType === 'permanent' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-600'}`}>
              {info.employmentType}
            </span>
          </div>
        </td>
        <td className="p-3 text-center">
          <span className="text-lg font-bold text-gray-800">{info.totalShifts}</span>
        </td>
        <td className="p-3 text-center">
          <span className="text-lg font-bold text-gray-800">{info.totalHours}h</span>
        </td>
        <td className="p-3 text-center">
          {target > 0 ? (
            <span className="text-sm text-gray-500">{target}h</span>
          ) : target === 0 && info.employmentType === 'permanent' ? (
            <span className="text-xs text-amber-500 italic">TBD</span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="p-3">
          {progress !== null ? (
            <div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isOver ? 'bg-red-500' : isUnder ? 'bg-amber-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
                <span className={`text-xs font-medium ${isOver ? 'text-red-600' : isUnder ? 'text-amber-600' : 'text-green-600'}`}>
                  {progress}%
                </span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {isOver ? (
                  <><TrendingUp className="w-3 h-3 text-red-500" /><span className="text-xs text-red-500">{info.totalHours - target}h over</span></>
                ) : progress === 100 ? (
                  <><Minus className="w-3 h-3 text-green-500" /><span className="text-xs text-green-500">On target</span></>
                ) : (
                  <><TrendingDown className="w-3 h-3 text-amber-500" /><span className="text-xs text-amber-500">{target - info.totalHours}h remaining</span></>
                )}
              </div>
            </div>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        {info.weeklyBreakdown.map((week, i) => (
          <td key={i} className="p-3 text-center text-sm text-gray-600">
            {week.hours > 0 ? `${week.hours}h` : <span className="text-gray-300">—</span>}
          </td>
        ))}
      </tr>
    );
  };

  const weekKeys = getMonthWeeks(currentMonth.year, currentMonth.month);

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Monthly Hours Tracker</h1>
          <p className="text-gray-500 text-sm">Track hours for permanent staff targets</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToPrevMonth} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-[160px] text-center">
            {monthName}
          </span>
          <button onClick={goToNextMonth} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Permanent staff highlight */}
      {permanentStaff.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-green-600" />
            Permanent Staff — Hours Tracking
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {permanentStaff.map(member => {
              const info = monthlyData[member.id];
              const target = info?.target || 0;
              const progress = target > 0 ? Math.round((info.totalHours / target) * 100) : null;
              return (
                <div key={member.id} className="bg-white rounded-xl shadow-sm border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-800">{member.name}</h3>
                      <span className="text-xs text-gray-500">{member.role}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-gray-800">{info?.totalHours || 0}h</div>
                      {target > 0 ? (
                        <div className="text-xs text-gray-500">of {target}h target</div>
                      ) : (
                        <div className="text-xs text-amber-500">Target TBD</div>
                      )}
                    </div>
                  </div>
                  {progress !== null && (
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          progress > 100 ? 'bg-red-500' : progress < 80 ? 'bg-amber-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">{info?.totalShifts || 0} shifts this month</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-3 text-sm font-semibold text-gray-600 w-48">Staff Member</th>
                <th className="text-center p-3 text-sm font-semibold text-gray-600 w-20">Shifts</th>
                <th className="text-center p-3 text-sm font-semibold text-gray-600 w-24">Hours</th>
                <th className="text-center p-3 text-sm font-semibold text-gray-600 w-20">Target</th>
                <th className="text-center p-3 text-sm font-semibold text-gray-600 w-48">Progress</th>
                {weekKeys.map((wk, i) => (
                  <th key={wk} className="text-center p-3 text-sm font-semibold text-gray-600 w-20">
                    Wk {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5 + weekKeys.length} className="bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 uppercase tracking-wide">
                  Permanent Staff
                </td>
              </tr>
              {permanentStaff.map(renderStaffRow)}
              <tr>
                <td colSpan={5 + weekKeys.length} className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Part-time & Locum Staff
                </td>
              </tr>
              {otherStaff.map(renderStaffRow)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
