/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getStoreVersion } from './neon-store.ts';
import { matchesPhoneCandidates } from './auth.ts';
import { sanitizeSubdomainValue } from './subdomain.ts';

export function sanitizeRecordSecrets<T>(record: T): T {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const copy = { ...(record as Record<string, unknown>) };
  if ('telegramChatId' in copy || 'telegramPhone' in copy || 'telegramLinked' in copy) {
    const hasChat = Boolean(String(copy.telegramChatId || '').trim());
    const hasPhone =
      Boolean(String(copy.telegramPhone || '').trim()) && copy.telegramUnlinkedManually !== true;
    copy.telegramLinked = hasChat || hasPhone || Boolean(copy.telegramLinked);
  }
  delete copy.pw;
  delete copy.passwordHash;
  delete copy.jwtToken;
  delete copy.telegramChatId;
  return copy as T;
}

export interface SnapshotBuckets {
  restaurants: Map<string, Record<string, unknown>>;
  restaurantsBySubdomain: Map<string, { rid: string; rest: Record<string, unknown> }>;
  restaurantsBySlug: Map<string, { rid: string; rest: Record<string, unknown> }>;
  childrenByParentRid: Map<string, string[]>;
  accounts: Array<[string, Record<string, unknown>]>;
  staff: Array<[string, Record<string, unknown>]>;
  catsByRid: Map<string, Array<[string, Record<string, unknown>]>>;
  itemsByRid: Map<string, Array<[string, Record<string, unknown>]>>;
  ordersByRid: Map<string, Array<[string, Record<string, unknown>]>>;
  reportsByRid: Map<string, Array<[string, Record<string, unknown>]>>;
  loyaltyByRid: Map<string, Array<[string, Record<string, unknown>]>>;
  settingsAndMeta: Array<[string, unknown]>;
}

const snapshotBucketsCache = new WeakMap<object, SnapshotBuckets>();

