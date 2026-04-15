import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, GripVertical, ArrowUp, ArrowDown, Check, Copy } from 'lucide-react';
import { DAYS_OF_WEEK } from '../data/initialData';
import {
  TODO_ROLES, buildDefaultTemplates, genTodoId, getTodosForRoleDay,
  getTodayDayName,
} from '../utils/todos';
import { useAudit } from '../contexts/AuditContext';

/**
 * Admin modal for editing the daily task templates.
 *
 * Saves immediately to templates state on every change. Parent is expected
 * to wire templates up to Firebase via the App.jsx persist effect.
 */
export default function TodoEditor({ templates, setTemplates, onClose }) {
  const audit = useAudit();
  const [day, setDay] = useState(() => getTodayDayName());
  const [role, setRole] = useState('nurse');

  // Ensure templates exist (seed defaults if null)
  useEffect(() => {
    if (!templates) setTemplates(buildDefaultTemplates());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Body-scroll lock and Esc close
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const items = useMemo(() => getTodosForRoleDay(templates, role, day), [templates, role, day]);

  const updateItems = (nextItems) => {
    setTemplates(prev => {
      const base = prev || buildDefaultTemplates();
      const nextRole = { ...(base[role] || {}) };
      nextRole[day] = nextItems;
      return { ...base, [role]: nextRole };
    });
  };

  const handleAdd = () => {
    const item = { id: genTodoId(), text: '', order: items.length };
    updateItems([...items, item]);
    audit({
      domain: 'todos',
      action: 'item_added',
      targetLabel: `${role === 'nurse' ? 'Nurse' : 'Receptionist'} · ${day}`,
    });
  };

  const handleRemove = (id) => {
    const removed = items.find(i => i.id === id);
    const next = items.filter(i => i.id !== id).map((it, idx) => ({ ...it, order: idx }));
    updateItems(next);
    if (removed) {
      audit({
        domain: 'todos',
        action: 'item_removed',
        targetLabel: `${role === 'nurse' ? 'Nurse' : 'Receptionist'} · ${day}`,
        details: [`Removed: "${removed.text || '(empty)'}"`],
      });
    }
  };

  const handleEdit = (id, text) => {
    updateItems(items.map(i => (i.id === id ? { ...i, text } : i)));
  };

  const handleBlur = (id, before, after) => {
    if (before === after) return;
    audit({
      domain: 'todos',
      action: 'item_edited',
      targetLabel: `${role === 'nurse' ? 'Nurse' : 'Receptionist'} · ${day}`,
      changes: [{ field: 'Task', from: before || '(empty)', to: after || '(empty)' }],
    });
  };

  const handleMove = (id, dir) => {
    const idx = items.findIndex(i => i.id === id);
    const swapWith = idx + dir;
    if (idx < 0 || swapWith < 0 || swapWith >= items.length) return;
    const next = [...items];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    updateItems(next.map((it, i) => ({ ...it, order: i })));
  };

  const handleCopyToAllDays = () => {
    if (!window.confirm(`Copy these ${items.length} task${items.length === 1 ? '' : 's'} to every day for ${role === 'nurse' ? 'nurses' : 'receptionists'}?`)) return;
    setTemplates(prev => {
      const base = prev || buildDefaultTemplates();
      const nextRole = { ...(base[role] || {}) };
      for (const d of DAYS_OF_WEEK) {
        nextRole[d] = items.map((it, i) => ({
          id: genTodoId(),
          text: it.text,
          order: i,
        }));
      }
      return { ...base, [role]: nextRole };
    });
    audit({
      domain: 'todos',
      action: 'template_updated',
      targetLabel: `${role === 'nurse' ? 'Nurse' : 'Receptionist'} · all days`,
      details: [`Copied ${items.length} task${items.length === 1 ? '' : 's'} to every weekday`],
    });
  };

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" onClick={onClose} />
      <div className="fixed inset-2 md:inset-4 z-[101] flex items-center justify-center pointer-events-none">
        <div className="bg-d4l-raised border border-d4l-border rounded-xl shadow-2xl w-full max-w-3xl h-full max-h-[900px] pointer-events-auto flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 border-b border-d4l-border shrink-0" style={{ minHeight: 52 }}>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-d4l-text">Edit Daily Tasks</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-md text-d4l-muted hover:text-d4l-text hover:bg-d4l-hover" title="Close (Esc)">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Day tabs */}
          <div className="flex gap-1 px-4 pt-3 border-b border-d4l-border overflow-x-auto overflow-y-hidden shrink-0">
            {DAYS_OF_WEEK.map(d => (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={`px-3 py-2 text-xs font-semibold rounded-t-md whitespace-nowrap transition-colors ${
                  day === d
                    ? 'bg-d4l-surface text-d4l-gold border-b-2 border-d4l-gold -mb-px'
                    : 'text-d4l-muted hover:text-d4l-text'
                }`}
              >
                {d.slice(0, 3)}
              </button>
            ))}
          </div>

          {/* Role switcher */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-d4l-border shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-d4l-muted mr-1">Role:</span>
            {TODO_ROLES.map(r => (
              <button
                key={r.id}
                onClick={() => setRole(r.id)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  role === r.id
                    ? 'bg-d4l-gold text-black'
                    : 'bg-d4l-bg border border-d4l-border text-d4l-muted hover:text-d4l-text'
                }`}
              >
                {r.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={handleCopyToAllDays}
              disabled={items.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-d4l-bg border border-d4l-border text-d4l-muted hover:text-d4l-text disabled:opacity-40"
              title="Apply this list to every weekday"
            >
              <Copy className="w-3.5 h-3.5" /> Copy to all days
            </button>
          </div>

          {/* Item list */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-2">
            {items.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-d4l-muted mb-4">No tasks yet for {role === 'nurse' ? 'nurses' : 'receptionists'} on {day}.</p>
              </div>
            ) : (
              items.map((item, idx) => (
                <TaskRow
                  key={item.id}
                  item={item}
                  isFirst={idx === 0}
                  isLast={idx === items.length - 1}
                  onEdit={(text) => handleEdit(item.id, text)}
                  onBlur={(before, after) => handleBlur(item.id, before, after)}
                  onRemove={() => handleRemove(item.id)}
                  onMoveUp={() => handleMove(item.id, -1)}
                  onMoveDown={() => handleMove(item.id, 1)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-d4l-border shrink-0 bg-d4l-surface" style={{ minHeight: 52 }}>
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-4 py-2 bg-d4l-gold text-black rounded-md text-sm font-semibold hover:bg-d4l-gold-dark btn-glow"
            >
              <Plus className="w-4 h-4" /> Add task
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-d4l-bg border border-d4l-border rounded-md text-sm text-d4l-text hover:border-d4l-gold/40"
            >
              <Check className="w-4 h-4" /> Done
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

function TaskRow({ item, isFirst, isLast, onEdit, onBlur, onRemove, onMoveUp, onMoveDown }) {
  const [draft, setDraft] = useState(item.text || '');
  const [focused, setFocused] = useState(false);

  // Keep input in sync if parent changes the value (e.g. after a reorder)
  useEffect(() => {
    if (!focused) setDraft(item.text || '');
  }, [item.text, focused]);

  return (
    <div className="flex items-center gap-2 bg-d4l-surface border border-d4l-border rounded-lg p-2">
      <GripVertical className="w-4 h-4 text-d4l-dim shrink-0" />
      <input
        type="text"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); onEdit(e.target.value); }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onBlur(item.text || '', draft); }}
        placeholder="Task description..."
        className="flex-1 bg-transparent border-0 px-2 py-1.5 text-sm text-d4l-text focus:outline-none placeholder-d4l-dim"
      />
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1.5 rounded text-d4l-dim hover:text-d4l-text hover:bg-d4l-hover disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move up"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1.5 rounded text-d4l-dim hover:text-d4l-text hover:bg-d4l-hover disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move down"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRemove}
          className="p-1.5 rounded text-d4l-dim hover:text-red-400 hover:bg-red-500/10"
          title="Remove task"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
