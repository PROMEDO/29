/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order, Restaurant } from '../types';
import { buildDefaultAddons } from '../data/addonsCatalog';
import { getCollection, getItem } from './storage';

let sharedBellAudioCtx: AudioContext | null = null;
let pendingBellTone: { tone: 'chime' | 'bell' | 'alert'; queuedAt: number } | null = null;
let lastBellTriggeredAt = 0;

function getOrCreateBellAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedBellAudioCtx || sharedBellAudioCtx.state === 'closed') {
    sharedBellAudioCtx = new AudioCtx();
  }
  return sharedBellAudioCtx;
}

export function clearPendingBellTone(): void {
  pendingBellTone = null;
}

function scheduleBellChime(ctx: AudioContext, tone: 'chime' | 'bell' | 'alert') {
  const nowMs = Date.now();
  if (nowMs - lastBellTriggeredAt < 450) return;
  lastBellTriggeredAt = nowMs;

  const baseNow = ctx.currentTime + 0.02;
  // Boosted by +50% over original levels (with soft compressor headroom protection)
  const VOLUME_BOOST = 1.5;

  let outputNode: AudioNode = ctx.destination;
  try {
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-10, baseNow);
      comp.knee.setValueAtTime(12, baseNow);
      comp.ratio.setValueAtTime(6, baseNow);
      comp.attack.setValueAtTime(0.004, baseNow);
      comp.release.setValueAtTime(0.18, baseNow);
      comp.connect(ctx.destination);
      outputNode = comp;
    }
  } catch {
    outputNode = ctx.destination;
  }

  const baseNotes: Array<{ freq: number; delay: number; duration: number; gain: number; shimmer?: number }> =
    tone === 'bell'
      ? [
          { freq: 987.77, delay: 0, duration: 0.48, gain: 0.11 * VOLUME_BOOST, shimmer: 1975.53 },
          { freq: 1318.51, delay: 0.13, duration: 0.68, gain: 0.125 * VOLUME_BOOST, shimmer: 2637.02 },
        ]
      : tone === 'alert'
      ? [
          { freq: 659.25, delay: 0, duration: 0.28, gain: 0.1 * VOLUME_BOOST, shimmer: 1318.51 },
          { freq: 880, delay: 0.14, duration: 0.42, gain: 0.115 * VOLUME_BOOST, shimmer: 1760 },
        ]
      : [
          { freq: 587.33, delay: 0, duration: 0.34, gain: 0.1 * VOLUME_BOOST },
          { freq: 783.99, delay: 0.11, duration: 0.4, gain: 0.11 * VOLUME_BOOST },
          { freq: 1046.5, delay: 0.22, duration: 0.56, gain: 0.105 * VOLUME_BOOST, shimmer: 2093 },
        ];

  // Single chime per order arrival event (like WhatsApp notification)
  baseNotes.forEach(({ freq, delay, duration, gain: peakGain, shimmer }) => {
    const start = baseNow + delay;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = tone === 'alert' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, start);

    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.linearRampToValueAtTime(peakGain, start + 0.014);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gainNode);
    gainNode.connect(outputNode);
    osc.start(start);
    osc.stop(start + duration + 0.03);

    if (shimmer) {
      const shimmerOsc = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      shimmerOsc.type = 'sine';
      shimmerOsc.frequency.setValueAtTime(shimmer, start);
      shimmerGain.gain.setValueAtTime(0.0001, start);
      shimmerGain.gain.linearRampToValueAtTime(0.02 * VOLUME_BOOST, start + 0.012);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.72);
      shimmerOsc.connect(shimmerGain);
      shimmerGain.connect(outputNode);
      shimmerOsc.start(start);
      shimmerOsc.stop(start + duration + 0.03);
    }
  });
}

export function unlockBellAudio() {
  try {
    const ctx = getOrCreateBellAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        try {
          const silentBuf = ctx.createBuffer(1, 1, 22050);
          const src = ctx.createBufferSource();
          src.buffer = silentBuf;
          src.connect(ctx.destination);
          src.start(0);
        } catch {
          // ignore silent buffer errors
        }
        if (pendingBellTone && ctx.state === 'running') {
          const queued = pendingBellTone;
          pendingBellTone = null;
          if (Date.now() - queued.queuedAt < 6000) {
            scheduleBellChime(ctx, queued.tone);
          }
        }
      });
    } else if (pendingBellTone && ctx.state === 'running') {
      const queued = pendingBellTone;
      pendingBellTone = null;
      if (Date.now() - queued.queuedAt < 6000) {
        scheduleBellChime(ctx, queued.tone);
      }
    }
  } catch {
    // ignore browser audio restrictions
  }
}

export function playBellTone(tone: 'chime' | 'bell' | 'alert' = 'bell') {
  try {
    const ctx = getOrCreateBellAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      pendingBellTone = { tone, queuedAt: Date.now() };
      void ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running' && pendingBellTone) {
            const queued = pendingBellTone;
            pendingBellTone = null;
            if (Date.now() - queued.queuedAt < 6000) {
              scheduleBellChime(ctx, queued.tone);
            }
          }
        })
        .catch(() => {});
      return;
    }
    pendingBellTone = null;
    scheduleBellChime(ctx, tone);
  } catch {
    // ignore audio autoplay restrictions
  }
}

const NOTIFIED_ORDERS_PREFIX = 'mp_notified_orders_v1:';
const BASELINE_ORDERS_PREFIX = 'mp_orders_baseline_v1:';
const MAX_STORED_ORDER_IDS = 400;
const FRESH_ARRIVAL_WINDOW_MS = 20_000;

