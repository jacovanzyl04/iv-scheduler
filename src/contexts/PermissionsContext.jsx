import { createContext, useContext, useMemo } from 'react';
import { getEffectivePermissions } from '../utils/permissions';

const PermissionsContext = createContext({});

export function PermissionsProvider({ role, permissions, children }) {
  const effective = useMemo(
    () => getEffectivePermissions({ role, permissions }),
    [role, permissions]
  );
  return (
    <PermissionsContext.Provider value={effective}>
      {children}
    </PermissionsContext.Provider>
  );
}

/**
 * Returns the effective access level for a permission key.
 *   'full' — read + write
 *   'view' — read only
 *    false — no access
 */
export function useAccess(key) {
  const effective = useContext(PermissionsContext);
  return effective[key];
}

export function useEffectivePermissions() {
  return useContext(PermissionsContext);
}

/**
 * Convenience: { canRead, canWrite } derived from a permission key.
 */
export function useCan(key) {
  const level = useAccess(key);
  return {
    canRead:  level === 'full' || level === 'view',
    canWrite: level === 'full',
    level,
  };
}
