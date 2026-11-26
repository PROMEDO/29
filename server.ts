/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyChanges,
  deleteInternalStoreItem,
  getInternalStoreItem,
  getMemoryStoreSnapshot,
  getRealtimeVersion,
  getStoreVersion,
  isReservedInternalKey,
  isSafeStoreKey,
  readAll,
  setInternalStoreItem,
  subscribeStoreChanges,
} from './server/neon-store.ts';
import {
  checkSupabaseHealth,
  getDatabaseUrlInfo,
  getSupabasePublicConfig,
  isSupabaseConfigured,
} from './server/supabase.ts';
import {
  readNotesDocument,
  saveNoteToFile,
  deleteNoteFromFile,
  replaceAllNotesInFile,
  type StoredNote,
} from './server/notes-store.ts';
import { searchWebImages, proxyExternalImage } from './server/image-search.ts';
import {
  getTelegramBotStatus,
  getTelegramOrderLinkStatus,
  handleIncomingTelegramMessage,
  initTelegramOrderLink,
  sendOrderNotificationToTelegram,
  sendPartnerTestOrderNotification,
  startTelegramBotPolling,
  stopTelegramBotPolling,
  toggleTelegramForRestaurant,
  unlinkTelegramForRestaurant,
  verifyTelegramBotLive,
} from './server/telegram-otp.ts';
import {
  attachAuthSession,
  createServerAuthSession,
  destroyServerAuthSession,
  FULL_OWNER_PERMISSIONS,
  hashPasswordScrypt,
  matchesPhoneCandidates,
  parseRequestCookies,
  requireAdminOrStaff,
  sanitizeAuthSessionForClient,
  signSid,
  updateServerAuthSession,
  verifyStoredCredential,
} from './server/auth.ts';
import { createAdminRouter } from './server/admin-routes.ts';
import {
  flushVisitorAnalytics,
  getVisitorAnalyticsStats,
  recordSiteOrMenuVisit,
} from './server/visitor-analytics.ts';
import {
  computePwaLogoVersion,
  getFallbackPwaIcon,
  getRestaurantRecordForPwa,
  resolveRestaurantPwaIcon,
} from './server/pwa-icon.ts';
import {
  ensureWebPushVapidKeys,
  getWebPushPublicKey,
  removePushSubscription,
  sendOrderWebPushNotifications,
  upsertPushSubscription,
} from './server/web-push.ts';
import {
  createSubdomainRouter,
  extractPlansList,
  generateUniqueMenuCode,
  isPaidPlanForRestaurant,
  isValidSixCharCode,
  normalizeSubdomainRules,
  sanitizeSubdomainValue,
  subdomainMiddleware,
  validatePathSlugFormat,
  type StoreRecord,
} from './server/subdomain.ts';
import {
  collectFamilyDescendantRids,
  collectTakenSlugsFromAllData,
  getOrderEpochMs,
  getOwnedPartnerRids,
  getSnapshotBuckets,
  preserveRestaurantOrderNotificationFields,
  resolvePublicHomeRecords,
  resolvePublicMenuFamily,
  resolveRestaurantEntryByIdOrSlug,
  sanitizeRecordSecrets,
  todayIsoDate,
} from './server/snapshot.ts';
import { createSeoAndMcpRouter, createSpaPageHandler } from './server/seo.ts';
import { runStartupMigrations } from './server/migrations.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const rawPort = String(process.env.PORT || '3000').trim();
const PORT: number | string = /^\d+$/.test(rawPort) ? Number(rawPort) : rawPort;
const isProduction = process.env.NODE_ENV === 'production' || __filename.endsWith('.js');
const BASE_DOMAIN = String(process.env.BASE_DOMAIN || 'menuplus.io')
  .toLowerCase()
  .trim()
  .replace(/^https?:\/\//, '')
  .replace(/\/.*$/, '') || 'menuplus.io';

app.set('trust proxy', true);
app.set('etag', false);
app.disable('x-powered-by');
app.use((req, _res, next) => {
  if (req.url.startsWith('//')) {
    req.url = req.url.replace(/^\/{2,}/, '/');
  }
  next();
});
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.path === '/api/realtime/events') return false;
      return compression.filter(req, res);
    },
  })
);

// Baseline HTTP security & wildcard-subdomain CORS headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=()');

  const origin = String(req.headers.origin || '').trim();
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.toLowerCase();
      if (
        originHost === BASE_DOMAIN ||
        originHost.endsWith(`.${BASE_DOMAIN}`) ||
        originHost === 'localhost' ||
        originHost.endsWith('.localhost')
      ) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id, X-Admin-Key');
      }
    } catch {
      // ignore invalid origin header
    }
  }
  next();
});

// Auth & OTP sliding-window rate limiters
const otpRateWindowMs = 60_000;
const otpRateMaxRequests = 25;
const otpRateBuckets = new Map<string, number[]>();
const loginRateMaxRequests = 20;
const loginRateBuckets = new Map<string, number[]>();

const otpCleanupTimer = setInterval(() => {
  const cutoff = Date.now() - otpRateWindowMs;
  for (const bucket of [otpRateBuckets, loginRateBuckets]) {
    for (const [ip, timestamps] of bucket.entries()) {
      const valid = timestamps.filter((ts) => ts > cutoff);
      if (valid.length === 0) {
        bucket.delete(ip);
      } else {
        bucket.set(ip, valid);
      }
    }
  }
}, otpRateWindowMs);
otpCleanupTimer.unref();

function otpRateLimiter(req: Request, res: Response, next: NextFunction) {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const cutoff = now - otpRateWindowMs;
  const recent = (otpRateBuckets.get(clientIp) || []).filter((ts) => ts > cutoff);

  if (recent.length >= otpRateMaxRequests) {
    return res.status(429).json({
      success: false,
      error: 'طلبات كثيرة جداً، يرجى الانتظار دقيقة والمحاولة مرة أخرى.',
    });
  }

  recent.push(now);
  otpRateBuckets.set(clientIp, recent);
  return next();
}

function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const cutoff = now - otpRateWindowMs;
  const recent = (loginRateBuckets.get(clientIp) || []).filter((ts) => ts > cutoff);

  if (recent.length >= loginRateMaxRequests) {
    return res.status(429).json({
      ok: false,
      error: 'محاولات دخول كثيرة جداً، يرجى الانتظار دقيقة والمحاولة مرة أخرى.',
    });
  }

  recent.push(now);
  loginRateBuckets.set(clientIp, recent);
  return next();
}

// Attach verified server session from signed HttpOnly cookie BEFORE any API routes
app.use(attachAuthSession);

// 0. Health Check endpoint for Hostinger / reverse proxies
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    status: 'healthy',
    env: isProduction ? 'production' : 'development',
    uptime: Math.round(process.uptime()),
  });
});

function resolveEffectiveAdminPermissions(req: Request) {
  const ses = req.authSession;
  return ses && (ses.role === 'owner' || !ses.staffId)
    ? FULL_OWNER_PERMISSIONS
    : { ...FULL_OWNER_PERMISSIONS, ...req.authPermissions };
}

let cachedVisitorDbPayload: { version: number; jsonPayload: string } | null = null;

// 1. Role-Scoped & Hardened Database Endpoints
app.get('/api/db', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const currentVersion = getStoreVersion();
    res.setHeader('X-Store-Version', String(currentVersion));
    const requestedVersion = Number(req.query.v || 0);
    if (Number.isFinite(requestedVersion) && requestedVersion > 0 && requestedVersion === currentVersion) {
      return res.json({ ok: true, unchanged: true, version: currentVersion });
    }

    const ses = req.authSession;
    if (!ses && cachedVisitorDbPayload && cachedVisitorDbPayload.version === currentVersion) {
      return res
        .status(200)
        .setHeader('Content-Type', 'application/json; charset=utf-8')
        .send(cachedVisitorDbPayload.jsonPayload);
    }

    const allData = await readAll(false);
    const buckets = getSnapshotBuckets(allData);
    const out: Record<string, unknown> = {};

    if (ses?.admin) {
      const perms = resolveEffectiveAdminPermissions(req);
      for (const [k, v] of Object.entries(allData)) {
        if (k.startsWith('accounts/')) {
          if (perms.canManageRestaurants || ses.accountId === k.slice('accounts/'.length)) {
            out[k] = sanitizeRecordSecrets(v);
          }
        } else if (k.startsWith('staff/')) {
          if (perms.canManageStaff || ses.staffId === k.slice('staff/'.length)) {
            out[k] = sanitizeRecordSecrets(v);
          }
        } else if (k.startsWith('notes/')) {
          if (perms.canUseNotes) {
            out[k] = v;
          }
        } else if (k.startsWith('reports/')) {
          if (perms.canViewReports !== false) {
            out[k] = v;
          }
        } else if (k.startsWith('finance_expenses/') || k.startsWith('finance_profits/') || k === 'settings/finance') {
          if (perms.canManageFinance) {
            out[k] = v;
          }
        } else if (k.startsWith('custom_font_files/')) {
          continue;
        } else {
          out[k] = sanitizeRecordSecrets(v);
        }
      }
      return res.json(out);
    }

    for (const [k, v] of buckets.settingsAndMeta) {
      if (k !== 'settings/finance') {
        out[k] = sanitizeRecordSecrets(v);
      }
    }
    for (const [rid, rec] of buckets.restaurants.entries()) {
      out[`restaurants/${rid}`] = sanitizeRecordSecrets(rec);
    }
    for (const entries of buckets.catsByRid.values()) {
      for (const [k, rec] of entries) {
        out[k] = sanitizeRecordSecrets(rec);
      }
    }
    for (const entries of buckets.itemsByRid.values()) {
      for (const [k, rec] of entries) {
        out[k] = sanitizeRecordSecrets(rec);
      }
    }

    if (ses && ses.role === 'partner') {
      const ownerRid = ses.personalRid || ses.rid;
      const ownedRids = getOwnedPartnerRids(allData, ownerRid, ses);
      for (const ownedRid of ownedRids) {
        const orderList = buckets.ordersByRid.get(ownedRid);
        if (orderList) {
          for (const [k, rec] of orderList) out[k] = sanitizeRecordSecrets(rec);
        }
        const reportList = buckets.reportsByRid.get(ownedRid);
        if (reportList) {
          for (const [k, rec] of reportList) out[k] = sanitizeRecordSecrets(rec);
        }
        const loyaltyList = buckets.loyaltyByRid.get(ownedRid);
        if (loyaltyList) {
          for (const [k, rec] of loyaltyList) out[k] = sanitizeRecordSecrets(rec);
        }
      }
      if (ses.accountId && allData[`accounts/${ses.accountId}`] !== undefined) {
        out[`accounts/${ses.accountId}`] = sanitizeRecordSecrets(allData[`accounts/${ses.accountId}`]);
      }
      return res.json(out);
    }

    // Unauthenticated visitor: cache pre-serialized public storefront catalog & settings payload by store version
    const latestVersion = getStoreVersion();
    const jsonPayload = JSON.stringify(out);
    cachedVisitorDbPayload = { version: latestVersion, jsonPayload };
    return res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8').send(jsonPayload);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Database error' });
  }
});

