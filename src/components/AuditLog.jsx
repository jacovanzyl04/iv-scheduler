import { useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import AuditLogPanel from './AuditLogPanel';

export default function AuditLog({ audits }) {
  const totalCount = useMemo(() => Object.keys(audits || {}).length, [audits]);

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 section-animate">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-wide text-d4l-text font-display">
            Audit Log
          </h1>
          <p className="text-d4l-muted text-sm mt-0.5">
            Every change to staff, accounts, schedules, pay cycles, timesheets, availability, stock and transfers — with who, what and when
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-d4l-muted">
          <ShieldCheck className="w-4 h-4 text-d4l-gold" />
          <span>{totalCount.toLocaleString()} total entries</span>
        </div>
      </div>

      <AuditLogPanel audits={audits} />
    </div>
  );
}
