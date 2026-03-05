import { useState } from 'react';
import { BRANCHES, DAYS_OF_WEEK, isBranchOpen } from '../data/initialData';
import { validateSchedule, calculateWeeklyHours } from '../utils/scheduler';
import { ChevronLeft, ChevronRight, AlertTriangle, AlertCircle, CheckCircle2, Users, Clock } from 'lucide-react';

function formatWeekRange(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('en-ZA', opts)} – ${end.toLocaleDateString('en-ZA', { ...opts, year: 'numeric' })}`;
}

const DAYS_MAP = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Dashboard({ schedule, staff, weekStartDate, currentWeekStart, goToPrevWeek, goToNextWeek, goToToday }) {
  const { warnings, errors } = validateSchedule(schedule, staff);
  const weeklyHours = calculateWeeklyHours(schedule, staff);

  const [hoverInfo, setHoverInfo] = useState(null);
  const [issuesOpen, setIssuesOpen] = useState(false);

  // Time greeting
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayName = DAYS_MAP[now.getDay()];

  // Is the user viewing the current week?
  const viewingCurrentWeek = (() => {
    const today = new Date();
    const viewStart = new Date(currentWeekStart);
    const viewEnd = new Date(viewStart);
    viewEnd.setDate(viewEnd.getDate() + 6);
    today.setHours(0, 0, 0, 0);
    viewStart.setHours(0, 0, 0, 0);
    viewEnd.setHours(0, 0, 0, 0);
    return today >= viewStart && today <= viewEnd;
  })();

  // Coverage stats
  let totalShifts = 0;
  let coveredSlots = 0;
  let totalSlots = 0;
  DAYS_OF_WEEK.forEach(day => {
    BRANCHES.forEach(branch => {
      if (!isBranchOpen(branch.id, day)) return;
      if (branch.isClinic) return;
      totalSlots += 2;
      const cell = schedule[day]?.[branch.id];
      if (cell?.nurses?.length > 0) { coveredSlots++; totalShifts += cell.nurses.length; }
      if (cell?.receptionists?.length > 0) { coveredSlots++; totalShifts += cell.receptionists.length; }
    });
  });
  // Also count clinic nurse shifts
  DAYS_OF_WEEK.forEach(day => {
    BRANCHES.forEach(branch => {
      if (!branch.isClinic || !isBranchOpen(branch.id, day)) return;
      const cell = schedule[day]?.[branch.id];
      if (cell?.nurses?.length > 0) totalShifts += cell.nurses.length;
    });
  });

  const coveragePercent = totalSlots > 0 ? Math.round((coveredSlots / totalSlots) * 100) : 0;

  const activeStaffIds = new Set();
  DAYS_OF_WEEK.forEach(day => {
    BRANCHES.forEach(branch => {
      const cell = schedule[day]?.[branch.id];
      cell?.nurses?.forEach(n => activeStaffIds.add(n.id));
      cell?.receptionists?.forEach(r => activeStaffIds.add(r.id));
    });
  });

  const totalIssues = errors.length + warnings.length;

  // Today's staffing data
  const todayData = viewingCurrentWeek ? BRANCHES.map(branch => {
    const open = isBranchOpen(branch.id, todayName);
    const cell = schedule[todayName]?.[branch.id];
    const nurses = cell?.nurses || [];
    const receptionists = cell?.receptionists || [];
    const hours = branch.hours?.[todayName];
    const missingNurse = open && nurses.length === 0;
    const missingRec = open && !branch.isClinic && receptionists.length === 0;

    return { branch, open, nurses, receptionists, hours, missingNurse, missingRec };
  }) : [];

  // Coverage color helpers
  const covColor = coveragePercent === 100 ? 'green' : coveragePercent > 80 ? 'amber' : 'red';
  const issColor = errors.length > 0 ? 'red' : warnings.length > 0 ? 'amber' : 'green';

  const gradients = {
    green: 'from-green-500 to-emerald-400',
    amber: 'from-amber-500 to-yellow-400',
    red: 'from-red-500 to-rose-400',
    blue: 'from-blue-500 to-cyan-400',
    purple: 'from-purple-500 to-violet-400',
  };

  const glows = {
    green: 'rgba(34,197,94,0.07)',
    amber: 'rgba(245,158,11,0.07)',
    red: 'rgba(239,68,68,0.07)',
    blue: 'rgba(59,130,246,0.07)',
    purple: 'rgba(139,92,246,0.07)',
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">

      {/* ===== SECTION 1: TOP BAR ===== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 md:mb-8 section-animate">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide text-d4l-text" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            {greeting}
          </h1>
          <p className="text-d4l-muted text-xs md:text-sm mt-0.5">
            {now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          <button onClick={goToPrevWeek} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={goToToday} className="px-3 py-1.5 text-xs md:text-sm bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow">
            Today
          </button>
          <span className="text-xs md:text-sm font-medium text-d4l-text2 min-w-[140px] md:min-w-[180px] text-center">
            {formatWeekRange(currentWeekStart)}
          </span>
          <button onClick={goToNextWeek} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ===== SECTION 2: PREMIUM STAT CARDS ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        {/* Coverage */}
        <div className="stat-animate hover-lift panel-glow relative overflow-hidden bg-d4l-surface rounded-xl border border-d4l-border">
          <div className={`h-[2px] bg-gradient-to-r ${gradients[covColor]}`} />
          <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-40"
            style={{ background: `radial-gradient(circle at top right, ${glows[covColor]}, transparent 70%)` }} />
          <div className="p-5 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-d4l-muted font-medium">Coverage</p>
                <p className={`text-4xl font-bold tracking-wide count-animate mt-1 ${covColor === 'green' ? 'text-green-400' : covColor === 'amber' ? 'text-amber-400' : 'text-red-400'}`}
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {coveragePercent}<span className="text-xl">%</span>
                </p>
              </div>
              <div className={`p-3 rounded-xl ${covColor === 'green' ? 'bg-green-500/10' : covColor === 'amber' ? 'bg-amber-500/10' : 'bg-red-500/10'}`}>
                <CheckCircle2 className={`w-6 h-6 ${covColor === 'green' ? 'text-green-400' : covColor === 'amber' ? 'text-amber-400' : 'text-red-400'}`} />
              </div>
            </div>
            <p className="text-[11px] text-d4l-dim mt-2">{coveredSlots} of {totalSlots} slots filled</p>
          </div>
        </div>

        {/* Active Staff */}
        <div className="stat-animate hover-lift panel-glow relative overflow-hidden bg-d4l-surface rounded-xl border border-d4l-border">
          <div className={`h-[2px] bg-gradient-to-r ${gradients.blue}`} />
          <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-40"
            style={{ background: `radial-gradient(circle at top right, ${glows.blue}, transparent 70%)` }} />
          <div className="p-5 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-d4l-muted font-medium">Active Staff</p>
                <p className="text-4xl font-bold tracking-wide count-animate mt-1 text-d4l-text"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {activeStaffIds.size}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
            </div>
            <p className="text-[11px] text-d4l-dim mt-2">across {BRANCHES.length} branches</p>
          </div>
        </div>

        {/* Total Shifts */}
        <div className="stat-animate hover-lift panel-glow relative overflow-hidden bg-d4l-surface rounded-xl border border-d4l-border">
          <div className={`h-[2px] bg-gradient-to-r ${gradients.purple}`} />
          <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-40"
            style={{ background: `radial-gradient(circle at top right, ${glows.purple}, transparent 70%)` }} />
          <div className="p-5 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-d4l-muted font-medium">Total Shifts</p>
                <p className="text-4xl font-bold tracking-wide count-animate mt-1 text-d4l-text"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {totalShifts}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-purple-500/10">
                <Clock className="w-6 h-6 text-purple-400" />
              </div>
            </div>
            <p className="text-[11px] text-d4l-dim mt-2">this week</p>
          </div>
        </div>

        {/* Issues */}
        <div className="stat-animate hover-lift panel-glow relative overflow-hidden bg-d4l-surface rounded-xl border border-d4l-border">
          <div className={`h-[2px] bg-gradient-to-r ${gradients[issColor]}`} />
          <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-40"
            style={{ background: `radial-gradient(circle at top right, ${glows[issColor]}, transparent 70%)` }} />
          <div className="p-5 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-d4l-muted font-medium">Issues</p>
                <p className={`text-4xl font-bold tracking-wide count-animate mt-1 ${issColor === 'green' ? 'text-green-400' : issColor === 'amber' ? 'text-amber-400' : 'text-red-400'}`}
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {totalIssues}
                </p>
              </div>
              <div className={`p-3 rounded-xl ${issColor === 'green' ? 'bg-green-500/10' : issColor === 'amber' ? 'bg-amber-500/10' : 'bg-red-500/10'}`}>
                {totalIssues === 0
                  ? <CheckCircle2 className="w-6 h-6 text-green-400" />
                  : <AlertTriangle className={`w-6 h-6 ${errors.length > 0 ? 'text-red-400' : 'text-amber-400'}`} />}
              </div>
            </div>
            <p className="text-[11px] text-d4l-dim mt-2">
              {errors.length > 0
                ? `${errors.length} error${errors.length > 1 ? 's' : ''}, ${warnings.length} warning${warnings.length > 1 ? 's' : ''}`
                : warnings.length > 0
                  ? `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`
                  : 'All clear'}
            </p>
          </div>
        </div>
      </div>

      {/* ===== SECTION 3: TODAY'S FOCUS ===== */}
      {viewingCurrentWeek && (
        <div className="mb-8 section-animate section-animate-delay-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 pulse-dot" />
              <h2 className="text-lg font-semibold text-d4l-text uppercase tracking-wider"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                Today's Staffing
              </h2>
            </div>
            <span className="text-xs text-d4l-dim">
              {todayName} {now.getDate()} {now.toLocaleDateString('en-ZA', { month: 'short' })}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {todayData.map(({ branch, open, nurses, receptionists, hours, missingNurse, missingRec }) => (
              <div key={branch.id}
                className={`card-animate relative overflow-hidden rounded-xl border bg-d4l-surface hover-lift panel-glow ${!open ? 'opacity-40' : ''}`}
                style={{ borderColor: open ? `${branch.color}20` : undefined }}
              >
                {/* Colored top strip */}
                <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${branch.color}, ${branch.color}66)` }} />

                <div className="p-4">
                  {/* Branch header */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: branch.color }} />
                    <span className="text-sm font-semibold text-d4l-text">{branch.name}</span>
                    {!open && (
                      <span className="ml-auto text-[10px] text-d4l-dim bg-d4l-raised px-2 py-0.5 rounded-full">Closed</span>
                    )}
                    {open && hours && (
                      <span className="ml-auto text-[10px] text-d4l-dim">{hours.open} – {hours.close}</span>
                    )}
                  </div>

                  {open ? (
                    <div className="space-y-2">
                      {/* Nurses */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider text-d4l-dim w-10 shrink-0">Nurse</span>
                        {nurses.length > 0 ? nurses.map(n => (
                          <span key={n.id} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/20">
                            {n.name}
                          </span>
                        )) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 flex items-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 pulse-dot" />
                            Missing
                          </span>
                        )}
                      </div>

                      {/* Receptionists (skip for clinic) */}
                      {!branch.isClinic && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase tracking-wider text-d4l-dim w-10 shrink-0">Recep</span>
                          {receptionists.length > 0 ? receptionists.map(r => (
                            <span key={r.id} className="text-xs px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/20">
                              {r.name}
                            </span>
                          )) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot" />
                              Missing
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-d4l-dim">Not operating today</p>
                  )}
                </div>

                {/* Pulsing ring for critical missing nurse */}
                {open && missingNurse && (
                  <div className="absolute inset-0 rounded-xl ring-2 ring-inset ring-red-500/30 pointer-events-none" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== SECTION 4: WEEK AT A GLANCE ===== */}
      <div className="mb-8 section-animate section-animate-delay-2">
        <h2 className="text-lg font-semibold text-d4l-text mb-4 uppercase tracking-wider"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          Week at a Glance
        </h2>

        <div className="bg-d4l-surface rounded-xl border border-d4l-border overflow-hidden panel-glow">
          <div className="overflow-x-auto">
          <div className="min-w-[600px]">
          {/* Day headers */}
          <div className="grid border-b border-d4l-border bg-d4l-bg" style={{ gridTemplateColumns: '120px repeat(7, 1fr)' }}>
            <div className="p-2 md:p-3 text-[10px] text-d4l-dim font-medium uppercase tracking-wider">Branch</div>
            {DAYS_OF_WEEK.map((day, i) => {
              const d = new Date(currentWeekStart);
              d.setDate(d.getDate() + i);
              const isTodayCol = viewingCurrentWeek && d.toDateString() === now.toDateString();
              return (
                <div key={day} className={`p-3 text-center ${isTodayCol ? 'bg-d4l-gold/5' : ''}`}>
                  <div className={`text-[10px] font-semibold uppercase ${isTodayCol ? 'text-d4l-gold' : 'text-d4l-muted'}`}>
                    {day.slice(0, 3)}
                  </div>
                  <div className={`text-sm font-bold ${isTodayCol ? 'text-d4l-gold' : 'text-d4l-text2'}`}>
                    {d.getDate()}
                  </div>
                  {isTodayCol && <div className="h-[2px] bg-d4l-gold rounded-full mt-1 mx-auto w-4" />}
                </div>
              );
            })}
          </div>

          {/* Branch rows */}
          {BRANCHES.map(branch => (
            <div key={branch.id}
              className="row-animate grid border-b border-d4l-border last:border-b-0 hover:bg-d4l-hover/30 transition-colors"
              style={{ gridTemplateColumns: '120px repeat(7, 1fr)' }}
            >
              {/* Branch name */}
              <div className="p-3 flex items-center gap-2.5 border-l-[3px]"
                style={{ borderLeftColor: branch.color }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: branch.color }} />
                <span className="text-sm font-medium text-d4l-text">{branch.name}</span>
              </div>

              {/* Day cells */}
              {DAYS_OF_WEEK.map((day, i) => {
                const open = isBranchOpen(branch.id, day);
                const cell = schedule[day]?.[branch.id];
                const nurses = cell?.nurses || [];
                const receptionists = cell?.receptionists || [];
                const d = new Date(currentWeekStart);
                d.setDate(d.getDate() + i);
                const isTodayCol = viewingCurrentWeek && d.toDateString() === now.toDateString();

                let status = 'closed';
                if (open) {
                  const hasNurse = nurses.length > 0;
                  const hasRec = receptionists.length > 0;
                  if (branch.isClinic) {
                    status = hasNurse ? 'full' : 'no-nurse';
                  } else if (hasNurse && hasRec) {
                    status = 'full';
                  } else if (hasNurse && !hasRec) {
                    status = 'no-rec';
                  } else {
                    status = 'no-nurse';
                  }
                }

                const dotClass = {
                  closed: 'bg-d4l-dim/30',
                  full: 'bg-green-400',
                  'no-nurse': 'bg-red-400',
                  'no-rec': 'bg-amber-400',
                }[status];

                return (
                  <div key={day}
                    className={`p-3 flex items-center justify-center relative group cursor-default ${isTodayCol ? 'bg-d4l-gold/[0.03]' : ''}`}
                    onMouseEnter={(e) => {
                      if (!open) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoverInfo({ branchId: branch.id, day, nurses, receptionists, rect, branchName: branch.name, isClinic: branch.isClinic });
                    }}
                    onMouseLeave={() => setHoverInfo(null)}
                    onClick={(e) => {
                      if (!open) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoverInfo(prev =>
                        prev?.branchId === branch.id && prev?.day === day ? null
                        : { branchId: branch.id, day, nurses, receptionists, rect, branchName: branch.name, isClinic: branch.isClinic }
                      );
                    }}
                  >
                    <div className={`w-3 h-3 rounded-full coverage-dot ${dotClass} ${status === 'no-nurse' ? 'pulse-dot' : ''}`} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        </div>{/* end min-w */}
        </div>{/* end overflow-x-auto */}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 md:gap-5 mt-3 px-1">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-400" /><span className="text-[10px] text-d4l-dim">Fully staffed</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="text-[10px] text-d4l-dim">Missing receptionist</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-400" /><span className="text-[10px] text-d4l-dim">Missing nurse</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-d4l-dim/30" /><span className="text-[10px] text-d4l-dim">Closed</span></div>
        </div>
      </div>

      {/* ===== SECTION 5: ISSUES (Collapsible) ===== */}
      {totalIssues > 0 && (
        <div className="section-animate section-animate-delay-3 mb-4">
          <button
            onClick={() => setIssuesOpen(!issuesOpen)}
            className="w-full flex items-center justify-between p-4 bg-d4l-surface rounded-xl border border-d4l-border hover:bg-d4l-hover transition-colors panel-glow"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className={`w-5 h-5 ${errors.length > 0 ? 'text-red-400' : 'text-amber-400'}`} />
              <span className="text-sm font-semibold text-d4l-text">Schedule Issues</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${errors.length > 0 ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                {totalIssues}
              </span>
            </div>
            <ChevronRight className={`w-4 h-4 text-d4l-muted transition-transform duration-200 ${issuesOpen ? 'rotate-90' : ''}`} />
          </button>

          {issuesOpen && (
            <div className="mt-2 bg-d4l-surface rounded-xl border border-d4l-border p-4 space-y-2 animate-fade-in">
              {errors.map((err, i) => (
                <div key={`e-${i}`} className="flex items-start gap-2 text-red-400 bg-red-500/10 p-2.5 rounded-lg">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="text-sm">{err}</span>
                </div>
              ))}
              {warnings.map((warn, i) => (
                <div key={`w-${i}`} className="flex items-start gap-2 text-amber-400 bg-amber-500/10 p-2.5 rounded-lg">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="text-sm">{warn}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All clear banner */}
      {totalIssues === 0 && totalShifts > 0 && (
        <div className="section-animate section-animate-delay-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium text-sm">All good — no scheduling issues this week.</span>
          </div>
        </div>
      )}

      {/* ===== HOVER TOOLTIP ===== */}
      {hoverInfo && (
        <div
          className="fixed z-50 bg-d4l-raised border border-d4l-border rounded-lg shadow-2xl p-3 min-w-[160px] animate-fade-in"
          style={{
            top: hoverInfo.rect.bottom + 8,
            left: hoverInfo.rect.left + hoverInfo.rect.width / 2,
            transform: 'translateX(-50%)',
          }}
        >
          <p className="text-xs font-semibold text-d4l-text mb-2">{hoverInfo.branchName} — {hoverInfo.day}</p>
          <div className="space-y-1.5">
            {hoverInfo.nurses.length > 0 ? (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-blue-400 font-medium">Nurses</span>
                {hoverInfo.nurses.map(n => (
                  <p key={n.id} className="text-xs text-d4l-text2">{n.name}{n.shiftStart ? ` (${n.shiftStart}–${n.shiftEnd})` : ''}</p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-red-400">No nurse assigned</p>
            )}
            {!hoverInfo.isClinic && (
              hoverInfo.receptionists.length > 0 ? (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-pink-400 font-medium">Receptionists</span>
                  {hoverInfo.receptionists.map(r => (
                    <p key={r.id} className="text-xs text-d4l-text2">{r.name}</p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-amber-400">No receptionist assigned</p>
              )
            )}
          </div>
          {/* Tooltip arrow */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-d4l-raised border-l border-t border-d4l-border rotate-45" />
        </div>
      )}
    </div>
  );
}