app.post('/api/db', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Invalid database payload' });
    }
    const payload = body as { put?: Record<string, unknown>; del?: string[] };
    const allData = await readAll(false);
    const ses = req.authSession || null;
    const filteredPut: Record<string, unknown> = {};
    const filteredDel: string[] = [];

    const checkKeyWritable = (key: string, val: unknown, isDelete: boolean): boolean => {
      if (!isSafeStoreKey(key)) return false;

      // Guest visitor: only permitted to place new pending customer orders
      if (!ses) {
        if (isDelete || !key.startsWith('orders/')) return false;
        if (Object.prototype.hasOwnProperty.call(allData, key)) return false;
        if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
        const ord = val as Record<string, unknown>;
        const rid = String(ord.rid || '').trim();
        if (!rid || !allData[`restaurants/${rid}`]) return false;
        const tot = Number(ord.tot ?? ord.total ?? 0);
        if (!Number.isFinite(tot) || tot < 0) return false;
        return true;
      }

      // Partner user: strictly scoped to own stores + child branches
      if (!ses.admin) {
        const ownerRid = ses.personalRid || ses.rid;
        const ownedRids = getOwnedPartnerRids(allData, ownerRid, ses);

        if (key.startsWith('restaurants/') && !key.slice('restaurants/'.length).includes('/')) {
          const rid = key.slice('restaurants/'.length);
          if (isDelete) {
            const existing = allData[key] as Record<string, unknown> | undefined;
            const isBranchRec = Boolean(existing && (existing.isBranch || existing.parentRid));
            return isBranchRec && rid !== ownerRid && ownedRids.has(rid);
          }
          if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
          const existing = allData[key] as Record<string, unknown> | undefined;
          const nextObj = { ...(val as Record<string, unknown>) };
          const plansList = extractPlansList(allData['settings/plans']);
          const subRules = normalizeSubdomainRules((allData['settings/site'] as Record<string, unknown>) || null);
          const takenSlugs = collectTakenSlugsFromAllData(allData, rid);

          if (existing) {
            if (!ownedRids.has(rid)) return false;
            // Prevent client-side plan escalation, expiry extension, or suspension bypass
            nextObj.planId = existing.planId;
            nextObj.p = existing.p;
            nextObj.e = existing.e;
            nextObj.isPaid = existing.isPaid;
            nextObj.a = existing.a;
            if (existing.parentRid) nextObj.parentRid = existing.parentRid;
            if (existing.isBranch !== undefined) nextObj.isBranch = existing.isBranch;
            preserveRestaurantOrderNotificationFields(nextObj, existing);

            const { isPaid } = isPaidPlanForRestaurant(existing as StoreRecord, plansList);
            const existingSlug = sanitizeSubdomainValue(String(existing.slug || ''));
            const requestedSlug = sanitizeSubdomainValue(String(nextObj.slug || ''));

            if (!isPaid) {
              nextObj.slug = existingSlug && isValidSixCharCode(existingSlug) && !takenSlugs.has(existingSlug)
                ? existingSlug
                : existingSlug || generateUniqueMenuCode(takenSlugs);
              nextObj.subdomain = '';
            } else if (requestedSlug && requestedSlug !== existingSlug) {
              const check = validatePathSlugFormat(requestedSlug, subRules);
              if (check.valid && !takenSlugs.has(requestedSlug)) {
                nextObj.slug = requestedSlug;
                nextObj.subdomain = subRules.enabled ? requestedSlug : '';
              } else {
                nextObj.slug = existingSlug || generateUniqueMenuCode(takenSlugs);
                nextObj.subdomain = subRules.enabled ? String(nextObj.slug) : '';
              }
            } else {
              nextObj.slug = existingSlug || generateUniqueMenuCode(takenSlugs);
              nextObj.subdomain = subRules.enabled ? String(nextObj.slug) : '';
            }

            filteredPut[key] = nextObj;
            return false; // handled custom sanitized write
          } else {
            // Creating a new branch under any owned primary store
            const targetParentRid = String(nextObj.parentRid || ownerRid || '').trim();
            if (!targetParentRid || !ownedRids.has(targetParentRid)) return false;
            const parentRest = allData[`restaurants/${targetParentRid}`] as Record<string, unknown> | undefined;
            if (!parentRest) return false;
            nextObj.parentRid = targetParentRid;
            nextObj.isBranch = true;
            nextObj.planId = parentRest.planId;
            nextObj.p = parentRest.p;
            nextObj.e = parentRest.e;
            nextObj.isPaid = parentRest.isPaid;
            nextObj.a = parentRest.a === 0 ? 0 : 1;
            // New branches start with independent Telegram linking (never inherited from main branch)
            nextObj.telegramPhone = '';
            nextObj.telegramChatId = '';
            nextObj.telegramUsername = '';
            nextObj.telegramLinked = false;
            nextObj.telegramUnlinkedManually = true;

            const { isPaid } = isPaidPlanForRestaurant(parentRest as StoreRecord, plansList);
            const requestedSlug = sanitizeSubdomainValue(String(nextObj.slug || ''));
            const check = requestedSlug ? validatePathSlugFormat(requestedSlug, subRules) : { valid: false };
            if (isPaid && requestedSlug && check.valid && !takenSlugs.has(requestedSlug)) {
              nextObj.slug = requestedSlug;
              nextObj.subdomain = subRules.enabled ? requestedSlug : '';
            } else {
              nextObj.slug = generateUniqueMenuCode(takenSlugs);
              nextObj.subdomain = '';
            }

            filteredPut[key] = nextObj;
            return false;
          }
        }

        if (key.startsWith('cats/') || key.startsWith('items/') || key.startsWith('orders/') || key.startsWith('loyalty/')) {
          if (isDelete) {
            const existing = allData[key] as Record<string, unknown> | undefined;
            return Boolean(existing && ownedRids.has(String(existing.rid || '')));
          }
          if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
          const rec = val as Record<string, unknown>;
          return ownedRids.has(String(rec.rid || ''));
        }

        if (key.startsWith('reports/')) {
          if (isDelete || Object.prototype.hasOwnProperty.call(allData, key)) return false;
          if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
          const rep = val as Record<string, unknown>;
          const rid = String(rep.rid || '').trim();
          const msg = String(rep.message || '').trim();
          return Boolean(rid && ownedRids.has(rid) && msg.length > 0);
        }

        if (key.startsWith('logs/') && !isDelete) {
          return true;
        }
        return false;
      }

      // Admin or Staff: check hierarchical permissions per collection
      const perms = resolveEffectiveAdminPermissions(req);

      if (key === 'settings/finance' || key.startsWith('finance_expenses/') || key.startsWith('finance_profits/')) {
        return Boolean(perms.canManageFinance);
      }
      if (key === 'settings/plans') {
        return Boolean(perms.canManagePlans);
      }
      if (key === 'settings/theme') {
        return Boolean(perms.canManageSettings || perms.canManageThemeMode || perms.canEditHomePage);
      }
      if (key.startsWith('settings/')) {
        return Boolean(perms.canManageSettings || perms.canEditTabLabels || perms.canReorderTabs || perms.canManageThemeMode || perms.canManageSubdomains || perms.canEditHomePage);
      }
      if (key === 'restaurants/demo') {
        return Boolean(perms.canManageRestaurants);
      }
      if (key.startsWith('restaurants/')) {
        if (isDelete) return Boolean(perms.canDeletePartner || perms.canManageRestaurants);
        if (!perms.canManageRestaurants) return false;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const existing = allData[key] as Record<string, unknown> | undefined;
          const nextObj = { ...(val as Record<string, unknown>) };
          if (existing) {
            preserveRestaurantOrderNotificationFields(nextObj, existing);
          }
          filteredPut[key] = nextObj;
          return false;
        }
        return true;
      }
      if (key.startsWith('cats/') || key.startsWith('items/')) {
        return Boolean(perms.canManageRestaurants);
      }
      if (key.startsWith('orders/') || key.startsWith('loyalty/')) {
        return Boolean(perms.canManageRestaurants);
      }
      if (key.startsWith('accounts/')) {
        if (isDelete) return Boolean(perms.canDeletePartner && ses.role === 'owner');
        if (ses.role !== 'owner') return false;
        // Preserve existing pw if sanitized client omitted it
        const existing = allData[key] as Record<string, unknown> | undefined;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const nextObj = { ...(val as Record<string, unknown>) };
          if (!nextObj.pw && existing?.pw) nextObj.pw = existing.pw;
          filteredPut[key] = nextObj;
        }
        return false;
      }
      if (key.startsWith('staff/')) {
        if (!perms.canManageStaff) return false;
        if (!isDelete && val && typeof val === 'object' && !Array.isArray(val)) {
          const existing = allData[key] as Record<string, unknown> | undefined;
          const nextObj = { ...(val as Record<string, unknown>) };
          if (!nextObj.passwordHash && existing?.passwordHash) nextObj.passwordHash = existing.passwordHash;
          filteredPut[key] = nextObj;
          return false;
        }
        return true;
      }
      if (key.startsWith('notes/')) {
        return Boolean(perms.canUseNotes);
      }
      if (key.startsWith('reports/')) {
        return Boolean(perms.canViewReports !== false || perms.canManageRestaurants);
      }
      if (key.startsWith('logs/')) {
        return true;
      }
      if (key === 'initialized_v6' || key.startsWith('migrations/')) {
        return Boolean(perms.canManageSettings || ses.role === 'owner');
      }
      return false;
    };

    if (payload.put && typeof payload.put === 'object' && !Array.isArray(payload.put)) {
      for (const [k, v] of Object.entries(payload.put)) {
        if (checkKeyWritable(k, v, false)) {
          filteredPut[k] = v;
        }
      }
    }
    if (Array.isArray(payload.del)) {
      for (const k of payload.del) {
        if (typeof k === 'string' && checkKeyWritable(k, undefined, true)) {
          filteredDel.push(k);
        }
      }
    }

    const hasFilteredWrites = Object.keys(filteredPut).length > 0 || filteredDel.length > 0;
    const requestedWrites =
      (payload.put ? Object.keys(payload.put).length : 0) + (Array.isArray(payload.del) ? payload.del.length : 0);

    if (requestedWrites > 0 && !hasFilteredWrites) {
      return res.status(ses ? 403 : 401).json({
        ok: false,
        error: ses ? 'ليست لديك صلاحية لتعديل هذه البيانات.' : 'يرجى تسجيل الدخول لإجراء هذه العملية.',
      });
    }

    const newOrderEvents: Array<{ rest: Record<string, unknown>; ord: Record<string, unknown>; rid: string }> = [];
    if (hasFilteredWrites) {
      const ridOrderSeqTracker = new Map<string, number>();
      const countStoreOrders = (targetRid: string): number => {
        let count = 0;
        for (const [ak, av] of Object.entries(allData)) {
          if (
            ak.startsWith('orders/') &&
            av &&
            typeof av === 'object' &&
            !Array.isArray(av) &&
            String((av as Record<string, unknown>).rid || '').trim() === targetRid
          ) {
            count++;
          }
        }
        return count;
      };

      for (const [k, v] of Object.entries(filteredPut)) {
        if (
          k.startsWith('orders/') &&
          !Object.prototype.hasOwnProperty.call(allData, k) &&
          v &&
          typeof v === 'object' &&
          !Array.isArray(v)
        ) {
          const ord = v as Record<string, unknown>;
          const rid = String(ord.rid || '').trim();
          const currentRest = (filteredPut[`restaurants/${rid}`] || allData[`restaurants/${rid}`]) as
            | Record<string, unknown>
            | undefined;
          if (currentRest) {
            const baseCount = ridOrderSeqTracker.has(rid)
              ? (ridOrderSeqTracker.get(rid) as number)
              : Math.max(Number(currentRest.o || 0) || 0, countStoreOrders(rid));
            const nextSeq = baseCount + 1;
            ridOrderSeqTracker.set(rid, nextSeq);

            const updatedOrder: Record<string, unknown> = {
              ...ord,
              seq: nextSeq,
              orderSeq: nextSeq,
            };
            filteredPut[k] = updatedOrder;

            const updatedRest: Record<string, unknown> = {
              ...currentRest,
              o: Math.max(Number(currentRest.o || 0) || 0, nextSeq),
            };
            filteredPut[`restaurants/${rid}`] = updatedRest;

            newOrderEvents.push({ rest: updatedRest, ord: updatedOrder, rid });
          }
        }
      }
    }

    const newReportEvents: Array<{ rep: Record<string, unknown> }> = [];
    if (hasFilteredWrites) {
      let maxReportSeq = 0;
      for (const [ak, av] of Object.entries(allData)) {
        if (ak.startsWith('reports/') && av && typeof av === 'object' && !Array.isArray(av)) {
          const rec = av as Record<string, unknown>;
          const s = Number(rec.reportSeq || rec.seq || 0);
          if (Number.isFinite(s) && s > maxReportSeq) maxReportSeq = s;
        }
      }
      const existingReportsCount = Object.keys(allData).filter((ak) => ak.startsWith('reports/')).length;
      let nextReportSeqCursor = Math.max(maxReportSeq, existingReportsCount);

      for (const [k, v] of Object.entries(filteredPut)) {
        if (
          k.startsWith('reports/') &&
          !Object.prototype.hasOwnProperty.call(allData, k) &&
          v &&
          typeof v === 'object' &&
          !Array.isArray(v)
        ) {
          const rep = v as Record<string, unknown>;
          nextReportSeqCursor += 1;
          const updatedReport: Record<string, unknown> = {
            ...rep,
            seq: nextReportSeqCursor,
            reportSeq: nextReportSeqCursor,
          };
          filteredPut[k] = updatedReport;
          newReportEvents.push({ rep: updatedReport });
        }
      }
    }

    const loyaltyUpdates: Record<string, { phone: string; name: string; earned: number; points: number }> = {};
    if (newOrderEvents.length > 0) {
      for (const ev of newOrderEvents) {
        const addonsObj = (ev.rest.addons && typeof ev.rest.addons === 'object' ? ev.rest.addons : {}) as Record<string, any>;
        const lpCfg = addonsObj.loyaltyPoints;
        if (lpCfg && lpCfg.enabled) {
          const rawPhone = String(ev.ord.phone || '').trim();
          const digits = rawPhone.replace(/[\s\-()+]/g, '');
          const normPhone = digits.startsWith('964') && digits.length >= 12 ? `0${digits.slice(3)}` : digits;
          if (normPhone.length >= 7) {
            const rate = Math.max(1, Number(lpCfg.pointsPerThousand || 1));
            const amount = Math.max(0, Number(ev.ord.tot ?? ev.ord.total ?? 0));
            const earned = Math.floor(amount / 1000) * rate;
            const loyaltyKey = `loyalty/${ev.rid}__${normPhone}`;
            const existingLoyalty = (filteredPut[loyaltyKey] || allData[loyaltyKey]) as Record<string, unknown> | undefined;
            const prevPoints = Math.max(0, Number(existingLoyalty?.points || 0));
            const newPoints = prevPoints + earned;
            const customerName = String(ev.ord.name || '').trim() || String(existingLoyalty?.name || '').trim() || 'زبون';
            const nowTs = Date.now();
            filteredPut[loyaltyKey] = {
              id: `${ev.rid}__${normPhone}`,
              rid: ev.rid,
              phone: normPhone,
              name: customerName,
              points: newPoints,
              totalOrders: Math.max(0, Number(existingLoyalty?.totalOrders || 0)) + 1,
              totalSpent: Math.max(0, Number(existingLoyalty?.totalSpent || 0)) + amount,
              createdAt: Number(existingLoyalty?.createdAt || nowTs),
              updatedAt: nowTs,
            };
            if (ev.ord.id) {
              loyaltyUpdates[String(ev.ord.id)] = {
                phone: normPhone,
                name: customerName,
                earned,
                points: newPoints,
              };
            }
          }
        }
      }
    }

    const result = hasFilteredWrites
      ? await applyChanges({ put: filteredPut, del: filteredDel }, false)
      : { persistedToSupabase: false };

    let telegramDispatch: { sent: boolean; reason?: string } | undefined;
    if (newOrderEvents.length > 0) {
      for (const ev of newOrderEvents) {
        const restPayload = { ...ev.rest, id: ev.rest.id || ev.rid };
        const [tgRes] = await Promise.all([
          sendOrderNotificationToTelegram(restPayload, ev.ord).catch((err) => ({
            sent: false,
            reason: err instanceof Error ? err.message : 'error',
          })),
          sendOrderWebPushNotifications(restPayload, ev.ord).catch((err) => {
            console.warn('[WebPush Order]', err instanceof Error ? err.message : err);
            return { sent: 0, removed: 0 };
          }),
        ]);
        telegramDispatch = tgRes;
        if (
          !tgRes.sent &&
          tgRes.reason &&
          tgRes.reason !== 'channel_whatsapp_only' &&
          tgRes.reason !== 'channel_app_only' &&
          tgRes.reason !== 'store_notifications_disabled'
        ) {
          console.warn(`[Telegram Order] Store ${ev.rid} order #${String(ev.ord.orderSeq || ev.ord.seq || '').trim() || String(ev.ord.id || '').slice(-6)} not sent: ${tgRes.reason}`);
        }
      }
    }

    const assignedOrderSeqs =
      newOrderEvents.length > 0
        ? Object.fromEntries(
            newOrderEvents
              .map((ev): [string, number] => [String(ev.ord.id || ''), Number(ev.ord.orderSeq || 0)])
              .filter(([id, seq]) => Boolean(id) && seq > 0)
          )
        : undefined;

    const assignedReportSeqs =
      newReportEvents.length > 0
        ? Object.fromEntries(
            newReportEvents
              .map((ev): [string, number] => [String(ev.rep.id || ''), Number(ev.rep.reportSeq || 0)])
              .filter(([id, seq]) => Boolean(id) && seq > 0)
          )
        : undefined;

    return res.json({
      ok: true,
      driver: isSupabaseConfigured() ? 'supabase' : 'file-memory',
      persistedToSupabase: result.persistedToSupabase,
      ...(assignedOrderSeqs ? { assignedOrderSeqs } : {}),
      ...(assignedReportSeqs ? { assignedReportSeqs } : {}),
      ...(Object.keys(loyaltyUpdates).length > 0 ? { loyaltyUpdates } : {}),
      ...(telegramDispatch ? { telegramDispatch } : {}),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Database error' });
  }
});