export function getSnapshotBuckets(allData: Record<string, unknown>): SnapshotBuckets {
  const cached = snapshotBucketsCache.get(allData);
  if (cached) return cached;

  const restaurants = new Map<string, Record<string, unknown>>();
  const restaurantsBySubdomain = new Map<string, { rid: string; rest: Record<string, unknown> }>();
  const restaurantsBySlug = new Map<string, { rid: string; rest: Record<string, unknown> }>();
  const childrenByParentRid = new Map<string, string[]>();
  const accounts: Array<[string, Record<string, unknown>]> = [];
  const staff: Array<[string, Record<string, unknown>]> = [];
  const catsByRid = new Map<string, Array<[string, Record<string, unknown>]>>();
  const itemsByRid = new Map<string, Array<[string, Record<string, unknown>]>>();
  const ordersByRid = new Map<string, Array<[string, Record<string, unknown>]>>();
  const reportsByRid = new Map<string, Array<[string, Record<string, unknown>]>>();
  const loyaltyByRid = new Map<string, Array<[string, Record<string, unknown>]>>();
  const settingsAndMeta: Array<[string, unknown]> = [];

  const pushToRidMap = (
    map: Map<string, Array<[string, Record<string, unknown>]>>,
    rid: string,
    entry: [string, Record<string, unknown>]
  ) => {
    let arr = map.get(rid);
    if (!arr) {
      arr = [];
      map.set(rid, arr);
    }
    arr.push(entry);
  };

  for (const [k, v] of Object.entries(allData)) {
    if (k.startsWith('settings/') || k === 'initialized_v6' || k.startsWith('migrations/')) {
      settingsAndMeta.push([k, v]);
      continue;
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const rec = v as Record<string, unknown>;

    if (k.startsWith('restaurants/')) {
      const rid = k.slice('restaurants/'.length);
      if (rid && !rid.includes('/')) {
        restaurants.set(rid, rec);
        const parentRid = String(rec.parentRid || '').trim();
        if (parentRid) {
          let kids = childrenByParentRid.get(parentRid);
          if (!kids) {
            kids = [];
            childrenByParentRid.set(parentRid, kids);
          }
          kids.push(rid);
        }
        if (rec.deleted !== true) {
          const s2 = sanitizeSubdomainValue(String(rec.subdomain || ''));
          if (s2 && !restaurantsBySubdomain.has(s2)) {
            restaurantsBySubdomain.set(s2, { rid, rest: rec });
          }
          const s1 = sanitizeSubdomainValue(String(rec.slug || ''));
          if (s1 && !restaurantsBySlug.has(s1)) {
            restaurantsBySlug.set(s1, { rid, rest: rec });
          }
        }
      }
    } else if (k.startsWith('accounts/')) {
      accounts.push([k, rec]);
    } else if (k.startsWith('staff/')) {
      staff.push([k, rec]);
    } else if (k.startsWith('cats/')) {
      pushToRidMap(catsByRid, String(rec.rid || '').trim(), [k, rec]);
    } else if (k.startsWith('items/')) {
      pushToRidMap(itemsByRid, String(rec.rid || '').trim(), [k, rec]);
    } else if (k.startsWith('orders/')) {
      pushToRidMap(ordersByRid, String(rec.rid || '').trim(), [k, rec]);
    } else if (k.startsWith('reports/')) {
      pushToRidMap(reportsByRid, String(rec.rid || '').trim(), [k, rec]);
    } else if (k.startsWith('loyalty/')) {
      pushToRidMap(loyaltyByRid, String(rec.rid || '').trim(), [k, rec]);
    }
  }

  const buckets: SnapshotBuckets = {
    restaurants,
    restaurantsBySubdomain,
    restaurantsBySlug,
    childrenByParentRid,
    accounts,
    staff,
    catsByRid,
    itemsByRid,
    ordersByRid,
    reportsByRid,
    loyaltyByRid,
    settingsAndMeta,
  };
  snapshotBucketsCache.set(allData, buckets);
  return buckets;
}

export function collectFamilyDescendantRids(
  buckets: SnapshotBuckets,
  seedRids: Iterable<string>
): Set<string> {
  const familyRids = new Set<string>();
  const queue: string[] = [];
  for (const id of seedRids) {
    if (id && !familyRids.has(id)) {
      familyRids.add(id);
      queue.push(id);
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const children = buckets.childrenByParentRid.get(cur);
    if (!children) continue;
    for (const childRid of children) {
      if (!familyRids.has(childRid)) {
        familyRids.add(childRid);
        queue.push(childRid);
      }
    }
  }
  return familyRids;
}

export function resolveRestaurantEntryByIdOrSlug(
  allData: Record<string, unknown>,
  slugOrId?: string
): { rid: string; rest: Record<string, unknown> } | null {
  const raw = String(slugOrId || '').trim();
  if (!raw) return null;
  const buckets = getSnapshotBuckets(allData);
  const direct = buckets.restaurants.get(raw);
  if (direct && direct.deleted !== true) {
    return { rid: raw, rest: direct };
  }
  const normalized = sanitizeSubdomainValue(raw);
  if (!normalized) return null;
  const bySub = buckets.restaurantsBySubdomain.get(normalized);
  if (bySub) return bySub;
  const bySlug = buckets.restaurantsBySlug.get(normalized);
  if (bySlug) return bySlug;

  if (normalized === 'cap-burger' || normalized === 'demo') {
    const demo = buckets.restaurants.get('demo');
    if (demo) {
      return { rid: 'demo', rest: demo };
    }
  }
  return null;
}

export function resolvePublicMenuFamily(
  allData: Record<string, unknown>,
  slugOrId?: string
): {
  rid: string;
  mainRid: string;
  rest: Record<string, unknown>;
  familyRids: Set<string>;
  slug: string;
  records: Record<string, unknown>;
  bootstrapRecords: Record<string, unknown>;
} | null {
  const resolved = resolveRestaurantEntryByIdOrSlug(allData, slugOrId);
  if (!resolved) return null;

  const buckets = getSnapshotBuckets(allData);
  const { rid, rest } = resolved;

  let mainRid = rid;
  const visitedUp = new Set<string>([rid]);
  let curRest: Record<string, unknown> | undefined = rest;
  for (let hop = 0; hop < 5 && curRest?.parentRid; hop++) {
    const pId: string = String(curRest.parentRid || '').trim();
    if (!pId || visitedUp.has(pId)) break;
    visitedUp.add(pId);
    mainRid = pId;
    curRest = buckets.restaurants.get(pId);
  }

  const familyRids = collectFamilyDescendantRids(buckets, [rid, mainRid]);

  const records: Record<string, unknown> = {};
  const bootstrapRecords: Record<string, unknown> = {};
  const mainRest = buckets.restaurants.get(mainRid);
  const effectiveFamilyActive = mainRest ? mainRest.a !== 0 : rest.a !== 0;

  for (const settingKey of ['settings/plans', 'settings/site', 'settings/theme'] as const) {
    const v = allData[settingKey];
    if (v && typeof v === 'object') {
      const clean = sanitizeRecordSecrets(v);
      records[settingKey] = clean;
      bootstrapRecords[settingKey] = clean;
    }
  }

  for (const entryRid of familyRids) {
    const restRec = buckets.restaurants.get(entryRid);
    if (restRec) {
      const clean = sanitizeRecordSecrets(restRec) as Record<string, unknown>;
      if (entryRid !== mainRid && effectiveFamilyActive && clean.a === 0 && clean.deleted !== true) {
        clean.a = mainRest?.a ?? 1;
      }
      const key = `restaurants/${entryRid}`;
      records[key] = clean;
      const lite: Record<string, unknown> = { ...clean };
      if (typeof lite.logo === 'string' && lite.logo.startsWith('data:') && lite.logo.length > 16000) {
        delete lite.logo;
      }
      if (Array.isArray(lite.coverImages)) {
        const hasLargeDataCover = lite.coverImages.some(
          (img) => typeof img === 'string' && img.startsWith('data:') && img.length > 16000
        );
        if (hasLargeDataCover) delete lite.coverImages;
      }
      bootstrapRecords[key] = lite;
    }

    const cats = buckets.catsByRid.get(entryRid);
    if (cats) {
      for (const [k, rec] of cats) {
        const clean = sanitizeRecordSecrets(rec) as Record<string, unknown>;
        records[k] = clean;
        bootstrapRecords[k] = { ...clean };
      }
    }

    const items = buckets.itemsByRid.get(entryRid);
    if (items) {
      for (const [k, rec] of items) {
        const clean = sanitizeRecordSecrets(rec) as Record<string, unknown>;
        records[k] = clean;
        const lite: Record<string, unknown> = { ...clean };
        if (typeof lite.img === 'string' && lite.img.startsWith('data:') && lite.img.length > 16000) {
          delete lite.img;
        }
        bootstrapRecords[k] = lite;
      }
    }
  }

  const slug =
    sanitizeSubdomainValue(String(rest.slug || rest.subdomain || '')) ||
    (rid === 'demo' ? 'cap-burger' : '');

  return {
    rid,
    mainRid,
    rest,
    familyRids,
    slug,
    records,
    bootstrapRecords,
  };
}

export function resolvePublicHomeRecords(allData: Record<string, unknown>): Record<string, unknown> {
  const buckets = getSnapshotBuckets(allData);
  const records: Record<string, unknown> = {};
  for (const [k, v] of buckets.settingsAndMeta) {
    if (
      k === 'settings/site' ||
      k === 'settings/home' ||
      k === 'settings/plans' ||
      k === 'settings/theme' ||
      k === 'initialized_v6' ||
      k.startsWith('migrations/')
    ) {
      records[k] = sanitizeRecordSecrets(v);
    }
  }
  const demoRest = buckets.restaurants.get('demo');
  if (demoRest) {
    const clean = sanitizeRecordSecrets(demoRest) as Record<string, unknown>;
    records['restaurants/demo'] = {
      id: clean.id || 'demo',
      n: clean.n || 'Cap Burger',
      slug: clean.slug || 'cap-burger',
      subdomain: clean.subdomain || 'cap-burger',
      projectType: clean.projectType || 'restaurant',
      currency: clean.currency || 'د.ع',
      done: clean.done ?? 1,
      a: clean.a ?? 1,
      verifiedPartner: clean.verifiedPartner !== undefined ? Boolean(clean.verifiedPartner) : true,
    };
  }
  return records;
}

export function injectInitialHomeBootstrapIntoHtml(
  html: string,
  allData: Record<string, unknown>
): string {
  const records = resolvePublicHomeRecords(allData);
  if (Object.keys(records).length === 0) return html;
  const payload = JSON.stringify({
    version: getStoreVersion(),
    records,
  })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const tag = `<script>window.__MENUPLUS_INITIAL_HOME__=${payload};</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', () => `  ${tag}\n  </head>`);
  }
  return `${tag}${html}`;
}

export function injectInitialMenuBootstrapIntoHtml(
  html: string,
  family: ReturnType<typeof resolvePublicMenuFamily>
): string {
  if (!family) return html;
  const payload = JSON.stringify({
    rid: family.rid,
    mainRid: family.mainRid,
    slug: family.slug,
    records: family.bootstrapRecords,
  })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const tag = `<script>window.__MENUPLUS_INITIAL_MENU__=${payload};</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', () => `  ${tag}\n  </head>`);
  }
  return `${tag}${html}`;
}

export function getOwnedPartnerRids(
  allData: Record<string, unknown>,
  ownerRid?: string,
  ses?: { accountId?: string; phone?: string; admin?: boolean } | null
): Set<string> {
  const buckets = getSnapshotBuckets(allData);
  const owned = new Set<string>();
  if (ownerRid) owned.add(ownerRid);

  if (ses && !ses.admin) {
    const sesPhone = String(ses.phone || '').trim();
    for (const [k, acc] of buckets.accounts) {
      const accId = k.slice('accounts/'.length);
      if (acc.active === false) continue;
      if (acc.admin === true || acc.r === 'admin' || accId.startsWith('acc_admin_')) continue;
      if (accId === 'acc_menu_demo' && ses.accountId !== 'acc_menu_demo') continue;

      const accRid = String(acc.rid || '').trim();
      if (!accRid) continue;

      const matchesAccount = Boolean(ses.accountId && accId === ses.accountId);
      const matchesPhone = Boolean(
        sesPhone &&
          [acc.phone, acc.ph, acc.projectPhone, acc.em, acc.username].some(
            (candidate) =>
              typeof candidate === 'string' &&
              candidate.trim() &&
              matchesPhoneCandidates(candidate, sesPhone)
          )
      );

      if (matchesAccount || matchesPhone) {
        const rest = buckets.restaurants.get(accRid);
        if (!rest || rest.a !== 0 || accRid === ownerRid) {
          owned.add(accRid);
        }
      }
    }
  }

  const queue = Array.from(owned);
  while (queue.length > 0) {
    const rid = queue.shift()!;
    const rec = buckets.restaurants.get(rid);
    if (rec) {
      const parentRid = String(rec.parentRid || '').trim();
      if (parentRid && !owned.has(parentRid)) {
        const parentRec = buckets.restaurants.get(parentRid);
        if (parentRec && parentRec.deleted !== true) {
          owned.add(parentRid);
          queue.push(parentRid);
        }
      }
    }
    const children = buckets.childrenByParentRid.get(rid);
    if (children) {
      for (const childRid of children) {
        if (!owned.has(childRid)) {
          owned.add(childRid);
          queue.push(childRid);
        }
      }
    }
  }
  return owned;
}

export function collectTakenSlugsFromAllData(
  allData: Record<string, unknown>,
  excludeRid?: string
): Set<string> {
  const buckets = getSnapshotBuckets(allData);
  const taken = new Set<string>();
  for (const [rid, rec] of buckets.restaurants.entries()) {
    if (excludeRid && rid === excludeRid) continue;
    const s1 = sanitizeSubdomainValue(String(rec.slug || ''));
    const s2 = sanitizeSubdomainValue(String(rec.subdomain || ''));
    if (s1) taken.add(s1);
    if (s2) taken.add(s2);
  }
  return taken;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getOrderEpochMs(rec: Record<string, unknown>): number {
  const rawAt = Number(rec.at || 0);
  if (Number.isFinite(rawAt) && rawAt > 0) {
    return rawAt < 1e12 ? rawAt * 1000 : rawAt;
  }
  if (rec.createdAt) {
    const parsed = Date.parse(String(rec.createdAt));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

/**
 * Preserves server-managed Telegram link & notification channel flags when saving a restaurant record.
 */
export function preserveRestaurantOrderNotificationFields(
  nextObj: Record<string, unknown>,
  existing: Record<string, unknown>
): void {
  if (nextObj.telegramUnlinkedManually === undefined && existing.telegramUnlinkedManually !== undefined) {
    nextObj.telegramUnlinkedManually = existing.telegramUnlinkedManually;
  }
  if (nextObj.telegramChatId === undefined && existing.telegramChatId) {
    nextObj.telegramChatId = existing.telegramChatId;
  } else if (!nextObj.telegramChatId && existing.telegramChatId && nextObj.telegramUnlinkedManually !== true) {
    nextObj.telegramChatId = existing.telegramChatId;
  }
  if (nextObj.telegramPhone === undefined && existing.telegramPhone) {
    nextObj.telegramPhone = existing.telegramPhone;
  } else if (!nextObj.telegramPhone && existing.telegramPhone && nextObj.telegramUnlinkedManually !== true) {
    nextObj.telegramPhone = existing.telegramPhone;
  }
  if (nextObj.telegramUsername === undefined && existing.telegramUsername) {
    nextObj.telegramUsername = existing.telegramUsername;
  } else if (!nextObj.telegramUsername && existing.telegramUsername && nextObj.telegramUnlinkedManually !== true) {
    nextObj.telegramUsername = existing.telegramUsername;
  }
  if (
    nextObj.orderChannel === 'both' ||
    nextObj.orderChannel === 'telegram' ||
    nextObj.orderChannel === 'whatsapp' ||
    nextObj.orderChannel === 'app'
  ) {
    if (nextObj.telegramNotificationsEnabled === undefined) {
      nextObj.telegramNotificationsEnabled =
        nextObj.orderChannel === 'both' || nextObj.orderChannel === 'telegram';
    }
    if (nextObj.whatsappNotificationsEnabled === undefined) {
      nextObj.whatsappNotificationsEnabled =
        nextObj.orderChannel === 'both' || nextObj.orderChannel === 'whatsapp';
    }
  } else if (existing.orderChannel) {
    nextObj.orderChannel = existing.orderChannel;
  }
  if (
    nextObj.telegramNotificationsEnabled === undefined &&
    existing.telegramNotificationsEnabled !== undefined
  ) {
    nextObj.telegramNotificationsEnabled = existing.telegramNotificationsEnabled;
  }
  if (
    nextObj.whatsappNotificationsEnabled === undefined &&
    existing.whatsappNotificationsEnabled !== undefined
  ) {
    nextObj.whatsappNotificationsEnabled = existing.whatsappNotificationsEnabled;
  }
  if (
    nextObj.appNotificationsEnabled === undefined &&
    existing.appNotificationsEnabled !== undefined
  ) {
    nextObj.appNotificationsEnabled = existing.appNotificationsEnabled;
  }
}
