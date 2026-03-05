import { useState, useMemo, Fragment } from 'react';
import { BRANCHES, DAYS_OF_WEEK, getShiftHours, getLunchDeduction, isScheduleRole } from '../data/initialData';
import { hoursBetween } from '../utils/scheduler';
import {
  getPayCycleForDate,
  getPayCycleRange,
  getWeekKeysForPayCycle,
  getPrevPayCycle,
  getNextPayCycle,
} from '../utils/payCycle';
import { Clock, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight, ChevronDown, Users, BarChart3, Calculator } from 'lucide-react';

const gradients = {
  blue: 'from-blue-500 to-cyan-400',
  purple: 'from-purple-500 to-violet-400',
  green: 'from-green-500 to-emerald-400',
  amber: 'from-amber-500 to-yellow-400',
};
const glows = {
  blue: 'rgba(59,130,246,0.07)',
  purple: 'rgba(139,92,246,0.07)',
  green: 'rgba(34,197,94,0.07)',
  amber: 'rgba(245,158,11,0.07)',
};

export default function MonthlyHours({ staff, schedules }) {
  const [currentCycle, setCurrentCycle] = useState(() => getPayCycleForDate(new Date()));
  const [expandedStaff, setExpandedStaff] = useState(new Set());

  const toggleExpanded = (staffId) => {
    setExpandedStaff(prev => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  const cycleRange = useMemo(() => getPayCycleRange(currentCycle), [currentCycle]);
  const weekKeys = useMemo(() => getWeekKeysForPayCycle(currentCycle), [currentCycle]);

  const goToPrevCycle = () => setCurrentCycle(prev => getPrevPayCycle(prev));
  const goToNextCycle = () => setCurrentCycle(prev => getNextPayCycle(prev));
  const goToCurrentCycle = () => setCurrentCycle(getPayCycleForDate(new Date()));

  const scheduleStaff = staff.filter(s => isScheduleRole(s.role));

  const monthlyData = useMemo(() => {
    const { start, end } = cycleRange;
    const data = {};

    scheduleStaff.forEach(member => {
      data[member.id] = {
        name: member.name, role: member.role, employmentType: member.employmentType,
        target: member.monthlyHoursTarget, totalHours: 0, totalShifts: 0,
        weeklyBreakdown: [], weekdayCount: 0, weekdayHours: 0,
        saturdayCount: 0, saturdayHours: 0, sundayCount: 0, sundayHours: 0,
      };
    });

    weekKeys.forEach(weekKey => {
      const weekSchedule = schedules[weekKey];
      if (!weekSchedule) {
        scheduleStaff.forEach(member => { data[member.id].weeklyBreakdown.push({ weekKey, hours: 0, shifts: 0 }); });
        return;
      }
      const weekHours = {};
      scheduleStaff.forEach(member => { weekHours[member.id] = { hours: 0, shifts: 0 }; });

      DAYS_OF_WEEK.forEach((day, dayIndex) => {
        const weekStart = new Date(weekKey + 'T12:00:00');
        const dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + dayIndex);
        if (dayDate < start || dayDate > end) return;

        const dayShifts = {};
        BRANCHES.forEach(branch => {
          const cell = weekSchedule[day]?.[branch.id];
          if (!cell) return;
          const defaultHrs = getShiftHours(branch.id, day);
          [...(cell.nurses || []), ...(cell.receptionists || [])].forEach(person => {
            if (weekHours[person.id]) {
              if (!dayShifts[person.id]) dayShifts[person.id] = { branches: [], totalHours: 0 };
              let shiftHrs = defaultHrs;
              if (person.shiftStart && person.shiftEnd) shiftHrs = hoursBetween(person.shiftStart, person.shiftEnd);
              dayShifts[person.id].branches.push(branch.id);
              dayShifts[person.id].totalHours += shiftHrs;
            }
          });
        });

        Object.entries(dayShifts).forEach(([personId, shiftData]) => {
          const lunch = getLunchDeduction(day, shiftData.branches);
          const netHours = shiftData.totalHours - lunch;
          weekHours[personId].hours += netHours;
          weekHours[personId].shifts += shiftData.branches.length;
          if (day === 'Saturday') { data[personId].saturdayCount += 1; data[personId].saturdayHours += netHours; }
          else if (day === 'Sunday') { data[personId].sundayCount += 1; data[personId].sundayHours += netHours; }
          else { data[personId].weekdayCount += 1; data[personId].weekdayHours += netHours; }
        });
      });

      scheduleStaff.forEach(member => {
        const wh = weekHours[member.id] || { hours: 0, shifts: 0 };
        data[member.id].totalHours += wh.hours;
        data[member.id].totalShifts += wh.shifts;
        data[member.id].weeklyBreakdown.push({ weekKey, ...wh });
      });
    });

    return data;
  }, [scheduleStaff, schedules, currentCycle, cycleRange, weekKeys]);

  const permanentStaff = scheduleStaff.filter(s => s.employmentType === 'permanent');
  const otherStaff = scheduleStaff.filter(s => s.employmentType !== 'permanent');

  // Summary stats
  const totalHoursAll = Object.values(monthlyData).reduce((s, d) => s + d.totalHours, 0);
  const totalShiftsAll = Object.values(monthlyData).reduce((s, d) => s + d.totalShifts, 0);
  const staffCount = scheduleStaff.length;
  const avgHours = staffCount > 0 ? Math.round(totalHoursAll / staffCount) : 0;

  const gridCols = `1fr 70px 80px 70px 180px repeat(${weekKeys.length}, 70px)`;

  const renderStaffRow = (member) => {
    const info = monthlyData[member.id];
    if (!info) return null;
    const target = info.target;
    const progress = target > 0 ? Math.round((info.totalHours / target) * 100) : null;
    const isOver = progress !== null && progress > 100;
    const isUnder = progress !== null && progress < 80;
    const isExpanded = expandedStaff.has(member.id);

    return (
      <Fragment key={member.id}>
        {/* Main row */}
        <div className="row-animate grid items-center border-b border-d4l-border hover:bg-d4l-hover/30 cursor-pointer select-none transition-colors px-4 py-2.5"
          style={{ gridTemplateColumns: gridCols }}
          onClick={() => toggleExpanded(member.id)}>
          {/* Name */}
          <div className="flex items-center gap-1.5">
            <ChevronDown className={`w-4 h-4 text-d4l-dim shrink-0 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
            <div>
              <div className="font-medium text-d4l-text text-sm">{info.name}</div>
              <div className="flex gap-1.5 mt-0.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${info.role === 'nurse' ? 'bg-blue-500/10 text-blue-400' : 'bg-pink-500/10 text-pink-400'}`}>{info.role}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${info.employmentType === 'permanent' ? 'bg-green-500/10 text-green-400' : 'bg-d4l-raised text-d4l-dim'}`}>{info.employmentType}</span>
              </div>
            </div>
          </div>
          {/* Shifts */}
          <div className="text-center"><span className="text-sm font-bold text-d4l-text">{info.totalShifts}</span></div>
          {/* Hours */}
          <div className="text-center"><span className="text-sm font-bold text-d4l-text">{info.totalHours}h</span></div>
          {/* Target */}
          <div className="text-center">
            {target > 0 ? <span className="text-xs text-d4l-muted">{target}h</span>
              : target === 0 && info.employmentType === 'permanent' ? <span className="text-[10px] text-amber-400 italic">TBD</span>
              : <span className="text-xs text-d4l-dim">—</span>}
          </div>
          {/* Progress */}
          <div>
            {progress !== null ? (
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2.5 bg-d4l-hover rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${
                      isOver ? 'bg-gradient-to-r from-red-500 to-rose-400' : isUnder ? 'bg-gradient-to-r from-amber-500 to-yellow-400' : 'bg-gradient-to-r from-green-500 to-emerald-400'
                    }`} style={{ width: `${Math.min(progress, 100)}%` }} />
                  </div>
                  <span className={`text-xs font-semibold min-w-[32px] text-right ${isOver ? 'text-red-400' : isUnder ? 'text-amber-400' : 'text-green-400'}`}>{progress}%</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {isOver ? <><TrendingUp className="w-3 h-3 text-red-400" /><span className="text-[10px] text-red-400">{info.totalHours - target}h over</span></>
                    : progress === 100 ? <><Minus className="w-3 h-3 text-green-400" /><span className="text-[10px] text-green-400">On target</span></>
                    : <><TrendingDown className="w-3 h-3 text-amber-400" /><span className="text-[10px] text-amber-400">{target - info.totalHours}h remaining</span></>}
                </div>
              </div>
            ) : <span className="text-xs text-d4l-dim">—</span>}
          </div>
          {/* Weekly breakdown */}
          {info.weeklyBreakdown.map((week, i) => (
            <div key={i} className="text-center text-xs text-d4l-text2">
              {week.hours > 0 ? `${week.hours}h` : <span className="text-d4l-dim">—</span>}
            </div>
          ))}
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-b border-d4l-border bg-d4l-bg px-4 py-3 animate-fade-in">
            <div className="ml-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg">
              {[
                { label: 'Weekdays', sub: 'Mon–Fri', count: info.weekdayCount, hours: info.weekdayHours, color: '#3b82f6' },
                { label: 'Saturdays', sub: null, count: info.saturdayCount, hours: info.saturdayHours, color: '#f59e0b' },
                { label: 'Sundays', sub: null, count: info.sundayCount, hours: info.sundayHours, color: '#8b5cf6' },
              ].map(d => (
                <div key={d.label} className="bg-d4l-surface rounded-lg border border-d4l-border overflow-hidden">
                  <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${d.color}, ${d.color}66)` }} />
                  <div className="p-3 text-center">
                    <div className="text-[10px] text-d4l-muted mb-1">{d.label} {d.sub && <span className="text-d4l-dim">({d.sub})</span>}</div>
                    <div className="text-lg font-bold text-d4l-text">{d.count} <span className="text-xs font-normal text-d4l-muted">{d.count === 1 ? 'day' : 'days'}</span></div>
                    <div className="text-sm text-d4l-muted">{d.hours}h</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Fragment>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-full mx-auto">

      {/* ===== HEADER ===== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 md:mb-8 section-animate">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide text-d4l-text" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            Pay Cycle Hours
          </h1>
          <p className="text-d4l-muted text-sm mt-0.5">Track hours per pay cycle (25th — 24th)</p>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          <button onClick={goToPrevCycle} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={goToCurrentCycle} className="px-2 md:px-3 py-1.5 text-xs md:text-sm bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow">
            This Cycle
          </button>
          <span className="text-xs md:text-sm font-medium text-d4l-text2 min-w-[160px] md:min-w-[220px] text-center">
            {cycleRange.label}
          </span>
          <button onClick={goToNextCycle} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ===== STAT CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { color: 'blue', icon: Clock, label: 'Total Hours', value: `${totalHoursAll}`, sub: 'across all staff' },
          { color: 'purple', icon: BarChart3, label: 'Total Shifts', value: `${totalShiftsAll}`, sub: 'this cycle' },
          { color: 'green', icon: Users, label: 'Staff Count', value: `${staffCount}`, sub: 'scheduled this cycle' },
          { color: 'amber', icon: Calculator, label: 'Avg Hours', value: `${avgHours}`, sub: 'per staff member' },
        ].map(({ color, icon: Icon, label, value, sub }) => (
          <div key={label} className="stat-animate hover-lift panel-glow relative overflow-hidden bg-d4l-surface rounded-xl border border-d4l-border">
            <div className={`h-[2px] bg-gradient-to-r ${gradients[color]}`} />
            <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-40"
              style={{ background: `radial-gradient(circle at top right, ${glows[color]}, transparent 70%)` }} />
            <div className="p-5 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-d4l-muted font-medium">{label}</p>
                  <p className="text-4xl font-bold tracking-wide count-animate mt-1 text-d4l-text" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                    {value}
                  </p>
                </div>
                <div className={`p-3 rounded-xl bg-${color === 'amber' ? 'amber' : color}-500/10`}>
                  <Icon className={`w-6 h-6 text-${color === 'amber' ? 'amber' : color}-400`} />
                </div>
              </div>
              <p className="text-[11px] text-d4l-dim mt-2">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ===== PERMANENT STAFF HIGHLIGHT ===== */}
      {permanentStaff.length > 0 && (
        <div className="mb-8 section-animate section-animate-delay-1">
          <h2 className="text-lg font-semibold text-d4l-text mb-4 flex items-center gap-2 uppercase tracking-wider" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            <Clock className="w-5 h-5 text-green-400" />
            Permanent Staff — Hours Tracking
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {permanentStaff.map(member => {
              const info = monthlyData[member.id];
              const target = info?.target || 0;
              const progress = target > 0 ? Math.round((info.totalHours / target) * 100) : null;
              const isOver = progress !== null && progress > 100;
              const isUnder = progress !== null && progress < 80;
              return (
                <div key={member.id} className="card-animate relative overflow-hidden bg-d4l-surface rounded-xl border border-d4l-border hover-lift panel-glow">
                  <div className={`h-[2px] bg-gradient-to-r ${info?.role === 'nurse' ? 'from-blue-500 to-cyan-400' : 'from-pink-500 to-rose-400'}`} />
                  <div className="absolute top-0 right-0 w-28 h-28 pointer-events-none opacity-30"
                    style={{ background: `radial-gradient(circle at top right, ${info?.role === 'nurse' ? 'rgba(59,130,246,0.08)' : 'rgba(236,72,153,0.08)'}, transparent 70%)` }} />
                  <div className="p-4 relative">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-d4l-text text-sm">{member.name}</h3>
                        <span className="text-[10px] text-d4l-muted">{member.role}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-d4l-text" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{info?.totalHours || 0}h</div>
                        {target > 0 ? <div className="text-[10px] text-d4l-dim">of {target}h target</div>
                          : <div className="text-[10px] text-amber-400">Target TBD</div>}
                      </div>
                    </div>
                    {progress !== null && (
                      <div className="h-2.5 bg-d4l-hover rounded-full overflow-hidden mb-1">
                        <div className={`h-full rounded-full transition-all duration-500 ${
                          isOver ? 'bg-gradient-to-r from-red-500 to-rose-400' : isUnder ? 'bg-gradient-to-r from-amber-500 to-yellow-400' : 'bg-gradient-to-r from-green-500 to-emerald-400'
                        }`} style={{ width: `${Math.min(progress, 100)}%` }} />
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-d4l-dim">{info?.totalShifts || 0} shifts this cycle</span>
                      {progress !== null && (
                        <span className={`text-[10px] font-semibold ${isOver ? 'text-red-400' : isUnder ? 'text-amber-400' : 'text-green-400'}`}>{progress}%</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== FULL STAFF TABLE ===== */}
      <div className="section-animate section-animate-delay-2 bg-d4l-surface rounded-xl border border-d4l-border overflow-hidden panel-glow">
        <div className="overflow-x-auto">
          {/* Header */}
          <div className="grid items-center bg-d4l-bg border-b border-d4l-border px-4 py-2.5"
            style={{ gridTemplateColumns: gridCols }}>
            <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium">Staff Member</span>
            <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium text-center">Shifts</span>
            <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium text-center">Hours</span>
            <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium text-center">Target</span>
            <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium">Progress</span>
            {weekKeys.map((wk, i) => (
              <span key={wk} className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium text-center">Wk {i + 1}</span>
            ))}
          </div>

          {/* Permanent group */}
          <div className="px-4 py-2 border-l-[3px] border-l-green-500" style={{ background: 'rgba(34,197,94,0.04)' }}>
            <span className="text-xs font-semibold text-green-400 uppercase tracking-wider" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              Permanent Staff
            </span>
          </div>
          {permanentStaff.map(renderStaffRow)}

          {/* Part-time group */}
          <div className="px-4 py-2 border-l-[3px] border-l-d4l-muted" style={{ background: 'rgba(138,128,112,0.04)' }}>
            <span className="text-xs font-semibold text-d4l-text2 uppercase tracking-wider" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              Part-time & Locum Staff
            </span>
          </div>
          {otherStaff.map(renderStaffRow)}
        </div>
      </div>
    </div>
  );
}