const POPULAR_ITEMS_TTL_MS = 180_000;
const popularItemsCache = new Map<
  string,
  { counts: Record<string, number>; totalOrders: number; cachedAt: number }
>();
const inFlightPopularItems = new Map<
  string,
  Promise<{ counts: Record<string, number>; totalOrders: number }>
>();

subscribeStoreChanges((ev) => {
  if (ev.changedKeys.includes('__full_sync__')) {
    popularItemsCache.clear();
    cachedVisitorDbPayload = null;
    return;
  }
  cachedVisitorDbPayload = null;
  const hasOrderChange = ev.changedKeys.some((k) => k.startsWith('orders/'));
  if (!hasOrderChange) return;
  if (ev.rids.length === 0) {
    popularItemsCache.clear();
  } else {
    for (const rid of ev.rids) {
      popularItemsCache.delete(rid);
    }
  }
});

app.get('/api/public/popular-items/:rid', async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=60');
  try {
    const rid = String(req.params.rid || '').trim();
    if (!rid) {
      return res.json({ ok: true, counts: {}, totalOrders: 0 });
    }
    const now = Date.now();
    const cached = popularItemsCache.get(rid);
    if (cached && now - cached.cachedAt < POPULAR_ITEMS_TTL_MS) {
      return res.json({ ok: true, counts: cached.counts, totalOrders: cached.totalOrders });
    }

    let pending = inFlightPopularItems.get(rid);
    if (!pending) {
      pending = (async () => {
        const allData = await readAll(false);
        const buckets = getSnapshotBuckets(allData);
        const counts: Record<string, number> = {};
        let totalOrders = 0;

        const ridOrders = buckets.ordersByRid.get(rid) || [];
        for (const [, rec] of ridOrders) {
          if (rec.st === 'cancelled' || rec.status === 'cancelled') continue;
          totalOrders += 1;
          const items = Array.isArray(rec.items) ? rec.items : [];
          for (const rawLine of items) {
            if (!rawLine || typeof rawLine !== 'object') continue;
            const line = rawLine as Record<string, unknown>;
            const nameKey = String(line.n || line.name || '').trim().toLowerCase();
            if (!nameKey) continue;
            const qty = Math.max(1, Number(line.q ?? line.qty ?? 1) || 1);
            counts[nameKey] = (counts[nameKey] || 0) + qty;
          }
        }

        const result = { counts, totalOrders };
        popularItemsCache.set(rid, { ...result, cachedAt: Date.now() });
        return result;
      })().finally(() => {
        inFlightPopularItems.delete(rid);
      });
      inFlightPopularItems.set(rid, pending);
    }

    const result = await pending;
    return res.json({ ok: true, counts: result.counts, totalOrders: result.totalOrders });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Database error', counts: {}, totalOrders: 0 });
  }
});

const MAX_SSE_CLIENTS = 40;
const SSE_MAX_LIFETIME_MS = 25_000;
let activeSseClients = 0;

interface CachedPublicMenuEntry {
  menuVer: number;
  rid: string;
  mainRid: string;
  slug: string;
  familyRids: Set<string>;
  jsonPayload: string;
  unchangedMap?: Map<number, string>;
}

const publicMenuResponseCache = new Map<string, CachedPublicMenuEntry>();
let publicHomeResponseCache: { menuVer: number; jsonPayload: string; records: Record<string, unknown> } | null = null;
const MAX_PUBLIC_MENU_CACHE = 300;

function getOrResolvePublicMenuCached(
  allData: Record<string, unknown>,
  slugOrId: string
): CachedPublicMenuEntry | null {
  const cacheKey = slugOrId.toLowerCase();
  const cached = publicMenuResponseCache.get(cacheKey);
  if (cached) {
    const liveMenuVer = getRealtimeVersion('menu', cached.familyRids);
    if (liveMenuVer === cached.menuVer) {
      return cached;
    }
  }

  const family = resolvePublicMenuFamily(allData, slugOrId);
  if (!family) {
    publicMenuResponseCache.delete(cacheKey);
    return null;
  }

  const menuVer = getRealtimeVersion('menu', family.familyRids);
  const jsonPayload = JSON.stringify({
    ok: true,
    version: menuVer,
    buildId: SERVER_BUILD_ID,
    rid: family.rid,
    mainRid: family.mainRid,
    slug: family.slug,
    records: family.records,
  });

  if (publicMenuResponseCache.size >= MAX_PUBLIC_MENU_CACHE) {
    const firstKey = publicMenuResponseCache.keys().next().value;
    if (firstKey) publicMenuResponseCache.delete(firstKey);
  }

  const entry: CachedPublicMenuEntry = {
    menuVer,
    rid: family.rid,
    mainRid: family.mainRid,
    slug: family.slug,
    familyRids: family.familyRids,
    jsonPayload,
  };
  publicMenuResponseCache.set(cacheKey, entry);
  return entry;
}

function getOrResolvePublicHomeCached(allData: Record<string, unknown>): {
  menuVer: number;
  jsonPayload: string;
  records: Record<string, unknown>;
} {
  const menuVer = getRealtimeVersion('menu', ['demo']);
  if (publicHomeResponseCache && publicHomeResponseCache.menuVer === menuVer) {
    return publicHomeResponseCache;
  }
  const records = resolvePublicHomeRecords(allData);
  const jsonPayload = JSON.stringify({
    ok: true,
    version: menuVer,
    buildId: SERVER_BUILD_ID,
    records,
  });
  publicHomeResponseCache = { menuVer, jsonPayload, records };
  return publicHomeResponseCache;
}

// Lightweight version polling endpoint (replaces persistent long-lived SSE connections under high proxy/CDN load)
app.get('/api/realtime/version', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const scope = req.query.scope === 'menu' ? 'menu' : 'dashboard';
  const requestedRid = typeof req.query.rid === 'string' ? req.query.rid.trim() : '';

  if (scope === 'dashboard') {
    const ses = req.authSession;
    if (!ses) {
      return res.status(401).json({ ok: false, error: 'يتطلب تسجيل الدخول.' });
    }
    const allData = getMemoryStoreSnapshot(false);
    let targetRids: Iterable<string> | null = null;
    if (!ses.admin) {
      const ownerRid = ses.personalRid || ses.rid;
      const allowedRids = getOwnedPartnerRids(allData, ownerRid, ses);
      if (requestedRid && !allowedRids.has(requestedRid)) {
        return res.status(403).json({ ok: false, error: 'غير مصرح بالوصول.' });
      }
      targetRids = requestedRid ? [requestedRid] : allowedRids;
    } else if (requestedRid) {
      targetRids = [requestedRid];
    }
    const version = getRealtimeVersion('dashboard', targetRids);
    return res.json({ ok: true, scope: 'dashboard', version });
  }

  if (!requestedRid) {
    return res.status(400).json({ ok: false, error: 'Menu rid required' });
  }
  const cacheKey = requestedRid.toLowerCase();
  const cached = publicMenuResponseCache.get(cacheKey);
  if (cached) {
    const version = getRealtimeVersion('menu', cached.familyRids);
    return res.json({ ok: true, scope: 'menu', version });
  }
  const allData = getMemoryStoreSnapshot(false);
  const family = resolvePublicMenuFamily(allData, requestedRid);
  const familyRids = family ? family.familyRids : [requestedRid];
  const version = getRealtimeVersion('menu', familyRids);
  return res.json({ ok: true, scope: 'menu', version });
});

// Bounded SSE endpoint kept for backward compatibility (rotates cleanly every 25s to prevent 120s proxy 500s)
app.get('/api/realtime/events', (req, res) => {
  const scope = req.query.scope === 'menu' ? 'menu' : 'dashboard';
  const requestedRid = typeof req.query.rid === 'string' ? req.query.rid.trim() : '';

  const allData = getMemoryStoreSnapshot(false);
  let allowedRids: Set<string> | null = null;

  if (scope === 'dashboard') {
    const ses = req.authSession;
    if (!ses) {
      return res.status(401).json({ ok: false, error: 'يتطلب تسجيل الدخول.' });
    }
    if (!ses.admin) {
      const ownerRid = ses.personalRid || ses.rid;
      allowedRids = getOwnedPartnerRids(allData, ownerRid, ses);
      if (requestedRid && !allowedRids.has(requestedRid)) {
        return res.status(403).json({ ok: false, error: 'غير مصرح بالوصول.' });
      }
    }
  } else {
    if (!requestedRid) {
      return res.status(400).json({ ok: false, error: 'Menu rid required' });
    }
    const family = resolvePublicMenuFamily(allData, requestedRid);
    allowedRids = family ? family.familyRids : new Set([requestedRid]);
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  if (activeSseClients >= MAX_SSE_CLIENTS) {
    try {
      res.write(`event: reconnect\ndata: ${JSON.stringify({ reason: 'busy' })}\n\n`);
      res.end();
    } catch {
      // ignore closed socket
    }
    return;
  }

  activeSseClients += 1;
  let closed = false;

  const writeEvent = (eventName: string, data: unknown) => {
    if (closed || res.writableEnded || res.destroyed) return;
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      cleanup();
    }
  };

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let maxLifetimeTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe = () => {};

  const cleanup = () => {
    if (closed) return;
    closed = true;
    activeSseClients = Math.max(0, activeSseClients - 1);
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (maxLifetimeTimer) {
      clearTimeout(maxLifetimeTimer);
      maxLifetimeTimer = null;
    }
    try {
      unsubscribe();
    } catch {
      // ignore
    }
  };

  writeEvent('ready', { version: getRealtimeVersion(scope, allowedRids) });

  heartbeat = setInterval(() => {
    if (closed || res.writableEnded || res.destroyed) {
      cleanup();
      return;
    }
    try {
      res.write(': ping\n\n');
    } catch {
      cleanup();
    }
  }, 15_000);
  heartbeat.unref?.();

  maxLifetimeTimer = setTimeout(() => {
    if (closed) return;
    try {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`event: reconnect\ndata: ${JSON.stringify({ reason: 'rotate' })}\n\n`);
        res.end();
      }
    } catch {
      // ignore
    }
    cleanup();
  }, SSE_MAX_LIFETIME_MS);
  maxLifetimeTimer.unref?.();

  unsubscribe = subscribeStoreChanges((ev) => {
    if (closed) return;
    const publicKeys = ev.changedKeys.filter((k) => k === '__full_sync__' || !isReservedInternalKey(k));
    if (publicKeys.length === 0) return;

    const isFullSync = publicKeys.includes('__full_sync__');
    if (scope === 'menu') {
      const hasCatalogChange =
        isFullSync ||
        publicKeys.some(
          (k) =>
            k.startsWith('restaurants/') ||
            k.startsWith('cats/') ||
            k.startsWith('items/') ||
            k.startsWith('settings/')
        );
      if (!hasCatalogChange) return;
      if (
        !isFullSync &&
        allowedRids &&
        ev.rids.length > 0 &&
        !ev.rids.some((r) => allowedRids!.has(r)) &&
        !publicKeys.some((k) => k.startsWith('settings/'))
      ) {
        return;
      }
      writeEvent('update', { version: getRealtimeVersion('menu', allowedRids), scope: 'menu' });
      return;
    }

    // Dashboard / Owner notifications scope
    if (!isFullSync && allowedRids) {
      if (requestedRid) {
        const matchesRequested =
          ev.rids.includes(requestedRid) ||
          publicKeys.some((k) => k.startsWith('settings/'));
        if (!matchesRequested && ev.rids.length > 0) return;
      } else if (ev.rids.length > 0 && !ev.rids.some((r) => allowedRids!.has(r))) {
        return;
      }
    }
    writeEvent('update', { version: ev.version, rids: ev.rids });
  });

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
  res.on('finish', cleanup);
  res.on('error', cleanup);
});

// Fast single-menu public payload (eliminates loading all restaurants/categories/items/orders on customer menu entry)
app.get('/api/public/menu/:slugOrId', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const slugOrId = decodeURIComponent(String(req.params.slugOrId || '')).trim();
    if (!slugOrId) {
      return res.status(400).json({ ok: false, error: 'Menu identifier required' });
    }
    const allData = await readAll(false);
    const cached = getOrResolvePublicMenuCached(allData, slugOrId);
    if (!cached) {
      return res.status(404).json({ ok: false, error: 'Menu not found' });
    }

    res.setHeader('X-Store-Version', String(cached.menuVer));
    res.setHeader('X-App-Build', SERVER_BUILD_ID);

    const requestedVersion = Number(req.query.v || 0);
    if (Number.isFinite(requestedVersion) && requestedVersion > 0 && requestedVersion === cached.menuVer) {
      return res.json({ ok: true, unchanged: true, version: cached.menuVer });
    }

    return res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8').send(cached.jsonPayload);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Database error' });
  }
});

// Fast lightweight payload for landing home & auth pages (avoids downloading all restaurants/cats/items/orders)
app.get('/api/public/home-bootstrap', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const allData = await readAll(false);
    const cached = getOrResolvePublicHomeCached(allData);
    res.setHeader('X-Store-Version', String(cached.menuVer));
    res.setHeader('X-App-Build', SERVER_BUILD_ID);

    const requestedVersion = Number(req.query.v || 0);
    if (Number.isFinite(requestedVersion) && requestedVersion > 0 && requestedVersion === cached.menuVer) {
      return res.json({ ok: true, unchanged: true, version: cached.menuVer });
    }
    return res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8').send(cached.jsonPayload);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Database error' });
  }
});

const BOOTSTRAP_RECENT_ORDER_LIMIT = 150;
const BOOTSTRAP_RECENT_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

