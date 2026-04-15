import { DAYS_OF_WEEK } from '../data/initialData';

export const DEFAULT_NURSE_TODOS = [
  'Clean station',
  'Restock station',
  'Vial stock take and report sent',
  'Report if stock is low at the beginning of the day',
];

export const DEFAULT_RECEPTIONIST_TODOS = [
  'Make sure shop is tidy',
  'Check emails (Gmail and webmail)',
  'Report if petty cash is low',
  'Stock take and sent to Tumi',
  'All client birthdays and reminders set',
];

export const TODO_ROLES = [
  { id: 'nurse',        label: 'Nurses' },
  { id: 'receptionist', label: 'Receptionists' },
];

export function genTodoId() {
  return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Build the default template map: same list applied to every weekday. */
export function buildDefaultTemplates() {
  const templates = { nurse: {}, receptionist: {} };
  for (const d of DAYS_OF_WEEK) {
    templates.nurse[d] = DEFAULT_NURSE_TODOS.map((text, i) => ({
      id: genTodoId(), text, order: i,
    }));
    templates.receptionist[d] = DEFAULT_RECEPTIONIST_TODOS.map((text, i) => ({
      id: genTodoId(), text, order: i,
    }));
  }
  return templates;
}

/** Today's day-of-week name matching DAYS_OF_WEEK. */
export function getTodayDayName(date = new Date()) {
  const jsDay = date.getDay();
  const idx = jsDay === 0 ? 6 : jsDay - 1;
  return DAYS_OF_WEEK[idx];
}

/** Format a date as 'YYYY-MM-DD'. */
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Return an ordered list of todos for the given role+day, safe for
 *  a possibly-empty template. */
export function getTodosForRoleDay(templates, role, dayName) {
  const list = templates?.[role]?.[dayName];
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Collect IDs of everyone assigned to at least one cell on the given day. */
export function getStaffWorkingOnDay(weekSchedule, dayName) {
  const ids = new Set();
  const daySchedule = weekSchedule?.[dayName];
  if (!daySchedule) return ids;
  for (const branchCell of Object.values(daySchedule)) {
    for (const n of branchCell?.nurses || []) if (n?.id) ids.add(n.id);
    for (const r of branchCell?.receptionists || []) if (r?.id) ids.add(r.id);
  }
  return ids;
}

/** For one staff on one date, return { done, total, items: [{id, text, order, done}] }. */
export function getStaffProgress({ templates, completions, role, dayName, dateStr, staffId }) {
  const items = getTodosForRoleDay(templates, role, dayName);
  const staffCompletions = completions?.[dateStr]?.[staffId] || {};
  const withState = items.map(it => ({ ...it, done: !!staffCompletions[it.id] }));
  const done = withState.filter(i => i.done).length;
  return { done, total: items.length, items: withState };
}
