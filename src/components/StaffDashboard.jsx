import { useMemo } from 'react';
import { BRANCHES, DAYS_OF_WEEK, getShiftHours } from '../data/initialData';
import { getPayCycleForDate, getPayCycleRange, getWeekKeysForPayCycle } from '../utils/payCycle';
import { hoursBetween } from '../utils/scheduler';
import { ChevronLeft, ChevronRight, CalendarDays, Clock, ClipboardList, FileCheck } from 'lucide-react';

function formatWeekRange(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('en-ZA', opts)} - ${end.toLocaleDateString('en-ZA', { ...opts, year: 'numeric' })}`;
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function StaffDashboard({
  staffId, staff, schedules, currentWeekStart, weekKey,
  goToPrevWeek, goToNextWeek, goToToday, setActivePage
}) {
  const member = staff.find(s => s.id === staffId);
  const currentSchedule = schedules[weekKey] || {};

  // Extract this staff member's assignments for the week
  const mySchedule = useMemo(() => {
    const result = {};
    DAYS_OF_WEEK.forEach(day => {
      result[day] = [];
      BRANCHES.forEach(branch => {
        const cell = currentSchedule[day]?.[branch.id];
        const inNurses = cell?.nurses?.find(n => n.id === staffId);
        const inRecs = cell?.receptionists?.find(r => r.id === staffId);
        const match = inNurses || inRecs;
        if (match) {
          const defaultHrs = getShiftHours(branch.id, day);
          const hrs = (match.shiftStart && match.shiftEnd)
            ? hoursBetween(match.shiftStart, match.shiftEnd)
            : defaultHrs;
          result[day].push({
            branch: branch.name,
            branchColor: branch.color,
            role: inNurses ? 'Nurse' : 'Receptionist',
            shiftStart: match.shiftStart,
            shiftEnd: match.shiftEnd,
            hours: hrs,
          });
        }
      });
    });
    return result;
  }, [currentSchedule, staffId]);

  // Calculate hours for this week
  const weeklyHours = useMemo(() => {
    let total = 0;
    let shifts = 0;
    DAYS_OF_WEEK.forEach(day => {
      mySchedule[day].forEach(s => {
        total += s.hours;
        shifts++;
      });
    });
    return { total, shifts };
  }, [mySchedule]);

  // Calculate pay cycle hours
  const cycleStats = useMemo(() => {
    const cycleKey = getPayCycleForDate(new Date());
    const { label } = getPayCycleRange(cycleKey);
    const weekKeys = getWeekKeysForPayCycle(cycleKey);
    const { start, end } = getPayCycleRange(cycleKey);
    let total = 0;
    let shifts = 0;

    weekKeys.forEach(wk => {
      const ws = schedules[wk];
      if (!ws) return;
      DAYS_OF_WEEK.forEach((day, dayIndex) => {
        const weekStart = new Date(wk + 'T12:00:00');
        const dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + dayIndex);
        if (dayDate < start || dayDate > end) return;

        BRANCHES.forEach(branch => {
          const cell = ws[day]?.[branch.id];
          const match = cell?.nurses?.find(n => n.id === staffId) || cell?.receptionists?.find(r => r.id === staffId);
          if (match) {
            const defaultHrs = getShiftHours(branch.id, day);
            const hrs = (match.shiftStart && match.shiftEnd)
              ? hoursBetween(match.shiftStart, match.shiftEnd)
              : defaultHrs;
            total += hrs;
            shifts++;
          }
        });
      });
    });

    return { total, shifts, label };
  }, [schedules, staffId]);

  // Day abbreviations
  const dayAbbr = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

  // Get date number for each day
  const getDayDate = (dayIndex) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + dayIndex);
    return d.getDate();
  };

  const isToday = (dayIndex) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + dayIndex);
    return d.toDateString() === new Date().toDateString();
  };

  const branchColorMap = {
    blue: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    pink: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
    orange: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-d4l-text">
          Welcome, {member?.name || 'Staff'}
        </h1>
        <p className="text-d4l-muted text-sm">Your schedule and hours overview</p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <button
          onClick={() => setActivePage('full-schedule')}
          className="flex items-center gap-3 p-4 stat-animate bg-d4l-surface rounded-xl border border-d4l-border hover-lift panel-glow text-left"
        >
          <CalendarDays className="w-5 h-5 text-d4l-gold" />
          <span className="text-sm font-medium text-d4l-text2">Full Schedule</span>
        </button>
        <button
          onClick={() => setActivePage('my-availability')}
          className="flex items-center gap-3 p-4 stat-animate bg-d4l-surface rounded-xl border border-d4l-border hover-lift panel-glow text-left"
        >
          <ClipboardList className="w-5 h-5 text-d4l-gold" />
          <span className="text-sm font-medium text-d4l-text2">My Availability</span>
        </button>
        <button
          onClick={() => setActivePage('my-timesheet')}
          className="flex items-center gap-3 p-4 stat-animate bg-d4l-surface rounded-xl border border-d4l-border hover-lift panel-glow text-left"
        >
          <FileCheck className="w-5 h-5 text-d4l-gold" />
          <span className="text-sm font-medium text-d4l-text2">My Timesheet</span>
        </button>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-d4l-text">My Schedule</h2>
        <div className="flex items-center gap-2">
          <button onClick={goToPrevWeek} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={goToToday} className="px-3 py-1.5 text-sm bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow">
            Today
          </button>
          <span className="text-sm font-medium text-d4l-text2 min-w-[180px] text-center">
            {formatWeekRange(currentWeekStart)}
          </span>
          <button onClick={goToNextWeek} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Weekly Schedule Grid */}
      <div className="section-animate section-animate-delay-1 bg-d4l-surface rounded-xl border border-d4l-border overflow-hidden mb-6 panel-glow">
        <div className="grid grid-cols-7 divide-x divide-d4l-border">
          {DAYS_OF_WEEK.map((day, i) => {
            const assignments = mySchedule[day];
            const today = isToday(i);
            return (
              <div key={day} className={`${today ? 'bg-d4l-gold/5' : ''}`}>
                <div className={`text-center py-2 border-b border-d4l-border ${today ? 'bg-d4l-gold/10' : 'bg-d4l-bg'}`}>
                  <div className={`text-xs font-semibold ${today ? 'text-d4l-gold' : 'text-d4l-text2'}`}>
                    {dayAbbr[day]}
                  </div>
                  <div className={`text-lg font-bold ${today ? 'text-d4l-gold' : 'text-d4l-text'}`}>
                    {getDayDate(i)}
                  </div>
                </div>
                <div className="p-2 min-h-[100px]">
                  {assignments.length === 0 ? (
                    <div className="text-xs text-d4l-dim text-center mt-6">Off</div>
                  ) : (
                    assignments.map((a, idx) => (
                      <div key={idx} className={`mb-2 p-2 rounded-lg border text-xs ${branchColorMap[a.branchColor] || 'bg-d4l-raised text-d4l-text2 border-d4l-border'}`}>
                        <div className="font-semibold">{a.branch}</div>
                        <div className="text-[10px] opacity-75">{a.role}</div>
                        {a.shiftStart && a.shiftEnd && (
                          <div className="mt-1">{a.shiftStart} - {a.shiftEnd}</div>
                        )}
                        <div className="mt-0.5 font-medium">{a.hours}h</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hours Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-d4l-surface rounded-xl border border-d4l-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-d4l-gold" />
            <h3 className="font-semibold text-d4l-text2">This Week</h3>
          </div>
          <div className="text-3xl font-bold text-d4l-text">{weeklyHours.total}h</div>
          <div className="text-sm text-d4l-muted mt-1">{weeklyHours.shifts} shift{weeklyHours.shifts !== 1 ? 's' : ''}</div>
        </div>

        <div className="bg-d4l-surface rounded-xl border border-d4l-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-d4l-text2">Pay Cycle</h3>
          </div>
          <div className="text-3xl font-bold text-d4l-text">{cycleStats.total}h</div>
          <div className="text-sm text-d4l-muted mt-1">{cycleStats.shifts} shift{cycleStats.shifts !== 1 ? 's' : ''}</div>
          <div className="text-xs text-d4l-dim mt-1">{cycleStats.label}</div>
        </div>
      </div>
    </div>
  );
}