// Fast authenticated dashboard bootstrap payload (scoped only to user's owned stores / target menu family)
app.get('/api/dashboard/bootstrap', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const ses = req.authSession;
  if (!ses) {
    return res.status(401).json({ ok: false, error: 'يرجى تسجيل الدخول للمتابعة.' });
  }
  try {
    const currentVersion = getStoreVersion();
    res.setHeader('X-Store-Version', String(currentVersion));

    const requestedRidRaw = typeof req.query.rid === 'string' ? req.query.rid.trim() : '';
    const requestedSlugRaw = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
    const requestedLookup = requestedSlugRaw || requestedRidRaw;
    const requestedVersion = Number(req.query.v || 0);

    if (
      Number.isFinite(requestedVersion) &&
      requestedVersion > 0 &&
      requestedVersion === currentVersion &&
      (!requestedLookup || requestedLookup === ses.rid)
    ) {
      return res.json({
        ok: true,
        unchanged: true,
        version: currentVersion,
        targetRid: String(ses.rid || ses.personalRid || '').trim(),
        session: sanitizeAuthSessionForClient(ses),
      });
    }

    const allData = await readAll(false);
    const buckets = getSnapshotBuckets(allData);
    const ownerRid = ses.personalRid || ses.rid;
    const partnerOwnedRids = ses.admin ? null : getOwnedPartnerRids(allData, ownerRid, ses);

    let targetRid = String(ses.rid || ownerRid || '').trim();
    if (requestedLookup) {
      const resolved = resolveRestaurantEntryByIdOrSlug(allData, requestedLookup);
      if (resolved) {
        if (!ses.admin && partnerOwnedRids && !partnerOwnedRids.has(resolved.rid)) {
          return res.status(403).json({ ok: false, error: 'غير مصرح بالوصول إلى لوحة هذا المتجر.' });
        }
        targetRid = resolved.rid;
      }
    }

    if (
      Number.isFinite(requestedVersion) &&
      requestedVersion > 0 &&
      requestedVersion === currentVersion
    ) {
      return res.json({
        ok: true,
        unchanged: true,
        version: currentVersion,
        targetRid,
        session: sanitizeAuthSessionForClient(ses),
      });
    }

    const targetRest = buckets.restaurants.get(targetRid);
    const targetMainRid = String(targetRest?.parentRid || targetRid).trim() || targetRid;

    const scopedRids = collectFamilyDescendantRids(buckets, [
      ...(partnerOwnedRids ? partnerOwnedRids : []),
      targetRid,
      targetMainRid,
    ]);

    const includeAllOrders = req.query.ordersScope === 'all';
    const scopedOrders: Array<{ key: string; rec: Record<string, unknown>; ts: number; isActive: boolean }> = [];
    const records: Record<string, unknown> = {};

    for (const [k, v] of buckets.settingsAndMeta) {
      if (k !== 'settings/finance') {
        records[k] = sanitizeRecordSecrets(v);
      }
    }

    for (const entryRid of scopedRids) {
      const restRec = buckets.restaurants.get(entryRid);
      if (restRec) {
        records[`restaurants/${entryRid}`] = sanitizeRecordSecrets(restRec);
      }
      const orders = buckets.ordersByRid.get(entryRid);
      if (orders) {
        for (const [k, rec] of orders) {
          const st = String(rec.st || rec.status || 'new').toLowerCase();
          const isActive = st !== 'completed' && st !== 'cancelled';
          scopedOrders.push({ key: k, rec, ts: getOrderEpochMs(rec), isActive });
        }
      }
      const cats = buckets.catsByRid.get(entryRid);
      if (cats) {
        for (const [k, rec] of cats) records[k] = sanitizeRecordSecrets(rec);
      }
      const items = buckets.itemsByRid.get(entryRid);
      if (items) {
        for (const [k, rec] of items) records[k] = sanitizeRecordSecrets(rec);
      }
      const reports = buckets.reportsByRid.get(entryRid);
      if (reports) {
        for (const [k, rec] of reports) records[k] = sanitizeRecordSecrets(rec);
      }
      const loyalty = buckets.loyaltyByRid.get(entryRid);
      if (loyalty) {
        for (const [k, rec] of loyalty) records[k] = sanitizeRecordSecrets(rec);
      }
    }

    if (ses.accountId && allData[`accounts/${ses.accountId}`] !== undefined) {
      records[`accounts/${ses.accountId}`] = sanitizeRecordSecrets(allData[`accounts/${ses.accountId}`]);
    }

    // Always include active/pending orders + recent 60d/150 orders by default; full archive loads on demand
    let returnedOrdersCount = 0;
    if (includeAllOrders || scopedOrders.length <= BOOTSTRAP_RECENT_ORDER_LIMIT) {
      for (const entry of scopedOrders) {
        records[entry.key] = sanitizeRecordSecrets(entry.rec);
        returnedOrdersCount += 1;
      }
    } else {
      const cutoffMs = Date.now() - BOOTSTRAP_RECENT_WINDOW_MS;
      scopedOrders.sort((a, b) => b.ts - a.ts);
      const picked = new Set<string>();
      for (const entry of scopedOrders) {
        if (entry.isActive) {
          records[entry.key] = sanitizeRecordSecrets(entry.rec);
          picked.add(entry.key);
        }
      }
      for (const entry of scopedOrders) {
        if (picked.has(entry.key)) continue;
        if (picked.size < BOOTSTRAP_RECENT_ORDER_LIMIT || (entry.ts >= cutoffMs && picked.size < 250)) {
          records[entry.key] = sanitizeRecordSecrets(entry.rec);
          picked.add(entry.key);
        }
      }
      returnedOrdersCount = picked.size;
    }

    return res.json({
      ok: true,
      version: currentVersion,
      targetRid,
      session: sanitizeAuthSessionForClient(ses),
      ownedRids: Array.from(scopedRids),
      ordersTruncated: returnedOrdersCount < scopedOrders.length,
      totalOrdersCount: scopedOrders.length,
      returnedOrdersCount,
      records,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Database error' });
  }
});

// On-demand bounded/archived orders endpoint for dashboard Stats/Orders history
app.get('/api/dashboard/orders', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const ses = req.authSession;
  if (!ses) {
    return res.status(401).json({ ok: false, error: 'يرجى تسجيل الدخول للمتابعة.' });
  }
  try {
    const allData = await readAll(false);
    const buckets = getSnapshotBuckets(allData);
    const ownerRid = ses.personalRid || ses.rid;
    const partnerOwnedRids = ses.admin ? null : getOwnedPartnerRids(allData, ownerRid, ses);
    const requestedRid = typeof req.query.rid === 'string' ? req.query.rid.trim() : '';
    const targetRid = requestedRid || String(ses.rid || ownerRid || '').trim();

    if (!ses.admin && partnerOwnedRids && targetRid && !partnerOwnedRids.has(targetRid)) {
      return res.status(403).json({ ok: false, error: 'غير مصرح بالوصول إلى طلبات هذا المتجر.' });
    }

    const seedRids: string[] = partnerOwnedRids ? Array.from(partnerOwnedRids) : [];
    if (targetRid) {
      seedRids.push(targetRid);
      const targetRest = buckets.restaurants.get(targetRid);
      const mainRid = String(targetRest?.parentRid || targetRid).trim() || targetRid;
      seedRids.push(mainRid);
    }
    const scopedRids = collectFamilyDescendantRids(buckets, seedRids);

    const orders: Array<{ key: string; order: Record<string, unknown>; ts: number }> = [];
    const orderGroups =
      scopedRids.size > 0
        ? Array.from(scopedRids).map((id) => buckets.ordersByRid.get(id) || [])
        : Array.from(buckets.ordersByRid.values());
    for (const group of orderGroups) {
      for (const [k, rec] of group) {
        orders.push({
          key: k,
          order: sanitizeRecordSecrets(rec),
          ts: getOrderEpochMs(rec),
        });
      }
    }
    orders.sort((a, b) => b.ts - a.ts);

    const scopeAll = req.query.scope === 'all';
    const offset = Math.max(0, Number(req.query.offset || 0) || 0);
    const limit = scopeAll
      ? orders.length
      : Math.max(1, Math.min(500, Number(req.query.limit || 200) || 200));
    const slice = orders.slice(offset, offset + limit);

    const records: Record<string, unknown> = {};
    for (const entry of slice) {
      records[entry.key] = entry.order;
    }

    return res.json({
      ok: true,
      totalCount: orders.length,
      returnedCount: slice.length,
      hasMore: offset + slice.length < orders.length,
      records,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Database error' });
  }
});

app.get('/api/db-status', async (req, res) => {
  try {
    const supabaseHealth = await checkSupabaseHealth();
    const databaseUrl = getDatabaseUrlInfo();
    if (!req.authSession?.admin) {
      return res.json({
        connected: supabaseHealth.configured ? supabaseHealth.connected : true,
        status: !supabaseHealth.configured || supabaseHealth.connected ? 'operational' : 'degraded',
      });
    }
    const all = await readAll();
    const count = Object.keys(all).length;
    return res.json({
      connected: supabaseHealth.configured ? supabaseHealth.connected : true,
      driver: isSupabaseConfigured() ? 'supabase' : 'file-memory',
      supabase: supabaseHealth,
      databaseUrl,
      recordsCount: count,
      status: !supabaseHealth.configured || supabaseHealth.connected ? 'operational' : 'degraded',
    });
  } catch (err: any) {
    return res.status(500).json({
      connected: false,
      error: req.authSession?.admin ? err?.message || 'Database error' : 'Database unavailable',
    });
  }
});

// 1.5. Verified Cookie-Backed Authentication Endpoints
app.get('/api/auth/supabase-public-config', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const publicCfg = getSupabasePublicConfig();
  return res.json({
    ok: true,
    configured: Boolean(publicCfg),
    googleAuthEnabled: false,
    ...(publicCfg ? { url: publicCfg.url, anonKey: publicCfg.anonKey } : {}),
  });
});

app.get('/api/auth/me', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    ok: true,
    authenticated: Boolean(req.authSession),
    session: sanitizeAuthSessionForClient(req.authSession || null),
    ...(req.authSession?.sid ? { token: signSid(req.authSession.sid) } : {}),
  });
});

app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const identifier = String(body.identifier || '').trim();
    const fullPhone = String(body.fullPhone || '').trim();
    const password = String(body.password || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ ok: false, error: 'يرجى إدخال رقم الهاتف أو المعرف وكلمة المرور.' });
    }

    const allData = await readAll(false);
    const buckets = getSnapshotBuckets(allData);
    const idCandidates = Array.from(new Set([identifier, fullPhone].filter(Boolean)));
    const matchesAnyId = (val: unknown): boolean => {
      if (typeof val !== 'string' || !val.trim()) return false;
      return idCandidates.some((c) => matchesPhoneCandidates(val, c));
    };

    const targetSlug = String(body.targetSlug || '').trim();
    const targetRidParam = String(body.targetRid || '').trim();

    const resolveInitialSessionRid = (
      defaultRid: string,
      isAdminAcc: boolean,
      accountId?: string,
      phoneVal?: string
    ): string => {
      const lookup = targetSlug || targetRidParam;
      if (!lookup) return defaultRid;
      const target = resolveRestaurantEntryByIdOrSlug(allData, lookup);
      if (!target) return defaultRid;
      if (isAdminAcc) return target.rid;
      const owned = getOwnedPartnerRids(allData, defaultRid, {
        admin: false,
        accountId,
        phone: phoneVal || '',
      });
      return owned.has(target.rid) ? target.rid : defaultRid;
    };

    let matchedAnyAccount = false;

    // 2. Staff accounts in staff/*
    for (const [key, val] of buckets.staff) {
      const stf = val as Record<string, any>;
      if (!matchesAnyId(stf.phone) && !matchesAnyId(stf.email)) continue;
      matchedAnyAccount = true;

      const credOk = verifyStoredCredential(
        stf.passwordHash || stf.pw,
        [stf.email, stf.phone, identifier, fullPhone],
        password,
        false
      );
      if (!credOk) continue;

      if (stf.active === false) {
        return res.status(403).json({ ok: false, error: 'تم إيقاف هذا الحساب من قبل إدارة المنصة.' });
      }
      const staffId = key.slice('staff/'.length);
      const perms = stf.permissions || {};
      const effectiveRid = resolveInitialSessionRid('demo', true, undefined, String(stf.phone || ''));
      const ses = await createServerAuthSession(req, res, {
        role: 'staff',
        admin: true,
        staffId,
        rid: effectiveRid,
        personalRid: 'demo',
        impersonating: effectiveRid !== 'demo',
        name: String(stf.name || 'موظف إدارة'),
        email: String(stf.email || stf.phone || ''),
        phone: String(stf.phone || ''),
        roleTitle: String(stf.roleTitle || 'موظف إدارة'),
        permissions: perms,
      });
      return res.json({
        ok: true,
        token: signSid(ses.sid),
        session: sanitizeAuthSessionForClient(ses),
        restaurant: sanitizeRecordSecrets(buckets.restaurants.get(effectiveRid) || buckets.restaurants.get('demo') || null),
      });
    }

    // 3. Admin & Partner accounts in accounts/* (prioritize admin accounts first)
    const accountEntries = [...buckets.accounts].sort(([kA, vA], [kB, vB]) => {
      const aRec = vA as Record<string, any>;
      const bRec = vB as Record<string, any>;
      const aIsAdmin = aRec.admin === true || aRec.r === 'admin' || kA.startsWith('accounts/acc_admin_') ? 0 : 1;
      const bIsAdmin = bRec.admin === true || bRec.r === 'admin' || kB.startsWith('accounts/acc_admin_') ? 0 : 1;
      return aIsAdmin - bIsAdmin;
    });

    for (const [key, val] of accountEntries) {
      const acc = val as Record<string, any>;
      const accId = key.slice('accounts/'.length);
      if (
        !matchesAnyId(acc.email) &&
        !matchesAnyId(acc.phone) &&
        !matchesAnyId(acc.projectPhone) &&
        !matchesAnyId(acc.em) &&
        !matchesAnyId(acc.username) &&
        !matchesAnyId(acc.e) &&
        !matchesAnyId(acc.u)
      ) {
        continue;
      }
      matchedAnyAccount = true;

      const credOk = verifyStoredCredential(
        acc.pw,
        [acc.email, acc.username, acc.em, acc.phone, acc.e, acc.u, identifier, fullPhone, '07711448594'],
        password,
        accId === 'acc_menu_demo'
      );
      if (!credOk) continue;

      if (acc.active === false) {
        return res.status(403).json({ ok: false, error: 'تم إيقاف هذا الحساب من قبل إدارة المنصة.' });
      }

      const isAdmin = Boolean(acc.admin === true || acc.r === 'admin' || accId.startsWith('acc_admin_'));
      const baseRid = String(acc.rid || (isAdmin ? 'demo' : '')).trim() || 'demo';
      const phoneStr = String(acc.phone || acc.ph || acc.projectPhone || '');
      const effectiveRid = resolveInitialSessionRid(baseRid, isAdmin, accId, phoneStr);
      const linkedRest = buckets.restaurants.get(effectiveRid) as Record<string, any> | undefined;

      if (!isAdmin && linkedRest && linkedRest.a === 0) {
        return res.status(403).json({ ok: false, error: 'تم إيقاف هذا المتجر مؤقتاً، يرجى التواصل مع الدعم الفني.' });
      }

      if (isAdmin) {
        const ses = await createServerAuthSession(req, res, {
          role: 'owner',
          admin: true,
          accountId: accId,
          rid: effectiveRid,
          personalRid: baseRid,
          impersonating: effectiveRid !== baseRid,
          name: String(acc.n || 'مدير المنصة'),
          email: String(acc.em || acc.phone || identifier),
          phone: phoneStr,
          roleTitle: String(acc.roleTitle || 'مالك المنصة والمدير العام'),
          permissions: FULL_OWNER_PERMISSIONS,
        });
        return res.json({
          ok: true,
          token: signSid(ses.sid),
          session: sanitizeAuthSessionForClient(ses),
          restaurant: sanitizeRecordSecrets(linkedRest || null),
        });
      }

      const targetRestObj = linkedRest;
      const effectivePersonalRid =
        targetRestObj && !targetRestObj.isBranch && !targetRestObj.parentRid
          ? effectiveRid
          : String(targetRestObj?.parentRid || baseRid);

      const ses = await createServerAuthSession(req, res, {
        role: 'partner',
        admin: false,
        accountId: accId,
        rid: effectiveRid,
        personalRid: effectivePersonalRid,
        name: String(acc.n || acc.projectName || linkedRest?.n || 'شريك'),
        email: String(acc.em || acc.phone || ''),
        phone: phoneStr,
      });
      return res.json({
        ok: true,
        token: signSid(ses.sid),
        session: sanitizeAuthSessionForClient(ses),
        restaurant: sanitizeRecordSecrets(linkedRest || null),
      });
    }

    return res.status(401).json({
      ok: false,
      error: matchedAnyAccount ? 'كلمة المرور غير صحيحة.' : 'لا يوجد حساب بهذا الرقم.',
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر إتمام تسجيل الدخول.' });
  }
});

