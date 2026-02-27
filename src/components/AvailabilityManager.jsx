import { useState } from 'react';
import { BRANCHES, DAYS_OF_WEEK } from '../data/initialData';
import { CalendarOff, CalendarCheck, ChevronLeft, ChevronRight, Star } from 'lucide-react';

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
  // Use local date to avoid UTC timezone shift
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

export default function AvailabilityManager({
  staff, availability, setAvailability, shiftRequests, setShiftRequests,
  currentWeekStart, weekKey, goToPrevWeek, goToNextWeek, goToToday
}) {
  const [activeTab, setActiveTab] = useState('leave'); // 'leave' or 'requests'
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

  const priorityStaff = staff.filter(s => s.priority);
  const nurses = staff.filter(s => s.role === 'nurse');
  const receptionists = staff.filter(s => s.role === 'receptionist');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Availability & Requests</h1>
          <p className="text-gray-500 text-sm">Mark leave days and shift requests for the week</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToPrevWeek} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={goToToday} className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
            This Week
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
            {formatWeekRange(currentWeekStart)}
          </span>
          <button onClick={goToNextWeek} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('leave')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'leave' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <CalendarOff className="w-4 h-4" />
          Leave / Unavailable
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'requests' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          Shift Requests (Priority Staff)
        </button>
      </div>

      {activeTab === 'leave' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-3 text-sm font-semibold text-gray-600 w-44">Staff Member</th>
                  {DAYS_OF_WEEK.map((day, i) => (
                    <th key={day} className="text-center p-3 text-sm font-semibold text-gray-600">
                      <div>{day.slice(0, 3)}</div>
                      <div className="text-xs font-normal text-gray-400">
                        {getLocalDayOfMonth(currentWeekStart, i)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Nurses section */}
                <tr>
                  <td colSpan={8} className="bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 uppercase tracking-wide">
                    Nurses
                  </td>
                </tr>
                {nurses.map(member => (
                  <tr key={member.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-800 text-sm">{member.name}</span>
                        {member.priority && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                      </div>
                      <span className="text-xs text-gray-500">{member.employmentType}</span>
                    </td>
                    {DAYS_OF_WEEK.map((day, i) => {
                      const dateStr = getDateForDay(currentWeekStart, i);
                      const isOff = availability[member.id]?.includes(dateStr);
                      const dayRestricted = member.availableDays && !member.availableDays.includes(day);

                      return (
                        <td key={day} className="p-1 text-center">
                          {dayRestricted ? (
                            <div className="w-full h-10 flex items-center justify-center">
                              <span className="text-xs text-gray-300">N/A</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => toggleLeave(member.id, dateStr)}
                              className={`w-full h-10 rounded-lg text-xs font-medium transition-all ${
                                isOff
                                  ? 'bg-red-100 text-red-700 border-2 border-red-300 hover:bg-red-200'
                                  : 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'
                              }`}
                            >
                              {isOff ? 'OFF' : '✓'}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Receptionists section */}
                <tr>
                  <td colSpan={8} className="bg-pink-50 px-3 py-1.5 text-xs font-semibold text-pink-700 uppercase tracking-wide">
                    Receptionists
                  </td>
                </tr>
                {receptionists.map(member => (
                  <tr key={member.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3">
                      <div className="font-medium text-gray-800 text-sm">{member.name}</div>
                      <span className="text-xs text-gray-500">{member.employmentType}</span>
                    </td>
                    {DAYS_OF_WEEK.map((day, i) => {
                      const dateStr = getDateForDay(currentWeekStart, i);
                      const isOff = availability[member.id]?.includes(dateStr);
                      const dayRestricted = member.availableDays && !member.availableDays.includes(day);

                      return (
                        <td key={day} className="p-1 text-center">
                          {dayRestricted ? (
                            <div className="w-full h-10 flex items-center justify-center">
                              <span className="text-xs text-gray-300">N/A</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => toggleLeave(member.id, dateStr)}
                              className={`w-full h-10 rounded-lg text-xs font-medium transition-all ${
                                isOff
                                  ? 'bg-red-100 text-red-700 border-2 border-red-300 hover:bg-red-200'
                                  : 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'
                              }`}
                            >
                              {isOff ? 'OFF' : '✓'}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'requests' && (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-amber-800">
              <strong>Priority staff</strong> (Nneka, Dinah, Ntombi) get all shifts they request.
              Select which branch they want to work at for each day.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-3 text-sm font-semibold text-gray-600 w-44">Staff Member</th>
                    {DAYS_OF_WEEK.map((day, i) => (
                      <th key={day} className="text-center p-3 text-sm font-semibold text-gray-600">
                        <div>{day.slice(0, 3)}</div>
                        <div className="text-xs font-normal text-gray-400">
                          {getLocalDayOfMonth(currentWeekStart, i)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {priorityStaff.map(member => (
                    <tr key={member.id} className="border-b border-gray-100">
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-800 text-sm">{member.name}</span>
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        </div>
                        <span className="text-xs text-gray-500">{member.role}</span>
                      </td>
                      {DAYS_OF_WEEK.map(day => {
                        const currentRequest = shiftRequests[member.id]?.[day];
                        const dayRestricted = member.availableDays && !member.availableDays.includes(day);

                        return (
                          <td key={day} className="p-1">
                            {dayRestricted ? (
                              <div className="text-center text-xs text-gray-300">N/A</div>
                            ) : (
                              <select
                                value={currentRequest || ''}
                                onChange={e => setShiftRequest(member.id, day, e.target.value || null)}
                                className="w-full text-xs p-1.5 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                              >
                                <option value="">— No request —</option>
                                {BRANCHES.filter(b => member.branches.includes(b.id)).map(branch => (
                                  <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                    {branch.id === member.mainBranch ? ' ★' : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {priorityStaff.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-gray-400 text-sm">
                        No priority staff members. Mark staff as priority in the Staff page.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
