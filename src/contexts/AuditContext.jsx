import { createContext, useContext, useCallback } from 'react';
import { logAudit } from '../utils/audits';

// Default no-op so components work even if not wrapped
const AuditContext = createContext(() => null);

export function AuditProvider({ currentUser, staffName, userRole, children }) {
  const log = useCallback((entry) => {
    return logAudit(entry, { currentUser, staffName, userRole });
  }, [currentUser, staffName, userRole]);

  return (
    <AuditContext.Provider value={log}>
      {children}
    </AuditContext.Provider>
  );
}

/**
 * Hook returning a `log(entry)` function already bound to the current user.
 * Usage: const audit = useAudit(); audit({ domain: 'staff', action: 'created', ... });
 */
export function useAudit() {
  return useContext(AuditContext);
}