// List all menus & branches controlled by the signed-in session (multi-menu SSO)
app.get('/api/auth/owned-menus', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const ses = req.authSession;
  if (!ses) {
    return res.status(401).json({ ok: false, error: 'يرجى تسجيل الدخول للمتابعة.' });
  }
  try {
    const allData = await readAll(false);
    const buckets = getSnapshotBuckets(allData);
    const ownedRids = ses.admin
      ? null
      : getOwnedPartnerRids(allData, ses.personalRid || ses.rid, ses);

    const menus: Array<{
      id: string;
      name: string;
      slug: string;
      branchName: string;
      isBranch: boolean;
      parentRid: string;
      logo: string;
      done: number;
      projectType: string;
      planId: string;
    }> = [];

    const appendMenu = (rid: string, rec: Record<string, unknown>) => {
      const slug =
        sanitizeSubdomainValue(String(rec.slug || rec.subdomain || '')) ||
        (rid === 'demo' ? 'cap-burger' : rid);
      menus.push({
        id: rid,
        name: String(rec.n || 'متجر'),
        slug,
        branchName: String(rec.branchName || ''),
        isBranch: Boolean(rec.isBranch || rec.parentRid),
        parentRid: String(rec.parentRid || ''),
        logo: String(rec.logo || ''),
        done: Number(rec.done || 0),
        projectType: String(rec.projectType || 'restaurant'),
        planId: String(rec.planId || 'pro'),
      });
    };

    if (ownedRids) {
      for (const rid of ownedRids) {
        const rec = buckets.restaurants.get(rid);
        if (rec) appendMenu(rid, rec);
      }
    } else {
      for (const [rid, rec] of buckets.restaurants.entries()) {
        appendMenu(rid, rec);
      }
    }

    menus.sort((a, b) => {
      if (a.id === ses.rid) return -1;
      if (b.id === ses.rid) return 1;
      if (a.isBranch !== b.isBranch) return a.isBranch ? 1 : -1;
      return a.name.localeCompare(b.name, 'ar');
    });

    return res.json({ ok: true, menus });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر تحميل قائمة المنيوهات.' });
  }
});

// Switch active menu/branch within already authenticated SSO session (no re-login needed)
app.post('/api/auth/switch-menu', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const ses = req.authSession;
  if (!ses) {
    return res.status(401).json({ ok: false, error: 'يرجى تسجيل الدخول للمتابعة.' });
  }
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const lookup = String(body.slug || body.rid || '').trim();
    if (!lookup) {
      return res.status(400).json({ ok: false, error: 'معرف المنيو مطلوب.' });
    }
    const allData = await readAll(false);
    const target = resolveRestaurantEntryByIdOrSlug(allData, lookup);
    if (!target) {
      return res.status(404).json({ ok: false, error: 'المنيو المطلوب غير موجود.' });
    }

    if (!ses.admin) {
      const owned = getOwnedPartnerRids(allData, ses.personalRid || ses.rid, ses);
      if (!owned.has(target.rid)) {
        return res.status(403).json({ ok: false, error: 'غير مصرح بالوصول إلى لوحة هذا المنيو.' });
      }
      if (target.rest.a === 0) {
        return res.status(403).json({ ok: false, error: 'تم إيقاف هذا المتجر مؤقتاً.' });
      }
    } else if (target.rid !== 'demo') {
      const perms = resolveEffectiveAdminPermissions(req);
      if (!perms.canImpersonatePartner && !perms.canManageRestaurants) {
        return res.status(403).json({ ok: false, error: 'ليست لديك صلاحية الدخول للوحة هذا المنيو.' });
      }
    }

    const isBranch = Boolean(target.rest.isBranch || target.rest.parentRid);
    const nextPersonalRid = ses.admin
      ? ses.personalRid || 'demo'
      : !isBranch
      ? target.rid
      : String(target.rest.parentRid || ses.personalRid || target.rid);

    const updated = {
      ...ses,
      rid: target.rid,
      personalRid: nextPersonalRid,
      menuLoggedOut: false,
      ...(ses.admin ? { impersonating: target.rid !== (ses.personalRid || 'demo') } : {}),
    };
    await updateServerAuthSession(ses.sid, updated);
    req.authSession = updated;

    return res.json({
      ok: true,
      token: signSid(updated.sid),
      session: sanitizeAuthSessionForClient(updated),
      restaurant: sanitizeRecordSecrets(target.rest),
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر التبديل إلى المنيو.' });
  }
});

app.post('/api/onboard/profile', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ses = req.authSession;
    if (!ses) {
      return res.status(401).json({ ok: false, error: 'يرجى تسجيل الدخول للمتابعة.' });
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const allData = await readAll(false);
    const ownerRid = ses.personalRid || ses.rid;
    const ownedRids = ses.admin ? null : getOwnedPartnerRids(allData, ownerRid, ses);
    const rid = String(body.rid || ses.rid || ownerRid || '').trim();
    if (!rid || (ownedRids && !ownedRids.has(rid))) {
      return res.status(403).json({ ok: false, error: 'غير مصرح بتعديل هذا المشروع.' });
    }

    const existingRest = (allData[`restaurants/${rid}`] as Record<string, any> | undefined) || { id: rid };
    const nextRest: Record<string, any> = { ...existingRest };

    if (typeof body.n === 'string' && body.n.trim()) {
      nextRest.n = body.n.trim().slice(0, 120);
      nextRest.ow = nextRest.n;
    }
    if (body.ph !== undefined) {
      nextRest.ph = String(body.ph || '').trim().slice(0, 32);
    }
    if (body.projectType === 'restaurant' || body.projectType === 'store') {
      nextRest.projectType = body.projectType;
    }
    if (typeof body.logo === 'string' && body.logo.length <= 450_000) {
      nextRest.logo = body.logo;
    }
    if (nextRest.projectType !== 'store') {
      nextRest.coverImages = [];
    } else if (Array.isArray(body.coverImages)) {
      nextRest.coverImages = body.coverImages
        .filter((x): x is string => typeof x === 'string' && x.length <= 650_000)
        .slice(0, 5);
    }
    if (typeof body.tagline === 'string') {
      nextRest.tagline = body.tagline.trim().slice(0, 220);
    }
    if (typeof body.aboutText === 'string') {
      nextRest.aboutText = body.aboutText.trim().slice(0, 800);
    }
    if (body.themeMode === 'light' || body.themeMode === 'dark' || body.themeMode === 'auto') {
      nextRest.themeMode = body.themeMode;
    }
    if (typeof body.themePreset === 'string' && body.themePreset.trim()) {
      nextRest.themePreset = body.themePreset.trim().slice(0, 48);
    }
    if (typeof body.themeShape === 'string' && body.themeShape.trim()) {
      nextRest.themeShape = body.themeShape.trim().slice(0, 32);
    }
    if (typeof body.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(body.color.trim())) {
      nextRest.color = body.color.trim();
    }
    if (
      body.lay === 'list' ||
      body.lay === 'grid' ||
      body.lay === 'grid3' ||
      body.lay === 'grid4' ||
      body.lay === 'cards'
    ) {
      nextRest.lay = body.lay;
    }
    if (nextRest.projectType === 'store') {
      nextRest.themeMode = 'light';
      nextRest.themePreset = 'estore';
      nextRest.themeShape = 'estore';
      nextRest.color = '#f15a29';
      delete nextRest.bgColor;
      if (String(nextRest.tagline || '').trim() === 'أشهى الأطباق المحضرة يومياً طازجة بجودة عالية') {
        nextRest.tagline = '';
      }
    }
    if (body.h && typeof body.h === 'object' && !Array.isArray(body.h)) {
      nextRest.h = body.h;
    }
    if (body.done === 0 || body.done === 1) {
      nextRest.done = body.done;
    }
    if (body.on === 0 || body.on === 1) {
      nextRest.on = body.on;
    }
    const plansList = extractPlansList(allData['settings/plans']);
    const subRules = normalizeSubdomainRules((allData['settings/site'] as Record<string, unknown>) || null);
    const takenSlugs = collectTakenSlugsFromAllData(allData, rid);
    const { isPaid: restIsPaid } = isPaidPlanForRestaurant(nextRest as StoreRecord, plansList);
    const canUseCustomSlug = Boolean(ses.admin) || restIsPaid;

    if (!canUseCustomSlug) {
      const curSlug = sanitizeSubdomainValue(String(nextRest.slug || ''));
      if (!isValidSixCharCode(curSlug) || takenSlugs.has(curSlug)) {
        nextRest.slug = generateUniqueMenuCode(takenSlugs);
      } else {
        nextRest.slug = curSlug;
      }
      nextRest.subdomain = '';
    } else {
      if (!nextRest.slug || !sanitizeSubdomainValue(String(nextRest.slug))) {
        nextRest.slug = generateUniqueMenuCode(takenSlugs);
      }
      if (typeof body.slug === 'string' && body.slug.trim()) {
        const cleanSlug = sanitizeSubdomainValue(body.slug);
        const validation = validatePathSlugFormat(cleanSlug, subRules);
        if (validation.valid && !takenSlugs.has(cleanSlug)) {
          nextRest.slug = cleanSlug;
          nextRest.subdomain = subRules.enabled ? cleanSlug : '';
        }
      } else if (!subRules.enabled) {
        nextRest.subdomain = '';
      }
    }

    const putMap: Record<string, unknown> = {
      [`restaurants/${rid}`]: nextRest,
    };

    if (ses.accountId && allData[`accounts/${ses.accountId}`]) {
      const existingAcc = allData[`accounts/${ses.accountId}`] as Record<string, any>;
      putMap[`accounts/${ses.accountId}`] = {
        ...existingAcc,
        ...(nextRest.n ? { projectName: nextRest.n, n: nextRest.n } : {}),
        ...(nextRest.projectType ? { projectType: nextRest.projectType } : {}),
        ...(body.ph !== undefined ? { projectPhone: nextRest.ph } : {}),
      };
      if (nextRest.n) {
        await updateServerAuthSession(ses.sid, { ...ses, name: nextRest.n }).catch(() => {});
      }
    }

    putMap[`logs/aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`] = {
      id: `aud_${Date.now().toString(36)}`,
      ts: Date.now(),
      actor: ses.phone || ses.name || nextRest.n || 'شريك',
      action: 'تحديث ملف المشروع والإعداد الأولي',
      details: `المشروع: ${nextRest.n || rid} (${rid})`,
      type: 'restaurant',
    };

    await applyChanges({ put: putMap }, false);
    return res.json({ ok: true, restaurant: nextRest });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر حفظ بيانات المشروع.' });
  }
});

app.post('/api/auth/impersonate', requireAdminOrStaff(), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ses = req.authSession!;
    const rawRid = (req.body as Record<string, unknown>)?.rid;
    const requestedRid = rawRid === null || rawRid === undefined ? '' : String(rawRid).trim();
    const exitToOwn = !requestedRid || requestedRid === '__exit__';
    const nextRid = exitToOwn ? (ses.personalRid || 'demo') : requestedRid;

    if (!exitToOwn) {
      const perms: Record<string, boolean | undefined> =
        ses.role === 'owner' || !ses.staffId ? FULL_OWNER_PERMISSIONS : (req.authPermissions as Record<string, boolean | undefined>) || {};
      if (nextRid === 'demo') {
        if (!perms.canEditDemoMenu && !perms.canImpersonatePartner) {
          return res.status(403).json({ ok: false, error: 'ليست لديك صلاحية تعديل المنيو التجريبي.' });
        }
      } else if (!perms.canImpersonatePartner) {
        return res.status(403).json({ ok: false, error: 'ليست لديك صلاحية فتح لوحة تحكم الشركاء.' });
      }

      const targetRest = await getInternalStoreItem(`restaurants/${nextRid}`);
      if (!targetRest) {
        return res.status(404).json({ ok: false, error: 'المتجر المستهدف غير موجود.' });
      }
    }

    const updated = {
      ...ses,
      rid: nextRid,
      personalRid: exitToOwn ? (ses.personalRid || 'demo') : (ses.personalRid || nextRid),
      impersonating: !exitToOwn && nextRid !== (ses.personalRid || 'demo'),
      menuLoggedOut: false,
    };
    await updateServerAuthSession(ses.sid, updated);
    req.authSession = updated;
    return res.json({ ok: true, token: signSid(updated.sid), session: sanitizeAuthSessionForClient(updated) });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر تبديل الجلسة.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const body = (req.body || {}) as Record<string, unknown>;
  const scope = String(body.scope || 'all').trim();
  const ses = req.authSession;
  if (scope === 'menu' && ses && ses.admin && !ses.menuLoggedOut) {
    const updated = {
      ...ses,
      rid: undefined,
      personalRid: undefined,
      impersonating: false,
      menuLoggedOut: true,
    };
    await updateServerAuthSession(ses.sid, updated);
    req.authSession = updated;
    return res.json({
      ok: true,
      partial: true,
      token: signSid(updated.sid),
      session: sanitizeAuthSessionForClient(updated),
    });
  }
  await destroyServerAuthSession(req, res);
  return res.json({ ok: true, partial: false });
});

