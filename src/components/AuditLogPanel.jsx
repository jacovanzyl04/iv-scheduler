import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  History, Search, Filter, ChevronDown,
} from 'lucide-react';
import {
  DOMAIN_LABELS,
  DOMAIN_STYLES,
  ACTION_LABELS,
  formatRelativeTime,
  formatFullTime,
  dayLabel,
} from '../utils/audits';

/**
 * Embeddable audit log panel. Can be used standalone (full Audit Log page) or
 * inside a page tab filtered to a single domain.
 *
 * @param {Object} props
 * @param {Object} props.audits — { id: entry } map
 * @param {string} [props.fixedDomain] — when set, the domain filter is hidden
 *        and results are locked to that domain
 * @param {boolean} [props.compact] — tighter spacing when embedded as a tab
 */
export default function AuditLogPanel({ audits, fixedDomain, compact }) {
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState(fixedDomain || 'all');
  const [actionFilter, setActionFilter] = useState('all');

  // Keep the domain filter locked to fixedDomain if the prop is present
  useEffect(() => {
    if (fixedDomain) setDomainFilter(fixedDomain);
  }, [fixedDomain]);

  const auditArr = useMemo(() => {
    const arr = Object.values(audits || {}).filter(Boolean);
    arr.sort((a, b) => (b.at || 0) - (a.at || 0));
    return arr;
  }, [audits]);

  const scopedArr = useMemo(() => {
    if (!fixedDomain) return auditArr;
    return auditArr.filter(a => a.domain === fixedDomain);
  }, [auditArr, fixedDomain]);

  const availableActions = useMemo(() => {
    const set = new Set();
    for (const a of scopedArr) {
      if (!fixedDomain && domainFilter !== 'all' && a.domain !== domainFilter) continue;
      set.add(a.action);
    }
    return Array.from(set).sort();
  }, [scopedArr, domainFilter, fixedDomain]);

  useEffect(() => {
    if (actionFilter !== 'all' && !availableActions.includes(actionFilter)) {
      setActionFilter('all');
    }
  }, [availableActions, actionFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedArr.filter(a => {
      if (!fixedDomain && domainFilter !== 'all' && a.domain !== domainFilter) return false;
      if (actionFilter !== 'all' && a.action !== actionFilter) return false;
      if (!q) return true;
      return (
        (a.targetLabel || '').toLowerCase().includes(q) ||
        (a.byName || '').toLowerCase().includes(q) ||
        (a.byEmail || '').toLowerCase().includes(q) ||
        (a.action || '').toLowerCase().includes(q)
      );
    });
  }, [scopedArr, search, domainFilter, actionFilter, fixedDomain]);

  const grouped = useMemo(() => {
    const groups = [];
    let currentKey = null;
    let currentGroup = null;
    for (const entry of filtered) {
      const key = dayLabel(entry.at);
      if (key !== currentKey) {
        currentKey = key;
        currentGroup = { label: key, entries: [] };
        groups.push(currentGroup);
      }
      currentGroup.entries.push(entry);
    }
    return groups;
  }, [filtered]);

  // Resolve action label — preserving the domain prefix if available
  const resolveActionLabel = (actionId) => {
    if (fixedDomain) {
      return ACTION_LABELS[`${fixedDomain}.${actionId}`] || actionId;
    }
    if (domainFilter !== 'all') {
      return ACTION_LABELS[`${domainFilter}.${actionId}`] || actionId;
    }
    // Find any label ending with .actionId
    const key = Object.keys(ACTION_LABELS).find(k => k.endsWith(`.${actionId}`));
    return key ? ACTION_LABELS[key] : actionId;
  };

  return (
    <>
      {/* Controls row */}
      <div className={`bg-d4l-surface border border-d4l-border rounded-xl ${compact ? 'p-2.5' : 'p-3'} mb-4 flex flex-col md:flex-row md:items-center gap-3 section-animate panel-glow`}>
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-d4l-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={fixedDomain ? 'Search these logs...' : 'Search by target, actor or action...'}
            className="w-full pl-9 pr-3 py-2 bg-d4l-bg border border-d4l-border rounded-lg text-sm text-d4l-text placeholder-d4l-dim focus:outline-none focus:border-d4l-gold/60"
          />
        </div>
        {!fixedDomain && (
          <DropdownFilter
            value={domainFilter}
            onChange={setDomainFilter}
            options={[
              { id: 'all', label: 'All domains' },
              ...Object.entries(DOMAIN_LABELS).map(([id, label]) => ({ id, label })),
            ]}
            icon={<Filter className="w-3.5 h-3.5 text-d4l-muted" />}
          />
        )}
        <DropdownFilter
          value={actionFilter}
          onChange={setActionFilter}
          options={[
            { id: 'all', label: 'All actions' },
            ...availableActions.map(a => ({ id: a, label: resolveActionLabel(a) })),
          ]}
          icon={<Filter className="w-3.5 h-3.5 text-d4l-muted" />}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-d4l-muted mb-3">
        <span>
          Showing <span className="text-d4l-text font-semibold">{filtered.length}</span> of {scopedArr.length} entries — newest first
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-d4l-surface border border-d4l-border rounded-xl py-16 px-6 text-center panel-glow">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-d4l-hover/40 text-d4l-muted mb-4">
            <History className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-semibold text-d4l-text mb-1">
            {scopedArr.length === 0 ? 'No audit activity yet' : 'No matches'}
          </h3>
          <p className="text-sm text-d4l-muted">
            {scopedArr.length === 0
              ? (fixedDomain
                  ? `Changes on this page will appear here as they happen.`
                  : 'Changes to staff, accounts, schedules, pay cycles and timesheets will appear here as they happen.')
              : 'Try a different search term or filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6 section-animate section-animate-delay-1">
          {grouped.map(g => (
            <div key={g.label}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-d4l-muted">{g.label}</span>
                <div className="flex-1 h-px bg-d4l-border" />
                <span className="text-[11px] text-d4l-dim">{g.entries.length}</span>
              </div>
              <div className="space-y-2">
                {g.entries.map(a => (
                  <AuditRow key={a.id} audit={a} showDomainChip={!fixedDomain} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------- */

function DropdownFilter({ value, onChange, options, icon }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const current = options.find(o => o.id === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.max(r.width, 200);
      const wantedH = Math.min(options.length * 34 + 8, 400);
      const below = window.innerHeight - r.bottom;
      const openUp = below < wantedH && r.top > wantedH;
      setPos({
        top: openUp ? Math.max(8, r.top - wantedH - 4) : r.bottom + 4,
        left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)),
        width: w,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, options.length]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 bg-d4l-bg border border-d4l-border rounded-lg text-sm text-d4l-text hover:border-d4l-gold/40 transition-colors min-w-[180px] justify-between"
      >
        <span className="flex items-center gap-2 truncate">{icon}{current.label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-d4l-muted shrink-0" />
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div
            className="fixed bg-d4l-raised border border-d4l-border rounded-lg shadow-2xl z-[91] overflow-auto"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: 400 }}
          >
            {options.map(o => (
              <button
                key={o.id}
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  value === o.id
                    ? 'bg-d4l-gold/10 text-d4l-gold'
                    : 'text-d4l-text hover:bg-d4l-hover'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

function AuditRow({ audit, showDomainChip }) {
  const domainStyle = DOMAIN_STYLES[audit.domain] || DOMAIN_STYLES.system;
  const domainLabel = DOMAIN_LABELS[audit.domain] || audit.domain || 'Unknown';
  const actionLabel = ACTION_LABELS[`${audit.domain}.${audit.action}`] || audit.action;
  const initials = (audit.byName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="bg-d4l-surface border border-d4l-border rounded-lg overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-2.5 bg-d4l-bg border-b border-d4l-border">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          {showDomainChip && (
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${domainStyle.color} ${domainStyle.bg} ${domainStyle.border}`}>
              {domainLabel}
            </span>
          )}
          <span className="text-xs text-d4l-muted font-medium">{actionLabel}</span>
          {audit.targetLabel && (
            <>
              <span className="text-d4l-dim text-xs">—</span>
              <span className="text-sm text-d4l-text font-medium truncate">{audit.targetLabel}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-full bg-d4l-gold/20 text-d4l-gold flex items-center justify-center text-[11px] font-semibold">
            {initials}
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-[11px] text-d4l-text font-medium truncate max-w-[160px]">{audit.byName}</p>
            <p className="text-[10px] text-d4l-dim">{audit.byRole || 'user'}</p>
          </div>
        </div>
      </div>

      {(Array.isArray(audit.changes) && audit.changes.length) || (Array.isArray(audit.details) && audit.details.length) ? (
        <div className="px-4 py-3">
          {Array.isArray(audit.changes) && audit.changes.length > 0 && (
            <ul className="pl-4 space-y-0.5">
              {audit.changes.map((c, i) => (
                <li key={i} className="text-xs text-d4l-muted list-disc list-outside marker:text-d4l-dim">
                  <span className="text-d4l-text2">{c.field}:</span>{' '}
                  <span className="text-d4l-dim line-through">{truncate(c.from)}</span>
                  {' → '}
                  <span className="text-d4l-text">{truncate(c.to)}</span>
                </li>
              ))}
            </ul>
          )}
          {Array.isArray(audit.details) && audit.details.length > 0 && (
            <ul className="pl-4 space-y-0.5 mt-1">
              {audit.details.map((d, i) => (
                <li key={i} className="text-xs text-d4l-muted list-disc list-outside marker:text-d4l-dim">{d}</li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-d4l-dim mt-2" title={formatFullTime(audit.at)}>
            {formatFullTime(audit.at)} · {formatRelativeTime(audit.at)}
          </p>
        </div>
      ) : (
        <div className="px-4 py-2 text-[10px] text-d4l-dim" title={formatFullTime(audit.at)}>
          {formatFullTime(audit.at)} · {formatRelativeTime(audit.at)}
        </div>
      )}
    </div>
  );
}

function truncate(s, max = 60) {
  if (s == null) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max) + '…' : str;
}
