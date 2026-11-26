/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getInternalStoreItem, upsertInternalKvSilent } from './neon-store.ts';

const VISITOR_STORE_KEY = 'settings/visitor_analytics_internal';
const VISITOR_FILE = path.resolve(process.cwd(), 'data/visitor-analytics.json');
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 90 * DAY_MS;
const MAX_STORED_RECORDS = 15_000;
const FLUSH_DELAY_MS = 60_000;

const CRAWLER_UA_RE =
  /(googlebot|bingbot|yandexbot|baiduspider|duckduckbot|slurp|facebookexternalhit|twitterbot|slackbot|discordbot|telegrambot|whatsapp|semrushbot|ahrefsbot|petalbot|applebot|linkedinbot|pinterestbot)/i;

export type VisitScope = 'site' | 'menu';

interface StoredVisitorRecord {
  f: number; // firstSeen timestamp (ms)
  l: number; // lastSeen timestamp (ms)
  s?: 1;     // visited main site
  m?: 1;     // visited customer menu
}

interface VisitorAnalyticsDoc {
  version: 1;
  nextId: number;
  totalEver: number;
  visitors: Record<string, StoredVisitorRecord>;
  ipIndex: Record<string, string>;
  devIndex: Record<string, string>;
}

export interface VisitorStatsSummary {
  last24h: number;
  total: number;
  siteLast24h: number;
  menuLast24h: number;
  updatedAt: number;
}

function createEmptyDoc(): VisitorAnalyticsDoc {
  return {
    version: 1,
    nextId: 1,
    totalEver: 0,
    visitors: {},
    ipIndex: {},
    devIndex: {},
  };
}

let cachedDoc: VisitorAnalyticsDoc | null = null;
let loadPromise: Promise<VisitorAnalyticsDoc> | null = null;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let activeFlush: Promise<void> | null = null;

function sanitizeDoc(raw: unknown): VisitorAnalyticsDoc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createEmptyDoc();
  }
  const obj = raw as Partial<VisitorAnalyticsDoc>;
  const visitors: Record<string, StoredVisitorRecord> = {};
  if (obj.visitors && typeof obj.visitors === 'object' && !Array.isArray(obj.visitors)) {
    for (const [id, rec] of Object.entries(obj.visitors)) {
      if (!rec || typeof rec !== 'object') continue;
      const f = Number((rec as StoredVisitorRecord).f);
      const l = Number((rec as StoredVisitorRecord).l);
      if (!Number.isFinite(f) || !Number.isFinite(l)) continue;
      const cleaned: StoredVisitorRecord = { f, l };
      if ((rec as StoredVisitorRecord).s === 1) cleaned.s = 1;
      if ((rec as StoredVisitorRecord).m === 1) cleaned.m = 1;
      visitors[id] = cleaned;
    }
  }

  const ipIndex: Record<string, string> = {};
  if (obj.ipIndex && typeof obj.ipIndex === 'object' && !Array.isArray(obj.ipIndex)) {
    for (const [h, vid] of Object.entries(obj.ipIndex)) {
      if (typeof vid === 'string' && visitors[vid]) {
        ipIndex[h] = vid;
      }
    }
  }

  const devIndex: Record<string, string> = {};
  if (obj.devIndex && typeof obj.devIndex === 'object' && !Array.isArray(obj.devIndex)) {
    for (const [h, vid] of Object.entries(obj.devIndex)) {
      if (typeof vid === 'string' && visitors[vid]) {
        devIndex[h] = vid;
      }
    }
  }

  const visitorCount = Object.keys(visitors).length;
  const rawTotal = Number(obj.totalEver);
  const totalEver = Number.isFinite(rawTotal) && rawTotal >= visitorCount ? rawTotal : visitorCount;
  const rawNextId = Number(obj.nextId);
  const nextId = Number.isFinite(rawNextId) && rawNextId >= 1 ? Math.floor(rawNextId) : visitorCount + 1;

  return {
    version: 1,
    nextId,
    totalEver,
    visitors,
    ipIndex,
    devIndex,
  };
}