// Validated public review submission (without granting full write access to restaurants/*)
app.post('/api/reviews', otpRateLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const rid = String(body.rid || '').trim();
    const name = String(body.name || 'زبون').trim().slice(0, 60) || 'زبون';
    const rate = Math.max(1, Math.min(5, Math.round(Number(body.rate || 5))));
    const comment = String(body.comment || '').trim().slice(0, 500);
    if (!rid || !comment) {
      return res.status(400).json({ ok: false, error: 'يرجى كتابة التقييم قبل الإرسال.' });
    }

    const rest = await getInternalStoreItem<Record<string, any>>(`restaurants/${rid}`);
    if (!rest) {
      return res.status(404).json({ ok: false, error: 'المتجر غير موجود.' });
    }

    const existingReviews = Array.isArray(rest.reviews) ? rest.reviews : [];
    const newReview = {
      id: `rev_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
      name,
      rate,
      comment,
      at: Date.now(),
    };
    const nextReviews = [newReview, ...existingReviews].slice(0, 200);
    await applyChanges({ put: { [`restaurants/${rid}`]: { ...rest, reviews: nextReviews } } }, false);
    return res.json({ ok: true, reviews: nextReviews });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر إرسال التقييم.' });
  }
});

// Backward-compatible /api/session endpoints — strictly read-only or scoped RID switch only (NO privilege escalation)
app.get('/api/session', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    sessionId: req.authSession?.sid || null,
    session: sanitizeAuthSessionForClient(req.authSession || null),
  });
});

app.post('/api/session', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const ses = req.authSession;
  if (!ses) {
    return res.status(401).json({ ok: false, error: 'يتطلب تسجيل الدخول عبر /api/auth/login.' });
  }
  const reqSes = (req.body as Record<string, unknown>)?.session as Record<string, unknown> | undefined;
  const targetRid = reqSes?.rid ? String(reqSes.rid).trim() : '';
  if (!targetRid || targetRid === ses.rid) {
    return res.json({ ok: true, sessionId: ses.sid });
  }
  if (ses.admin) {
    const updated = { ...ses, rid: targetRid, menuLoggedOut: false };
    await updateServerAuthSession(ses.sid, updated);
    req.authSession = updated;
    return res.json({ ok: true, sessionId: ses.sid });
  }
  // Partners can switch between any of their owned menus & branches
  const allData = await readAll(false);
  const owned = getOwnedPartnerRids(allData, ses.personalRid || ses.rid, ses);
  if (!owned.has(targetRid)) {
    return res.status(403).json({ ok: false, error: 'غير مصرح بالوصول إلى هذا المتجر.' });
  }
  const updated = { ...ses, rid: targetRid };
  await updateServerAuthSession(ses.sid, updated);
  req.authSession = updated;
  return res.json({ ok: true, sessionId: ses.sid });
});

app.delete('/api/session', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  await destroyServerAuthSession(req, res);
  return res.json({ ok: true });
});

// 2. Telegram Order Notifications Bot endpoints
app.get('/api/telegram-status', (_req, res) => {
  res.json(getTelegramBotStatus());
});

async function resolvePartnerTelegramAccess(req: Request, requestedRid: unknown): Promise<{ ok: true; rid: string } | { ok: false; status: number; error: string }> {
  const ses = req.authSession;
  if (!ses) {
    return { ok: false, status: 401, error: 'يرجى تسجيل الدخول للمتابعة.' };
  }
  const targetRid = String(requestedRid || ses.rid || '').trim();
  if (!targetRid) {
    return { ok: false, status: 400, error: 'معرّف المتجر مطلوب.' };
  }
  if (ses.admin) {
    return { ok: true, rid: targetRid };
  }
  const allData = await readAll(false);
  const owned = getOwnedPartnerRids(allData, ses.personalRid || ses.rid, ses);
  if (!owned.has(targetRid)) {
    return { ok: false, status: 403, error: 'غير مصرح بالوصول إلى هذا المتجر.' };
  }
  return { ok: true, rid: targetRid };
}

app.get('/api/dashboard/telegram/status', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const auth = await resolvePartnerTelegramAccess(req, req.query.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const status = await getTelegramOrderLinkStatus(auth.rid);
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر تحميل حالة الربط.' });
  }
});

app.post('/api/dashboard/telegram/link', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const result = await initTelegramOrderLink(auth.rid, String(body.phone || ''));
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر بدء ربط تيليجرام.' });
  }
});

app.post('/api/dashboard/telegram/toggle', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const enabled = body.enabled !== false;
    const ok = await toggleTelegramForRestaurant(auth.rid, enabled);
    if (!ok) return res.status(404).json({ ok: false, error: 'المتجر غير موجود.' });
    return res.json({ ok: true, enabled });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر تحديث التفعيل.' });
  }
});

app.post('/api/dashboard/telegram/unlink', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const ok = await unlinkTelegramForRestaurant(auth.rid);
    if (!ok) return res.status(404).json({ ok: false, error: 'المتجر غير موجود.' });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر فك الربط.' });
  }
});

app.post('/api/dashboard/telegram/test', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const result = await sendPartnerTestOrderNotification(auth.rid);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || 'تعذر إرسال الطلب التجريبي.' });
  }
});

app.post('/api/dashboard/telegram/verify', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const result = await verifyTelegramBotLive(auth.rid);
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      diagnosticMessage: err?.message || 'تعذر فحص اتصال بوت تيليجرام.',
    });
  }
});

app.post('/api/telegram/webhook', async (req, res) => {
  try {
    const body = (req.body || {}) as { message?: Parameters<typeof handleIncomingTelegramMessage>[0] };
    if (body?.message && body.message.chat?.id) {
      await handleIncomingTelegramMessage(body.message);
    }
    return res.json({ ok: true });
  } catch (err: any) {
    console.warn('[Telegram Webhook] Error:', err?.message || err);
    return res.json({ ok: true });
  }
});

// 2.5. Cross-Menu Persistent Customer Profile (auto-fills across all menus & subdomains)
const CUST_PROFILE_COOKIE = 'mp_cust_id';
const CUST_PROFILE_KV_PREFIX = 'customer_profiles/';

function setCustomerProfileCookie(res: Response, req: Request, custId: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const reqHost = String(req.hostname || '').toLowerCase().trim();
  const sharesSubdomains =
    BASE_DOMAIN &&
    (reqHost === BASE_DOMAIN || reqHost.endsWith(`.${BASE_DOMAIN}`));
  const parts = [
    `${CUST_PROFILE_COOKIE}=${encodeURIComponent(custId)}`,
    'Path=/',
    'HttpOnly',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${365 * 24 * 60 * 60}`,
  ];
  if (sharesSubdomains) parts.push(`Domain=.${BASE_DOMAIN}`);
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

app.get('/api/customer-profile', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cookies = parseRequestCookies(req.headers.cookie);
    const custId = String(cookies[CUST_PROFILE_COOKIE] || req.headers['x-customer-profile-id'] || '').trim();
    if (!custId || !/^[a-zA-Z0-9_-]{8,64}$/.test(custId)) {
      return res.json({ ok: true, profile: null });
    }
    const profile = await getInternalStoreItem<{
      name?: string;
      phone?: string;
      address?: string;
      notes?: string;
      updatedAt?: number;
    }>(`${CUST_PROFILE_KV_PREFIX}${custId}`).catch(() => null);
    return res.json({ ok: true, custId, profile: profile || null });
  } catch {
    return res.json({ ok: true, profile: null });
  }
});

app.post('/api/customer-profile', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cookies = parseRequestCookies(req.headers.cookie);
    let custId = String(cookies[CUST_PROFILE_COOKIE] || req.headers['x-customer-profile-id'] || '').trim();
    if (!custId || !/^[a-zA-Z0-9_-]{8,64}$/.test(custId)) {
      custId = `cust_${crypto.randomBytes(12).toString('hex')}`;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const existing = await getInternalStoreItem<{
      name?: string;
      phone?: string;
      address?: string;
      notes?: string;
      updatedAt?: number;
    }>(`${CUST_PROFILE_KV_PREFIX}${custId}`).catch(() => null);

    const nextProfile = {
      name: String(body.name ?? existing?.name ?? '').trim().slice(0, 120),
      phone: String(body.phone ?? existing?.phone ?? '').trim().slice(0, 40),
      address: String(body.address ?? existing?.address ?? '').trim().slice(0, 400),
      notes: String(body.notes ?? existing?.notes ?? '').trim().slice(0, 400),
      updatedAt: Date.now(),
    };
    await setInternalStoreItem(`${CUST_PROFILE_KV_PREFIX}${custId}`, nextProfile);
    setCustomerProfileCookie(res, req, custId);
    return res.json({ ok: true, custId, profile: nextProfile });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

// 2.6. URL-Backed Media Image Upload, Serving & Cleanup (prevents Base64 bloat in menuplus_kv)
const MEDIA_DISK_DIR = path.resolve(process.cwd(), 'data/media');

function detectImageFormatAndMime(buf: Buffer): {
  ext: 'jpg' | 'png' | 'webp' | 'gif';
  mime: string;
} | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  // GIF: GIF87a or GIF89a
  const gifSig = buf.subarray(0, 6).toString('ascii');
  if (gifSig === 'GIF87a' || gifSig === 'GIF89a') {
    return { ext: 'gif', mime: 'image/gif' };
  }
  return null;
}

app.post('/api/media/upload', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ses = req.authSession;
    if (!ses) {
      return res.status(401).json({ ok: false, error: 'يرجى تسجيل الدخول لرفع الصور.' });
    }
    const { fileName, dataBase64 } = (req.body || {}) as {
      fileName?: string;
      dataBase64?: string;
    };
    const rawB64 = String(dataBase64 || '')
      .trim()
      .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '');
    if (!rawB64) {
      return res.status(400).json({ ok: false, error: 'بيانات الصورة غير صالحة.' });
    }
    const buf = Buffer.from(rawB64, 'base64');
    if (buf.length < 32 || buf.length > 4 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'حجم الصورة يجب أن يكون أقل من 4 ميغابايت.' });
    }
    const detected = detectImageFormatAndMime(buf);
    if (!detected) {
      return res.status(400).json({ ok: false, error: 'صيغة الصورة غير مدعومة (JPG/PNG/WebP/GIF فقط).' });
    }

    const fileId = `img_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
    if (!fs.existsSync(MEDIA_DISK_DIR)) {
      fs.mkdirSync(MEDIA_DISK_DIR, { recursive: true });
    }
    const diskPath = path.resolve(MEDIA_DISK_DIR, `${fileId}.${detected.ext}`);
    if (!diskPath.startsWith(MEDIA_DISK_DIR + path.sep)) {
      return res.status(400).json({ ok: false, error: 'مسار غير صالح.' });
    }
    fs.writeFileSync(diskPath, buf);

    // Lazy KV fallback (excluded from bulk sync/bootstrap; fetched only on cold cache miss)
    await setInternalStoreItem(`media_files/${fileId}`, {
      fileId,
      fileName: String(fileName || 'image').slice(0, 120),
      ext: detected.ext,
      mime: detected.mime,
      sizeBytes: buf.length,
      dataBase64: buf.toString('base64'),
      createdAt: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      fileId,
      url: `/api/media/file/${fileId}.${detected.ext}`,
      ext: detected.ext,
      sizeBytes: buf.length,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'فشل رفع الصورة.' });
  }
});

app.get('/api/media/file/:fileParam', async (req, res) => {
  try {
    const rawParam = String(req.params.fileParam || '').trim();
    const match = /^([a-zA-Z0-9_-]+)(?:\.(jpg|jpeg|png|webp|gif))?$/i.exec(rawParam);
    if (!match) {
      return res.status(400).send('Invalid media id');
    }
    const fileId = match[1];
    const mimeByExt: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };

    for (const ext of ['jpg', 'png', 'webp', 'gif'] as const) {
      const candidate = path.resolve(MEDIA_DISK_DIR, `${fileId}.${ext}`);
      if (candidate.startsWith(MEDIA_DISK_DIR + path.sep) && fs.existsSync(candidate)) {
        res.setHeader('Content-Type', mimeByExt[ext]);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(candidate);
      }
    }

    const stored = (await getInternalStoreItem(`media_files/${fileId}`)) as
      | { ext?: string; mime?: string; dataBase64?: string }
      | undefined;
    if (!stored || !stored.dataBase64) {
      return res.status(404).send('Image not found');
    }
    const buf = Buffer.from(stored.dataBase64, 'base64');
    const ext = stored.ext === 'png' || stored.ext === 'webp' || stored.ext === 'gif' ? stored.ext : 'jpg';
    const mime = stored.mime || mimeByExt[ext];
    try {
      if (!fs.existsSync(MEDIA_DISK_DIR)) fs.mkdirSync(MEDIA_DISK_DIR, { recursive: true });
      const diskPath = path.resolve(MEDIA_DISK_DIR, `${fileId}.${ext}`);
      if (diskPath.startsWith(MEDIA_DISK_DIR + path.sep)) {
        fs.writeFileSync(diskPath, buf);
      }
    } catch {
      // ignore disk cache write failure
    }
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(buf);
  } catch {
    return res.status(500).send('Failed to load image');
  }
});

app.post('/api/dashboard/media/delete-file', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ses = req.authSession;
    if (!ses) {
      return res.status(401).json({ ok: false, error: 'يرجى تسجيل الدخول.' });
    }
    const url = String((req.body || {}).url || '').trim();
    if (!url || (!url.startsWith('/uploads/') && !url.startsWith('/api/media/file/'))) {
      return res.json({ ok: true, deletedFile: false });
    }

    // Check only relevant collections from in-memory snapshot without triggering a DB sync
    const snapshot = getMemoryStoreSnapshot(false);
    let stillReferenced = false;
    for (const [k, v] of Object.entries(snapshot)) {
      if (
        !k.startsWith('restaurants/') &&
        !k.startsWith('cats/') &&
        !k.startsWith('items/') &&
        !k.startsWith('reports/')
      ) {
        continue;
      }
      if (v && JSON.stringify(v).includes(url)) {
        stillReferenced = true;
        break;
      }
    }
    if (stillReferenced) {
      return res.json({ ok: true, deletedFile: false });
    }

    if (url.startsWith('/api/media/file/')) {
      const rawParam = url.slice('/api/media/file/'.length);
      const m = /^([a-zA-Z0-9_-]+)(?:\.(jpg|jpeg|png|webp|gif))?$/i.exec(rawParam);
      if (!m) return res.json({ ok: true, deletedFile: false });
      const fileId = m[1];
      let deletedDisk = false;
      for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif']) {
        const target = path.resolve(MEDIA_DISK_DIR, `${fileId}.${ext}`);
        if (target.startsWith(MEDIA_DISK_DIR + path.sep) && fs.existsSync(target)) {
          fs.unlinkSync(target);
          deletedDisk = true;
        }
      }
      await deleteInternalStoreItem(`media_files/${fileId}`).catch(() => {});
      return res.json({ ok: true, deletedFile: deletedDisk || true });
    }

    const uploadsRoot = path.resolve(process.cwd(), 'public', 'uploads');
    const relPath = url.replace(/^\/uploads\//, '');
    const resolvedTarget = path.resolve(uploadsRoot, relPath);
    if (
      resolvedTarget.startsWith(uploadsRoot + path.sep) &&
      fs.existsSync(resolvedTarget) &&
      fs.statSync(resolvedTarget).isFile()
    ) {
      fs.unlinkSync(resolvedTarget);
      return res.json({ ok: true, deletedFile: true });
    }
    return res.json({ ok: true, deletedFile: false });
  } catch {
    return res.json({ ok: true, deletedFile: false });
  }
});


// 3. Notes endpoints (strictly protected with canUseNotes permission)
app.all('/api/notes', requireAdminOrStaff('canUseNotes'), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const db = await readAll().catch(() => ({} as Record<string, unknown>));
    const seedNotes: StoredNote[] = Object.entries(db)
      .filter(([k]) => k.startsWith('notes/'))
      .map(([, v]) => v as StoredNote)
      .filter((v) => v && typeof v === 'object' && v.id);

    if (req.method === 'GET') {
      const result = readNotesDocument(seedNotes);
      if (seedNotes.length > 0 && isSupabaseConfigured()) {
        return res.json({ ...result, notes: seedNotes });
      }
      return res.json(result);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.action === 'delete' && body.id) {
        const noteId = String(body.id);
        const result = deleteNoteFromFile(noteId, seedNotes);
        await applyChanges({ del: [`notes/${noteId}`] }, false);
        return res.json({ ok: true, ...result });
      }
      if (body.action === 'replaceAll' && Array.isArray(body.notes)) {
        const result = replaceAllNotesInFile(body.notes);
        const oldNoteKeys = Object.keys(db).filter((k) => k.startsWith('notes/'));
        const putMap: Record<string, unknown> = {};
        for (const n of result.notes) {
          putMap[`notes/${n.id}`] = n;
        }
        const delKeys = oldNoteKeys.filter((k) => !Object.prototype.hasOwnProperty.call(putMap, k));
        await applyChanges({ put: putMap, del: delKeys }, false);
        return res.json({ ok: true, ...result });
      }
      if (body.note && typeof body.note === 'object' && body.note.id) {
        const result = saveNoteToFile(body.note as StoredNote, seedNotes);
        await applyChanges({ put: { [`notes/${result.savedNote.id}`]: result.savedNote } }, false);
        return res.json({ ok: true, ...result });
      }
      return res.status(400).json({ error: 'Invalid notes payload' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Notes error' });
  }
});

// 4. Image search & proxy
app.get('/api/search-images', async (req, res) => {
  const q = String(req.query.q || '').slice(0, 120);
  const limit = Math.min(24, Math.max(4, Number(req.query.limit || '16') || 16));
  const offset = Math.max(0, Math.min(80, Number(req.query.offset || '0') || 0));
  const seed = Math.max(0, Math.min(50, Number(req.query.seed || '0') || 0));
  const excludeRaw = String(req.query.exclude || '');
  const exclude = excludeRaw ? excludeRaw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 48) : [];
  const images = await searchWebImages(q, limit, offset, seed, exclude);
  res.json({ query: q, images });
});

app.get('/api/proxy-image', async (req, res) => {
  const target = String(req.query.url || '');
  const result = await proxyExternalImage(target);
  res.status(result.status);
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (result.status === 200 && result.buffer) {
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(result.buffer);
  }
  return res.json({ error: result.error || 'Proxy error' });
});

// 4.5. Admin persistent Staff CRUD & Accounts management endpoints
app.use(createAdminRouter());

// 4.6. Dynamic subdomain resolution, availability check & admin listing endpoints
app.use(createSubdomainRouter());

// 4.7. Platform Custom Font (.otf/.ttf/.woff/.woff2) Upload & Serving Endpoints
const FONTS_DISK_DIR = path.resolve(process.cwd(), 'data/fonts');

function detectFontFormatAndMime(fileName: string, buf: Buffer): {
  ext: 'otf' | 'ttf' | 'woff' | 'woff2';
  format: 'opentype' | 'truetype' | 'woff' | 'woff2';
  mime: string;
} | null {
  const lower = String(fileName || '').toLowerCase();
  const magic4 = buf.subarray(0, 4);
  const magicStr = magic4.toString('ascii');

  const isOtfMagic = magicStr === 'OTTO';
  const isTtfMagic =
    (magic4[0] === 0x00 && magic4[1] === 0x01 && magic4[2] === 0x00 && magic4[3] === 0x00) ||
    magicStr === 'true' ||
    magicStr === 'typ1';
  const isWoffMagic = magicStr === 'wOFF';
  const isWoff2Magic = magicStr === 'wOF2';

  if (lower.endsWith('.otf') && (isOtfMagic || isTtfMagic)) {
    return { ext: 'otf', format: 'opentype', mime: 'font/otf' };
  }
  if (lower.endsWith('.ttf') && (isTtfMagic || isOtfMagic)) {
    return { ext: 'ttf', format: 'truetype', mime: 'font/ttf' };
  }
  if (lower.endsWith('.woff2') && isWoff2Magic) {
    return { ext: 'woff2', format: 'woff2', mime: 'font/woff2' };
  }
  if (lower.endsWith('.woff') && isWoffMagic) {
    return { ext: 'woff', format: 'woff', mime: 'font/woff' };
  }

  // Fallback by magic bytes if filename had unusual casing or omitted ext
  if (isOtfMagic) return { ext: 'otf', format: 'opentype', mime: 'font/otf' };
  if (isWoff2Magic) return { ext: 'woff2', format: 'woff2', mime: 'font/woff2' };
  if (isWoffMagic) return { ext: 'woff', format: 'woff', mime: 'font/woff' };
  if (isTtfMagic) return { ext: 'ttf', format: 'truetype', mime: 'font/ttf' };
  return null;
}

app.post('/api/admin/fonts/upload', requireAdminOrStaff(), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const perms = resolveEffectiveAdminPermissions(req);
    if (!perms.canManageSettings && !perms.canManageThemeMode && !perms.canEditHomePage) {
      return res.status(403).json({ ok: false, error: 'ليست لديك صلاحية رفع وتعديل خطوط المنصة' });
    }

    const { fileName, dataBase64, weight } = (req.body || {}) as {
      fileName?: string;
      dataBase64?: string;
      weight?: number;
    };

    const rawName = String(fileName || 'custom-font.otf').trim();
    const rawB64 = String(dataBase64 || '')
      .trim()
      .replace(/^data:[^;]+;base64,/i, '');

    if (!rawB64) {
      return res.status(400).json({ ok: false, error: 'ملف الخط فارغ أو غير صالح' });
    }

    const buf = Buffer.from(rawB64, 'base64');
    if (buf.length < 32 || buf.length > 8 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'حجم ملف الخط يجب أن يكون بين 32 بايت و 8 ميغابايت' });
    }

    const detected = detectFontFormatAndMime(rawName, buf);
    if (!detected) {
      return res.status(400).json({
        ok: false,
        error: 'صيغة ملف الخط غير مدعومة. يرجى رفع ملف خط بصيغة .otf أو .ttf أو .woff2 أو .woff',
      });
    }

    const fileId = `font_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    const numericWeight = Number(weight) === 0 ? 0 : Math.min(900, Math.max(100, Number(weight) || 400));

    if (!fs.existsSync(FONTS_DISK_DIR)) {
      fs.mkdirSync(FONTS_DISK_DIR, { recursive: true });
    }
    const diskPath = path.join(FONTS_DISK_DIR, `${fileId}.${detected.ext}`);
    fs.writeFileSync(diskPath, buf);

    await applyChanges(
      {
        put: {
          [`custom_font_files/${fileId}`]: {
            fileId,
            fileName: rawName.slice(0, 140),
            ext: detected.ext,
            format: detected.format,
            mime: detected.mime,
            weight: numericWeight,
            sizeBytes: buf.length,
            dataBase64: buf.toString('base64'),
            createdAt: new Date().toISOString(),
          },
        },
      },
      false
    );

    return res.json({
      ok: true,
      fileId,
      url: `/api/fonts/file/${fileId}.${detected.ext}`,
      format: detected.format,
      ext: detected.ext,
      sizeBytes: buf.length,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'فشل رفع ملف الخط' });
  }
});

