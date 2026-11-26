/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DashboardTabId =
  | 'home'
  | 'cats'
  | 'menu'
  | 'orders'
  | 'stats'
  | 'appearance'
  | 'branches'
  | 'addons'
  | 'qr'
  | 'telegram'
  | 'set';

export type AdminTabId =
  | 'home'
  | 'partners'
  | 'notes'
  | 'reports'
  | 'staff'
  | 'home_editor'
  | 'settings'
  | 'account';

export type InfoPageId = 'about' | 'contact' | 'terms' | 'privacy';

export type ParsedRoute =
  | {
      page: 'home';
      scrollSection?: 'explore' | 'services' | 'steps' | 'demo' | 'pricing' | 'faq';
      infoPage?: InfoPageId;
      path: string;
    }
  | { page: 'login'; path: '/login' }
  | { page: 'signup'; path: '/signup' }
  | { page: 'forgot'; path: '/forgot' }
  | { page: 'onboard'; path: '/onboard' }
  | { page: 'dashboard'; tab: DashboardTabId; branchId?: string; menuSlug?: string; isAppearanceShortcut?: boolean; path: string }
  | { page: 'admin'; tab: AdminTabId; path: string }
  | { page: 'menu'; restaurantId: string; isSlug?: boolean; path: string }
  | { page: 'not_found'; path: string };

const DASHBOARD_SEGMENT_TO_TAB: Record<string, DashboardTabId> = {
  home: 'home',
  overview: 'home',
  stats: 'stats',
  analytics: 'stats',
  cats: 'cats',
  categories: 'cats',
  items: 'menu',
  menu: 'menu',
  orders: 'orders',
  appearance: 'appearance',
  lay: 'appearance',
  theme: 'appearance',
  branches: 'branches',
  qr: 'qr',
  addons: 'addons',
  telegram: 'telegram',
  settings: 'set',
  set: 'set',
};

const DASHBOARD_TAB_TO_SEGMENT: Record<DashboardTabId, string> = {
  home: 'home',
  cats: 'cats',
  menu: 'items',
  orders: 'orders',
  stats: 'stats',
  appearance: 'appearance',
  branches: 'branches',
  addons: 'addons',
  qr: 'qr',
  telegram: 'telegram',
  set: 'settings',
};

const ADMIN_TABS: AdminTabId[] = [
  'home',
  'partners',
  'notes',
  'reports',
  'staff',
  'home_editor',
  'settings',
  'account',
];

const RESERVED_TOP_SEGMENTS = new Set([
  'home',
  'explore',
  'services',
  'steps',
  'demo',
  'pricing',
  'faq',
  'about',
  'contact',
  'terms',
  'privacy',
  'login',
  'signup',
  'forgot',
  'onboard',
  'dashboard',
  'admin',
  'menu',
  'api',
  'assets',
]);

function resolveAdminTabStrict(sub: string): AdminTabId | null {
  if (!sub) return 'home';
  const clean = sub.toLowerCase();
  if (clean === 'accounts') return 'partners';
  if (clean === 'home-editor' || clean === 'plans') return 'home_editor';
  return ADMIN_TABS.includes(clean as AdminTabId) ? (clean as AdminTabId) : null;
}

function resolveAdminTab(sub: string): AdminTabId {
  return resolveAdminTabStrict(sub) || 'home';
}

export function isDashboardPath(pathname?: string): boolean {
  const raw = String(pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '')).trim();
  const clean = raw.split('?')[0].replace(/\/+$/, '') || '/';
  const segs = clean.split('/').filter(Boolean);
  if (segs[0]?.toLowerCase() === 'dashboard') return true;
  if (
    segs.length >= 2 &&
    segs[1].toLowerCase() === 'dashboard' &&
    !RESERVED_TOP_SEGMENTS.has(segs[0].toLowerCase())
  ) {
    return true;
  }
  return false;
}

export function extractDashboardSlugFromPath(pathname?: string): string | undefined {
  const raw = String(pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '')).trim();
  const clean = raw.split('?')[0].replace(/\/+$/, '') || '/';
  const segs = clean.split('/').filter(Boolean);
  if (
    segs.length >= 2 &&
    segs[1].toLowerCase() === 'dashboard' &&
    !RESERVED_TOP_SEGMENTS.has(segs[0].toLowerCase())
  ) {
    try {
      return decodeURIComponent(segs[0]).trim() || undefined;
    } catch {
      return segs[0].trim() || undefined;
    }
  }
  return undefined;
}