async function readVisitorFileOrFallback(): Promise<unknown> {
  try {
    if (fs.existsSync(VISITOR_FILE)) {
      const raw = await fs.promises.readFile(VISITOR_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // fall back to KV item once if local file missing/corrupt
  }
  return getInternalStoreItem<unknown>(VISITOR_STORE_KEY);
}

async function persistVisitorSnapshot(snapshot: VisitorAnalyticsDoc): Promise<void> {
  const dir = path.dirname(VISITOR_FILE);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmpPath = `${VISITOR_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(snapshot), 'utf-8');
  await fs.promises.rename(tmpPath, VISITOR_FILE);
  await upsertInternalKvSilent(VISITOR_STORE_KEY, snapshot);
}

async function ensureLoaded(): Promise<VisitorAnalyticsDoc> {
  if (cachedDoc) return cachedDoc;
  if (!loadPromise) {
    loadPromise = readVisitorFileOrFallback()
      .then((raw) => {
        cachedDoc = sanitizeDoc(raw);
        return cachedDoc;
      })
      .catch(() => {
        cachedDoc = createEmptyDoc();
        return cachedDoc;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

export async function flushVisitorAnalytics(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!cachedDoc || !dirty) return;
  if (activeFlush) {
    await activeFlush;
    return;
  }
  dirty = false;
  const snapshot = cachedDoc;
  activeFlush = persistVisitorSnapshot(snapshot)
    .catch((err) => {
      dirty = true;
      console.warn('[VisitorAnalytics] Failed to persist stats:', err?.message || err);
    })
    .finally(() => {
      activeFlush = null;
    });
  await activeFlush;
}

function scheduleFlush(): void {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushVisitorAnalytics();
  }, FLUSH_DELAY_MS);
  flushTimer.unref?.();
}

function normalizeClientIp(rawIp?: string): string {
  const first = String(rawIp || '').split(',')[0].trim().toLowerCase();
  if (!first) return '';
  const stripped = first.startsWith('::ffff:') ? first.slice(7) : first;
  if (stripped === '::1' || stripped === '127.0.0.1' || stripped === '0.0.0.0') {
    return 'loopback';
  }
  if (stripped.length > 64) return '';
  return stripped;
}

function sanitizeDeviceToken(rawToken?: string): string {
  const token = String(rawToken || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(token)) return '';
  return token;
}

function hashIdentifier(kind: 'ip' | 'dev', value: string): string {
  return crypto
    .createHash('sha256')
    .update(`mp_visitor_v1:${kind}:${value}`)
    .digest('hex')
    .slice(0, 20);
}

function pruneOldRecordsIfNeeded(doc: VisitorAnalyticsDoc, now: number): void {
  const entries = Object.entries(doc.visitors);
  if (entries.length <= MAX_STORED_RECORDS) return;

  const cutoff = now - RETENTION_MS;
  const removedIds = new Set<string>();
  for (const [id, rec] of entries) {
    if (rec.l < cutoff) {
      delete doc.visitors[id];
      removedIds.add(id);
    }
  }

  // If still above cap after 90-day prune, trim oldest inactive visitors beyond 24h window
  if (Object.keys(doc.visitors).length > MAX_STORED_RECORDS) {
    const dayCutoff = now - DAY_MS;
    const sorted = Object.entries(doc.visitors)
      .filter(([, rec]) => rec.l < dayCutoff)
      .sort((a, b) => a[1].l - b[1].l);
    const excess = Object.keys(doc.visitors).length - MAX_STORED_RECORDS;
    for (let i = 0; i < excess && i < sorted.length; i++) {
      const id = sorted[i][0];
      delete doc.visitors[id];
      removedIds.add(id);
    }
  }

  if (removedIds.size > 0) {
    for (const [h, vid] of Object.entries(doc.ipIndex)) {
      if (removedIds.has(vid)) delete doc.ipIndex[h];
    }
    for (const [h, vid] of Object.entries(doc.devIndex)) {
      if (removedIds.has(vid)) delete doc.devIndex[h];
    }
  }
}

export async function recordSiteOrMenuVisit(input: {
  ip?: string;
  visitorId?: string;
  userAgent?: string;
  scope: VisitScope;
}): Promise<{ counted: boolean; isNewPerson: boolean }> {
  const ua = String(input.userAgent || '');
  if (ua && CRAWLER_UA_RE.test(ua)) {
    return { counted: false, isNewPerson: false };
  }

  const normalizedIp = normalizeClientIp(input.ip);
  const cleanToken = sanitizeDeviceToken(input.visitorId);
  if (!normalizedIp && !cleanToken) {
    return { counted: false, isNewPerson: false };
  }

  const doc = await ensureLoaded();
  const now = Date.now();
  const ipHash = normalizedIp ? hashIdentifier('ip', normalizedIp) : '';
  const devHash = cleanToken ? hashIdentifier('dev', cleanToken) : '';

  const byDev = devHash ? doc.devIndex[devHash] : undefined;
  const byIp = ipHash ? doc.ipIndex[ipHash] : undefined;
  let personId =
    (byDev && doc.visitors[byDev] ? byDev : undefined) ||
    (byIp && doc.visitors[byIp] ? byIp : undefined);

  let isNewPerson = false;
  if (!personId) {
    personId = `v${doc.nextId++}`;
    doc.totalEver += 1;
    doc.visitors[personId] = {
      f: now,
      l: now,
      ...(input.scope === 'site' ? { s: 1 } : { m: 1 }),
    };
    isNewPerson = true;
  } else {
    const existing = doc.visitors[personId];
    existing.l = now;
    if (input.scope === 'site') existing.s = 1;
    if (input.scope === 'menu') existing.m = 1;
  }

  if (ipHash) doc.ipIndex[ipHash] = personId;
  if (devHash) doc.devIndex[devHash] = personId;

  pruneOldRecordsIfNeeded(doc, now);
  scheduleFlush();

  return { counted: true, isNewPerson };
}

export async function getVisitorAnalyticsStats(): Promise<VisitorStatsSummary> {
  const doc = await ensureLoaded();
  const now = Date.now();
  const cutoff = now - DAY_MS;

  let last24h = 0;
  let siteLast24h = 0;
  let menuLast24h = 0;

  for (const rec of Object.values(doc.visitors)) {
    if (rec.l >= cutoff) {
      last24h += 1;
      if (rec.s === 1) siteLast24h += 1;
      if (rec.m === 1) menuLast24h += 1;
    }
  }

  return {
    last24h,
    total: doc.totalEver,
    siteLast24h,
    menuLast24h,
    updatedAt: now,
  };
}