app.get('/api/fonts/file/:fileParam', async (req, res) => {
  try {
    const rawParam = String(req.params.fileParam || '').trim();
    const match = /^([a-zA-Z0-9_-]+)(?:\.(otf|ttf|woff2|woff))?$/i.exec(rawParam);
    if (!match) {
      return res.status(400).send('Invalid font id');
    }
    const fileId = match[1];

    // 1. Check disk cache first
    for (const ext of ['otf', 'ttf', 'woff2', 'woff'] as const) {
      const candidate = path.join(FONTS_DISK_DIR, `${fileId}.${ext}`);
      if (fs.existsSync(candidate)) {
        const mime =
          ext === 'otf'
            ? 'font/otf'
            : ext === 'ttf'
            ? 'font/ttf'
            : ext === 'woff2'
            ? 'font/woff2'
            : 'font/woff';
        res.setHeader('Content-Type', mime);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(candidate);
      }
    }

    // 2. Fallback to persistent store (e.g. Supabase or data/db-store.json)
    const stored = (await getInternalStoreItem(`custom_font_files/${fileId}`)) as
      | { ext?: string; mime?: string; dataBase64?: string }
      | undefined;
    if (!stored || !stored.dataBase64) {
      return res.status(404).send('Font not found');
    }
    const buf = Buffer.from(stored.dataBase64, 'base64');
    const ext = stored.ext || 'otf';
    const mime = stored.mime || 'font/otf';
    try {
      if (!fs.existsSync(FONTS_DISK_DIR)) fs.mkdirSync(FONTS_DISK_DIR, { recursive: true });
      fs.writeFileSync(path.join(FONTS_DISK_DIR, `${fileId}.${ext}`), buf);
    } catch {
      // ignore disk cache write failure
    }
    res.setHeader('Content-Type', mime);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(buf);
  } catch {
    return res.status(500).send('Failed to load font');
  }
});

app.delete('/api/admin/fonts/:fileId', requireAdminOrStaff(), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const perms = resolveEffectiveAdminPermissions(req);
    if (!perms.canManageSettings && !perms.canManageThemeMode && !perms.canEditHomePage) {
      return res.status(403).json({ ok: false, error: 'ليست لديك صلاحية حذف خطوط المنصة' });
    }
    const fileId = String(req.params.fileId || '').trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return res.status(400).json({ ok: false, error: 'معرف الخط غير صالح' });
    }
    for (const ext of ['otf', 'ttf', 'woff2', 'woff']) {
      const p = path.join(FONTS_DISK_DIR, `${fileId}.${ext}`);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
    await applyChanges({ del: [`custom_font_files/${fileId}`] }, false);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'فشل حذف ملف الخط' });
  }
});

function resolvePwaTargetFromQuery(
  allData: Record<string, unknown>,
  req: Request
): { targetRid: string; resolvedSlug: string; safeBranchId: string } {
  const rawRid = typeof req.query.rid === 'string' ? req.query.rid.trim() : '';
  const rawBranchId = typeof req.query.branchId === 'string' ? req.query.branchId.trim() : '';
  const rawSlug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
  const safeQueryRid = /^[a-zA-Z0-9_-]{1,64}$/.test(rawRid) ? rawRid : '';
  const safeBranchId = /^[a-zA-Z0-9_-]{1,64}$/.test(rawBranchId) ? rawBranchId : '';
  const safeSlug = sanitizeSubdomainValue(rawSlug);
  const sessionRid = typeof req.authSession?.rid === 'string' ? req.authSession.rid.trim() : '';

  let targetRid = safeBranchId || safeQueryRid || '';
  if (!targetRid && safeSlug) {
    const matched = resolveRestaurantEntryByIdOrSlug(allData, safeSlug);
    if (matched) targetRid = matched.rid;
  }
  if (!targetRid) {
    targetRid = sessionRid;
  }

  let resolvedSlug = safeSlug;
  if (targetRid) {
    const restRec = allData[`restaurants/${targetRid}`] as Record<string, unknown> | undefined;
    const dbSlug = sanitizeSubdomainValue(String(restRec?.slug || restRec?.subdomain || ''));
    if (dbSlug) {
      resolvedSlug = dbSlug;
    } else if (targetRid === 'demo' && !resolvedSlug) {
      resolvedSlug = 'cap-burger';
    }
  }

  return { targetRid, resolvedSlug, safeBranchId };
}

app.get('/api/pwa/dashboard-icon', async (req, res) => {
  try {
    const allData = await readAll(false);
    const { targetRid } = resolvePwaTargetFromQuery(allData, req);
    const iconInfo = await resolveRestaurantPwaIcon(allData, targetRid);
    res
      .status(200)
      .setHeader('Content-Type', iconInfo.mimeType)
      .setHeader('Cache-Control', 'public, max-age=3600')
      .setHeader('X-Content-Type-Options', 'nosniff')
      .send(iconInfo.buffer);
  } catch {
    const fallback = getFallbackPwaIcon();
    res
      .status(200)
      .setHeader('Content-Type', fallback.mimeType)
      .setHeader('Cache-Control', 'no-cache')
      .send(fallback.buffer);
  }
});

