import { useState } from 'react';
import { BRANCHES, DAYS_OF_WEEK } from '../data/initialData';
import { CalendarOff, CalendarCheck, ChevronLeft, ChevronRight, Star, Info, Users } from 'lucide-react';

function formatWeekRange(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('en-ZA', opts)} - ${end.toLocaleDateString('en-ZA', { ...opts, year: 'numeric' })}`;
}

function getDateForDay(weekStart, dayIndex) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalDayOfMonth(weekStart, dayIndex) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  return d.getDate();
}

function isToday(weekStart, dayIndex) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function AvailabilityManager({
  staff, availability, setAvailability, shiftRequests, setShiftRequests,
  currentWeekStart, weekKey, goToPrevWeek, goToNextWeek, goToToday,
  staffFilter
}) {
  const [activeTab, setActiveTab] = useState('leave');
  const effectiveTab = staffFilter ? 'leave' : activeTab;
  const [selectedStaff, setSelectedStaff] = useState(null);

  const toggleLeave = (staffId, dateStr) => {
    setAvailability(prev => {
      const current = { ...prev };
      if (!current[staffId]) current[staffId] = [];
      if (current[staffId].includes(dateStr)) {
        current[staffId] = current[staffId].filter(d => d !== dateStr);
      } else {
        current[staffId] = [...current[staffId], dateStr];
      }
      return current;
    });
  };

  const setShiftRequest = (staffId, day, branchId) => {
    setShiftRequests(prev => {
      const current = { ...prev };
      if (!current[staffId]) current[staffId] = {};
      if (current[staffId][day] === branchId) {
        delete current[staffId][day];
      } else {
        current[staffId][day] = branchId;
      }
      return current;
    });
  };

  const visibleStaff = staffFilter ? staff.filter(s => s.id === staffFilter) : staff;
  const priorityStaff = visibleStaff.filter(s => s.priority);
  const nurses = visibleStaff.filter(s => s.role === 'nurse');
  const receptionists = visibleStaff.filter(s => s.role === 'receptionist');

  const countLeave = (members) => {
    let count = 0;
    members.forEach(m => {
      DAYS_OF_WEEK.forEach((_, i) => {
        const dateStr = getDateForDay(currentWeekStart, i);
        if (availability[m.id]?.includes(dateStr)) count++;
      });
    });
    return count;
  };

  const nurseLeaveCount = countLeave(nurses);
  const receptionistLeaveCount = countLeave(receptionists);

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

  const renderStaffRow = (member) => (
    <div key={member.id} className="contents group">
      {/* Name cell */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-d4l-surface border-b border-d4l-border/50 min-w-[160px] animate-fade-in">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-d4l-text text-sm truncate">{member.name}</span>
            {member.priority && <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
          </div>
          <span className="text-[10px] text-d4l-dim">{member.employmentType}</span>
        </div>
      </div>

      {/* Day cells */}
      {DAYS_OF_WEEK.map((day, i) => {
        const dateStr = getDateForDay(currentWeekStart, i);
        const isOff = availability[member.id]?.includes(dateStr);
        const dayRestricted = member.availableDays && !member.availableDays.includes(day);
        const today = isToday(currentWeekStart, i);

        return (
          <div
            key={day}
            className={`flex items-center justify-center p-1 border-b border-d4l-border/50 ${today ? 'bg-d4l-gold/[0.03]' : ''}`}
          >
            {dayRestricted ? (
              <div className="w-full h-10 flex items-center justify-center">
                <span className="text-[10px] text-d4l-dim/40">-</span>
              </div>
            ) : (
              <button
                onClick={() => toggleLeave(member.id, dateStr)}
                className={`w-full h-10 rounded-lg text-xs font-medium transition-all ${
                  isOff
                    ? 'bg-red-500/12 text-red-400 ring-1 ring-inset ring-red-500/25 hover:bg-red-500/20'
                    : 'bg-green-500/8 text-green-500/60 hover:bg-green-500/12 hover:text-green-400'
                }`}
              >
                {isOff ? 'OFF' : '\u2713'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between mb-6 section-animate">
        <div>
          <h1 className="text-3xl font-bold tracking-wide text-d4l-text" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            {staffFilter ? 'My Availability' : 'Availability & Requests'}
          </h1>
          <p className="text-d4l-muted text-sm mt-0.5">Mark leave days and shift requests for the week</p>
        </div>

        <div className="flex items-center gap-1 bg-d4l-surface border border-d4l-border rounded-xl px-1 py-1">
          <button onClick={goToPrevWeek} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-text2">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goToToday} className="px-3 py-1.5 text-xs bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow">
            This Week
          </button>
          <span className="text-xs font-medium text-d4l-text2 min-w-[160px] text-center px-2">
            {formatWeekRange(currentWeekStart)}
          </span>
          <button onClick={goToNextWeek} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-text2">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ===== STAT CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Total Staff */}
        <div className="stat-animate hover-lift panel-glow relative overflow-hidden bg-d4l-surface rounded-xl border border-d4l-border">
          <div className={`h-[2px] bg-gradient-to-r ${gradients.blue}`} />
          <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-40"
            style={{ background: `radial-gradient(circle at top right, ${glows.blue}, transparent 70%)` }} />
          <div className="p-5 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-d4l-muted font-medium">Total Staff</p>
                <p className="text-4xl font-bold tracking-wide count-animate mt-1 text-d4l-text"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {visibleStaff.length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
            </div>
            <p className="text-[11px] text-d4l-dim mt-2">{nurses.length} nurses, {receptionists.length} receptionists</p>
          </div>
        </div>

        {/* Nurse Leave Days */}
        <div className="stat-animate hover-lift panel-glow relative overflow-hidden bg-d4l-surface rounded-xl border border-d4l-border" style={{ animationDelay: '0.05s' }}>
          <div className={`h-[2px] bg-gradient-to-r ${nurseLeaveCount > 0 ? gradients.red : gradients.green}`} />
          <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-40"
            style={{ background: `radial-gradient(circle at top right, ${nurseLeaveCount > 0 ? glows.red : glows.green}, transparent 70%)` }} />
          <div className="p-5 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-d4l-muted font-medium">Nurse Leave Days</p>
                <p className={`text-4xl font-bold tracking-wide count-animate mt-1 ${nurseLeaveCount > 0 ? 'text-red-400' : 'text-green-400'}`}
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {nurseLeaveCount}
                </p>
              </div>
              <div className={`p-3 rounded-xl ${nurseLeaveCount > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                <CalendarOff className={`w-6 h-6 ${nurseLeaveCount > 0 ? 'text-red-400' : 'text-green-400'}`} />
              </div>
            </div>
            <p className="text-[11px] text-d4l-dim mt-2">this week</p>
          </div>
        </div>

        {/* Receptionist Leave Days */}
        <div className="stat-animate hover-lift panel-glow relative overflow-hidden bg-d4l-surface rounded-xl border border-d4l-border" style={{ animationDelay: '0.10s' }}>
          <div className={`h-[2px] bg-gradient-to-r ${receptionistLeaveCount > 0 ? gradients.amber : gradients.green}`} />
          <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-40"
            style={{ background: `radial-gradient(circle at top right, ${receptionistLeaveCount > 0 ? glows.amber : glows.green}, transparent 70%)` }} />
          <div className="p-5 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-d4l-muted font-medium">Receptionist Leave</p>
                <p className={`text-4xl font-bold tracking-wide count-animate mt-1 ${receptionistLeaveCount > 0 ? 'text-amber-400' : 'text-green-400'}`}
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {receptionistLeaveCount}
                </p>
              </div>
              <div className={`p-3 rounded-xl ${receptionistLeaveCount > 0 ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
                <CalendarOff className={`w-6 h-6 ${receptionistLeaveCount > 0 ? 'text-amber-400' : 'text-green-400'}`} />
              </div>
            </div>
            <p className="text-[11px] text-d4l-dim mt-2">this week</p>
          </div>
        </div>
      </div>

      {/* ===== TABS ===== */}
      <div className="flex items-center gap-3 mb-5 section-animate section-animate-delay-1">
        <div className="flex gap-1 bg-d4l-bg rounded-lg p-1">
          <button
            onClick={() => setActiveTab('leave')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              effectiveTab === 'leave' ? 'bg-d4l-gold text-black font-semibold shadow-sm' : 'text-d4l-text2 hover:text-d4l-text hover:bg-d4l-hover'
            }`}
          >
            <CalendarOff className="w-4 h-4" />
            Leave / Unavailable
          </button>
          {!staffFilter && (
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                effectiveTab === 'requests' ? 'bg-d4l-gold text-black font-semibold shadow-sm' : 'text-d4l-text2 hover:text-d4l-text hover:bg-d4l-hover'
              }`}
            >
              <CalendarCheck className="w-4 h-4" />
              Shift Requests
            </button>
          )}
        </div>
      </div>

      {/* ===== LEAVE GRID ===== */}
      {effectiveTab === 'leave' && (
        <div className="tab-content bg-d4l-surface rounded-xl border border-d4l-border overflow-hidden panel-glow section-animate section-animate-delay-2">
          <div className="overflow-x-auto">
            <div
              className="min-w-[700px]"
              style={{
                display: 'grid',
                gridTemplateColumns: '180px repeat(7, 1fr)',
              }}
            >
              {/* Header */}
              <div className="bg-d4l-bg/80 px-3 py-3 border-b border-d4l-border">
                <span className="text-xs font-semibold text-d4l-dim uppercase tracking-wider">Staff</span>
              </div>
              {DAYS_OF_WEEK.map((day, i) => {
                const today = isToday(currentWeekStart, i);
                return (
                  <div key={day} className={`bg-d4l-bg/80 text-center py-2.5 border-b border-d4l-border ${today ? 'border-b-2 border-b-d4l-gold' : ''}`}>
                    <div className={`text-xs font-semibold ${today ? 'text-d4l-gold' : 'text-d4l-text2'}`}>{day.slice(0, 3)}</div>
                    <div className={`text-[10px] mt-0.5 ${today ? 'text-d4l-gold/70' : 'text-d4l-dim'}`}>
                      {getLocalDayOfMonth(currentWeekStart, i)}
                    </div>
                  </div>
                );
              })}

              {/* Nurses section header */}
              <div className="col-span-8 px-3 py-2 bg-blue-500/5 border-b border-d4l-border/50 border-l-[3px] border-l-blue-500 flex items-center gap-2">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  Nurses
                </span>
                <span className="text-[10px] text-blue-400/60">({nurses.length})</span>
              </div>

              {nurses.map(member => renderStaffRow(member))}

              {/* Receptionists section header */}
              <div className="col-span-8 px-3 py-2 bg-pink-500/5 border-b border-d4l-border/50 border-l-[3px] border-l-pink-500 flex items-center gap-2">
                <span className="text-xs font-bold text-pink-400 uppercase tracking-wider" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  Receptionists
                </span>
                <span className="text-[10px] text-pink-400/60">({receptionists.length})</span>
              </div>

              {receptionists.map(member => renderStaffRow(member))}
            </div>
          </div>
        </div>
      )}

      {/* ===== SHIFT REQUESTS ===== */}
      {effectiveTab === 'requests' && (
        <div className="tab-content">
          {/* Info banner */}
          <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3 mb-4 animate-fade-in">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-400/80 leading-relaxed">
              <strong className="text-amber-400">Priority staff</strong> get all shifts they request. Select which branch they want to work at for each day.
            </p>
          </div>

          <div className="bg-d4l-surface rounded-xl border border-d4l-border overflow-hidden panel-glow">
            <div className="overflow-x-auto">
              <div
                className="min-w-[700px]"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '180px repeat(7, 1fr)',
                }}
              >
                {/* Header */}
                <div className="bg-d4l-bg/80 px-3 py-3 border-b border-d4l-border">
                  <span className="text-xs font-semibold text-d4l-dim uppercase tracking-wider">Staff</span>
                </div>
                {DAYS_OF_WEEK.map((day, i) => {
                  const today = isToday(currentWeekStart, i);
                  return (
                    <div key={day} className={`bg-d4l-bg/80 text-center py-2.5 border-b border-d4l-border ${today ? 'border-b-2 border-b-d4l-gold' : ''}`}>
                      <div className={`text-xs font-semibold ${today ? 'text-d4l-gold' : 'text-d4l-text2'}`}>{day.slice(0, 3)}</div>
                      <div className={`text-[10px] mt-0.5 ${today ? 'text-d4l-gold/70' : 'text-d4l-dim'}`}>
                        {getLocalDayOfMonth(currentWeekStart, i)}
                      </div>
                    </div>
                  );
                })}

                {/* Priority staff rows */}
                {priorityStaff.map(member => (
                  <div key={member.id} className="contents">
                    {/* Name */}
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-d4l-surface border-b border-d4l-border/50 animate-fade-in">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-d4l-text text-sm truncate">{member.name}</span>
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                        </div>
                        <span className="text-[10px] text-d4l-dim">{member.role}</span>
                      </div>
                    </div>

                    {/* Day selects */}
                    {DAYS_OF_WEEK.map((day, i) => {
                      const currentRequest = shiftRequests[member.id]?.[day];
                      const dayRestricted = member.availableDays && !member.availableDays.includes(day);
                      const today = isToday(currentWeekStart, i);

                      return (
                        <div key={day} className={`flex items-center p-1.5 border-b border-d4l-border/50 ${today ? 'bg-d4l-gold/[0.03]' : ''}`}>
                          {dayRestricted ? (
                            <div className="w-full text-center text-[10px] text-d4l-dim/40">-</div>
                          ) : (
                            <select
                              value={currentRequest || ''}
                              onChange={e => setShiftRequest(member.id, day, e.target.value || null)}
                              className={`w-full text-xs p-2 rounded-lg outline-none transition-colors ${
                                currentRequest
                                  ? 'bg-d4l-raised border border-d4l-hover text-d4l-text font-medium'
                                  : 'bg-transparent border border-d4l-border/50 text-d4l-dim hover:border-d4l-border'
                              } focus:ring-1 focus:ring-d4l-gold/40`}
                            >
                              <option value="">-</option>
                              {BRANCHES.filter(b => member.branches.includes(b.id)).map(branch => (
                                <option key={branch.id} value={branch.id}>
                                  {branch.name}{branch.id === member.mainBranch ? ' \u2605' : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {priorityStaff.length === 0 && (
                  <div className="col-span-8 text-center py-12 text-d4l-dim text-sm">
                    No priority staff members. Mark staff as priority in the Staff page.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
