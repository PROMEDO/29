/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PublicVisitScope = 'site' | 'menu';

const VISITOR_UID_KEY = 'mp_visitor_uid';
const SCOPE_COOLDOWN_MS = 60_000;
const recentSentAt: Partial<Record<PublicVisitScope, number>> = {};

function generateVisitorToken(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '');
    }
  } catch {
    // fallback below
  }
  const randA = Math.random().toString(36).slice(2, 12);
  const randB = Date.now().toString(36);
  return `${randB}${randA}`;
}

export function getOrCreateVisitorUid(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(VISITOR_UID_KEY)?.trim() || '';
    if (/^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
      return existing;
    }
    const created = generateVisitorToken();
    window.localStorage.setItem(VISITOR_UID_KEY, created);
    return created;
  } catch {
    return '';
  }
}

export function trackPublicVisit(scope: PublicVisitScope): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const prev = recentSentAt[scope] || 0;
  if (now - prev < SCOPE_COOLDOWN_MS) return;
  recentSentAt[scope] = now;

  const visitorId = getOrCreateVisitorUid();
  try {
    void fetch('/api/analytics/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, visitorId }),
      keepalive: true,
    }).catch(() => {
      // ignore offline or transient analytics network errors
    });
  } catch {
    // ignore fetch init errors
  }
}
