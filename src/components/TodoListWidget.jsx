import { useState, useMemo } from 'react';
import {
  ListChecks, CheckCircle2, Circle, Pencil, ChevronDown, ChevronRight,
  Users, Coffee, CheckSquare,
} from 'lucide-react';
import {
  getTodosForRoleDay,
  getStaffWorkingOnDay,
  getStaffProgress,
  getTodayDayName,
  dateKey,
  TODO_ROLES,
} from '../utils/todos';

/**
 * Dashboard widget rendering today's daily tasks.
 *
 * Staff mode (linkedStaffId provided):
 *   - If the staff isn't scheduled today → shows a small "not scheduled" card
 *   - Otherwise lists their role's tasks for today with checkboxes
 *
 * Admin / HR mode (no linkedStaffId):
 *   - Shows overview of all scheduled staff today grouped by role,
 *     with per-staff progress and expand to see which items are left
 *   - "Edit tasks" button opens the editor modal
 */
export default function TodoListWidget({
  staff,
  schedule,               // this week's draft schedule (for admin overview)
  publishedSchedule,      // published schedule (for staff view)
  templates,
  completions,
  onToggle,               // (dateStr, staffId, itemId, done) => void
  onEdit,                 // admin-only: opens TodoEditor
  userRole,
  linkedStaffId,
}) {
  const isAdmin = userRole === 'admin';
  const isHR = userRole === 'hr';
  const canManage = isAdmin || isHR;
  const isStaff = !canManage;

  const today = useMemo(() => new Date(), []);
  const dayName = getTodayDayName(today);
  const dateStr = dateKey(today);

  // Which schedule to pull today's staff list from? Staff see the published
  // schedule only. Admin/HR see the draft so mid-week assignments surface.
  const sourceSchedule = isStaff ? publishedSchedule : schedule;
  const scheduledIds = useMemo(
    () => getStaffWorkingOnDay(sourceSchedule, dayName),
    [sourceSchedule, dayName]
  );

  /* ============================== STAFF MODE ============================== */
  if (isStaff) {
    const me = staff.find(s => s.id === linkedStaffId);
    const isScheduled = linkedStaffId && scheduledIds.has(linkedStaffId);

    if (!me) return null;
    if (!isScheduled) {
      return (
        <div className="bg-d4l-surface rounded-xl border border-d4l-border p-5 panel-glow">
          <div className="flex items-center gap-2 mb-2">
            <ListChecks className="w-5 h-5 text-d4l-gold" />
            <h2 className="text-base font-semibold text-d4l-text">Daily Tasks · {dayName}</h2>
          </div>
          <p className="text-sm text-d4l-muted flex items-center gap-2">
            <Coffee className="w-4 h-4" />
            You're not scheduled today — enjoy the day off.
          </p>
        </div>
      );
    }

    const progress = getStaffProgress({
      templates, completions, role: me.role, dayName, dateStr, staffId: me.id,
    });

    return (
      <div className="bg-d4l-surface rounded-xl border border-d4l-border p-5 panel-glow">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-d4l-gold" />
            <h2 className="text-base font-semibold text-d4l-text">My Tasks · {dayName}</h2>
          </div>
          <ProgressBadge done={progress.done} total={progress.total} />
        </div>
        {progress.items.length === 0 ? (
          <p className="text-sm text-d4l-muted">No tasks set for {me.role}s on {dayName}.</p>
        ) : (
          <TodoList
            items={progress.items}
            onToggle={(itemId, done) => onToggle(dateStr, me.id, itemId, done)}
            readonly={false}
          />
        )}
      </div>
    );
  }

  /* =========================== ADMIN / HR MODE =========================== */
  const scheduledStaff = useMemo(() => {
    return staff.filter(s => scheduledIds.has(s.id));
  }, [staff, scheduledIds]);

  const byRole = useMemo(() => {
    const map = {};
    for (const r of TODO_ROLES) map[r.id] = [];
    for (const s of scheduledStaff) {
      if (map[s.role]) map[s.role].push(s);
    }
    return map;
  }, [scheduledStaff]);

  // Aggregate totals across all scheduled staff
  const totals = useMemo(() => {
    let done = 0, total = 0, staffDone = 0, staffTotal = 0;
    for (const s of scheduledStaff) {
      const p = getStaffProgress({
        templates, completions, role: s.role, dayName, dateStr, staffId: s.id,
      });
      done += p.done;
      total += p.total;
      if (p.total > 0) {
        staffTotal += 1;
        if (p.done === p.total) staffDone += 1;
      }
    }
    return { done, total, staffDone, staffTotal };
  }, [scheduledStaff, templates, completions, dayName, dateStr]);

  return (
    <div className="bg-d4l-surface rounded-xl border border-d4l-border p-5 panel-glow">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-d4l-gold" />
          <h2 className="text-base font-semibold text-d4l-text">Daily Tasks · {dayName}</h2>
        </div>
        <div className="flex items-center gap-2">
          <SummaryChip
            icon={<CheckSquare className="w-3 h-3" />}
            text={`${totals.done} / ${totals.total} items`}
          />
          <SummaryChip
            icon={<Users className="w-3 h-3" />}
            text={`${totals.staffDone} / ${totals.staffTotal} staff done`}
          />
          {isAdmin && onEdit && (
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-d4l-gold text-black rounded-md text-xs font-semibold hover:bg-d4l-gold-dark btn-glow"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit tasks
            </button>
          )}
        </div>
      </div>

      {scheduledStaff.length === 0 ? (
        <p className="text-sm text-d4l-muted">
          No staff scheduled for {dayName} yet. Assign staff on the Weekly Schedule page.
        </p>
      ) : (
        <div className="space-y-4">
          {TODO_ROLES.map(r => {
            const list = byRole[r.id] || [];
            if (list.length === 0) return null;
            return (
              <RoleSection
                key={r.id}
                roleId={r.id}
                roleLabel={r.label}
                staffList={list}
                templates={templates}
                completions={completions}
                dayName={dayName}
                dateStr={dateStr}
                onToggle={onToggle}
                canTick={isAdmin}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Helper components ----------------------- */

function ProgressBadge({ done, total }) {
  if (total === 0) return null;
  const all = done === total;
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
      all
        ? 'bg-green-500/15 border-green-500/30 text-green-400'
        : 'bg-d4l-bg border-d4l-border text-d4l-text2'
    }`}>
      {done} / {total}
    </span>
  );
}

function SummaryChip({ icon, text }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-d4l-bg border border-d4l-border text-xs text-d4l-muted">
      {icon}
      {text}
    </span>
  );
}

function TodoList({ items, onToggle, readonly }) {
  return (
    <ul className="space-y-1.5">
      {items.map(item => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => !readonly && onToggle(item.id, !item.done)}
            disabled={readonly}
            className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
              readonly
                ? 'cursor-default'
                : 'hover:bg-d4l-hover/40'
            } ${item.done ? 'text-d4l-dim' : 'text-d4l-text'}`}
          >
            {item.done
              ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-px" />
              : <Circle className="w-5 h-5 text-d4l-dim shrink-0 mt-px" />
            }
            <span className={`flex-1 text-sm leading-snug ${item.done ? 'line-through' : ''}`}>
              {item.text}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RoleSection({ roleId, roleLabel, staffList, templates, completions, dayName, dateStr, onToggle, canTick }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${roleId === 'nurse' ? 'bg-blue-400' : 'bg-pink-400'}`} />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-d4l-muted">
          {roleLabel} <span className="text-d4l-dim normal-case font-normal">({staffList.length} scheduled)</span>
        </h3>
      </div>
      <div className="space-y-1.5">
        {staffList.map(s => (
          <StaffRow
            key={s.id}
            staff={s}
            templates={templates}
            completions={completions}
            dayName={dayName}
            dateStr={dateStr}
            onToggle={onToggle}
            canTick={canTick}
          />
        ))}
      </div>
    </div>
  );
}

function StaffRow({ staff, templates, completions, dayName, dateStr, onToggle, canTick }) {
  const [expanded, setExpanded] = useState(false);
  const progress = getStaffProgress({
    templates, completions, role: staff.role, dayName, dateStr, staffId: staff.id,
  });
  const allDone = progress.total > 0 && progress.done === progress.total;

  return (
    <div className="bg-d4l-bg border border-d4l-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-d4l-hover/40 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-d4l-dim shrink-0" />
          : <ChevronRight className="w-4 h-4 text-d4l-dim shrink-0" />
        }
        <span className="text-sm font-medium text-d4l-text flex-1 truncate">{staff.name}</span>
        {progress.total > 0 && (
          <span className={`text-xs font-semibold shrink-0 ${allDone ? 'text-green-400' : 'text-d4l-muted'}`}>
            {progress.done} / {progress.total}
          </span>
        )}
        {allDone && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
      </button>
      {expanded && (
        <div className="border-t border-d4l-border px-3 py-2.5 bg-d4l-surface/40">
          {progress.items.length === 0 ? (
            <p className="text-xs text-d4l-dim">No tasks configured for {staff.role}s on {dayName}.</p>
          ) : (
            <TodoList
              items={progress.items}
              onToggle={(itemId, done) => onToggle(dateStr, staff.id, itemId, done)}
              readonly={!canTick}
            />
          )}
        </div>
      )}
    </div>
  );
}