export function getDashboardTabPath(tab: DashboardTabId, branchId?: string, menuSlug?: string): string {
  const seg = DASHBOARD_TAB_TO_SEGMENT[tab] || 'home';
  const cleanSlug = String(menuSlug || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
  if (cleanSlug && !cleanSlug.includes('/') && !RESERVED_TOP_SEGMENTS.has(cleanSlug)) {
    return `/${encodeURIComponent(cleanSlug)}/dashboard/${seg}`;
  }
  const cleanBranch = String(branchId || '').trim();
  if (cleanBranch) {
    return `/dashboard/b/${encodeURIComponent(cleanBranch)}/${seg}`;
  }
  return `/dashboard/${seg}`;
}

export function getAdminTabPath(tab: AdminTabId): string {
  return `/admin/${ADMIN_TABS.includes(tab) ? tab : 'home'}`;
}

/**
 * Converts any route target (clean path or legacy hash string) into a canonical clean path.
 */
export function normalizeRouteTarget(target: string): string {
  const raw = String(target || '').trim();
  if (!raw || raw === '#' || raw === '/' || raw === '#home' || raw === 'home' || raw === '/home') {
    return '/';
  }

  // Strip leading # and leading /
  const stripped = raw.replace(/^#+/, '').replace(/^\/+/, '');
  const [pathOnly, queryPart] = stripped.split('?');
  const suffix = queryPart ? `?${queryPart}` : '';

  const segments = pathOnly.split('/').filter(Boolean);
  const root = segments[0] || '';
  const sub = segments[1] || '';

  if (root === 'home') return `/${suffix}`;
  if (root === 'demo' || root === 'menu-demo') return `/cap-burger${suffix}`;
  if (
    root === 'explore' ||
    root === 'services' ||
    root === 'steps' ||
    root === 'pricing' ||
    root === 'faq' ||
    root === 'about' ||
    root === 'contact' ||
    root === 'terms' ||
    root === 'privacy'
  ) {
    return `/${root}${suffix}`;
  }
  if (root === 'login' || root === 'signup' || root === 'forgot' || root === 'onboard') {
    return `/${root}${suffix}`;
  }

  // Menu-slug scoped dashboard route: /:slug/dashboard/:tab?
  if (
    segments.length >= 2 &&
    sub.toLowerCase() === 'dashboard' &&
    !RESERVED_TOP_SEGMENTS.has(root.toLowerCase())
  ) {
    let decodedSlug = root;
    try {
      decodedSlug = decodeURIComponent(root);
    } catch {
      // keep raw
    }
    const tabSeg = (segments[2] || 'home').toLowerCase();
    const mappedTab = DASHBOARD_SEGMENT_TO_TAB[tabSeg] || 'home';
    return `${getDashboardTabPath(mappedTab, undefined, decodedSlug)}${suffix}`;
  }

  if (root === 'dashboard') {
    if (sub === 'b' && segments[2]) {
      let decodedBranch = segments[2];
      try {
        decodedBranch = decodeURIComponent(segments[2]);
      } catch {
        // keep raw segment
      }
      const tabSeg = segments[3] || 'home';
      const mappedTab = DASHBOARD_SEGMENT_TO_TAB[tabSeg] || 'home';
      return `${getDashboardTabPath(mappedTab, decodedBranch)}${suffix}`;
    }
    const mappedTab = DASHBOARD_SEGMENT_TO_TAB[sub] || 'home';
    return `${getDashboardTabPath(mappedTab)}${suffix}`;
  }

  if (root === 'admin') {
    const mappedAdmin = resolveAdminTab(sub);
    return `${getAdminTabPath(mappedAdmin)}${suffix}`;
  }

  // Normalize /menu/:id and legacy /menu-:id to root slug paths (/:slug)
  if (root === 'menu' && sub) {
    const cleanSub = sub === 'demo' ? 'cap-burger' : sub;
    return `/${cleanSub}${suffix}`;
  }
  const legacyMenuMatch = /^menu-([a-zA-Z0-9_-]+)$/.exec(root);
  if (legacyMenuMatch) {
    const cleanSub = legacyMenuMatch[1] === 'demo' ? 'cap-burger' : legacyMenuMatch[1];
    return `/${cleanSub}${suffix}`;
  }

  return `/${pathOnly}${suffix}`;
}

/**
 * Parses a URL pathname into a strongly typed ParsedRoute.
 */
export function parsePathRoute(pathname: string): ParsedRoute {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  const segments = clean.split('/').filter(Boolean);
  const root = segments[0] || '';
  const sub = segments[1] || '';

  const rootLower = root.toLowerCase();
  const subLower = sub.toLowerCase();

  if (!root || (rootLower === 'home' && segments.length === 1)) {
    return { page: 'home', path: '/' };
  }

  if (
    segments.length === 1 &&
    (rootLower === 'explore' ||
      rootLower === 'services' ||
      rootLower === 'steps' ||
      rootLower === 'pricing' ||
      rootLower === 'faq')
  ) {
    return { page: 'home', scrollSection: rootLower, path: `/${rootLower}` };
  }

  if (
    segments.length === 1 &&
    (rootLower === 'about' || rootLower === 'contact' || rootLower === 'terms' || rootLower === 'privacy')
  ) {
    return { page: 'home', infoPage: rootLower, path: `/${rootLower}` };
  }

  if (segments.length === 1 && (rootLower === 'demo' || rootLower === 'menu-demo')) {
    return {
      page: 'menu',
      restaurantId: 'demo',
      isSlug: false,
      path: '/cap-burger',
    };
  }

  if (segments.length === 1 && rootLower === 'login') return { page: 'login', path: '/login' };
  if (segments.length === 1 && rootLower === 'signup') return { page: 'signup', path: '/signup' };
  if (segments.length === 1 && rootLower === 'forgot') return { page: 'forgot', path: '/forgot' };
  if (segments.length === 1 && rootLower === 'onboard') return { page: 'onboard', path: '/onboard' };

  // Menu-slug scoped dashboard route: /:slug/dashboard/:tab?
  if (
    (segments.length === 2 || segments.length === 3) &&
    subLower === 'dashboard' &&
    !RESERVED_TOP_SEGMENTS.has(rootLower)
  ) {
    let decodedSlug = root;
    try {
      decodedSlug = decodeURIComponent(root);
    } catch {
      return { page: 'not_found', path: clean };
    }
    const tabSeg = (segments[2] || 'home').toLowerCase();
    const tab = DASHBOARD_SEGMENT_TO_TAB[tabSeg];
    if (!tab) return { page: 'not_found', path: clean };
    return {
      page: 'dashboard',
      tab,
      menuSlug: decodedSlug,
      isAppearanceShortcut: tabSeg === 'lay' || tabSeg === 'appearance',
      path: getDashboardTabPath(tab, undefined, decodedSlug),
    };
  }

  if (rootLower === 'dashboard') {
    if (segments.length === 1) {
      return {
        page: 'dashboard',
        tab: 'home',
        isAppearanceShortcut: false,
        path: getDashboardTabPath('home'),
      };
    }
    if (subLower === 'b') {
      if ((segments.length !== 3 && segments.length !== 4) || !segments[2]) {
        return { page: 'not_found', path: clean };
      }
      let decodedBranch = segments[2];
      try {
        decodedBranch = decodeURIComponent(segments[2]);
      } catch {
        return { page: 'not_found', path: clean };
      }
      const tabSeg = (segments[3] || 'home').toLowerCase();
      const tab = DASHBOARD_SEGMENT_TO_TAB[tabSeg];
      if (!tab) return { page: 'not_found', path: clean };
      return {
        page: 'dashboard',
        tab,
        branchId: decodedBranch,
        isAppearanceShortcut: tabSeg === 'lay' || tabSeg === 'appearance',
        path: getDashboardTabPath(tab, decodedBranch),
      };
    }
    if (segments.length === 2) {
      const tab = DASHBOARD_SEGMENT_TO_TAB[subLower];
      if (!tab) return { page: 'not_found', path: clean };
      return {
        page: 'dashboard',
        tab,
        isAppearanceShortcut: subLower === 'lay' || subLower === 'appearance',
        path: getDashboardTabPath(tab),
      };
    }
    return { page: 'not_found', path: clean };
  }

  if (rootLower === 'admin') {
    if (segments.length > 2) return { page: 'not_found', path: clean };
    const tab = resolveAdminTabStrict(subLower);
    if (!tab) return { page: 'not_found', path: clean };
    return {
      page: 'admin',
      tab,
      path: getAdminTabPath(tab),
    };
  }

  if (rootLower === 'menu') {
    if (segments.length === 2 && sub) {
      return {
        page: 'menu',
        restaurantId: sub,
        isSlug: false,
        path: `/menu/${sub}`,
      };
    }
    return { page: 'not_found', path: clean };
  }

  if (segments.length === 1) {
    const legacyMenuMatch = /^menu-([a-zA-Z0-9_-]+)$/.exec(root);
    if (legacyMenuMatch) {
      return {
        page: 'menu',
        restaurantId: legacyMenuMatch[1],
        isSlug: false,
        path: `/menu/${legacyMenuMatch[1]}`,
      };
    }

    // Clean custom slug top-level route (e.g. /cap-burger)
    if (root && !RESERVED_TOP_SEGMENTS.has(rootLower)) {
      return {
        page: 'menu',
        restaurantId: root,
        isSlug: true,
        path: `/${root}`,
      };
    }
  }

  return { page: 'not_found', path: clean };
}

/**
 * Seamlessly upgrades any legacy hash URL (e.g. /#/login or /#menu-demo) to clean Path Routing.
 */
export function migrateLegacyHashToPath(): boolean {
  const hash = window.location.hash;
  if (!hash || hash === '#') return false;

  const rawHash = hash.slice(1);
  // Preserve query parameters embedded in hash (e.g. #menu-demo?table=5)
  const [hashPath, hashQuery] = rawHash.split('?');
  const targetPath = normalizeRouteTarget(hashPath);

  const mergedSearch = new URLSearchParams(window.location.search);
  if (hashQuery) {
    const extra = new URLSearchParams(hashQuery);
    extra.forEach((val, key) => {
      if (!mergedSearch.has(key)) mergedSearch.set(key, val);
    });
  }
  const searchStr = mergedSearch.toString();
  const nextUrl = `${targetPath}${searchStr ? `?${searchStr}` : ''}`;

  window.history.replaceState(null, '', nextUrl);
  return true;
}
