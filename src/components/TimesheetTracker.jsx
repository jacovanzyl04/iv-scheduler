import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Users, CheckCircle2, Clock, FileCheck, Upload, Paperclip, X, Loader2, History, MoreVertical, BellRing, BellOff, Wallet, Send, Trash2 } from 'lucide-react';
import { isScheduleRole } from '../data/initialData';
import EmptyState from './EmptyState';
import {
  getPayCycleForDate,
  getPayCycleRange,
  getScheduledStaffForPayCycle,
  getSupportStaffForPayCycle,
  getPrevPayCycle,
  getNextPayCycle,
} from '../utils/payCycle';
import { uploadTimesheetFile, deleteTimesheetFile, runMonthlyCleanup, getTimesheetFiles } from '../utils/timesheetFiles';
import { uploadPayslipFile } from '../utils/payslipFiles';
import { useAudit, useAudits } from '../contexts/AuditContext';
import { useCan } from '../contexts/PermissionsContext';
import PageTabs from './PageTabs';
import AuditLogPanel from './AuditLogPanel';

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

export default function TimesheetTracker({ staff, schedules, timesheets, setTimesheets, payslips, setPayslips, currentUser, staffName, staffFilter }) {
  const audit = useAudit();
  const allAudits = useAudits();
  const [pageTab, setPageTab] = useState('main');
  const { canWrite } = useCan('Timesheets');
  const domainAuditsCount = useMemo(() => {
    return Object.values(allAudits || {}).filter(a => a.domain === 'timesheets' || a.domain === 'payslips').length;
  }, [allAudits]);
  // Default the payslip view to the PREVIOUS cycle — payslips are issued
  // for the period just finished, not the one currently in progress.
  const [currentCycle, setCurrentCycle] = useState(() => getPayCycleForDate(new Date()));
  const [payslipCycle, setPayslipCycle] = useState(() => getPrevPayCycle(getPayCycleForDate(new Date())));
  const [uploadingStaff, setUploadingStaff] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
  const uploadTargetStaff = useRef(null);
  // Which uploader is using the hidden <input>: 'timesheet' or 'payslip'
  const uploadMode = useRef('timesheet');

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
  const filesUploadedCount = filteredEntries.filter(([id]) => getTimesheetFiles(cycleTimesheets[id]).length > 0).length;

  const nurses = filteredEntries.filter(([, info]) => info.role === 'nurse').sort((a, b) => a[1].name.localeCompare(b[1].name));
  const receptionists = filteredEntries.filter(([, info]) => info.role === 'receptionist').sort((a, b) => a[1].name.localeCompare(b[1].name));
  const support = filteredEntries.filter(([, info]) => !isScheduleRole(info.role)).sort((a, b) => a[1].name.localeCompare(b[1].name));

  const toggleStatus = (staffId) => {
    if (!canWrite) return;
    let fromStatus = 'pending';
    let toStatus = 'submitted';
    setTimesheets(prev => {
      const updated = { ...prev };
      if (!updated[currentCycle]) updated[currentCycle] = {};
      const current = updated[currentCycle][staffId] || { status: 'pending', submittedDate: null, notes: '' };
      fromStatus = current.status;
      if (current.status === 'pending') {
        toStatus = 'submitted';
        updated[currentCycle] = { ...updated[currentCycle], [staffId]: { ...current, status: 'submitted', submittedDate: new Date().toISOString().split('T')[0] } };
      } else {
        toStatus = 'pending';
        updated[currentCycle] = { ...updated[currentCycle], [staffId]: { ...current, status: 'pending', submittedDate: null } };
      }
      return updated;
    });
    const member = staff.find(s => s.id === staffId);
    audit({
      domain: 'timesheets',
      action: 'status_changed',
      targetId: staffId,
      targetLabel: member?.name || staffId,
      changes: [{ field: 'Status', from: fromStatus, to: toStatus }],
      details: [`Cycle: ${currentCycle}`],
    });
  };

  const updateNotes = (staffId, notes) => {
    if (!canWrite) return;
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

  const handleUploadClick = (staffId, mode = 'timesheet') => {
    if (!canWrite) return;
    setUploadError(null);
    uploadTargetStaff.current = staffId;
    uploadMode.current = mode;
    // Payslip upload = single file, Timesheet upload = multi-file.
    fileInputRef.current.multiple = mode === 'timesheet';
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  };

  const handleFileSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const staffId = uploadTargetStaff.current;
    if (!staffId) return;
    if (uploadMode.current === 'payslip') {
      await uploadPayslipBatch(staffId, files);
      return;
    }
    setUploadingStaff(staffId);
    setUploadError(null);
    const uploaded = [];
    try {
      // Upload sequentially so a failure mid-batch doesn't leave us with a
      // half-applied state update. Each Cloudinary public_id includes a
      // Date.now() suffix so concurrent uploads wouldn't collide anyway.
      for (const file of files) {
        const { fileUrl, fileName } = await uploadTimesheetFile(currentCycle, staffId, file);
        uploaded.push({ fileUrl, fileName, uploadedAt: new Date().toISOString() });
      }
      setTimesheets(prev => {
        const updated = { ...prev };
        if (!updated[currentCycle]) updated[currentCycle] = {};
        const current = updated[currentCycle][staffId] || { status: 'pending', submittedDate: null, notes: '' };
        // Merge with any existing files (including legacy single-file shape)
        // and drop the legacy fileUrl/fileName keys going forward.
        const existing = getTimesheetFiles(current);
        const { fileUrl: _oldUrl, fileName: _oldName, ...rest } = current;
        const nextFiles = [...existing, ...uploaded];
        updated[currentCycle] = {
          ...updated[currentCycle],
          [staffId]: {
            ...rest,
            files: nextFiles,
            status: 'submitted',
            submittedDate: new Date().toISOString().split('T')[0],
          },
        };
        return updated;
      });
      const member = staff.find(s => s.id === staffId);
      audit({
        domain: 'timesheets',
        action: 'file_uploaded',
        targetId: staffId,
        targetLabel: member?.name || staffId,
        details: [
          `Cycle: ${currentCycle}`,
          `Files: ${uploaded.map(f => f.fileName).join(', ')}`,
        ],
      });
    } catch (err) {
      setUploadError({ staffId, message: err.message });
      // Keep any files that succeeded before the error so the user doesn't
      // lose work from earlier iterations of the batch.
      if (uploaded.length) {
        setTimesheets(prev => {
          const updated = { ...prev };
          if (!updated[currentCycle]) updated[currentCycle] = {};
          const current = updated[currentCycle][staffId] || { status: 'pending', submittedDate: null, notes: '' };
          const existing = getTimesheetFiles(current);
          const { fileUrl: _oldUrl, fileName: _oldName, ...rest } = current;
          updated[currentCycle] = {
            ...updated[currentCycle],
            [staffId]: { ...rest, files: [...existing, ...uploaded], status: 'submitted', submittedDate: new Date().toISOString().split('T')[0] },
          };
          return updated;
        });
      }
    } finally {
      setUploadingStaff(null);
    }
  };

  const handleRemoveFile = async (staffId, fileUrl) => {
    if (!canWrite) return;
    try {
      const currentEntry = timesheets[currentCycle]?.[staffId];
      const existing = getTimesheetFiles(currentEntry);
      const removed = existing.find(f => f.fileUrl === fileUrl);
      await deleteTimesheetFile(currentCycle, staffId);
      setTimesheets(prev => {
        const updated = { ...prev };
        if (!updated[currentCycle]?.[staffId]) return prev;
        const entry = updated[currentCycle][staffId];
        const files = getTimesheetFiles(entry).filter(f => f.fileUrl !== fileUrl);
        // Drop legacy fileUrl/fileName to migrate this entry to the new shape.
        const { fileUrl: _oldUrl, fileName: _oldName, ...rest } = entry;
        const nextEntry = files.length
          ? { ...rest, files }
          : { ...rest, files: [], status: 'pending', submittedDate: null };
        updated[currentCycle] = { ...updated[currentCycle], [staffId]: nextEntry };
        return updated;
      });
      const member = staff.find(s => s.id === staffId);
      audit({
        domain: 'timesheets',
        action: 'file_removed',
        targetId: staffId,
        targetLabel: member?.name || staffId,
        details: [`Cycle: ${currentCycle}`, removed?.fileName ? `File: ${removed.fileName}` : null].filter(Boolean),
      });
    } catch (err) {
      console.error('Failed to remove file:', err);
    }
  };

  // =====================================================================
  // PAYSLIP LOGIC — parallel to timesheets, but files replace instead of
  // accumulate (a payslip is a single document per cycle, typically).
  // =====================================================================
  const payslipCycleRange = useMemo(() => getPayCycleRange(payslipCycle), [payslipCycle]);
  const payslipScheduledStaff = useMemo(() => getScheduledStaffForPayCycle(schedules, staff, payslipCycle), [schedules, staff, payslipCycle]);
  const payslipSupportStaff = useMemo(() => getSupportStaffForPayCycle(staff), [staff]);
  const payslipAllStaff = useMemo(() => ({ ...payslipScheduledStaff, ...payslipSupportStaff }), [payslipScheduledStaff, payslipSupportStaff]);
  const cyclePayslips = (payslips && payslips[payslipCycle]) || {};
  const payslipStaffEntries = Object.entries(payslipAllStaff);
  const payslipFilteredEntries = staffFilter ? payslipStaffEntries.filter(([id]) => id === staffFilter) : payslipStaffEntries;
  const payslipTotal = payslipFilteredEntries.length;
  const payslipUploadedCount = payslipFilteredEntries.filter(([id]) => cyclePayslips[id]?.files?.length > 0).length;
  const payslipNotifiedCount = payslipFilteredEntries.filter(([id]) => cyclePayslips[id]?.notifiedAt).length;
  const payslipPendingCount = payslipTotal - payslipUploadedCount;

  const payslipNurses = payslipFilteredEntries.filter(([, info]) => info.role === 'nurse').sort((a, b) => a[1].name.localeCompare(b[1].name));
  const payslipReceptionists = payslipFilteredEntries.filter(([, info]) => info.role === 'receptionist').sort((a, b) => a[1].name.localeCompare(b[1].name));
  const payslipSupport = payslipFilteredEntries.filter(([, info]) => !isScheduleRole(info.role)).sort((a, b) => a[1].name.localeCompare(b[1].name));

  const goToPrevPayslipCycle = () => setPayslipCycle(getPrevPayCycle(payslipCycle));
  const goToNextPayslipCycle = () => setPayslipCycle(getNextPayCycle(payslipCycle));
  const goToLatestPayslipCycle = () => setPayslipCycle(getPrevPayCycle(getPayCycleForDate(new Date())));

  // Filter audits shown in the shared Logs tab so both timesheet and payslip
  // events appear together without dragging in unrelated domains.
  const scopedAuditsForPanel = useMemo(() => {
    const out = {};
    for (const [id, a] of Object.entries(allAudits || {})) {
      if (a.domain === 'timesheets' || a.domain === 'payslips') out[id] = a;
    }
    return out;
  }, [allAudits]);

  const uploadPayslipBatch = async (staffId, files) => {
    setUploadingStaff(staffId);
    setUploadError(null);
    const uploaded = [];
    try {
      for (const file of files) {
        const { fileUrl, fileName } = await uploadPayslipFile(payslipCycle, staffId, file);
        uploaded.push({ fileUrl, fileName, uploadedAt: new Date().toISOString() });
      }
      setPayslips(prev => {
        const next = { ...(prev || {}) };
        const cycle = { ...(next[payslipCycle] || {}) };
        const current = cycle[staffId] || { files: [], notes: '' };
        // A new upload invalidates any prior "notified" state — staff should
        // be re-notified when a new file replaces the old one.
        cycle[staffId] = {
          ...current,
          files: uploaded, // replace, not append — one payslip per cycle per staff
          notifiedAt: null,
          acknowledgedAt: null,
        };
        next[payslipCycle] = cycle;
        return next;
      });
      const member = staff.find(s => s.id === staffId);
      audit({
        domain: 'payslips',
        action: 'uploaded',
        targetId: staffId,
        targetLabel: member?.name || staffId,
        details: [`Cycle: ${payslipCycle}`, `File: ${uploaded.map(f => f.fileName).join(', ')}`],
      });
    } catch (err) {
      setUploadError({ staffId, message: err.message });
    } finally {
      setUploadingStaff(null);
    }
  };

  const updatePayslipNotes = (staffId, notes) => {
    if (!canWrite) return;
    setPayslips(prev => {
      const next = { ...(prev || {}) };
      const cycle = { ...(next[payslipCycle] || {}) };
      const current = cycle[staffId] || { files: [], notes: '' };
      cycle[staffId] = { ...current, notes };
      next[payslipCycle] = cycle;
      return next;
    });
  };

  const notifyStaff = (staffId) => {
    if (!canWrite) return;
    const entry = cyclePayslips[staffId];
    if (!entry?.files?.length) return;
    const ts = new Date().toISOString();
    setPayslips(prev => {
      const next = { ...(prev || {}) };
      const cycle = { ...(next[payslipCycle] || {}) };
      const current = cycle[staffId] || { files: [], notes: '' };
      cycle[staffId] = {
        ...current,
        notifiedAt: ts,
        notificationMessage: `Your payslip for ${payslipCycleRange.label} is available.`,
        // Reset any previous acknowledgement so the banner reappears.
        acknowledgedAt: null,
      };
      next[payslipCycle] = cycle;
      return next;
    });
    const member = staff.find(s => s.id === staffId);
    audit({
      domain: 'payslips',
      action: entry.notifiedAt ? 'notification_resent' : 'notification_sent',
      targetId: staffId,
      targetLabel: member?.name || staffId,
      details: [`Cycle: ${payslipCycle}`],
    });
  };

  const revokeNotification = (staffId) => {
    if (!canWrite) return;
    setPayslips(prev => {
      const next = { ...(prev || {}) };
      const cycle = { ...(next[payslipCycle] || {}) };
      const current = cycle[staffId];
      if (!current) return prev;
      cycle[staffId] = { ...current, notifiedAt: null, notificationMessage: null };
      next[payslipCycle] = cycle;
      return next;
    });
    const member = staff.find(s => s.id === staffId);
    audit({
      domain: 'payslips',
      action: 'notification_revoked',
      targetId: staffId,
      targetLabel: member?.name || staffId,
      details: [`Cycle: ${payslipCycle}`],
    });
  };

  const removePayslip = (staffId) => {
    if (!canWrite) return;
    if (!window.confirm('Remove this payslip? The staff notification (if sent) will also be cleared.')) return;
    const removedFiles = cyclePayslips[staffId]?.files || [];
    setPayslips(prev => {
      const next = { ...(prev || {}) };
      const cycle = { ...(next[payslipCycle] || {}) };
      if (!cycle[staffId]) return prev;
      // Keep notes but drop files/notification state.
      const { files, notifiedAt, notificationMessage, acknowledgedAt, ...rest } = cycle[staffId];
      if (Object.keys(rest).some(k => rest[k])) {
        cycle[staffId] = { ...rest, files: [] };
      } else {
        delete cycle[staffId];
      }
      next[payslipCycle] = cycle;
      return next;
    });
    const member = staff.find(s => s.id === staffId);
    audit({
      domain: 'payslips',
      action: 'removed',
      targetId: staffId,
      targetLabel: member?.name || staffId,
      details: [`Cycle: ${payslipCycle}`, removedFiles.length ? `Files: ${removedFiles.map(f => f.fileName).join(', ')}` : null].filter(Boolean),
    });
  };

  const renderStaffRow = ([staffId, info]) => {
    const ts = cycleTimesheets[staffId] || { status: 'pending', submittedDate: null, notes: '' };
    const isSubmitted = ts.status === 'submitted';
    const files = getTimesheetFiles(ts);
    const hasFiles = files.length > 0;

    return (
      <div key={staffId} className="row-animate grid items-start border-b border-d4l-border last:border-b-0 hover:bg-d4l-hover/30 transition-colors px-4 py-3 min-w-[600px]"
        style={{ gridTemplateColumns: '1fr 70px 70px 110px 100px 1fr' }}>
        {/* Name + badges + files */}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-d4l-text text-sm">{info.name}</span>
            {hasFiles && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-d4l-gold/10 text-d4l-gold border border-d4l-gold/20 shrink-0">
                <Paperclip className="w-2.5 h-2.5" />
                {files.length} file{files.length === 1 ? '' : 's'}
              </span>
            )}
            {uploadingStaff === staffId ? (
              <Loader2 className="w-3.5 h-3.5 text-d4l-gold-dim animate-spin shrink-0" />
            ) : canWrite ? (
              <button onClick={() => handleUploadClick(staffId)} disabled={!!uploadingStaff}
                className="p-1 rounded-lg hover:bg-d4l-gold/10 transition-colors shrink-0" title={hasFiles ? 'Upload another file' : 'Upload timesheet'}>
                <Upload className={`w-3.5 h-3.5 ${uploadingStaff ? 'text-d4l-hover' : 'text-d4l-dim hover:text-d4l-gold'}`} />
              </button>
            ) : null}
          </div>
          <div className="flex gap-1.5 mt-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${info.role === 'nurse' ? 'bg-blue-500/10 text-blue-400' : info.role === 'receptionist' ? 'bg-pink-500/10 text-pink-400' : 'bg-green-500/10 text-green-400'}`}>
              {info.role}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${info.employmentType === 'permanent' ? 'bg-green-500/10 text-green-400' : 'bg-d4l-raised text-d4l-dim'}`}>
              {info.employmentType}
            </span>
          </div>
          {hasFiles && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {files.map((f, idx) => (
                <span key={f.fileUrl || idx} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-d4l-bg border border-d4l-border text-d4l-text2 max-w-full">
                  <Paperclip className="w-2.5 h-2.5 text-d4l-gold shrink-0" />
                  <a href={f.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="hover:text-d4l-gold hover:underline truncate max-w-[180px]"
                    title={f.fileName || 'timesheet'}>
                    {f.fileName || `File ${idx + 1}`}
                  </a>
                  {canWrite && (
                    <button onClick={() => handleRemoveFile(staffId, f.fileUrl)}
                      className="p-0.5 rounded hover:bg-red-500/10 shrink-0" title="Remove file">
                      <X className="w-3 h-3 text-d4l-dim hover:text-red-400" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
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
          {!staffFilter && canWrite ? (
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
          {canWrite ? (
            <NotesInput
              value={ts.notes}
              onChange={notes => updateNotes(staffId, notes)}
              placeholder="Add note..."
              className="w-full text-sm bg-transparent border-0 border-b border-d4l-border text-d4l-text placeholder:text-d4l-dim focus:border-d4l-gold focus:ring-0 outline-none py-1"
            />
          ) : (
            <span className="text-sm text-d4l-muted italic">{ts.notes || '—'}</span>
          )}
        </div>
      </div>
    );
  };

  const renderRoleGroup = (label, entries, color) => {
    if (entries.length === 0) return null;
    return (
      <>
        <div className="px-4 py-2 min-w-[600px] flex items-center gap-2" style={{ background: `${color}08` }}>
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs font-semibold uppercase tracking-wider font-display" style={{ color }}>
            {label}
          </span>
        </div>
        {entries.map(renderStaffRow)}
      </>
    );
  };

  const renderPayslipRow = ([staffId, info]) => {
    const entry = cyclePayslips[staffId] || { files: [], notes: '' };
    const files = Array.isArray(entry.files) ? entry.files : [];
    const hasFile = files.length > 0;
    const isNotified = !!entry.notifiedAt;
    const isAcknowledged = !!entry.acknowledgedAt && entry.acknowledgedAt >= entry.notifiedAt;
    const isUploading = uploadingStaff === staffId && uploadMode.current === 'payslip';

    // Status meaning:
    //   pending     → no file uploaded
    //   ready       → file uploaded, not yet notified
    //   notified    → notification sent, not yet viewed
    //   viewed      → staff opened the payslip
    let statusKey = 'pending';
    if (hasFile && !isNotified) statusKey = 'ready';
    if (hasFile && isNotified && !isAcknowledged) statusKey = 'notified';
    if (hasFile && isNotified && isAcknowledged) statusKey = 'viewed';

    const statusConfig = {
      pending:  { label: 'No payslip', cls: 'bg-red-500/15 text-red-400 border-red-500/20', dot: 'bg-red-400 pulse-dot' },
      ready:    { label: 'Ready',      cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20', dot: 'bg-amber-400' },
      notified: { label: 'Notified',   cls: 'bg-d4l-gold/15 text-d4l-gold border-d4l-gold/25', dot: 'bg-d4l-gold pulse-dot' },
      viewed:   { label: 'Viewed',     cls: 'bg-green-500/15 text-green-400 border-green-500/20', dot: 'bg-green-400' },
    }[statusKey];

    return (
      <div key={staffId} className="row-animate grid items-start border-b border-d4l-border last:border-b-0 hover:bg-d4l-hover/30 transition-colors px-4 py-3 min-w-[600px]"
        style={{ gridTemplateColumns: '1fr 130px 120px 1fr 44px' }}>
        {/* Name + file */}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-d4l-text text-sm">{info.name}</span>
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 text-d4l-gold-dim animate-spin shrink-0" />
            ) : canWrite ? (
              <button
                onClick={() => handleUploadClick(staffId, 'payslip')}
                disabled={!!uploadingStaff}
                className="p-1 rounded-lg hover:bg-d4l-gold/10 transition-colors shrink-0 active:scale-[0.92]"
                title={hasFile ? 'Replace payslip' : 'Upload payslip'}
              >
                <Upload className={`w-3.5 h-3.5 ${uploadingStaff ? 'text-d4l-hover' : 'text-d4l-dim hover:text-d4l-gold'}`} />
              </button>
            ) : null}
          </div>
          <div className="flex gap-1.5 mt-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${info.role === 'nurse' ? 'bg-blue-500/10 text-blue-400' : info.role === 'receptionist' ? 'bg-pink-500/10 text-pink-400' : 'bg-green-500/10 text-green-400'}`}>
              {info.role}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${info.employmentType === 'permanent' ? 'bg-green-500/10 text-green-400' : 'bg-d4l-raised text-d4l-dim'}`}>
              {info.employmentType}
            </span>
          </div>
          {hasFile && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {files.map((f, idx) => (
                <span key={f.fileUrl || idx} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-d4l-bg border border-d4l-border text-d4l-text2 max-w-full">
                  <Paperclip className="w-2.5 h-2.5 text-d4l-gold shrink-0" />
                  <a href={f.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="hover:text-d4l-gold hover:underline truncate max-w-[180px]"
                    title={f.fileName || 'payslip'}>
                    {f.fileName || `Payslip ${idx + 1}`}
                  </a>
                </span>
              ))}
            </div>
          )}
          {uploadError?.staffId === staffId && (
            <p className="text-[10px] text-red-400 mt-1">{uploadError.message}</p>
          )}
        </div>

        {/* Status pill */}
        <div className="text-center">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusConfig.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
            {statusConfig.label}
          </span>
        </div>

        {/* Notified at */}
        <div className="text-center text-xs text-d4l-muted">
          {entry.notifiedAt
            ? new Date(entry.notifiedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
            : <span className="text-d4l-dim">—</span>}
          {isAcknowledged && (
            <div className="text-[10px] text-green-400 mt-0.5">Viewed</div>
          )}
        </div>

        {/* Notes */}
        <div>
          {canWrite ? (
            <NotesInput
              value={entry.notes}
              onChange={notes => updatePayslipNotes(staffId, notes)}
              placeholder="Add note for staff..."
              className="w-full text-sm bg-transparent border-0 border-b border-d4l-border text-d4l-text placeholder:text-d4l-dim focus:border-d4l-gold focus:ring-0 outline-none py-1"
            />
          ) : (
            <span className="text-sm text-d4l-muted italic">{entry.notes || '—'}</span>
          )}
        </div>

        {/* Kebab */}
        <div className="flex justify-center">
          {canWrite && (
            <KebabMenu
              hasFile={hasFile}
              isNotified={isNotified}
              onNotify={() => notifyStaff(staffId)}
              onRevoke={() => revokeNotification(staffId)}
              onRemove={() => removePayslip(staffId)}
            />
          )}
        </div>
      </div>
    );
  };

  const renderPayslipRoleGroup = (label, entries, color) => {
    if (entries.length === 0) return null;
    return (
      <>
        <div className="px-4 py-2 min-w-[600px] flex items-center gap-2" style={{ background: `${color}08` }}>
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs font-semibold uppercase tracking-wider font-display" style={{ color }}>
            {label}
          </span>
        </div>
        {entries.map(renderPayslipRow)}
      </>
    );
  };

  const renderPayslipsTab = () => (
    <>
      {/* Stats — mirrors Timesheets layout, same typographic rhythm. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { color: 'blue',  icon: Users,        label: 'Total Staff',     value: payslipTotal,         sub: 'in last pay cycle',      textColor: 'text-d4l-text' },
          { color: 'amber', icon: Paperclip,    label: 'Uploaded',        value: payslipUploadedCount, sub: 'payslips attached',      textColor: 'text-d4l-gold' },
          { color: 'green', icon: BellRing,     label: 'Notified',        value: payslipNotifiedCount, sub: 'staff members informed', textColor: 'text-green-400' },
          { color: 'red',   icon: Clock,        label: 'Outstanding',     value: payslipPendingCount,  sub: 'still awaiting upload',  textColor: 'text-red-400' },
        ].map(({ color, icon: Icon, label, value, sub, textColor }) => (
          <div key={label} className="stat-animate hover-lift panel-glow bg-d4l-surface rounded-xl border border-d4l-border">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-d4l-muted font-medium">{label}</p>
                  <p className={`text-4xl font-bold tracking-wide count-animate mt-1 font-display ${textColor}`}>
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

      {payslipTotal === 0 ? (
        <EmptyState
          icon={<Wallet className="w-8 h-8" />}
          title="No staff to issue payslips for"
          hint="Staff scheduled in this pay cycle will appear here once the schedule is set."
        />
      ) : (
        <div className="section-animate section-animate-delay-1 bg-d4l-surface rounded-xl border border-d4l-border overflow-hidden panel-glow">
          <div className="overflow-x-auto">
            <div className="grid items-center bg-d4l-bg border-b border-d4l-border px-4 py-2.5 min-w-[600px]"
              style={{ gridTemplateColumns: '1fr 130px 120px 1fr 44px' }}>
              <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium">Staff Member</span>
              <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium text-center">Status</span>
              <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium text-center">Notified</span>
              <span className="text-[10px] uppercase tracking-wider text-d4l-muted font-medium">Notes to staff</span>
              <span className="sr-only">Actions</span>
            </div>
            {renderPayslipRoleGroup('Nurses', payslipNurses, '#3b82f6')}
            {renderPayslipRoleGroup('Receptionists', payslipReceptionists, '#ec4899')}
            {renderPayslipRoleGroup('Support Staff', payslipSupport, '#22c55e')}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="p-4 md:p-6 max-w-full mx-auto">

      {/* ===== HEADER ===== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 md:mb-8 section-animate">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide text-d4l-text font-display">
            {staffFilter ? 'My Timesheet' : pageTab === 'payslips' ? 'Payslips' : 'Timesheets'}
          </h1>
          <p className="text-d4l-muted text-sm mt-0.5">
            {pageTab === 'payslips'
              ? 'Issue payslips to staff who worked last cycle'
              : 'Track pay cycle timesheet submissions'}
          </p>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          <button
            onClick={pageTab === 'payslips' ? goToPrevPayslipCycle : goToPrevCycle}
            className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text active:scale-[0.96]"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={pageTab === 'payslips' ? goToLatestPayslipCycle : goToCurrentCycle}
            className="px-2 md:px-3 py-1.5 text-xs md:text-sm bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow active:scale-[0.97]"
          >
            {pageTab === 'payslips' ? 'Last Cycle' : 'This Cycle'}
          </button>
          <span className="text-xs md:text-sm font-medium text-d4l-text2 min-w-[160px] md:min-w-[220px] text-center">
            {pageTab === 'payslips' ? payslipCycleRange.label : cycleRange.label}
          </span>
          <button
            onClick={pageTab === 'payslips' ? goToNextPayslipCycle : goToNextCycle}
            className="p-2 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted hover:text-d4l-text active:scale-[0.96]"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {!staffFilter && (
        <PageTabs
          tabs={[
            { id: 'main', label: 'Timesheets', icon: <FileCheck className="w-4 h-4" /> },
            { id: 'payslips', label: 'Payslips', icon: <Wallet className="w-4 h-4" /> },
            { id: 'logs', label: 'Logs', icon: <History className="w-4 h-4" />, count: domainAuditsCount },
          ]}
          activeTab={pageTab}
          onTabChange={setPageTab}
        />
      )}

      {pageTab === 'logs' && !staffFilter ? (
        <AuditLogPanel audits={scopedAuditsForPanel} compact />
      ) : pageTab === 'payslips' && !staffFilter ? (
        renderPayslipsTab()
      ) : (
      <>

      {/* ===== STAT CARDS ===== */}
      {!staffFilter && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { color: 'blue', icon: Users, label: 'Total Staff', value: totalStaff, sub: 'in this cycle', textColor: 'text-d4l-text' },
            { color: 'green', icon: CheckCircle2, label: 'Submitted', value: submittedCount, sub: `${totalStaff > 0 ? Math.round(submittedCount / totalStaff * 100) : 0}% complete`, textColor: 'text-green-400' },
            { color: 'red', icon: Clock, label: 'Pending', value: pendingCount, sub: 'awaiting submission', textColor: 'text-red-400' },
            { color: 'amber', icon: Paperclip, label: 'Files Uploaded', value: filesUploadedCount, sub: 'timesheets attached', textColor: 'text-d4l-gold' },
          ].map(({ color, icon: Icon, label, value, sub, textColor }) => (
            <div key={label} className="stat-animate hover-lift panel-glow bg-d4l-surface rounded-xl border border-d4l-border">
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-d4l-muted font-medium">{label}</p>
                    <p className={`text-4xl font-bold tracking-wide count-animate mt-1 font-display ${textColor}`}>
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
        <EmptyState
          icon={<FileCheck className="w-8 h-8" />}
          title="No staff scheduled in this pay cycle"
          hint="Schedule shifts in the Weekly Schedule to see staff here"
        />
      ) : (
        <div className="section-animate section-animate-delay-1 bg-d4l-surface rounded-xl border border-d4l-border overflow-hidden panel-glow">
          <div className="overflow-x-auto">
          {/* Header row */}
          <div className="grid items-center bg-d4l-bg border-b border-d4l-border px-4 py-2.5 min-w-[600px]"
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
        </div>
      )}
      </>
      )}

      <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={handleFileSelected} className="hidden" />
    </div>
  );
}

/* ============================================================
   KebabMenu — per-row actions for payslips
   Dark surface, subtle elevation, no neon glow. Click-away
   close via a one-shot document listener; the menu is small
   enough that fixed anchoring isn't needed.
   ============================================================ */
function KebabMenu({ hasFile, isNotified, onNotify, onRevoke, onRemove }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const run = (fn) => () => { setOpen(false); fn(); };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-lg hover:bg-d4l-hover text-d4l-dim hover:text-d4l-text2 transition-colors active:scale-[0.94]"
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 w-52 bg-d4l-surface border border-d4l-border rounded-xl overflow-hidden shadow-[0_18px_40px_-16px_rgba(0,0,0,0.55)] animate-fade-in"
        >
          {!isNotified ? (
            <button
              role="menuitem"
              disabled={!hasFile}
              onClick={run(onNotify)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-d4l-text2 hover:bg-d4l-hover hover:text-d4l-gold disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-d4l-text2 transition-colors"
            >
              <Send className="w-4 h-4" />
              <div className="flex flex-col">
                <span className="font-medium">Notify staff</span>
                <span className="text-[10px] text-d4l-dim">{hasFile ? 'Send homepage alert' : 'Upload payslip first'}</span>
              </div>
            </button>
          ) : (
            <>
              <button
                role="menuitem"
                onClick={run(onNotify)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-d4l-text2 hover:bg-d4l-hover hover:text-d4l-gold transition-colors"
              >
                <Send className="w-4 h-4" />
                <div className="flex flex-col">
                  <span className="font-medium">Resend notification</span>
                  <span className="text-[10px] text-d4l-dim">Re-alerts the staff member</span>
                </div>
              </button>
              <button
                role="menuitem"
                onClick={run(onRevoke)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-d4l-text2 hover:bg-d4l-hover transition-colors"
              >
                <BellOff className="w-4 h-4" />
                <div className="flex flex-col">
                  <span className="font-medium">Revoke notification</span>
                  <span className="text-[10px] text-d4l-dim">Keeps file, removes banner</span>
                </div>
              </button>
            </>
          )}
          {hasFile && (
            <>
              <div className="h-px bg-d4l-border" />
              <button
                role="menuitem"
                onClick={run(onRemove)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <div className="flex flex-col">
                  <span className="font-medium">Remove payslip</span>
                  <span className="text-[10px] text-red-400/60">Clears the file &amp; notification</span>
                </div>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