app.get('/api/pwa/dashboard-manifest.webmanifest', async (req, res) => {
  const rawName = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  const cleanQueryName = rawName.replace(/[\r\n\t<>]/g, '').slice(0, 60);

  let allData: Record<string, unknown> = {};
  try {
    allData = await readAll(false);
  } catch {
    allData = {};
  }

  const { targetRid, resolvedSlug, safeBranchId } = resolvePwaTargetFromQuery(allData, req);
  const { logo, name: dbName } = getRestaurantRecordForPwa(allData, targetRid);
  const cleanName = cleanQueryName || dbName.replace(/[\r\n\t<>]/g, '').slice(0, 60);

  const manifestId = resolvedSlug
    ? `/${resolvedSlug}/dashboard/`
    : safeBranchId
    ? `/dashboard/b/${safeBranchId}/`
    : '/dashboard/';
  const startUrl = resolvedSlug
    ? `/${encodeURIComponent(resolvedSlug)}/dashboard/home?source=pwa`
    : safeBranchId
    ? `/dashboard/b/${encodeURIComponent(safeBranchId)}/home?source=pwa`
    : '/dashboard/home?source=pwa';
  const fullName = cleanName ? `لوحة تحكم ${cleanName}` : 'لوحة تحكم Menu Plus';
  const shortNameSource = cleanName || 'لوحة التحكم';
  const shortName = shortNameSource.length <= 14 ? shortNameSource : `${shortNameSource.slice(0, 13)}…`;

  let icons: Array<{ src: string; sizes: string; type: string; purpose: string }> = [
    {
      src: '/pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/pwa-maskable-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ];

  if (targetRid && logo) {
    try {
      const iconInfo = await resolveRestaurantPwaIcon(allData, targetRid);
      if (iconInfo.isCustom && iconInfo.buffer.length > 0) {
        const ver = computePwaLogoVersion(logo);
        const iconSrc = `/api/pwa/dashboard-icon?rid=${encodeURIComponent(targetRid)}&v=${encodeURIComponent(ver)}`;
        const hasLargeDimensions = iconInfo.width >= 144 && iconInfo.height >= 144;
        if (hasLargeDimensions) {
          icons = [
            {
              src: iconSrc,
              sizes: `${iconInfo.width}x${iconInfo.height}`,
              type: iconInfo.mimeType,
              purpose: 'any',
            },
          ];
        } else {
          icons = [
            {
              src: iconSrc,
              sizes: iconInfo.width > 0 && iconInfo.height > 0 ? `${iconInfo.width}x${iconInfo.height}` : '192x192',
              type: iconInfo.mimeType,
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
          ];
        }
      }
    } catch {
      // keep default platform icons
    }
  }

  res
    .status(200)
    .setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
    .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
    .json({
      id: manifestId,
      name: fullName,
      short_name: shortName,
      description: 'لوحة تحكم Menu Plus لإدارة المنيو والفروع والطلبات مباشرة.',
      start_url: startUrl,
      scope: '/',
      display: 'standalone',
      orientation: 'portrait-primary',
      dir: 'rtl',
      lang: 'ar',
      theme_color: '#061c15',
      background_color: '#061c15',
      icons,
    });
});

// ============================================================================
// PUBLIC UNIQUE VISITOR TRACKING & ADMIN VISITOR STATS
// ============================================================================
const visitRateWindowMs = 60_000;
const visitRateMaxRequests = 60;
const visitRateBuckets = new Map<string, number[]>();

app.post('/api/analytics/visit', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const rawScope = typeof req.body?.scope === 'string' ? req.body.scope.trim() : '';
    const scope = rawScope === 'menu' ? 'menu' : rawScope === 'site' ? 'site' : '';
    if (!scope) {
      return res.status(400).json({ ok: false, error: 'Invalid visit scope' });
    }

    const clientIp = req.ip || req.socket.remoteAddress || '';
    const now = Date.now();
    const cutoff = now - visitRateWindowMs;
    const recent = (visitRateBuckets.get(clientIp) || []).filter((ts) => ts > cutoff);
    if (recent.length >= visitRateMaxRequests) {
      return res.status(200).json({ ok: true, throttled: true });
    }
    recent.push(now);
    visitRateBuckets.set(clientIp, recent);
    if (visitRateBuckets.size > 5000) {
      for (const [ip, tsList] of visitRateBuckets.entries()) {
        if (!tsList.some((ts) => ts > cutoff)) visitRateBuckets.delete(ip);
      }
    }

    const visitorId = typeof req.body?.visitorId === 'string' ? req.body.visitorId.trim() : '';
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';

    await recordSiteOrMenuVisit({
      ip: clientIp,
      visitorId,
      userAgent,
      scope,
    });
    return res.json({ ok: true });
  } catch {
    return res.status(200).json({ ok: false });
  }
});

app.get('/api/admin/visitor-stats', requireAdminOrStaff(), async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const stats = await getVisitorAnalyticsStats();
    return res.json({ ok: true, ...stats });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر جلب إحصائيات الزوار' });
  }
});

// ============================================================================
// PWA WEB PUSH SUBSCRIPTIONS & PUBLIC LOYALTY WALLET ENDPOINTS
// ============================================================================
app.get('/api/pwa/push-public-key', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const publicKey = await getWebPushPublicKey();
    return res.json({ ok: true, publicKey });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Push key unavailable' });
  }
});

app.post('/api/pwa/push-subscribe', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ses = req.authSession;
    if (!ses) {
      return res.status(401).json({ ok: false, error: 'يرجى تسجيل الدخول لتفعيل الإشعارات.' });
    }
    const allData = await readAll(false);
    let ownedRids: string[] = [];
    if (ses.admin) {
      for (const k of Object.keys(allData)) {
        if (k.startsWith('restaurants/') && !k.slice('restaurants/'.length).includes('/')) {
          ownedRids.push(k.slice('restaurants/'.length));
        }
      }
    } else {
      const ownerRid = ses.personalRid || ses.rid;
      ownedRids = Array.from(getOwnedPartnerRids(allData, ownerRid, ses));
    }

    const sub = req.body?.subscription || {};
    const result = await upsertPushSubscription({
      subscription: sub,
      ownedRids,
      accountId: ses.accountId,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '',
    });

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error || 'بيانات الاشتراك غير صالحة' });
    }
    return res.json({ ok: true, id: result.id, ownedCount: ownedRids.length });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Push subscribe failed' });
  }
});

app.post('/api/pwa/push-unsubscribe', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const endpoint = String(req.body?.endpoint || '').trim();
    if (endpoint) {
      await removePushSubscription(endpoint);
    }
    return res.json({ ok: true });
  } catch {
    return res.json({ ok: false });
  }
});

function normalizeCustomerLoyaltyPhone(raw: unknown): string {
  const digits = String(raw || '').replace(/[\s\-()+]/g, '').replace(/[^\d]/g, '');
  if (digits.startsWith('964') && digits.length >= 12) {
    return `0${digits.slice(3)}`;
  }
  return digits;
}

app.get('/api/loyalty/wallet', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const rid = String(req.query.rid || '').trim();
    const phone = normalizeCustomerLoyaltyPhone(req.query.phone);
    if (!rid || phone.length < 7) {
      return res.status(400).json({ ok: false, error: 'رقم الهاتف أو المعرف غير صالح.' });
    }
    const key = `loyalty/${rid}__${phone}`;
    const existing = await getInternalStoreItem<Record<string, unknown>>(key);
    if (!existing) {
      return res.json({ ok: true, found: false, phone, points: 0, name: '' });
    }
    return res.json({
      ok: true,
      found: true,
      customer: {
        id: existing.id || `${rid}__${phone}`,
        rid,
        phone: String(existing.phone || phone),
        name: String(existing.name || ''),
        points: Math.max(0, Number(existing.points || 0)),
        totalOrders: Math.max(0, Number(existing.totalOrders || 0)),
        totalSpent: Math.max(0, Number(existing.totalSpent || 0)),
        updatedAt: Number(existing.updatedAt || Date.now()),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Loyalty lookup failed' });
  }
});

app.post('/api/loyalty/register', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const rid = String(req.body?.rid || '').trim();
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const phone = normalizeCustomerLoyaltyPhone(req.body?.phone);
    if (!rid || !name || phone.length < 7) {
      return res.status(400).json({ ok: false, error: 'يرجى كتابة الاسم ورقم الهاتف الصحيح.' });
    }
    const key = `loyalty/${rid}__${phone}`;
    const [rest, existing] = await Promise.all([
      getInternalStoreItem<Record<string, unknown>>(`restaurants/${rid}`),
      getInternalStoreItem<Record<string, unknown>>(key),
    ]);
    if (!rest) {
      return res.status(404).json({ ok: false, error: 'المنيو غير موجود.' });
    }
    const now = Date.now();
    const customer = {
      id: `${rid}__${phone}`,
      rid,
      phone,
      name,
      points: Math.max(0, Number(existing?.points || 0)),
      totalOrders: Math.max(0, Number(existing?.totalOrders || 0)),
      totalSpent: Math.max(0, Number(existing?.totalSpent || 0)),
      createdAt: Number(existing?.createdAt || now),
      updatedAt: now,
    };
    await applyChanges({ put: { [key]: customer } }, false);
    return res.json({ ok: true, customer });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Loyalty registration failed' });
  }
});

app.use(createSeoAndMcpRouter(BASE_DOMAIN));

// 5. Handle OPTIONS preflight and unmatched API routes with JSON 404 instead of index.html
app.options('/api/*', (_req, res) => {
  res.status(204).end();
});

app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Global error handler for malformed JSON or unhandled middleware errors
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON request body' });
  }
  console.error('[Server Error]', err?.message || err);
  return res.status(500).json({ error: 'Internal server error' });
});

const ASSET_EXTENSION_RE = /\.(?:js|mjs|css|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|eot|json|txt|xml)$/i;

// 6. Subdomain interception + Vite middleware (dev) or static dist/ + SPA fallback (prod)
app.use(subdomainMiddleware());

const DEV_BOOT_BUILD_ID = Date.now().toString(36);
let cachedProdBuildId = '';

function resolveServerBuildId(indexHtmlContent?: string): string {
  if (!isProduction) return DEV_BOOT_BUILD_ID;
  if (cachedProdBuildId) return cachedProdBuildId;
  if (indexHtmlContent) {
    const hash = crypto.createHash('sha1').update(indexHtmlContent).digest('hex').slice(0, 12);
    cachedProdBuildId = hash;
    return hash;
  }
  return DEV_BOOT_BUILD_ID;
}

let SERVER_BUILD_ID = resolveServerBuildId();

function injectBuildFingerprint(html: string, buildId: string): string {
  if (!buildId) return html;
  const tag = `<script>window.__MENUPLUS_BUILD__=${JSON.stringify(buildId)};</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', () => `  ${tag}\n  </head>`);
  }
  return `${tag}${html}`;
}

async function startServer() {
  await runStartupMigrations().catch((err) => {
    console.warn('[Startup Migration] Failed:', err);
  });
  const setNoStoreHtmlHeaders = (res: Response) => {
    res.removeHeader('ETag');
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Vary', 'User-Agent, Accept-Encoding');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    res.setHeader('Surrogate-Control', 'no-store');
  };

  if (isProduction) {
    const localDist = path.resolve(__dirname, 'dist');
    const cwdDist = path.resolve(process.cwd(), 'dist');
    const distDir = fs.existsSync(path.join(localDist, 'index.html')) ? localDist : cwdDist;
    const distAssetsDir = path.join(distDir, 'assets');
    const distUploadsDir = path.join(distDir, 'uploads');
    const publicUploadsDir = path.resolve(process.cwd(), 'public/uploads');
    const uploadsDir = fs.existsSync(distUploadsDir) ? distUploadsDir : publicUploadsDir;
    const indexHtmlPath = path.join(distDir, 'index.html');

    // Long immutable cache for hashed Vite JS/CSS bundles
    app.use(
      '/assets',
      express.static(distAssetsDir, {
        maxAge: '1y',
        immutable: true,
        index: false,
      })
    );

    if (fs.existsSync(uploadsDir)) {
      app.use(
        '/uploads',
        express.static(uploadsDir, {
          maxAge: '30d',
          index: false,
        })
      );
    }

    // Static serving for public assets (e.g. favicon, icons) while keeping SW & manifest uncached
    app.use(
      express.static(distDir, {
        cacheControl: false,
        index: false,
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath).toLowerCase();
          if (base === 'sw.js' || base === 'manifest.webmanifest' || base === 'index.html') {
            setNoStoreHtmlHeaders(res);
          } else {
            res.setHeader('Cache-Control', 'public, max-age=604800');
          }
        },
      })
    );

    // Cache dist/index.html keyed by file mtime so live rebuilds never serve stale CSS/JS hashes
    let cachedProdHtml: string | null = null;
    let cachedProdHtmlMtime = -1;
    const readFreshProdHtml = (): string | null => {
      try {
        const st = fs.statSync(indexHtmlPath);
        if (!cachedProdHtml || st.mtimeMs !== cachedProdHtmlMtime) {
          cachedProdHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
          cachedProdHtmlMtime = st.mtimeMs;
        }
        return cachedProdHtml;
      } catch {
        return cachedProdHtml;
      }
    };

    const bootProdHtml = readFreshProdHtml();
    if (bootProdHtml) {
      SERVER_BUILD_ID = resolveServerBuildId(bootProdHtml);
    }

    app.get(
      '*',
      createSpaPageHandler({
        isProduction: true,
        baseDomain: BASE_DOMAIN,
        shouldSkipRequest: (reqPath) =>
          reqPath.startsWith('/assets/') ||
          reqPath.startsWith('/uploads/') ||
          ASSET_EXTENSION_RE.test(reqPath),
        onAssetSkipped: (res) => {
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('CDN-Cache-Control', 'no-store');
          res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
          return res.status(404).end();
        },
        loadHtmlTemplate: async () => {
          const html = readFreshProdHtml();
          if (html) SERVER_BUILD_ID = resolveServerBuildId(html);
          return html;
        },
        setNoStoreHtmlHeaders,
        getServerBuildId: () => SERVER_BUILD_ID,
        injectBuildFingerprint,
      })
    );
  } else {
    const publicUploadsDir = path.resolve(process.cwd(), 'public/uploads');
    if (fs.existsSync(publicUploadsDir)) {
      app.use(
        '/uploads',
        express.static(publicUploadsDir, {
          maxAge: '30d',
          index: false,
        })
      );
    }

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'custom',
    });

    app.get(
      '*',
      createSpaPageHandler({
        isProduction: false,
        baseDomain: BASE_DOMAIN,
        shouldSkipRequest: (reqPath) =>
          reqPath.startsWith('/@') ||
          reqPath.startsWith('/src/') ||
          reqPath.startsWith('/node_modules/') ||
          reqPath.startsWith('/assets/') ||
          reqPath.startsWith('/uploads/') ||
          ASSET_EXTENSION_RE.test(reqPath),
        loadHtmlTemplate: async (req) => {
          const rawTemplate = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
          return vite.transformIndexHtml(req.originalUrl, rawTemplate);
        },
        setNoStoreHtmlHeaders,
        getServerBuildId: () => SERVER_BUILD_ID,
        injectBuildFingerprint,
      })
    );
    app.use(vite.middlewares);
    app.use((_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      return res.status(404).end();
    });
  }

  const onListening = () => {
    const addr = typeof PORT === 'number' ? `http://0.0.0.0:${PORT}` : String(PORT);
    console.log(`Menu Plus server running on ${addr} (${isProduction ? 'production' : 'development'})`);
    const dbInfo = getDatabaseUrlInfo();
    if (dbInfo.configured && dbInfo.valid) {
      console.log(`[Database] DATABASE_URL configured (${dbInfo.host}:${dbInfo.port}/${dbInfo.database})`);
    } else if (dbInfo.configured && !dbInfo.valid) {
      console.warn(`[Database] DATABASE_URL invalid: ${dbInfo.error}`);
    } else {
      console.warn('[Database] DATABASE_URL is not set.');
    }
    void readAll(false).catch(() => {});
    startTelegramBotPolling().catch((err) => {
      console.warn('[Telegram Bot] Failed to start polling:', err);
    });
    ensureWebPushVapidKeys().catch((err) => {
      console.warn('[WebPush] Failed to initialize VAPID keys:', err);
    });
  };

  const server =
    typeof PORT === 'number'
      ? app.listen(PORT, '0.0.0.0', onListening)
      : app.listen(PORT, onListening);

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;

  const shutdown = (signal: string) => {
    console.log(`[Server] Received ${signal}, shutting down gracefully...`);
    stopTelegramBotPolling();
    clearInterval(otpCleanupTimer);
    void flushVisitorAnalytics();
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
