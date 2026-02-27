import { BRANCHES, DAYS_OF_WEEK, isBranchOpen } from '../data/initialData';
import { validateSchedule, calculateWeeklyHours } from '../utils/scheduler';
import { ChevronLeft, ChevronRight, AlertTriangle, AlertCircle, CheckCircle2, Users, Building2, Clock } from 'lucide-react';

function formatWeekRange(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('en-ZA', opts)} - ${end.toLocaleDateString('en-ZA', { ...opts, year: 'numeric' })}`;
}

export default function Dashboard({ schedule, staff, weekStartDate, currentWeekStart, goToPrevWeek, goToNextWeek, goToToday }) {
  const { warnings, errors } = validateSchedule(schedule, staff);
  const weeklyHours = calculateWeeklyHours(schedule, staff);

  // Count total scheduled shifts
  let totalShifts = 0;
  let coveredSlots = 0;
  let totalSlots = 0;
  DAYS_OF_WEEK.forEach(day => {
    BRANCHES.forEach(branch => {
      if (!isBranchOpen(branch.id, day)) return;
      if (branch.isClinic) return;
      totalSlots += 2; // nurse + receptionist
      const cell = schedule[day]?.[branch.id];
      if (cell?.nurses?.length > 0) { coveredSlots++; totalShifts += cell.nurses.length; }
      if (cell?.receptionists?.length > 0) { coveredSlots++; totalShifts += cell.receptionists.length; }
    });
  });

  const coveragePercent = totalSlots > 0 ? Math.round((coveredSlots / totalSlots) * 100) : 0;

  // Active staff this week
  const activeStaffIds = new Set();
  DAYS_OF_WEEK.forEach(day => {
    BRANCHES.forEach(branch => {
      const cell = schedule[day]?.[branch.id];
      cell?.nurses?.forEach(n => activeStaffIds.add(n.id));
      cell?.receptionists?.forEach(r => activeStaffIds.add(r.id));
    });
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Week nav */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500 text-sm">Week overview at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToPrevWeek} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={goToToday} className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
            Today
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
            {formatWeekRange(currentWeekStart)}
          </span>
          <button onClick={goToNextWeek} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Coverage</p>
              <p className={`text-2xl font-bold ${coveragePercent === 100 ? 'text-green-600' : coveragePercent > 80 ? 'text-amber-600' : 'text-red-600'}`}>
                {coveragePercent}%
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Staff</p>
              <p className="text-2xl font-bold text-gray-800">{activeStaffIds.size}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Shifts</p>
              <p className="text-2xl font-bold text-gray-800">{totalShifts}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Issues</p>
              <p className={`text-2xl font-bold ${errors.length > 0 ? 'text-red-600' : warnings.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {errors.length + warnings.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Issues */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
          <h2 className="text-lg font-semibold mb-3">Schedule Issues</h2>
          <div className="space-y-2">
            {errors.map((err, i) => (
              <div key={`e-${i}`} className="flex items-start gap-2 text-red-700 bg-red-50 p-2 rounded-lg">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="text-sm">{err}</span>
              </div>
            ))}
            {warnings.map((warn, i) => (
              <div key={`w-${i}`} className="flex items-start gap-2 text-amber-700 bg-amber-50 p-2 rounded-lg">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="text-sm">{warn}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {errors.length === 0 && warnings.length === 0 && totalShifts > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">All good! No scheduling issues this week.</span>
          </div>
        </div>
      )}

      {/* Branch summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {BRANCHES.map(branch => (
          <div key={branch.id} className="bg-white rounded-xl shadow-sm border p-5" style={{ borderLeftColor: branch.color, borderLeftWidth: '4px' }}>
            <h3 className="font-semibold text-gray-800 mb-3">{branch.name}</h3>
            <div className="grid grid-cols-7 gap-1">
              {DAYS_OF_WEEK.map(day => {
                const open = isBranchOpen(branch.id, day);
                const cell = schedule[day]?.[branch.id];
                const hasNurse = cell?.nurses?.length > 0;
                const hasRec = cell?.receptionists?.length > 0;
                const dayShort = day.slice(0, 3);

                return (
                  <div key={day} className={`text-center p-1.5 rounded ${!open ? 'bg-gray-100 text-gray-400' : ''}`}>
                    <div className="text-xs font-medium text-gray-500 mb-1">{dayShort}</div>
                    {open ? (
                      <div className="space-y-0.5">
                        <div className={`text-xs px-1 py-0.5 rounded ${hasNurse ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                          {hasNurse ? cell.nurses[0]?.name?.split(' ')[0] : 'No nurse'}
                        </div>
                        <div className={`text-xs px-1 py-0.5 rounded ${hasRec ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-500'}`}>
                          {hasRec ? cell.receptionists[0]?.name?.split(' ')[0] : '—'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">Closed</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
