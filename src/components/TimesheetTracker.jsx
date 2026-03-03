import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Users, CheckCircle2, Clock, FileCheck, Upload, Paperclip, X, Loader2 } from 'lucide-react';
import { isScheduleRole } from '../data/initialData';
import {
  getPayCycleForDate,
  getPayCycleRange,
  getScheduledStaffForPayCycle,
  getSupportStaffForPayCycle,
  getPrevPayCycle,
  getNextPayCycle,
} from '../utils/payCycle';
import { uploadTimesheetFile, deleteTimesheetFile, runMonthlyCleanup } from '../utils/timesheetFiles';

const gradients = {
  blue: 'from-blue-500 to-cyan-400',
  green: 'from-green-500 to-emerald-400',
  red: 'from-red-500 to-rose-400',
  amber: 'from-amber-500 to-yellow-400',
};
const glows = {
  blue: 'rgba(59,130,246,0.07)',
  green: 'rgba(34,197,94,0.07)',
  red: 'rgba(239,68,68,0.07)',
  amber: 'rgba(245,158,11,0.07)',
};

function NotesInput({ value, onChange, placeholder, className }) {
  const [localValue, setLocalValue] = useState(value || '');
  const [focused, setFocused] = useState(false);

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

export default function TimesheetTracker({ staff, schedules, timesheets, setTimesheets, staffFilter }) {
  const [currentCycle, setCurrentCycle] = useState(() => getPayCycleForDate(new Date()));
  const [uploadingStaff, setUploadingStaff] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
  const uploadTargetStaff = useRef(null);

  useEffect(() => { runMonthlyCleanup(timesheets, setTimesheets); }, []);

  const cycleRange = useMemo(() => getPayCycleRange(currentCycle), [currentCycle]);
  const scheduledStaff = useMemo(() => getScheduledStaffForPayCycle(schedules, staff, currentCycle), [schedules, staff, currentCycle]);
  const supportStaff = useMemo(() => getSupportStaffForPayCycle(staff), [staff]);
  const allStaff = useMemo(() => ({ ...scheduledStaff, ...supportStaff }), [scheduledStaff, supportStaff]);

  const cycleTimesheets = timesheets[currentCycle] || {};
  const staffEntries = Object.entries(allStaff);
  const filteredEntries = staffFilter ? staffEntries.filter(([id]) => id === staffFilter) : staffEntries;
  const totalStaff = filteredEntries.length;
  const submittedCount = filteredEntries.filter(([id]) => cycleTimesheets[id]?.status === 'submitted').length;
  const pendingCount = totalStaff - submittedCount;
  const filesUploadedCount = filteredEntries.filter(([id]) => cycleTimesheets[id]?.fileUrl).length;

  const nurses = filteredEntries.filter(([, info]) => info.role === 'nurse').sort((a, b) => a[1].name.localeCompare(b[1].name));
  const receptionists = filteredEntries.filter(([, info]) => info.role === 'receptionist').sort((a, b) => a[1].name.localeCompare(b[1].name));
  const support = filteredEntries.filter(([, info]) => !isScheduleRole(info.role)).sort((a, b) => a[1].name.localeCompare(b[1].name));

  const toggleStatus = (staffId) => {
    setTimesheets(prev => {
      const updated = { ...prev };
      if (!updated[currentCycle]) updated[currentCycle] = {};
      const current = updated[currentCycle][staffId] || { status: 'pending', submittedDate: null, notes: '' };
      if (current.status === 'pending') {
        updated[currentCycle] = { ...updated[currentCycle], [staffId]: { ...current, status: 'submitted', submittedDate: new Date().toISOString().split('T')[0] } };
      } else {
        updated[currentCycle] = { ...updated[currentCycle], [staffId]: { ...current, status: 'pending', submittedDate: null } };
      }
      return updated;
    });
  };

  const updateNotes = (staffId, notes) => {
    setTimesheets(prev => {
      const updated = { ...prev };
      if (!updated[currentCycle]) updated[currentCycle] = {};
      const current = updated[currentCycle][staffId] || { status: 'pending', submittedDate: null, notes: '' };
      updated[currentCycle] = { ...updated[currentCycle], [staffId]: { ...current, notes } };
      return updated;
    });
  };

  const goToPrevCycle = () => setCurrentCycle(getPrevPayCycle(currentCycle));
  const goToNextCycle = () => setCurrentCycle(getNextPayCycle(currentCycle));
  const goToCurrentCycle = () => setCurrentCycle(getPayCycleForDate(new Date()));

  const handleUploadClick = (staffId) => {
    setUploadError(null);
    uploadTargetStaff.current = staffId;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const staffId = uploadTargetStaff.current;
    if (!staffId) return;
    setUploadingStaff(staffId);
    setUploadError(null);
    try {
      const { fileUrl, fileName } = await uploadTimesheetFile(currentCycle, staffId, file);
      setTimesheets(prev => {
        const updated = { ...prev };
        if (!updated[currentCycle]) updated[currentCycle] = {};
        const current = updated[currentCycle][staffId] || { status: 'pending', submittedDate: null, notes: '' };
        updated[currentCycle] = { ...updated[currentCycle], [staffId]: { ...current, fileUrl, fileName, status: 'submitted', submittedDate: new Date().toISOString().split('T')[0] } };
        return updated;
      });
    } catch (err) {
      setUploadError({ staffId, message: err.message });
    } finally {
      setUploadingStaff(null);
    }
  };

  const handleRemoveFile = async (staffId) => {
    try {
      await deleteTimesheetFile(currentCycle, staffId);
      setTimesheets(prev => {
        const updated = { ...prev };
        if (!updated[currentCycle]?.[staffId]) return prev;
        const { fileUrl, fileName, ...rest } = updated[currentCycle][staffId];
        updated[currentCycle] = { ...updated[currentCycle], [staffId]: { ...rest, status: 'pending', submittedDate: null } };
        return updated;
      });
    } catch (err) {
      console.error('Failed to remove file:', err);
    }
  };

  const renderStaffRow = ([staffId, info]) => {
    const ts = cycleTimesheets[staffId] || { status: 'pending', submittedDate: null, notes: '' };
    const isSubmitted = ts.status === 'submitted';

    return (
      <div key={staffId} className="row-animate grid items-center border-b border-d4l-border last:border-b-0 hover:bg-d4l-hover/30 transition-colors px-4 py-3"
        style={{ gridTemplateColumns: '1fr 70px 70px 110px 100px 1fr' }}>
        {/* Name + badges + file */}
        <div>
          <div className="flex items-center gap-2">
            {ts.fileUrl ? (
              <a href={ts.fileUrl} target="_blank" rel="noopener noreferrer"
                className="font-medium text-d4l-gold hover:underline text-sm truncate"
                title={`Open ${ts.fileName || 'timesheet'}`}>
                {info.name}
              </a>
            ) : (
              <span className="font-medium text-d4l-text text-sm">{info.name}</span>
            )}
            {ts.fileUrl && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-d4l-gold/10 text-d4l-gold border border-d4l-gold/20 shrink-0">
                <Paperclip className="w-2.5 h-2.5" />
                {(ts.fileName || 'file').slice(0, 12)}
              </span>
            )}
            {uploadingStaff === staffId ? (
              <Loader2 className="w-3.5 h-3.5 text-d4l-gold-dim animate-spin shrink-0" />
            ) : (
              <button onClick={() => handleUploadClick(staffId)} disabled={!!uploadingStaff}
                className="p-1 rounded-lg hover:bg-d4l-gold/10 transition-colors shrink-0" title={ts.fileUrl ? 'Replace file' : 'Upload timesheet'}>
                <Upload className={`w-3.5 h-3.5 ${uploadingStaff ? 'text-d4l-hover' : 'text-d4l-dim hover:text-d4l-gold'}`} />
              </button>
            )}
            {ts.fileUrl && (
              <button onClick={() => handleRemoveFile(staffId)} className="p-1 rounded-lg hover:bg-red-500/10 transition-colors shrink-0" title="Remove file">
                <X className="w-3.5 h-3.5 text-d4l-dim hover:text-red-400" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 mt-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${info.role === 'nurse' ? 'bg-blue-500/10 text-blue-400' : info.role === 'receptionist' ? 'bg-pink-500/10 text-pink-400' : 'bg-green-500/10 text-green-400'}`}>
              {info.role}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${info.employmentType === 'permanent' ? 'bg-green-500/10 text-green-400' : 'bg-d4l-raised text-d4l-dim'}`}>
              {info.employmentType}
            </span>
          </div>
          {uploadError?.staffId === staffId && (
            <p className="text-[10px] text-red-400 mt-1">{uploadError.message}</p>
          )}
        </div>

        {/* Shifts */}
        <div className="text-center">
          {isScheduleRole(info.role)
            ? <span className="text-sm font-bold text-d4l-text">{info.shifts}</span>
            : <span className="text-xs text-d4l-dim">—</span>}
        </div>

        {/* Hours */}
        <div className="text-center">
          {isScheduleRole(info.role)
            ? <span className="text-sm font-bold text-d4l-text">{info.hours}h</span>
            : <span className="text-xs text-d4l-dim">—</span>}
        </div>

        {/* Status */}
        <div className="text-center">
          {!staffFilter ? (
            <button onClick={() => toggleStatus(staffId)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                isSubmitted
                  ? 'bg-green-500/15 text-green-400 border border-green-500/20 hover:bg-green-500/25'
                  : 'bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25'
              }`}>
              {isSubmitted
                ? <><CheckCircle2 className="w-3 h-3" />Submitted</>
                : <><span className="w-1.5 h-1.5 rounded-full bg-red-400 pulse-dot" />Pending</>}
            </button>
          ) : (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              isSubmitted ? 'bg-green-500/15 text-green-400 border border-green-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'
            }`}>
              {isSubmitted ? <><CheckCircle2 className="w-3 h-3" />Submitted</> : <><span className="w-1.5 h-1.5 rounded-full bg-red-400 pulse-dot" />Pending</>}
            </span>
          )}
        </div>

        {/* Submitted date */}
        <div className="text-center text-xs text-d4l-muted">
          {ts.submittedDate || <span className="text-d4l-dim">—</span>}
        </div>

        {/* Notes */}
        <div>
          <NotesInput
            value={ts.notes}
            onChange={notes => updateNotes(staffId, notes)}
            placeholder="Add note..."
            className="w-full text-sm bg-transparent border-0 border-b border-d4l-border text-d4l-text placeholder:text-d4l-dim focus:border-d4l-gold focus:ring-0 outline-none py-1"
          />
        </div>
      </div>
    );
  };

  const renderRoleGroup = (label, entries, color) => {
    if (entries.length === 0) return null;
    return (
      <>
        <div className={`px-4 py-2 border-l-[3px]`} style={{ borderLeftColor: color, background: `${color}08` }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color, fontFamily: "'Bebas Neue', sans-serif" }}>
            {label}
          </span>
        </div>
        {entries.map(renderStaffRow)}
      </>
    );
  };

  return (
    <div className="p-6 max-w-full mx-auto">

      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between mb-8 section-animate">
        <div>
          <h1 className="text-3xl font-bold tracking-wide text-d4l-text" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            {staffFilter ? 'My Timesheet' : 'Timesheets'}
          </h1>
          <p className="text-d4l-muted text-sm mt-0.5">Track pay cycle timesheet submissions</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToPrevCycle} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={goToCurrentCycle} className="px-3 py-1.5 text-sm bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow">
            This Cycle
          </button>
          <span className="text-sm font-medium text-d4l-text2 min-w-[220px] text-center">
            {cycleRange.label}
          </span>
          <button onClick={goToNextCycle} className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ===== STAT CARDS ===== */}
      {!staffFilter && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { color: 'blue', icon: Users, label: 'Total Staff', value: totalStaff, sub: 'in this cycle', textColor: 'text-d4l-text' },
            { color: 'green', icon: CheckCircle2, label: 'Submitted', value: submittedCount, sub: `${totalStaff > 0 ? Math.round(submittedCount / totalStaff * 100) : 0}% complete`, textColor: 'text-green-400' },
            { color: 'red', icon: Clock, label: 'Pending', value: pendingCount, sub: 'awaiting submission', textColor: 'text-red-400' },
            { color: 'amber', icon: Paperclip, label: 'Files Uploaded', value: filesUploadedCount, sub: 'timesheets attached', textColor: 'text-d4l-gold' },
          ].map(({ color, icon: Icon, label, value, sub, textColor }) => (
            <div key={label} className="stat-animate hover-lift panel-glow relative overflow-hidden bg-d4l-surface rounded-xl border border-d4l-border">
              <div className={`h-[2px] bg-gradient-to-r ${gradients[color]}`} />
              <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-40"
                style={{ background: `radial-gradient(circle at top right, ${glows[color]}, transparent 70%)` }} />
              <div className="p-5 relative">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-d4l-muted font-medium">{label}</p>
                    <p className={`text-4xl font-bold tracking-wide count-animate mt-1 ${textColor}`} style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
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
      )}

      {/* ===== STAFF GRID ===== */}
      {totalStaff === 0 ? (
        <div className="section-animate bg-d4l-surface rounded-xl border border-d4l-border text-center py-16">
          <FileCheck className="w-12 h-12 mx-auto mb-3 text-d4l-dim" />
          <p className="text-sm text-d4l-dim">No staff scheduled in this pay cycle.</p>
          <p className="text-xs text-d4l-dim mt-1">Schedule shifts in the Weekly Schedule to see staff here.</p>
        </div>
      ) : (
        <div className="section-animate section-animate-delay-1 bg-d4l-surface rounded-xl border border-d4l-border overflow-hidden panel-glow">
          {/* Header row */}
          <div className="grid items-center bg-d4l-bg border-b border-d4l-border px-4 py-2.5"
            style={{ gridTemplateColumns: '1fr 70px 70px 110px 100px 1fr' }}>
            <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium">Staff Member</span>
            <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium text-center">Shifts</span>
            <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium text-center">Hours</span>
            <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium text-center">Status</span>
            <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium text-center">Submitted</span>
            <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium">Notes</span>
          </div>

          {/* Role groups */}
          {renderRoleGroup('Nurses', nurses, '#3b82f6')}
          {renderRoleGroup('Receptionists', receptionists, '#ec4899')}
          {renderRoleGroup('Support Staff', support, '#22c55e')}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={handleFileSelected} className="hidden" />
    </div>
  );
}
