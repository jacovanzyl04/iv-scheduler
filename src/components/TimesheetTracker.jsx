import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Users, CheckCircle2, Clock, FileCheck } from 'lucide-react';
import { isScheduleRole } from '../data/initialData';
import {
  getPayCycleForDate,
  getPayCycleRange,
  getScheduledStaffForPayCycle,
  getSupportStaffForPayCycle,
  getPrevPayCycle,
  getNextPayCycle,
} from '../utils/payCycle';

// Isolated input that uses local state while focused to prevent Firebase
// round-trip from overwriting text mid-typing. Syncs to parent on blur.
function NotesInput({ value, onChange, placeholder, className }) {
  const [localValue, setLocalValue] = useState(value || '');
  const [focused, setFocused] = useState(false);

  // Sync from parent when not focused (e.g. Firebase update while idle)
  useEffect(() => {
    if (!focused) setLocalValue(value || '');
  }, [value, focused]);

  return (
    <input
      type="text"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (localValue !== (value || '')) onChange(localValue);
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}

export default function TimesheetTracker({ staff, schedules, timesheets, setTimesheets }) {
  const [currentCycle, setCurrentCycle] = useState(() => getPayCycleForDate(new Date()));

  const cycleRange = useMemo(() => getPayCycleRange(currentCycle), [currentCycle]);

  const scheduledStaff = useMemo(
    () => getScheduledStaffForPayCycle(schedules, staff, currentCycle),
    [schedules, staff, currentCycle]
  );

  const supportStaff = useMemo(
    () => getSupportStaffForPayCycle(staff),
    [staff]
  );

  // Merge scheduled + support staff for totals
  const allStaff = useMemo(() => ({ ...scheduledStaff, ...supportStaff }), [scheduledStaff, supportStaff]);

  const cycleTimesheets = timesheets[currentCycle] || {};

  // Summary counts
  const staffEntries = Object.entries(allStaff);
  const totalStaff = staffEntries.length;
  const submittedCount = staffEntries.filter(([id]) => cycleTimesheets[id]?.status === 'submitted').length;
  const pendingCount = totalStaff - submittedCount;

  // Split by role
  const nurses = staffEntries.filter(([, info]) => info.role === 'nurse').sort((a, b) => a[1].name.localeCompare(b[1].name));
  const receptionists = staffEntries.filter(([, info]) => info.role === 'receptionist').sort((a, b) => a[1].name.localeCompare(b[1].name));
  const support = staffEntries.filter(([, info]) => !isScheduleRole(info.role)).sort((a, b) => a[1].name.localeCompare(b[1].name));

  const toggleStatus = (staffId) => {
    setTimesheets(prev => {
      const updated = { ...prev };
      if (!updated[currentCycle]) updated[currentCycle] = {};
      const current = updated[currentCycle][staffId] || { status: 'pending', submittedDate: null, notes: '' };

      if (current.status === 'pending') {
        updated[currentCycle] = {
          ...updated[currentCycle],
          [staffId]: { ...current, status: 'submitted', submittedDate: new Date().toISOString().split('T')[0] },
        };
      } else {
        updated[currentCycle] = {
          ...updated[currentCycle],
          [staffId]: { ...current, status: 'pending', submittedDate: null },
        };
      }
      return updated;
    });
  };

  const updateNotes = (staffId, notes) => {
    setTimesheets(prev => {
      const updated = { ...prev };
      if (!updated[currentCycle]) updated[currentCycle] = {};
      const current = updated[currentCycle][staffId] || { status: 'pending', submittedDate: null, notes: '' };
      updated[currentCycle] = {
        ...updated[currentCycle],
        [staffId]: { ...current, notes },
      };
      return updated;
    });
  };

  const goToPrevCycle = () => setCurrentCycle(getPrevPayCycle(currentCycle));
  const goToNextCycle = () => setCurrentCycle(getNextPayCycle(currentCycle));
  const goToCurrentCycle = () => setCurrentCycle(getPayCycleForDate(new Date()));

  const renderStaffRow = ([staffId, info]) => {
    const ts = cycleTimesheets[staffId] || { status: 'pending', submittedDate: null, notes: '' };
    const isSubmitted = ts.status === 'submitted';

    return (
      <tr
        key={staffId}
        className={`border-b border-gray-100 transition-colors ${
          isSubmitted ? 'bg-green-50/50' : 'bg-red-50/30'
        }`}
      >
        <td className="p-3">
          <div className="font-medium text-gray-800 text-sm">{info.name}</div>
          <div className="flex gap-1.5 mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              info.role === 'nurse' ? 'bg-blue-50 text-blue-600'
              : info.role === 'receptionist' ? 'bg-pink-50 text-pink-600'
              : 'bg-green-50 text-green-600'
            }`}>
              {info.role}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              info.employmentType === 'permanent' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-600'
            }`}>
              {info.employmentType}
            </span>
          </div>
        </td>
        <td className="p-3 text-center">
          {isScheduleRole(info.role)
            ? <span className="text-lg font-bold text-gray-800">{info.shifts}</span>
            : <span className="text-sm text-gray-400">—</span>
          }
        </td>
        <td className="p-3 text-center">
          {isScheduleRole(info.role)
            ? <span className="text-lg font-bold text-gray-800">{info.hours}h</span>
            : <span className="text-sm text-gray-400">—</span>
          }
        </td>
        <td className="p-3 text-center">
          <button
            onClick={() => toggleStatus(staffId)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              isSubmitted
                ? 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
                : 'bg-red-100 text-red-700 border border-red-300 hover:bg-red-200'
            }`}
          >
            {isSubmitted ? 'Submitted' : 'Pending'}
          </button>
        </td>
        <td className="p-3 text-center text-sm text-gray-500">
          {ts.submittedDate || <span className="text-gray-300">&mdash;</span>}
        </td>
        <td className="p-3">
          <NotesInput
            value={ts.notes}
            onChange={notes => updateNotes(staffId, notes)}
            placeholder="Add note..."
            className="w-full text-sm px-2 py-1 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
          />
        </td>
      </tr>
    );
  };

  return (
    <div className="p-6 max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Timesheets</h1>
          <p className="text-gray-500 text-sm">Track pay cycle timesheet submissions</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToPrevCycle} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goToCurrentCycle}
            className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            This Cycle
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-[220px] text-center">
            {cycleRange.label}
          </span>
          <button onClick={goToNextCycle} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Staff</p>
              <p className="text-2xl font-bold text-gray-800">{totalStaff}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Submitted</p>
              <p className="text-2xl font-bold text-green-600">{submittedCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Clock className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold text-red-600">{pendingCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Staff Table */}
      {totalStaff === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border text-center py-16">
          <FileCheck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">No staff scheduled in this pay cycle.</p>
          <p className="text-xs text-gray-300 mt-1">Schedule shifts in the Weekly Schedule to see staff here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-3 text-sm font-semibold text-gray-600 w-48">Staff Member</th>
                  <th className="text-center p-3 text-sm font-semibold text-gray-600 w-24">Shifts</th>
                  <th className="text-center p-3 text-sm font-semibold text-gray-600 w-24">Hours</th>
                  <th className="text-center p-3 text-sm font-semibold text-gray-600 w-32">Status</th>
                  <th className="text-center p-3 text-sm font-semibold text-gray-600 w-32">Submitted</th>
                  <th className="text-left p-3 text-sm font-semibold text-gray-600">Notes</th>
                </tr>
              </thead>
              <tbody>
                {nurses.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={6} className="bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 uppercase tracking-wide">
                        Nurses
                      </td>
                    </tr>
                    {nurses.map(renderStaffRow)}
                  </>
                )}
                {receptionists.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={6} className="bg-pink-50 px-3 py-1.5 text-xs font-semibold text-pink-700 uppercase tracking-wide">
                        Receptionists
                      </td>
                    </tr>
                    {receptionists.map(renderStaffRow)}
                  </>
                )}
                {support.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={6} className="bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 uppercase tracking-wide">
                        Support Staff
                      </td>
                    </tr>
                    {support.map(renderStaffRow)}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
