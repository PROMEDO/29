/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import { generateVAPIDKeys, sendNotification, setVapidDetails } from 'web-push';
import {
  deleteInternalStoreItem,
  getInternalStoreItem,
  readPrefixFromStore,
  setInternalStoreItem,
} from './neon-store.ts';

const VAPID_KEYS_STORE_KEY = 'settings/web_push_vapid_keys';
const PUSH_SUB_PREFIX = 'web_push_subs/';

interface StoredVapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
  createdAt: number;
}

export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  ownedRids: string[];
  accountId?: string;
  userAgent?: string;
  updatedAt: number;
  createdAt: number;
}

let cachedVapidKeys: StoredVapidKeys | null = null;
let vapidInitPromise: Promise<StoredVapidKeys> | null = null;

function hashEndpoint(endpoint: string): string {
  return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
}

export async function ensureWebPushVapidKeys(): Promise<StoredVapidKeys> {
  if (cachedVapidKeys) return cachedVapidKeys;
  if (vapidInitPromise) return vapidInitPromise;

  vapidInitPromise = (async () => {
    const cleanDomain = String(process.env.BASE_DOMAIN || '')
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    const defaultSubject =
      process.env.APP_URL && process.env.APP_URL.startsWith('https://')
        ? process.env.APP_URL
        : cleanDomain
        ? `mailto:support@${cleanDomain}`
        : 'mailto:support@menuplus.iq';

    const existing = await getInternalStoreItem<StoredVapidKeys>(VAPID_KEYS_STORE_KEY);
    if (existing && existing.publicKey && existing.privateKey) {
      cachedVapidKeys = existing;
      setVapidDetails(
        existing.subject || defaultSubject,
        existing.publicKey,
        existing.privateKey
      );
      return existing;
    }

    const generated = generateVAPIDKeys();
    const record: StoredVapidKeys = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject: defaultSubject,
      createdAt: Date.now(),
    };
    await setInternalStoreItem(VAPID_KEYS_STORE_KEY, record);
    cachedVapidKeys = record;
    setVapidDetails(record.subject, record.publicKey, record.privateKey);
    return record;
  })();

  try {
    return await vapidInitPromise;
  } finally {
    vapidInitPromise = null;
  }
}

export async function getWebPushPublicKey(): Promise<string> {
  const keys = await ensureWebPushVapidKeys();
  return keys.publicKey;
}

export async function upsertPushSubscription(params: {
  subscription: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  ownedRids: string[];
  accountId?: string;
  userAgent?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const endpoint = String(params.subscription?.endpoint || '').trim();
  const p256dh = String(params.subscription?.keys?.p256dh || '').trim();
  const auth = String(params.subscription?.keys?.auth || '').trim();

  if (!endpoint || !p256dh || !auth) {
    return { ok: false, error: 'بيانات الاشتراك بالإشعارات غير مكتملة.' };
  }

  const cleanRids = Array.from(
    new Set((params.ownedRids || []).map((r) => String(r || '').trim()).filter(Boolean))
  );
  if (cleanRids.length === 0) {
    return { ok: false, error: 'لا توجد منشآت مرتبطة بالحساب.' };
  }

  const id = hashEndpoint(endpoint);
  const storeKey = `${PUSH_SUB_PREFIX}${id}`;
  const existing = await getInternalStoreItem<StoredPushSubscription>(storeKey);
  const now = Date.now();

  const record: StoredPushSubscription = {
    id,
    endpoint,
    keys: { p256dh, auth },
    ownedRids: cleanRids,
    ...(params.accountId ? { accountId: params.accountId } : {}),
    ...(params.userAgent ? { userAgent: params.userAgent.slice(0, 220) } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await setInternalStoreItem(storeKey, record);
  return { ok: true, id };
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const clean = String(endpoint || '').trim();
  if (!clean) return;
  const id = hashEndpoint(clean);
  await deleteInternalStoreItem(`${PUSH_SUB_PREFIX}${id}`);
}

export async function sendOrderWebPushNotifications(
  rest: Record<string, unknown> | undefined,
  ord: Record<string, unknown>
): Promise<{ sent: number; removed: number }> {
  const rid = String(ord.rid || rest?.id || '').trim();
  if (!rid) return { sent: 0, removed: 0 };
  if (rest?.appNotificationsEnabled === false) return { sent: 0, removed: 0 };

  const parentRid = rest?.parentRid ? String(rest.parentRid).trim() : '';

  const vapid = await ensureWebPushVapidKeys();
  const { items: allPushSubs } = await readPrefixFromStore<StoredPushSubscription>(PUSH_SUB_PREFIX);

  const targets: StoredPushSubscription[] = [];
  for (const sub of allPushSubs) {
    if (!sub || typeof sub !== 'object') continue;
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || !Array.isArray(sub.ownedRids)) {
      continue;
    }
    if (sub.ownedRids.includes(rid) || (parentRid && sub.ownedRids.includes(parentRid))) {
      targets.push(sub);
    }
  }

  if (targets.length === 0) {
    return { sent: 0, removed: 0 };
  }

  const menuTitle = String(rest?.n || 'Menu Plus').trim();
  const branchTitle = String(rest?.branchName || '').trim();
  const fullName = branchTitle && branchTitle !== menuTitle ? `${menuTitle} — ${branchTitle}` : menuTitle;

  const seqNum = ord.orderSeq || ord.seq;
  const orderCode = seqNum ? `#${seqNum}` : `#${String(ord.id || '').slice(-5).toUpperCase()}`;
  const customerName = String(ord.name || '').trim() || 'زبون';
  const rawTotal = Number(ord.tot ?? ord.total ?? 0);
  const currency = String(rest?.currency || 'IQD').toUpperCase() === 'USD' ? '$' : 'د.ع';
  const totalFormatted = Number.isFinite(rawTotal) ? `${rawTotal.toLocaleString('en-US')} ${currency}` : '';

  const orderTypeLabel =
    ord.type === 'table'
      ? `طاولة ${ord.table || ''}`.trim()
      : ord.type === 'pickup'
      ? 'استلام من المطعم'
      : 'توصيل';

  const payload = JSON.stringify({
    type: 'NEW_ORDER',
    rid,
    orderId: String(ord.id || ''),
    title: `🔔 طلب جديد ${orderCode} — ${fullName}`,
    body: `${customerName} • ${orderTypeLabel}${totalFormatted ? ` • ${totalFormatted}` : ''}`,
    url: '/dashboard/orders',
    tag: `menuplus-order-${String(ord.id || Date.now())}`,
    at: Date.now(),
  });

  let sent = 0;
  let removed = 0;

  await Promise.all(
    targets.map(async (sub) => {
      try {
        await sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys.p256dh,
              auth: sub.keys.auth,
            },
          },
          payload,
          {
            TTL: 60 * 60,
            urgency: 'high',
            vapidDetails: {
              subject: vapid.subject,
              publicKey: vapid.publicKey,
              privateKey: vapid.privateKey,
            },
          }
        );
        sent += 1;
      } catch (err: any) {
        const statusCode = Number(err?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          removed += 1;
          await deleteInternalStoreItem(`${PUSH_SUB_PREFIX}${sub.id}`).catch(() => {});
        }
      }
    })
  );

  return { sent, removed };
}
