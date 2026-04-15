/**
 * Helpers for nursing-certification / licence expiry tracking.
 * Status buckets and thresholds mirror the vial-stock expiry styling so the
 * admin's mental model carries over.
 */

export const CERT_STATUS = {
  EXPIRED: 'expired',
  SOON:    'soon',    // within 30 days
  CHECK:   'check',   // within 60 days
  OK:      'ok',
  UNKNOWN: 'unknown', // no expiry set
};

export function getCertStatus(expiryDate, { now = new Date() } = {}) {
  if (!expiryDate) return { status: CERT_STATUS.UNKNOWN, daysRemaining: null };
  const d = new Date(expiryDate);
  if (isNaN(d.getTime())) return { status: CERT_STATUS.UNKNOWN, daysRemaining: null };
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (days < 0)   return { status: CERT_STATUS.EXPIRED, daysRemaining: days };
  if (days <= 30) return { status: CERT_STATUS.SOON,    daysRemaining: days };
  if (days <= 60) return { status: CERT_STATUS.CHECK,   daysRemaining: days };
  return { status: CERT_STATUS.OK, daysRemaining: days };
}

export const CERT_STATUS_STYLES = {
  expired: { label: 'Expired',   dot: 'bg-red-500',    text: 'text-red-400',    badge: 'bg-red-500/15 border-red-500/30 text-red-400' },
  soon:    { label: 'Expiring',  dot: 'bg-amber-500',  text: 'text-amber-400',  badge: 'bg-amber-500/15 border-amber-500/30 text-amber-400' },
  check:   { label: 'Check',     dot: 'bg-yellow-500', text: 'text-yellow-400', badge: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' },
  ok:      { label: 'Valid',     dot: 'bg-green-500',  text: 'text-green-400',  badge: 'bg-green-500/15 border-green-500/30 text-green-400' },
  unknown: { label: 'No expiry', dot: 'bg-d4l-dim',    text: 'text-d4l-dim',    badge: 'bg-d4l-hover border-d4l-border text-d4l-dim' },
};

/** Summarise a staff member's certs into the worst status + counts. */
export function summarizeCerts(certifications, opts = {}) {
  const counts = { expired: 0, soon: 0, check: 0, ok: 0, unknown: 0 };
  const certs = Array.isArray(certifications) ? certifications : [];
  for (const c of certs) {
    const { status } = getCertStatus(c?.expiryDate, opts);
    counts[status] = (counts[status] || 0) + 1;
  }
  const priority = ['expired', 'soon', 'check', 'unknown', 'ok'];
  const worstStatus = priority.find(p => counts[p] > 0) || 'ok';
  return { worstStatus, counts, total: certs.length };
}

/** Common nursing cert types in a South African IV clinic. */
export const COMMON_CERT_TYPES = [
  'SANC Registration',
  'Practice Number (BHF)',
  'HPCSA Registration',
  'BLS / CPR Certification',
  'ACLS Certification',
  'Aesthetic Nursing Certification',
  'Medical Indemnity Insurance',
  'ID Document',
  'Work Permit / Visa',
];

export function formatExpiryRelative(expiryDate, { now = new Date() } = {}) {
  if (!expiryDate) return '—';
  const { status, daysRemaining } = getCertStatus(expiryDate, { now });
  if (status === CERT_STATUS.UNKNOWN) return '—';
  if (status === CERT_STATUS.EXPIRED) {
    const abs = Math.abs(daysRemaining);
    return abs === 0 ? 'expires today' : `expired ${abs}d ago`;
  }
  if (daysRemaining === 0) return 'expires today';
  if (daysRemaining === 1) return 'tomorrow';
  return `in ${daysRemaining}d`;
}

export function genCertId() {
  return 'cert_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
