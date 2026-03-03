import { useState, useMemo } from 'react';
import { BRANCHES, DAYS_OF_WEEK, isBranchOpen } from '../data/initialData';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { exportMonthToExcel } from '../utils/exportMonthlyExcel';

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
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function MonthlyCalendar({ schedules, staff }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [hoverInfo, setHoverInfo] = useState(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const goToPrevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const goToNextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToThisMonth = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const calendarWeeks = useMemo(() => {
    const weeks = [];
    const firstDay = new Date(year, month, 1);
    const startDate = getMonday(firstDay);
    for (let w = 0; w < 6; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + w * 7 + d);
        week.push(date);
      }
      if (weeks.length >= 4 && week[0].getMonth() !== month && week[6].getMonth() !== month) break;
      weeks.push(week);
    }
    return weeks;
  }, [year, month]);

  const getDayData = (date) => {
    const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
    const weekMonday = getMonday(date);
    const weekKey = formatDate(weekMonday);
    const daySchedule = schedules[weekKey]?.[dayName];
    if (!daySchedule) return null;

    const branches = [];
    BRANCHES.forEach(branch => {
      const open = isBranchOpen(branch.id, dayName);
      const cell = daySchedule[branch.id];
      const nurses = cell?.nurses || [];
      const receptionists = cell?.receptionists || [];
      const hasNurse = nurses.length > 0;
      const hasRec = receptionists.length > 0 || branch.isClinic;

      branches.push({
        id: branch.id,
        name: branch.name,
        color: branch.color,
        nurses,
        receptionists,
        hasNurse,
        hasRec,
        isClinic: branch.isClinic,
        open,
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

      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between mb-6 section-animate">
        <div>
          <h1 className="text-3xl font-bold tracking-wide text-d4l-text" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            Monthly Calendar
          </h1>
          <p className="text-d4l-muted text-sm mt-0.5">Bird's-eye view of the full month</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToPrevMonth} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={goToThisMonth} className="px-3 py-1.5 text-sm bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow">
            This Month
          </button>
          <span className="text-xl font-bold text-d4l-text min-w-[200px] text-center" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={goToNextMonth} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow ml-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* ===== LEGEND ===== */}
      <div className="flex items-center gap-5 mb-4 section-animate">
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-400" /><span className="text-[10px] text-d4l-dim">Fully staffed</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-400" /><span className="text-[10px] text-d4l-dim">Missing nurse</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="text-[10px] text-d4l-dim">Missing receptionist</span></div>
        <div className="w-px h-3 bg-d4l-border" />
        {BRANCHES.map(b => (
          <div key={b.id} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
            <span className="text-[10px] text-d4l-dim">{b.name}</span>
          </div>
        ))}
      </div>

      {/* ===== CALENDAR GRID ===== */}
      <div className="section-animate section-animate-delay-1 bg-d4l-surface rounded-xl border border-d4l-border overflow-hidden panel-glow">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-d4l-bg border-b border-d4l-border">
          {WEEKDAY_HEADERS.map(d => (
            <div key={d} className="p-2.5 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-d4l-muted">{d}</span>
            </div>
          ))}
        </div>

        {/* Week rows */}
        {calendarWeeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-d4l-border last:border-b-0">
            {week.map((date, di) => {
              const inMonth = isCurrentMonth(date);
              const dayData = getDayData(date);
              const todayHighlight = isToday(date);

              return (
                <div
                  key={di}
                  className={`min-h-[100px] p-2 border-r border-d4l-border last:border-r-0 transition-colors ${
                    inMonth ? '' : 'opacity-25'
                  } ${todayHighlight ? 'bg-d4l-gold/[0.04]' : 'hover:bg-d4l-hover/20'}`}
                  onMouseEnter={(e) => {
                    if (!inMonth || !dayData) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoverInfo({ date, dayData, rect });
                  }}
                  onMouseLeave={() => setHoverInfo(null)}
                >
                  {/* Day number */}
                  <div className="flex items-center gap-1 mb-1.5">
                    <span className={`text-sm font-bold ${
                      todayHighlight ? 'text-d4l-gold' : inMonth ? 'text-d4l-text' : 'text-d4l-dim'
                    }`}>
                      {date.getDate()}
                    </span>
                    {todayHighlight && <div className="h-[2px] w-4 bg-d4l-gold rounded-full" />}
                  </div>

                  {/* Branch dots */}
                  {dayData && inMonth && (
                    <div className="space-y-1">
                      {dayData.branches.map(b => {
                        if (!b.open) return null;
                        let dotClass = 'bg-green-400';
                        if (!b.hasNurse) dotClass = 'bg-red-400 pulse-dot';
                        else if (!b.hasRec && !b.isClinic) dotClass = 'bg-amber-400';

                        return (
                          <div key={b.id} className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full shrink-0 coverage-dot ${dotClass}`}
                              style={b.hasNurse && (b.hasRec || b.isClinic) ? { backgroundColor: b.color } : {}} />
                            <span className="text-[9px] text-d4l-dim truncate leading-tight">
                              {b.nurses.length > 0
                                ? b.nurses.map(n => n.name.split(' ')[0]).join(', ')
                                : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ===== HOVER TOOLTIP ===== */}
      {hoverInfo && (
        <div
          className="fixed z-50 bg-d4l-raised border border-d4l-border rounded-lg shadow-2xl p-3 min-w-[180px] animate-fade-in pointer-events-none"
          style={{
            top: Math.min(hoverInfo.rect.bottom + 8, window.innerHeight - 200),
            left: Math.min(Math.max(hoverInfo.rect.left + hoverInfo.rect.width / 2, 100), window.innerWidth - 200),
            transform: 'translateX(-50%)',
          }}
        >
          <p className="text-xs font-semibold text-d4l-text mb-2">
            {hoverInfo.dayData.dayName} — {hoverInfo.date.getDate()} {MONTH_NAMES[hoverInfo.date.getMonth()]}
          </p>
          <div className="space-y-2">
            {hoverInfo.dayData.branches.map(b => {
              if (!b.open) return null;
              return (
                <div key={b.id}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="text-[10px] font-semibold text-d4l-text2">{b.name}</span>
                  </div>
                  <div className="pl-3.5 space-y-0.5">
                    {b.nurses.length > 0
                      ? b.nurses.map(n => (
                        <p key={n.id} className="text-[10px] text-blue-300">{n.name}</p>
                      ))
                      : <p className="text-[10px] text-red-400">No nurse</p>}
                    {!b.isClinic && (
                      b.receptionists.length > 0
                        ? b.receptionists.map(r => (
                          <p key={r.id} className="text-[10px] text-pink-300">{r.name}</p>
                        ))
                        : <p className="text-[10px] text-amber-400">No receptionist</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-d4l-raised border-l border-t border-d4l-border rotate-45" />
        </div>
      )}
    </div>
  );
}
