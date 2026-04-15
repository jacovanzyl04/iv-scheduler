import { createContext, useContext, useCallback, useMemo } from 'react';
import { logAudit } from '../utils/audits';

// Default no-op so components work even if not wrapped
const AuditLoggerContext = createContext(() => null);
const AuditsDataContext = createContext({});

export function AuditProvider({ currentUser, staffName, userRole, audits, children }) {
  const log = useCallback((entry) => {
    return logAudit(entry, { currentUser, staffName, userRole });
  }, [currentUser, staffName, userRole]);

  // Split the audits object into a stable identity so consumers of the
  // logger don't re-render on every audit arrival.
  const data = useMemo(() => audits || {}, [audits]);

  return (
    <AuditLoggerContext.Provider value={log}>
      <AuditsDataContext.Provider value={data}>
        {children}
      </AuditsDataContext.Provider>
    </AuditLoggerContext.Provider>
  );
}

/**
 * Hook returning a `log(entry)` function bound to the current user.
 */
export function useAudit() {
  return useContext(AuditLoggerContext);
}

/**
 * Hook returning the full audits map. Use on pages that render an inline
 * Logs tab via <AuditLogPanel fixedDomain="..." audits={audits} />.
 */
export function useAudits() {
  return useContext(AuditsDataContext);
}
