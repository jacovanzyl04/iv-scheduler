import { useState, useMemo, Fragment } from 'react';
import { BRANCHES, DAYS_OF_WEEK, getShiftHours, getLunchDeduction, isScheduleRole } from '../data/initialData';
import { hoursBetween } from '../utils/scheduler';
import {
  getPayCycleForDate,
  getPayCycleRange,
  getWeekKeysForPayCycle,
  getMonthlyRangeForCycle,
  getPrevPayCycle,
  getNextPayCycle,
} from '../utils/payCycle';
import { Clock, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight, ChevronDown, Users, BarChart3, Calculator, X, Plus, CalendarPlus, Timer, Zap } from 'lucide-react';

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

function formatDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MonthlyHours({ staff, schedules, payCycleExtras = {}, setPayCycleExtras, payCycleOvertime = {}, setPayCycleOvertime }) {
  const [currentCycle, setCurrentCycle] = useState(() => getPayCycleForDate(new Date()));
  const [expandedStaff, setExpandedStaff] = useState(new Set());
  const [activeTab, setActiveTab] = useState('standard'); // 'standard' | 'monthly'
  const [addingExtraFor, setAddingExtraFor] = useState(null); // staffId or null
  const [extraDateInput, setExtraDateInput] = useState('');
  const [addingOvertimeFor, setAddingOvertimeFor] = useState(null);
  const [overtimeDateInput, setOvertimeDateInput] = useState('');
  const [overtimeHoursInput, setOvertimeHoursInput] = useState('');
  const [overtimeNoteInput, setOvertimeNoteInput] = useState('');

  const toggleExpanded = (staffId) => {
    setExpandedStaff(prev => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  const cycleRange = useMemo(() => getPayCycleRange(currentCycle), [currentCycle]);
  const monthlyRange = useMemo(() => getMonthlyRangeForCycle(currentCycle), [currentCycle]);

  // Week keys covering the union of standard and monthly ranges
  const weekKeys = useMemo(() => {
    const stdKeys = getWeekKeysForPayCycle(currentCycle);
    // Add any extra weeks needed for monthly range
    const { start: mStart, end: mEnd } = monthlyRange;
    const allKeys = new Set(stdKeys);
    const current = new Date(mStart);
    const dow = current.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    current.setDate(current.getDate() + mondayOffset);
    while (current <= mEnd) {
      const yr = current.getFullYear();
      const mo = String(current.getMonth() + 1).padStart(2, '0');
      const dy = String(current.getDate()).padStart(2, '0');
      allKeys.add(`${yr}-${mo}-${dy}`);
      current.setDate(current.getDate() + 7);
    }
    return [...allKeys].sort();
  }, [currentCycle, monthlyRange]);

  const goToPrevCycle = () => setCurrentCycle(prev => getPrevPayCycle(prev));
  const goToNextCycle = () => setCurrentCycle(prev => getNextPayCycle(prev));
  const goToCurrentCycle = () => setCurrentCycle(getPayCycleForDate(new Date()));

  const scheduleStaff = staff.filter(s => isScheduleRole(s.role));

  // Build per-staff date range lookup
  const staffRanges = useMemo(() => {
    const ranges = {};
    scheduleStaff.forEach(member => {
      if (member.payCycleType === 'monthly') {
        ranges[member.id] = monthlyRange;
      } else {
        ranges[member.id] = cycleRange;
      }
    });
    return ranges;
  }, [scheduleStaff, cycleRange, monthlyRange]);

  // Build per-staff extra dates lookup for this cycle
  const extraDatesLookup = useMemo(() => {
    const cycleExtras = payCycleExtras[currentCycle] || {};
    const lookup = {};
    Object.entries(cycleExtras).forEach(([staffId, dates]) => {
      lookup[staffId] = new Set(Array.isArray(dates) ? dates : []);
    });
    return lookup;
  }, [payCycleExtras, currentCycle]);

  // Build exclusion set: dates in THIS cycle's range that were claimed by OTHER cycles
  // This prevents double-counting when a date is moved from one cycle to another
  const excludedDates = useMemo(() => {
    const excluded = {}; // { staffId: Set of date strings }
    Object.entries(payCycleExtras).forEach(([cycleKey, cycleData]) => {
      if (cycleKey === currentCycle) return; // skip current cycle's own extras
      Object.entries(cycleData).forEach(([staffId, dates]) => {
        if (!excluded[staffId]) excluded[staffId] = new Set();
        (Array.isArray(dates) ? dates : []).forEach(d => excluded[staffId].add(d));
      });
    });
    return excluded;
  }, [payCycleExtras, currentCycle]);

  // Extend weekKeys to include weeks containing extra dates
  const allWeekKeys = useMemo(() => {
    const allKeys = new Set(weekKeys);
    // Add week keys for any extra dates
    Object.values(extraDatesLookup).forEach(dateSet => {
      dateSet.forEach(dateStr => {
        const d = new Date(dateStr + 'T12:00:00');
        const dow = d.getDay();
        const mondayOffset = dow === 0 ? -6 : 1 - dow;
        const monday = new Date(d);
        monday.setDate(monday.getDate() + mondayOffset);
        allKeys.add(formatDateStr(monday));
      });
    });
    return [...allKeys].sort();
  }, [weekKeys, extraDatesLookup]);

  const monthlyData = useMemo(() => {
    const data = {};

    scheduleStaff.forEach(member => {
      const range = staffRanges[member.id];
      data[member.id] = {
        name: member.name, role: member.role, employmentType: member.employmentType,
        payCycleType: member.payCycleType || 'standard',
        cycleLabel: range.label,
        target: member.monthlyHoursTarget, totalHours: 0, totalShifts: 0,
        weeklyBreakdown: [], weekdayCount: 0, weekdayHours: 0,
        saturdayCount: 0, saturdayHours: 0, sundayCount: 0, sundayHours: 0,
        extraDatesDetail: [], // { dateStr, hours, branches }
        dailyOvertimeHours: 0, // auto-calculated: sum of (netHours - 9) for days > 9h
      };
    });

    allWeekKeys.forEach(weekKey => {
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
        const dayStr = formatDateStr(dayDate);

        const dayShifts = {};
        BRANCHES.forEach(branch => {
          const cell = weekSchedule[day]?.[branch.id];
          if (!cell) return;
          const defaultHrs = getShiftHours(branch.id, day);
          [...(cell.nurses || []), ...(cell.receptionists || [])].forEach(person => {
            if (!weekHours[person.id]) return;
            // Per-staff date range check — also allow extra dates, exclude claimed dates
            const range = staffRanges[person.id];
            const inRange = range && dayDate >= range.start && dayDate <= range.end;
            const isExtra = extraDatesLookup[person.id]?.has(dayStr);
            const isClaimed = excludedDates[person.id]?.has(dayStr); // claimed by another cycle
            if (isClaimed && !isExtra) return; // skip if claimed elsewhere (unless also extra here)
            if (!inRange && !isExtra) return;
            if (!dayShifts[person.id]) dayShifts[person.id] = { branches: [], totalHours: 0, isExtra };
            let shiftHrs = defaultHrs;
            if (person.shiftStart && person.shiftEnd) shiftHrs = hoursBetween(person.shiftStart, person.shiftEnd);
            dayShifts[person.id].branches.push(branch.id);
            dayShifts[person.id].totalHours += shiftHrs;
          });
        });

        Object.entries(dayShifts).forEach(([personId, shiftData]) => {
          const lunch = getLunchDeduction(day, shiftData.branches, shiftData.totalHours);
          const netHours = shiftData.totalHours - lunch;
          weekHours[personId].hours += netHours;
          weekHours[personId].shifts += shiftData.branches.length;
          if (day === 'Saturday') { data[personId].saturdayCount += 1; data[personId].saturdayHours += netHours; }
          else if (day === 'Sunday') { data[personId].sundayCount += 1; data[personId].sundayHours += netHours; }
          else { data[personId].weekdayCount += 1; data[personId].weekdayHours += netHours; }
          // Daily overtime: anything above 9h (lunch already deducted)
          if (netHours > 9) {
            data[personId].dailyOvertimeHours += netHours - 9;
          }
          // Track extra date details
          if (shiftData.isExtra) {
            data[personId].extraDatesDetail.push({
              dateStr: dayStr,
              hours: netHours,
              branches: shiftData.branches.map(bId => BRANCHES.find(b => b.id === bId)?.name || bId),
            });
          }
        });
      });

      scheduleStaff.forEach(member => {
        const wh = weekHours[member.id] || { hours: 0, shifts: 0 };
        data[member.id].totalHours += wh.hours;
        data[member.id].totalShifts += wh.shifts;
        data[member.id].weeklyBreakdown.push({ weekKey, ...wh });
      });
    });

    // Add manual overtime hours
    const cycleOvertime = payCycleOvertime[currentCycle] || {};
    scheduleStaff.forEach(member => {
      const entries = Array.isArray(cycleOvertime[member.id]) ? cycleOvertime[member.id] : [];
      data[member.id].overtimeEntries = entries;
      data[member.id].overtimeTotal = entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
      data[member.id].totalHours += data[member.id].overtimeTotal;
    });

    // Calculate monthly overtime for permanents (hours over target)
    scheduleStaff.forEach(member => {
      const d = data[member.id];
      if (d.employmentType === 'permanent' && d.target > 0) {
        d.monthlyOvertimeHours = Math.max(0, d.totalHours - d.target);
      } else {
        d.monthlyOvertimeHours = 0;
      }
      // Combined overtime = max of daily or monthly (they may overlap)
      // Daily overtime: excess per day > 9h
      // Monthly overtime: excess over target (for permanents)
      d.autoOvertimeHours = Math.max(d.dailyOvertimeHours, d.monthlyOvertimeHours);
    });

    return data;
  }, [scheduleStaff, schedules, currentCycle, cycleRange, monthlyRange, allWeekKeys, staffRanges, extraDatesLookup, excludedDates, payCycleOvertime]);

  // Split staff by pay cycle type
  const standardStaff = scheduleStaff.filter(s => s.payCycleType !== 'monthly');
  const monthlyStaff = scheduleStaff.filter(s => s.payCycleType === 'monthly');

  // Tab-specific staff lists
  const tabStaff = activeTab === 'monthly' ? monthlyStaff : standardStaff;
  const tabPermanent = tabStaff.filter(s => s.employmentType === 'permanent');
  const tabOther = tabStaff.filter(s => s.employmentType !== 'permanent');

  // Tab-specific week keys
  const standardWeekKeys = useMemo(() => getWeekKeysForPayCycle(currentCycle), [currentCycle]);
  const monthlyWeekKeys = useMemo(() => {
    const { start: mStart, end: mEnd } = monthlyRange;
    const keys = [];
    const cur = new Date(mStart);
    const dow = cur.getDay();
    cur.setDate(cur.getDate() + (dow === 0 ? -6 : 1 - dow));
    while (cur <= mEnd) {
      const yr = cur.getFullYear();
      const mo = String(cur.getMonth() + 1).padStart(2, '0');
      const dy = String(cur.getDate()).padStart(2, '0');
      keys.push(`${yr}-${mo}-${dy}`);
      cur.setDate(cur.getDate() + 7);
    }
    return keys;
  }, [monthlyRange]);
  const tabWeekKeys = activeTab === 'monthly' ? monthlyWeekKeys : standardWeekKeys;

  // Summary stats (per tab)
  const tabStaffIds = new Set(tabStaff.map(s => s.id));
  const totalHoursAll = Object.entries(monthlyData).filter(([id]) => tabStaffIds.has(id)).reduce((s, [, d]) => s + d.totalHours, 0);
  const totalShiftsAll = Object.entries(monthlyData).filter(([id]) => tabStaffIds.has(id)).reduce((s, [, d]) => s + d.totalShifts, 0);
  const staffCount = tabStaff.length;
  const avgHours = staffCount > 0 ? Math.round(totalHoursAll / staffCount) : 0;

  const addExtraDate = (staffId, dateStr) => {
    if (!dateStr || !setPayCycleExtras) return;
    setPayCycleExtras(prev => {
      const cycle = prev[currentCycle] || {};
      const existing = Array.isArray(cycle[staffId]) ? cycle[staffId] : [];
      if (existing.includes(dateStr)) return prev; // already added
      return { ...prev, [currentCycle]: { ...cycle, [staffId]: [...existing, dateStr] } };
    });
    setAddingExtraFor(null);
    setExtraDateInput('');
  };

  const removeExtraDate = (staffId, dateStr) => {
    if (!setPayCycleExtras) return;
    setPayCycleExtras(prev => {
      const cycle = prev[currentCycle] || {};
      const existing = Array.isArray(cycle[staffId]) ? cycle[staffId] : [];
      const updated = existing.filter(d => d !== dateStr);
      return { ...prev, [currentCycle]: { ...cycle, [staffId]: updated.length ? updated : [] } };
    });
  };

  const addOvertime = (staffId) => {
    if (!overtimeDateInput || !overtimeHoursInput || !setPayCycleOvertime) return;
    const entry = { date: overtimeDateInput, hours: Number(overtimeHoursInput), note: overtimeNoteInput.trim() || '' };
    setPayCycleOvertime(prev => {
      const cycle = prev[currentCycle] || {};
      const existing = Array.isArray(cycle[staffId]) ? cycle[staffId] : [];
      return { ...prev, [currentCycle]: { ...cycle, [staffId]: [...existing, entry] } };
    });
    setAddingOvertimeFor(null);
    setOvertimeDateInput('');
    setOvertimeHoursInput('');
    setOvertimeNoteInput('');
  };

  const removeOvertime = (staffId, index) => {
    if (!setPayCycleOvertime) return;
    setPayCycleOvertime(prev => {
      const cycle = prev[currentCycle] || {};
      const existing = Array.isArray(cycle[staffId]) ? cycle[staffId] : [];
      const updated = existing.filter((_, i) => i !== index);
      return { ...prev, [currentCycle]: { ...cycle, [staffId]: updated } };
    });
  };

  const gridCols = `1fr 70px 80px 70px 180px repeat(${tabWeekKeys.length}, 70px)`;

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
          {/* Weekly breakdown – only show weeks for active tab */}
          {tabWeekKeys.map((wk) => {
            const week = info.weeklyBreakdown.find(w => w.weekKey === wk);
            return (
              <div key={wk} className="text-center text-xs text-d4l-text2">
                {week && week.hours > 0 ? `${week.hours}h` : <span className="text-d4l-dim">—</span>}
              </div>
            );
          })}
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-b border-d4l-border bg-d4l-bg px-4 py-3 animate-fade-in">
            <div className="ml-6 grid grid-cols-1 sm:grid-cols-4 gap-3 max-w-2xl">
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
              {/* Overtime card */}
              <div className={`bg-d4l-surface rounded-lg border overflow-hidden ${info.autoOvertimeHours > 0 ? 'border-red-500/30' : 'border-d4l-border'}`}>
                <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #ef4444, #ef444466)' }} />
                <div className="p-3 text-center">
                  <div className="text-[10px] text-d4l-muted mb-1 flex items-center justify-center gap-1">
                    <Zap className="w-3 h-3 text-red-400" />
                    Overtime
                  </div>
                  <div className={`text-lg font-bold ${info.autoOvertimeHours > 0 ? 'text-red-400' : 'text-d4l-text'}`}>
                    {info.autoOvertimeHours}h
                  </div>
                  <div className="text-[10px] text-d4l-dim mt-0.5 space-y-0.5">
                    {info.dailyOvertimeHours > 0 && (
                      <div>Daily: {info.dailyOvertimeHours}h <span className="text-d4l-dim">(over 9h/day)</span></div>
                    )}
                    {info.monthlyOvertimeHours > 0 && (
                      <div>Monthly: {info.monthlyOvertimeHours}h <span className="text-d4l-dim">(over target)</span></div>
                    )}
                    {info.autoOvertimeHours === 0 && <div>None</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* Extra dates section – monthly tab only */}
            {activeTab === 'monthly' && (
              <div className="ml-6 mt-4 max-w-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarPlus className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-d4l-text2 uppercase tracking-wider">Extra Dates</span>
                </div>

                {/* List of extra dates with hours */}
                {info.extraDatesDetail.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {info.extraDatesDetail.map(ed => (
                      <div key={ed.dateStr} className="flex items-center gap-2 bg-d4l-surface rounded-lg border border-d4l-border px-3 py-2">
                        <span className="text-xs text-d4l-text flex-1">
                          {new Date(ed.dateStr + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                          <span className="text-d4l-muted ml-2">— {ed.hours}h</span>
                          <span className="text-d4l-dim ml-1">({ed.branches.join(', ')})</span>
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeExtraDate(member.id, ed.dateStr); }}
                          className="p-1 rounded hover:bg-red-500/10 text-d4l-dim hover:text-red-400 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Extra dates that have no schedule data */}
                {(() => {
                  const extras = payCycleExtras[currentCycle]?.[member.id] || [];
                  const detailDates = new Set(info.extraDatesDetail.map(d => d.dateStr));
                  const noData = extras.filter(d => !detailDates.has(d));
                  if (noData.length === 0) return null;
                  return (
                    <div className="space-y-1.5 mb-3">
                      {noData.map(dateStr => (
                        <div key={dateStr} className="flex items-center gap-2 bg-d4l-surface rounded-lg border border-amber-500/20 px-3 py-2">
                          <span className="text-xs text-amber-400 flex-1">
                            {new Date(dateStr + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                            <span className="text-d4l-dim ml-2">— no schedule found</span>
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeExtraDate(member.id, dateStr); }}
                            className="p-1 rounded hover:bg-red-500/10 text-d4l-dim hover:text-red-400 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Add extra date */}
                {addingExtraFor === member.id ? (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <input
                      type="date"
                      value={extraDateInput}
                      onChange={e => setExtraDateInput(e.target.value)}
                      className="px-2 py-1.5 text-xs rounded-lg bg-d4l-surface border border-d4l-border text-d4l-text focus:outline-none focus:border-d4l-gold"
                    />
                    <button
                      onClick={() => addExtraDate(member.id, extraDateInput)}
                      disabled={!extraDateInput}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-d4l-gold text-black hover:bg-d4l-gold-dark disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setAddingExtraFor(null); setExtraDateInput(''); }}
                      className="px-2 py-1.5 text-xs text-d4l-muted hover:text-d4l-text"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setAddingExtraFor(member.id); setExtraDateInput(''); }}
                    className="flex items-center gap-1.5 text-xs text-d4l-muted hover:text-d4l-gold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Date
                  </button>
                )}
              </div>
            )}

            {/* Manual Overtime section – monthly tab only */}
            {activeTab === 'monthly' && (
              <div className="ml-6 mt-4 max-w-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Timer className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-d4l-text2 uppercase tracking-wider">Manual Overtime</span>
                  {info.overtimeTotal > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400">{info.overtimeTotal}h</span>
                  )}
                </div>

                {/* List of overtime entries */}
                {info.overtimeEntries.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {info.overtimeEntries.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-d4l-surface rounded-lg border border-d4l-border px-3 py-2">
                        <span className="text-xs text-d4l-text flex-1">
                          {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                          <span className="text-cyan-400 font-semibold ml-2">+{entry.hours}h</span>
                          {entry.note && <span className="text-d4l-dim ml-2 italic">"{entry.note}"</span>}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeOvertime(member.id, idx); }}
                          className="p-1 rounded hover:bg-red-500/10 text-d4l-dim hover:text-red-400 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add overtime form */}
                {addingOvertimeFor === member.id ? (
                  <div className="space-y-2" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={overtimeDateInput}
                        onChange={e => setOvertimeDateInput(e.target.value)}
                        className="px-2 py-1.5 text-xs rounded-lg bg-d4l-surface border border-d4l-border text-d4l-text focus:outline-none focus:border-d4l-gold"
                      />
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        placeholder="Hours"
                        value={overtimeHoursInput}
                        onChange={e => setOvertimeHoursInput(e.target.value)}
                        className="w-20 px-2 py-1.5 text-xs rounded-lg bg-d4l-surface border border-d4l-border text-d4l-text focus:outline-none focus:border-d4l-gold"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Note (optional)"
                        value={overtimeNoteInput}
                        onChange={e => setOvertimeNoteInput(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-d4l-surface border border-d4l-border text-d4l-text focus:outline-none focus:border-d4l-gold"
                      />
                      <button
                        onClick={() => addOvertime(member.id)}
                        disabled={!overtimeDateInput || !overtimeHoursInput}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-d4l-gold text-black hover:bg-d4l-gold-dark disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setAddingOvertimeFor(null); setOvertimeDateInput(''); setOvertimeHoursInput(''); setOvertimeNoteInput(''); }}
                        className="px-2 py-1.5 text-xs text-d4l-muted hover:text-d4l-text"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setAddingOvertimeFor(member.id); setOvertimeDateInput(''); setOvertimeHoursInput(''); setOvertimeNoteInput(''); }}
                    className="flex items-center gap-1.5 text-xs text-d4l-muted hover:text-cyan-400 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Overtime
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Fragment>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-full mx-auto">

      {/* ===== HEADER ===== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 md:mb-6 section-animate">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide text-d4l-text" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            Pay Cycle Hours
          </h1>
          <p className="text-d4l-muted text-sm mt-0.5">
            {activeTab === 'monthly' ? 'Track hours per calendar month (1st — last day)' : 'Track hours per pay cycle (25th — 24th)'}
          </p>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          <button onClick={goToPrevCycle} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={goToCurrentCycle} className="px-2 md:px-3 py-1.5 text-xs md:text-sm bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow">
            This Cycle
          </button>
          <span className="text-xs md:text-sm font-medium text-d4l-text2 min-w-[160px] md:min-w-[220px] text-center">
            {activeTab === 'monthly' ? monthlyRange.label : cycleRange.label}
          </span>
          <button onClick={goToNextCycle} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ===== TAB SWITCHER ===== */}
      {monthlyStaff.length > 0 && (
        <div className="flex gap-1 mb-6 md:mb-8 bg-d4l-bg rounded-lg p-1 w-fit section-animate">
          <button
            onClick={() => setActiveTab('standard')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'standard'
                ? 'bg-d4l-surface text-d4l-text shadow-sm border border-d4l-border'
                : 'text-d4l-muted hover:text-d4l-text2'
            }`}
          >
            Standard Cycle
            <span className="ml-1.5 text-[10px] text-d4l-dim">25th — 24th</span>
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'monthly'
                ? 'bg-d4l-surface text-d4l-text shadow-sm border border-d4l-border'
                : 'text-d4l-muted hover:text-d4l-text2'
            }`}
          >
            Monthly Cycle
            <span className="ml-1.5 text-[10px] text-d4l-dim">1st — last day</span>
          </button>
        </div>
      )}

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
      {tabPermanent.length > 0 && (
        <div className="mb-8 section-animate section-animate-delay-1">
          <h2 className="text-lg font-semibold text-d4l-text mb-4 flex items-center gap-2 uppercase tracking-wider" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            <Clock className="w-5 h-5 text-green-400" />
            Permanent Staff — Hours Tracking
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tabPermanent.map(member => {
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
            {tabWeekKeys.map((wk, i) => (
              <span key={wk} className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium text-center">Wk {i + 1}</span>
            ))}
          </div>

          {/* Permanent group */}
          {tabPermanent.length > 0 && (
            <>
              <div className="px-4 py-2 border-l-[3px] border-l-green-500" style={{ background: 'rgba(34,197,94,0.04)' }}>
                <span className="text-xs font-semibold text-green-400 uppercase tracking-wider" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  Permanent Staff
                </span>
              </div>
              {tabPermanent.map(renderStaffRow)}
            </>
          )}

          {/* Part-time group */}
          {tabOther.length > 0 && (
            <>
              <div className="px-4 py-2 border-l-[3px] border-l-d4l-muted" style={{ background: 'rgba(138,128,112,0.04)' }}>
                <span className="text-xs font-semibold text-d4l-text2 uppercase tracking-wider" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  Part-time & Locum Staff
                </span>
              </div>
              {tabOther.map(renderStaffRow)}
            </>
          )}

          {/* Empty state */}
          {tabStaff.length === 0 && (
            <div className="px-4 py-12 text-center text-d4l-muted text-sm">
              No staff on this cycle type
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