export function getNotifiedOrderIds(rid: string): Set<string> {
  if (typeof window === 'undefined' || !rid) return new Set();
  try {
    const raw = window.localStorage.getItem(`${NOTIFIED_ORDERS_PREFIX}${rid}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((id) => String(id || '').trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function hasBaselineInitialized(rid: string): boolean {
  if (typeof window === 'undefined' || !rid) return false;
  try {
    return Boolean(window.localStorage.getItem(`${BASELINE_ORDERS_PREFIX}${rid}`));
  } catch {
    return false;
  }
}

function markBaselineInitialized(rid: string, lastOrderAt: number): void {
  if (typeof window === 'undefined' || !rid) return;
  try {
    window.localStorage.setItem(
      `${BASELINE_ORDERS_PREFIX}${rid}`,
      JSON.stringify({ initializedAt: Date.now(), lastOrderAt })
    );
  } catch {
    // ignore storage errors
  }
}

export function markOrdersAsNotified(rid: string, orderIds: string[]): void {
  if (typeof window === 'undefined' || !rid || orderIds.length === 0) return;
  try {
    const existing = Array.from(getNotifiedOrderIds(rid));
    const mergedSet = new Set(existing);
    orderIds.forEach((id) => {
      const clean = String(id || '').trim();
      if (clean) mergedSet.add(clean);
    });
    const list = Array.from(mergedSet).slice(-MAX_STORED_ORDER_IDS);
    window.localStorage.setItem(`${NOTIFIED_ORDERS_PREFIX}${rid}`, JSON.stringify(list));
  } catch {
    // ignore localStorage quota/privacy errors
  }
}

/**
 * Checks pending/new orders for `ownerRid`.
 * Only notifies ONCE for genuinely newly arrived pending orders:
 * - On initial dashboard hydration (when baseline is not yet established), any existing order
 *   older than 20s is silently recorded in the baseline without playing sound or showing stale toasts.
 * - Real incoming arrivals fire the chime ONCE and persist immediately.
 */
export function checkAndNotifyPendingOrders(
  ownerRid: string,
  showToast: (msg: string) => void,
  opts?: { isDashboardRoute?: boolean; silentBaselineOnly?: boolean }
): Order[] {
  const rid = String(ownerRid || '').trim();
  if (!rid) return [];

  const allOrders = getCollection<Order>('orders')
    .filter((o) => o.rid === rid)
    .sort((a, b) => (b.at || 0) - (a.at || 0));

  const baselineReady = hasBaselineInitialized(rid);

  if (allOrders.length === 0) {
    if (!baselineReady) {
      markBaselineInitialized(rid, 0);
    }
    return [];
  }

  const notifiedIds = getNotifiedOrderIds(rid);
  const pendingUnnotified = allOrders.filter(
    (o) => (o.st === 'new' || o.status === 'pending') && !notifiedIds.has(o.id)
  );

  if (pendingUnnotified.length === 0) {
    if (!baselineReady) {
      markBaselineInitialized(rid, Number(allOrders[0]?.at || 0));
    }
    return [];
  }

  const now = Date.now();

  if (opts?.silentBaselineOnly) {
    markOrdersAsNotified(
      rid,
      pendingUnnotified.map((o) => o.id)
    );
    markBaselineInitialized(rid, Number(allOrders[0]?.at || now));
    return [];
  }

  // First open on a device / new browser for this menu:
  // Silently baseline historical orders (> 20s old), and only ring if a live order just arrived.
  if (!baselineReady) {
    const staleOrders = pendingUnnotified.filter((o) => now - (Number(o.at) || 0) > FRESH_ARRIVAL_WINDOW_MS);
    const liveOrders = pendingUnnotified.filter((o) => now - (Number(o.at) || 0) <= FRESH_ARRIVAL_WINDOW_MS);

    if (staleOrders.length > 0) {
      markOrdersAsNotified(
        rid,
        staleOrders.map((o) => o.id)
      );
    }
    markBaselineInitialized(rid, Number(allOrders[0]?.at || now));

    if (liveOrders.length === 0) {
      return [];
    }
  }

  const toNotify = !baselineReady
    ? pendingUnnotified.filter((o) => now - (Number(o.at) || 0) <= FRESH_ARRIVAL_WINDOW_MS)
    : pendingUnnotified;

  if (toNotify.length === 0) return [];

  // Mark immediately before alerting so rapid events or refreshes never replay the same notification
  markOrdersAsNotified(
    rid,
    toNotify.map((o) => o.id)
  );
  markBaselineInitialized(rid, Number(allOrders[0]?.at || now));

  const rest = getItem<Restaurant>(`restaurants/${rid}`);
  const addonsState = buildDefaultAddons(rest || undefined);
  const bellAllowed = !addonsState.audioBell?.mutedByUser && addonsState.audioBell?.enabled !== false;

  if (bellAllowed) {
    playBellTone(addonsState.audioBell?.tone || 'bell');
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([180, 90, 180]);
    }
  } catch {
    // ignore unsupported vibration API
  }

  const latest = toNotify[0];
  const seqVal = latest?.orderSeq || latest?.seq;
  const seqLabel = seqVal ? `#${seqVal}` : `#${String(latest?.id || '').slice(-6).toUpperCase()}`;

  showToast(
    toNotify.length === 1
      ? `وصل طلب جديد (${seqLabel})`
      : `وصلت ${toNotify.length} طلبات جديدة`
  );

  return toNotify;
}
