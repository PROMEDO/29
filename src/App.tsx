/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { HomeSettings, PricingPlan, Restaurant, Session, SiteSettings, ThemeSettings } from './types';
import {
  applyPlatformTypography,
  applyScopedTheme,
  fetchAuthMe,
  fetchDashboardBootstrapFast,
  fetchPublicHomeFast,
  fetchPublicMenuFast,
  getHome,
  getItem,
  getPlans,
  getSession,
  getSite,
  getSlugForRestaurantId,
  getTheme,
  logoutFromServer,
  resolveRestaurantByIdOrSlug,
  seedInitialData,
  subscribeServerRealtime,
  switchMenuWithServer,
  syncFromServer,
} from './utils/storage';
import { syncDashboardMotionFromSite } from './utils/dashboardMotion';
import {
  ParsedRoute,
  getDashboardTabPath,
  isDashboardPath,
  migrateLegacyHashToPath,
  normalizeRouteTarget,
  parsePathRoute,
} from './utils/router';
import { detectClientSubdomain, sanitizeSlug } from './utils/businessDefaults';
import { checkAndNotifyPendingOrders, unlockBellAudio } from './utils/orderBell';
import { isRunningStandalone } from './hooks/usePWAInstall';
import { OfflineIndicator } from './components/DashboardPWAInstallPrompt';
import { trackPublicVisit } from './utils/visitorTracker';

const HomeView = lazy(() => import('./pages/Home').then((m) => ({ default: m.HomeView })));
const AuthView = lazy(() => import('./pages/Login').then((m) => ({ default: m.AuthView })));
const OnboardingView = lazy(() => import('./pages/Onboard').then((m) => ({ default: m.OnboardingView })));
const DashboardPage = lazy(() => import('./pages/dashboard').then((m) => ({ default: m.DashboardPage })));
const AdminView = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminView })));
const PublicMenuView = lazy(() => import('./pages/CustomerMenu').then((m) => ({ default: m.PublicMenuView })));

const RouteSuspenseFallback = () => (
  <div
    style={{
      minHeight: '100dvh',
      display: 'grid',
      placeItems: 'center',
      background: 'var(--bg, #f8fafc)',
    }}
    aria-hidden="true"
  >
    <div
      style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        border: '3px solid var(--line, rgba(15, 23, 42, 0.12))',
        borderTopColor: 'var(--brand, #059669)',
        animation: 'spin 0.7s linear infinite',
      }}
    />
  </div>
);

declare global {
  interface Window {
    __MENUPLUS_SUBDOMAIN__?: {
      subdomain: string;
      restaurantId: string;
      name: string;
      baseDomain: string;
    };
    __MENUPLUS_NOT_FOUND__?: boolean;
  }
}

function routesEqual(a: ParsedRoute, b: ParsedRoute): boolean {
  if (a === b) return true;
  if (a.page !== b.page || a.path !== b.path) return false;
  switch (a.page) {
    case 'home':
      return b.page === 'home' && a.scrollSection === b.scrollSection && a.infoPage === b.infoPage;
    case 'dashboard':
      return (
        b.page === 'dashboard' &&
        a.tab === b.tab &&
        a.branchId === b.branchId &&
        a.menuSlug === b.menuSlug
      );
    case 'admin':
      return b.page === 'admin' && a.tab === b.tab;
    case 'menu':
      return b.page === 'menu' && a.restaurantId === b.restaurantId && a.isSlug === b.isSlug;
    default:
      return true;
  }
}

function isMenuRouteOnActiveSubdomain(restaurantIdOrSlug: string, activeSubRidState: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const bootSub = window.__MENUPLUS_SUBDOMAIN__;
  const hostSub = sanitizeSlug(bootSub?.subdomain || detectClientSubdomain(getSite()) || '');
  const activeRid = activeSubRidState || bootSub?.restaurantId || (hostSub ? resolveRestaurantByIdOrSlug(hostSub)?.id : '');
  if (!hostSub && !activeRid) return false;

  const cleanTarget = sanitizeSlug(restaurantIdOrSlug);
  if (hostSub && cleanTarget && cleanTarget === hostSub) return true;
  if (activeRid && restaurantIdOrSlug === activeRid) return true;

  const targetRest = resolveRestaurantByIdOrSlug(restaurantIdOrSlug);
  const subRest = activeRid ? getItem<Restaurant>(`restaurants/${activeRid}`) : undefined;
  if (targetRest) {
    if (activeRid && targetRest.id === activeRid) return true;
    const targetRoot = targetRest.parentRid || targetRest.id;
    const subRoot = subRest?.parentRid || activeRid;
    if (subRoot && targetRoot === subRoot) return true;
    const targetSub = sanitizeSlug(targetRest.subdomain || '');
    const targetSlug = sanitizeSlug(targetRest.slug || '');
    if (hostSub && ((targetSub && targetSub === hostSub) || (targetSlug && targetSlug === hostSub))) {
      return true;
    }
  }
  return false;
}

export default function App() {
  const [route, setRoute] = useState<ParsedRoute>(() => {
    if (typeof window !== 'undefined' && window.__MENUPLUS_NOT_FOUND__) {
      return { page: 'not_found', path: window.location.pathname || '/' };
    }
    migrateLegacyHashToPath();
    return parsePathRoute(window.location.pathname);
  });
  const setRouteIfChanged = useCallback((next: ParsedRoute) => {
    setRoute((prev) => (routesEqual(prev, next) ? prev : next));
  }, []);
  const [session, setSessionState] = useState<Session | null>(() => getSession());
  const [site, setSite] = useState<SiteSettings>(getSite());
  const [home, setHome] = useState<HomeSettings>(getHome());
  const [plans, setPlans] = useState<PricingPlan[]>(getPlans());
  const [theme, setTheme] = useState<ThemeSettings>(getTheme());
  const [selectedPlanIndex, setSelectedPlanIndex] = useState<number>(0);
  const [subdomainRestaurantId, setSubdomainRestaurantId] = useState<string | null>(() => {
    return window.__MENUPLUS_SUBDOMAIN__?.restaurantId || null;
  });
  const [toastState, setToastState] = useState<{ id: number; text: string; isError: boolean } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [dataVersion, setDataVersion] = useState<number>(0);

  const showToast = useCallback((msg: string) => {
    const cleanText = String(msg || '').replace(/\s*[✓✔️]+\s*$/g, '').trim();
    if (!cleanText) return;
    const isError = /🔒|تعذر|يرجى|ليست|ليس لديك|وصلت|يتجاوز|مستخدم بالفعل|يجب إكمال|توجد مشكلة|غير متاح|Unable|Error|Please|Invalid|Required|Forbidden|Limit|Already|Incomplete|Unavailable|نەتوانرا|تکایە|هەڵە|ڕێگەپێنەدراو|پڕنەکراوە|ناگونجێت/i.test(cleanText);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    const toastId = Date.now();
    setToastState({ id: toastId, text: cleanText, isError });
    const durationMs = /طلب جديد|طلبات جديدة/.test(cleanText) ? 4500 : 3000;
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToastState((cur) => (cur && cur.id === toastId ? null : cur));
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const refreshData = useCallback(() => {
    setSite(getSite());
    setHome(getHome());
    setPlans(getPlans());
    setTheme(getTheme());
    setDataVersion((v) => v + 1);
  }, []);

  const initialSyncDoneRef = useRef(false);

  const applyGuardedRoute = useCallback(
    (pathname: string, search: string, options: { isInitial?: boolean; replaceUrl?: boolean } = {}) => {
      const parsed = parsePathRoute(pathname);
      if (parsed.page === 'menu' && isMenuRouteOnActiveSubdomain(parsed.restaurantId, subdomainRestaurantId)) {
        if (typeof window !== 'undefined') window.__MENUPLUS_NOT_FOUND__ = false;
        const rootUrl = `/${search || ''}`;
        if (typeof window !== 'undefined' && `${window.location.pathname}${window.location.search}` !== rootUrl) {
          window.history.replaceState(null, '', rootUrl);
        }
        setRouteIfChanged({ page: 'home', path: '/' });
        if (!options.isInitial) {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
        return;
      }
      if (options.isInitial && typeof window !== 'undefined' && window.__MENUPLUS_NOT_FOUND__) {
        setRouteIfChanged({ page: 'not_found', path: pathname || '/' });
        return;
      }
      if (parsed.page === 'not_found') {
        setRouteIfChanged(parsed);
        return;
      }
      const curSession = getSession();

      // Redirect /signup to /login
      if (parsed.page === 'signup') {
        window.history.replaceState(null, '', '/login');
        setRouteIfChanged({ page: 'login', path: '/login' });
        return;
      }

      // PWA standalone launch: send user directly into dashboard (preserving last active branch)
      const isPwaSource =
        typeof window !== 'undefined' &&
        (isRunningStandalone() || new URLSearchParams(search || '').get('source') === 'pwa');

      if (parsed.page === 'home' && !parsed.scrollSection && !parsed.infoPage && !window.__MENUPLUS_SUBDOMAIN__ && isPwaSource) {
        if (curSession?.admin && curSession.menuLoggedOut && !curSession.rid) {
          window.history.replaceState(null, '', '/admin/home');
          setRouteIfChanged({ page: 'admin', tab: 'home', path: '/admin/home' });
          return;
        }
        if (curSession?.rid) {
          const rid = curSession.rid;
          const curR = rid === 'demo' ? ({ done: 1 } as Restaurant) : getItem<Restaurant>(`restaurants/${rid}`);
          if (curR && curR.done === 1) {
            let savedBranch = '';
            try {
              savedBranch = window.localStorage.getItem(`mp_active_branch_${rid}`) || '';
            } catch {
              // ignore storage errors
            }
            const validBranch =
              savedBranch &&
              savedBranch !== rid &&
              getItem<Restaurant>(`restaurants/${savedBranch}`)?.parentRid === rid
                ? savedBranch
                : undefined;
            const targetDashRid = validBranch || rid;
            const dashPath = getDashboardTabPath('home', validBranch, getSlugForRestaurantId(targetDashRid));
            window.history.replaceState(null, '', dashPath);
            setRouteIfChanged(parsePathRoute(dashPath));
            return;
          }
          window.history.replaceState(null, '', '/onboard');
          setRouteIfChanged({ page: 'onboard', path: '/onboard' });
          return;
        }
        try {
          window.sessionStorage.setItem('mp_post_login_path', '/dashboard/home');
        } catch {
          // ignore storage errors
        }
        window.history.replaceState(null, '', '/login');
        setRouteIfChanged({ page: 'login', path: '/login' });
        return;
      }

      // Redirect already-authenticated users away from login
      if (parsed.page === 'login' && (curSession?.rid || curSession?.admin)) {
        let targetDashUrl = '';
        try {
          const pending = window.sessionStorage.getItem('mp_post_login_path') || '';
          if (pending && isDashboardPath(pending)) {
            window.sessionStorage.removeItem('mp_post_login_path');
            targetDashUrl = pending;
          }
        } catch {
          // ignore storage errors
        }
        if (curSession.admin && (!curSession.rid || curSession.menuLoggedOut) && !targetDashUrl) {
          window.history.replaceState(null, '', '/admin/home');
          setRouteIfChanged({ page: 'admin', tab: 'home', path: '/admin/home' });
          return;
        }
        const rid = (curSession.rid || curSession.personalRid || 'demo') as string;
        const curR = rid === 'demo' ? ({ done: 1 } as Restaurant) : getItem<Restaurant>(`restaurants/${rid}`);
        if (!curSession.admin && (!curR || curR.done !== 1) && !targetDashUrl) {
          window.history.replaceState(null, '', '/onboard');
          setRouteIfChanged({ page: 'onboard', path: '/onboard' });
          return;
        }
        if (!targetDashUrl) {
          let savedBranch = '';
          try {
            savedBranch = window.localStorage.getItem(`mp_active_branch_${rid}`) || '';
          } catch {
            // ignore storage errors
          }
          const validBranch =
            savedBranch &&
            savedBranch !== rid &&
            getItem<Restaurant>(`restaurants/${savedBranch}`)?.parentRid === rid
              ? savedBranch
              : undefined;
          const targetDashRid = validBranch || rid;
          targetDashUrl = getDashboardTabPath('home', validBranch, getSlugForRestaurantId(targetDashRid));
        }
        const targetParsed = parsePathRoute(targetDashUrl);
        window.history.replaceState(null, '', targetDashUrl);
        if (targetParsed.page === 'dashboard') {
          setRouteIfChanged(targetParsed);
        } else {
          const fallbackPath = getDashboardTabPath('home', undefined, getSlugForRestaurantId(rid));
          window.history.replaceState(null, '', fallbackPath);
          setRouteIfChanged(parsePathRoute(fallbackPath));
        }
        return;
      }

      // Guard dashboard & onboard routes
      if ((parsed.page === 'dashboard' || parsed.page === 'onboard') && !curSession?.rid && !curSession?.admin) {
        if (parsed.page === 'dashboard') {
          try {
            window.sessionStorage.setItem('mp_post_login_path', `${parsed.path}${search || ''}`);
          } catch {
            // ignore storage errors
          }
        }
        window.history.replaceState(null, '', '/login');
        setRouteIfChanged({ page: 'login', path: '/login' });
        return;
      }

      if (parsed.page === 'dashboard' && curSession?.admin && curSession.menuLoggedOut && !curSession.rid && !parsed.menuSlug) {
        window.history.replaceState(null, '', '/admin/home');
        setRouteIfChanged({ page: 'admin', tab: 'home', path: '/admin/home' });
        return;
      }

      if (parsed.page === 'dashboard' && !curSession?.admin) {
        const slugTargetRest = parsed.menuSlug ? resolveRestaurantByIdOrSlug(parsed.menuSlug) : undefined;
        const rid = (slugTargetRest?.id || curSession?.rid) as string;
        if (!curSession?.rid) {
          try {
            window.sessionStorage.setItem('mp_post_login_path', `${parsed.path}${search || ''}`);
          } catch {
            // ignore storage errors
          }
          window.history.replaceState(null, '', '/login');
          setRouteIfChanged({ page: 'login', path: '/login' });
          return;
        }
        if (rid && rid !== 'demo') {
          const curR = getItem<Restaurant>(`restaurants/${rid}`);
          if (curR && curR.done !== 1) {
            showToast('يجب إكمال معلومات وإعداد متجرك أولاً لتفعيل لوحة التحكم 🚀');
            window.history.replaceState(null, '', '/onboard');
            setRouteIfChanged({ page: 'onboard', path: '/onboard' });
            return;
          }
          if (!curR && initialSyncDoneRef.current && !parsed.menuSlug) {
            showToast('يجب إكمال معلومات وإعداد متجرك أولاً لتفعيل لوحة التحكم 🚀');
            window.history.replaceState(null, '', '/onboard');
            setRouteIfChanged({ page: 'onboard', path: '/onboard' });
            return;
          }
        }
      }

      if (parsed.page === 'dashboard' && !parsed.menuSlug) {
        const targetRid = parsed.branchId || curSession?.rid;
        const knownSlug = getSlugForRestaurantId(targetRid);
        if (knownSlug) {
          const slugPath = getDashboardTabPath(parsed.tab, undefined, knownSlug);
          const slugParsed = parsePathRoute(slugPath);
          const slugFull = `${slugPath}${search || ''}`;
          if (`${window.location.pathname}${window.location.search}` !== slugFull) {
            window.history.replaceState(null, '', slugFull);
          }
          setRouteIfChanged(slugParsed);
          if (!options.isInitial) {
            window.scrollTo({ top: 0, behavior: 'auto' });
            void fetchDashboardBootstrapFast({ slug: knownSlug, rid: targetRid, onlyIfChanged: true }).then((res) => {
              if (res.ok && !res.unchanged && mountedRef.current) refreshData();
            });
          }
          return;
        }
      }

      if (parsed.page === 'admin' && !curSession?.admin) {
        window.history.replaceState(null, '', '/login');
        setRouteIfChanged({ page: 'login', path: '/login' });
        return;
      }

      if (parsed.page === 'menu') {
        const matched = resolveRestaurantByIdOrSlug(parsed.restaurantId);
        if (!matched) {
          if (parsed.isSlug && initialSyncDoneRef.current) {
            setRouteIfChanged({ page: 'not_found', path: parsed.path });
            return;
          }
        } else if (!parsed.isSlug) {
          const canonicalSlug = matched.slug || (matched.id === 'demo' ? 'cap-burger' : matched.id);
          const targetPath = `/${canonicalSlug}`;
          const targetFull = `${targetPath}${search || ''}`;
          window.history.replaceState(null, '', targetFull);
          setRouteIfChanged({ page: 'menu', restaurantId: canonicalSlug, isSlug: true, path: targetPath });
          if (!options.isInitial) {
            window.scrollTo({ top: 0, behavior: 'auto' });
            void fetchPublicMenuFast(canonicalSlug, { onlyIfChanged: true }).then((r) => {
              if (r.ok && !r.unchanged && mountedRef.current) refreshData();
            });
          }
          return;
        }
      }

      if (options.replaceUrl) {
        const canonical = `${parsed.path}${search || ''}`;
        const currentFull = `${window.location.pathname}${window.location.search}`;
        if (currentFull !== canonical) {
          window.history.replaceState(null, '', canonical);
        }
      }

      setRouteIfChanged(parsed);

      if (parsed.page === 'home' && parsed.scrollSection) {
        const sectionId = parsed.scrollSection;
        if (!options.isInitial) {
          void fetchPublicHomeFast({ onlyIfChanged: true }).then((r) => {
            if (r.ok && !r.unchanged && mountedRef.current) refreshData();
          });
        }
        setTimeout(() => {
          document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
        }, 80);
        return;
      }

      if (!options.isInitial) {
        window.scrollTo({ top: 0, behavior: 'auto' });
        if (parsed.page === 'menu') {
          void fetchPublicMenuFast(parsed.restaurantId, { onlyIfChanged: true }).then((r) => {
            if (r.ok && !r.unchanged && mountedRef.current) refreshData();
          });
        } else if (parsed.page === 'dashboard') {
          void fetchDashboardBootstrapFast({
            slug: parsed.menuSlug,
            rid: parsed.branchId,
            onlyIfChanged: true,
          }).then((r) => {
            if (r.ok && !r.unchanged && mountedRef.current) refreshData();
          });
        } else if (
          parsed.page === 'home' ||
          parsed.page === 'login' ||
          parsed.page === 'forgot'
        ) {
          void fetchPublicHomeFast({ onlyIfChanged: true }).then((r) => {
            if (r.ok && !r.unchanged && mountedRef.current) refreshData();
          });
        } else {
          void syncFromServer().then((ok) => {
            if (ok && mountedRef.current) refreshData();
          });
        }
      }
    },
    [refreshData, setRouteIfChanged, showToast, subdomainRestaurantId]
  );

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const initParsed = parsePathRoute(window.location.pathname);
    const subRestId = window.__MENUPLUS_SUBDOMAIN__?.restaurantId;
    const initialClientHostSub = window.__MENUPLUS_SUBDOMAIN__?.subdomain || detectClientSubdomain(getSite());

    const isInitialNotFound = Boolean(window.__MENUPLUS_NOT_FOUND__) || initParsed.page === 'not_found';

    // Preload the active lazy page chunk immediately in parallel with network bootstrap
    if (isInitialNotFound) {
      // Keep 404 view lightweight
    } else if (initParsed.page === 'dashboard') {
      void import('./pages/dashboard');
    } else if (initParsed.page === 'admin') {
      void import('./pages/Admin');
    } else if (initParsed.page === 'login' || initParsed.page === 'signup' || initParsed.page === 'forgot') {
      void import('./pages/Login');
    } else if (initParsed.page === 'onboard') {
      void import('./pages/Onboard');
    } else if (initParsed.page === 'menu' || subRestId || initialClientHostSub) {
      void import('./pages/CustomerMenu');
    } else {
      void import('./pages/Home');
    }

    const bootstrapInitialData = async () => {
      if (isInitialNotFound) {
        await Promise.all([
          fetchAuthMe().catch(() => null),
          seedInitialData({ skipSession: true }).catch(() => {}),
        ]);
        return;
      }

      if (subRestId || initialClientHostSub || initParsed.page === 'menu') {
        let targetLookup = subRestId || (initParsed.page === 'menu' ? initParsed.restaurantId : '');
        if (!targetLookup && initialClientHostSub) {
          try {
            const res = await fetch(
              `/api/resolve-subdomain?subdomain=${encodeURIComponent(initialClientHostSub)}`,
              { cache: 'no-store' }
            );
            const data = (await res.json().catch(() => ({}))) as {
              found?: boolean;
              restaurantId?: string;
            };
            if (res.ok && data.found && data.restaurantId) {
              targetLookup = data.restaurantId;
              if (mountedRef.current) {
                setSubdomainRestaurantId(data.restaurantId);
              }
            } else {
              targetLookup = initialClientHostSub;
            }
          } catch {
            targetLookup = initialClientHostSub;
          }
        }
        const [menuRes] = await Promise.all([
          targetLookup ? fetchPublicMenuFast(targetLookup) : Promise.resolve({ ok: false }),
          fetchAuthMe().catch(() => null),
        ]);
        if (!menuRes.ok) {
          await seedInitialData({ skipSession: true }).catch(() => {});
        }
        return;
      }

      if (initParsed.page === 'dashboard') {
        const [, bootRes] = await Promise.all([
          fetchAuthMe().catch(() => null),
          fetchDashboardBootstrapFast({
            slug: initParsed.menuSlug,
            rid: initParsed.branchId,
            onlyIfChanged: true,
          }),
        ]);
        if (bootRes.forbidden) {
          showToast('غير مصرح بالوصول إلى لوحة هذا المنيو 🔒');
          const ownSes = getSession();
          if (ownSes?.rid) {
            const ownPath = getDashboardTabPath('home', undefined, getSlugForRestaurantId(ownSes.rid));
            window.history.replaceState(null, '', ownPath);
          }
        } else if (bootRes.ok && bootRes.targetRid && initParsed.menuSlug) {
          const curSes = getSession();
          if (curSes && curSes.rid !== bootRes.targetRid) {
            await switchMenuWithServer({ rid: bootRes.targetRid, slug: initParsed.menuSlug }).catch(() => null);
          }
        } else if (!bootRes.ok && !bootRes.unauthorized) {
          await seedInitialData({ skipSession: true }).catch(() => {});
        }
        return;
      }

      if (
        initParsed.page === 'home' ||
        initParsed.page === 'login' ||
        initParsed.page === 'signup' ||
        initParsed.page === 'forgot'
      ) {
        const [, homeRes] = await Promise.all([
          fetchAuthMe().catch(() => null),
          fetchPublicHomeFast().catch(() => ({ ok: false })),
        ]);
        if (!homeRes.ok || !getSite()?.n) {
          await seedInitialData({ skipSession: true }).catch(() => {});
        }
        return;
      }

      await Promise.all([
        fetchAuthMe().catch(() => null),
        seedInitialData({ skipSession: true }).catch(() => {}),
      ]);
    };

    void bootstrapInitialData().then(() => {
      if (!mountedRef.current) return;
      const curSite = getSite();
      setSessionState(getSession());
      refreshData();
      applyScopedTheme(window.location.pathname);
      const hostSub = window.__MENUPLUS_SUBDOMAIN__?.subdomain || detectClientSubdomain(curSite);
      if (hostSub) {
        const matched = window.__MENUPLUS_SUBDOMAIN__?.restaurantId
          ? { id: window.__MENUPLUS_SUBDOMAIN__.restaurantId }
          : resolveRestaurantByIdOrSlug(hostSub);
        if (matched?.id) {
          setSubdomainRestaurantId(matched.id);
        }
      }

      if (!mountedRef.current) return;
      initialSyncDoneRef.current = true;
      applyGuardedRoute(window.location.pathname, window.location.search, { isInitial: true, replaceUrl: true });
    });

    const handleThemeEvent = (e: any) => {
      if (e?.detail) {
        setTheme(e.detail);
      }
    };
    const handleSessionEvent = (e: any) => {
      if (mountedRef.current) {
        setSessionState(e?.detail ?? getSession());
      }
    };
    const handleDbUpdated = () => {
      if (mountedRef.current) refreshData();
    };
    const handlePopState = () => {
      if (typeof window !== 'undefined') window.__MENUPLUS_NOT_FOUND__ = false;
      applyGuardedRoute(window.location.pathname, window.location.search, { isInitial: false });
    };

    window.addEventListener('menuplus_theme_changed', handleThemeEvent);
    window.addEventListener('menuplus_session_changed', handleSessionEvent);
    window.addEventListener('menuplus_db_updated', handleDbUpdated);
    window.addEventListener('popstate', handlePopState);

    applyGuardedRoute(window.location.pathname, window.location.search, { isInitial: true, replaceUrl: true });

    return () => {
      mountedRef.current = false;
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('menuplus_theme_changed', handleThemeEvent);
      window.removeEventListener('menuplus_session_changed', handleSessionEvent);
      window.removeEventListener('menuplus_db_updated', handleDbUpdated);
    };
  }, [applyGuardedRoute, refreshData, showToast]);

  const activeDashboardThemeMode =
    route.page === 'dashboard' && session?.rid
      ? getItem<Restaurant>(`restaurants/${session.rid}`)?.dashboardThemeMode
      : undefined;

  const activeOwnerRid = session?.rid
    ? session.rid
    : session?.admin && !session?.menuLoggedOut
    ? session.personalRid || 'demo'
    : '';
  const isStorefrontOrDashboardRoute =
    route.page === 'menu' ||
    route.page === 'dashboard' ||
    Boolean(subdomainRestaurantId && route.page === 'home');

  useEffect(() => {
    const handleUnlock = () => unlockBellAudio();
    window.addEventListener('pointerdown', handleUnlock, { passive: true });
    window.addEventListener('keydown', handleUnlock, { passive: true });
    window.addEventListener('touchstart', handleUnlock, { passive: true });
    window.addEventListener('click', handleUnlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
      window.removeEventListener('touchstart', handleUnlock);
      window.removeEventListener('click', handleUnlock);
    };
  }, []);

  useEffect(() => {
    if (!activeOwnerRid || !isStorefrontOrDashboardRoute) return;
    let active = true;
    const isDash = route.page === 'dashboard';
    let lastWakeCheckAt = 0;

    const evaluateNow = () => {
      if (!active || !initialSyncDoneRef.current) return;
      checkAndNotifyPendingOrders(activeOwnerRid, showToast, { isDashboardRoute: isDash });
    };

    const pollServerOrders = async (bypassTtl = false) => {
      if (!active || document.visibilityState === 'hidden') return;
      try {
        const res = await fetchDashboardBootstrapFast({
          rid: activeOwnerRid,
          onlyIfChanged: true,
          ...(bypassTtl ? { bypassTtl: true } : {}),
        });
        if (res.ok && active && mountedRef.current) {
          evaluateNow();
        }
      } catch {
        // ignore transient background poll errors
      }
    };

    const handleDbOrStorage = () => {
      evaluateNow();
    };

    const handleWake = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastWakeCheckAt < 60_000) return;
      lastWakeCheckAt = now;
      void pollServerOrders(true);
    };

    // Immediate evaluation & initial server check
    evaluateNow();
    void pollServerOrders(false);

    // On storefront/menu routes, use lightweight SSE push instead of 4s polling (DashboardContext handles dashboard routes)
    const unsubscribeRealtime = !isDash
      ? subscribeServerRealtime({
          scope: 'dashboard',
          rid: activeOwnerRid,
          onUpdate: () => {
            if (active) void pollServerOrders(true);
          },
        })
      : () => {};

    window.addEventListener('menuplus_db_updated', handleDbOrStorage);
    window.addEventListener('storage', handleDbOrStorage);
    window.addEventListener('focus', handleWake);
    document.addEventListener('visibilitychange', handleWake);

    return () => {
      active = false;
      unsubscribeRealtime();
      window.removeEventListener('menuplus_db_updated', handleDbOrStorage);
      window.removeEventListener('storage', handleDbOrStorage);
      window.removeEventListener('focus', handleWake);
      document.removeEventListener('visibilitychange', handleWake);
    };
  }, [activeOwnerRid, isStorefrontOrDashboardRoute, route.page, showToast]);

  useEffect(() => {
    const isLandingHome = !subdomainRestaurantId && route.page === 'home';
    if (!isLandingHome && typeof document !== 'undefined') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    }
    const isStorefront = route.page === 'menu' || Boolean(subdomainRestaurantId && route.page === 'home');
    if (isStorefront) {
      applyPlatformTypography(getTheme());
      return;
    }
    applyScopedTheme(window.location.pathname);
    syncDashboardMotionFromSite(site, window.location.pathname);

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSchemeChange = () => {
      applyScopedTheme(window.location.pathname);
      setDataVersion((v) => v + 1);
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleSchemeChange);
      return () => mq.removeEventListener('change', handleSchemeChange);
    }
    mq.addListener(handleSchemeChange);
    return () => mq.removeListener(handleSchemeChange);
  }, [
    route.page,
    route.path,
    subdomainRestaurantId,
    site.homeThemeMode,
    site.adminThemeMode,
    site.dashboardThemeMode,
    site.adminBackdrop,
    site.dashboardBackdrop,
    site.motionConfig,
    session?.rid,
    activeDashboardThemeMode,
    theme.font,
    theme.typography,
  ]);

  const handleNavigate = useCallback(
    (target: string) => {
      if (typeof window !== 'undefined') window.__MENUPLUS_NOT_FOUND__ = false;
      const normalized = normalizeRouteTarget(target);
      const [nextPathname, nextQuery] = normalized.split('?');
      const parsed = parsePathRoute(nextPathname);
      if (parsed.page === 'menu' && isMenuRouteOnActiveSubdomain(parsed.restaurantId, subdomainRestaurantId)) {
        const rootUrl = `/${nextQuery ? `?${nextQuery}` : ''}`;
        const currentFull = `${window.location.pathname}${window.location.search}`;
        if (currentFull !== rootUrl) {
          window.history.pushState(null, '', rootUrl);
        }
        applyGuardedRoute('/', nextQuery ? `?${nextQuery}` : '', { isInitial: false });
        return;
      }
      const curSession = getSession();

      if (parsed.page === 'dashboard' && curSession?.admin && curSession.menuLoggedOut && !curSession.rid && !parsed.menuSlug) {
        window.history.pushState(null, '', '/admin/home');
        setRouteIfChanged({ page: 'admin', tab: 'home', path: '/admin/home' });
        window.scrollTo({ top: 0, behavior: 'auto' });
        return;
      }

      // Strictly forbid accessing dashboard if store setup is incomplete
      if (parsed.page === 'dashboard' && !curSession?.admin) {
        const slugTargetRest = parsed.menuSlug ? resolveRestaurantByIdOrSlug(parsed.menuSlug) : undefined;
        const rid = slugTargetRest?.id || curSession?.rid;
        if (!curSession?.rid) {
          try {
            window.sessionStorage.setItem('mp_post_login_path', `${parsed.path}${nextQuery ? `?${nextQuery}` : ''}`);
          } catch {
            // ignore storage errors
          }
          window.history.pushState(null, '', '/login');
          setRouteIfChanged({ page: 'login', path: '/login' });
          window.scrollTo({ top: 0, behavior: 'auto' });
          return;
        }
        if (rid && rid !== 'demo') {
          const curR = getItem<Restaurant>(`restaurants/${rid}`);
          if (curR && curR.done !== 1) {
            showToast('يجب إكمال معلومات وإعداد متجرك أولاً لتفعيل لوحة التحكم 🚀');
            window.history.pushState(null, '', '/onboard');
            setRouteIfChanged({ page: 'onboard', path: '/onboard' });
            window.scrollTo({ top: 0, behavior: 'auto' });
            return;
          }
        }
      }

      if (parsed.page === 'admin' && !curSession?.admin) {
        window.history.pushState(null, '', '/login');
        setRouteIfChanged({ page: 'login', path: '/login' });
        window.scrollTo({ top: 0, behavior: 'auto' });
        return;
      }

      const nextUrl = `${parsed.path}${nextQuery ? `?${nextQuery}` : ''}`;
      const currentFull = `${window.location.pathname}${window.location.search}`;

      if (currentFull === nextUrl) {
        if (parsed.page === 'home' && parsed.scrollSection) {
          document.getElementById(parsed.scrollSection)?.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
        if (parsed.page === 'menu') {
          void fetchPublicMenuFast(parsed.restaurantId, { onlyIfChanged: true }).then((r) => {
            if (r.ok && !r.unchanged && mountedRef.current) refreshData();
          });
        } else if (parsed.page === 'dashboard') {
          void fetchDashboardBootstrapFast({
            slug: parsed.menuSlug,
            rid: parsed.branchId,
            onlyIfChanged: true,
          }).then((r) => {
            if (r.ok && !r.unchanged && mountedRef.current) refreshData();
          });
        } else if (
          parsed.page === 'home' ||
          parsed.page === 'login' ||
          parsed.page === 'signup' ||
          parsed.page === 'forgot'
        ) {
          void fetchPublicHomeFast({ onlyIfChanged: true }).then((r) => {
            if (r.ok && !r.unchanged && mountedRef.current) refreshData();
          });
        } else {
          void syncFromServer().then((ok) => {
            if (ok && mountedRef.current) refreshData();
          });
        }
        return;
      }

      window.history.pushState(null, '', nextUrl);
      applyGuardedRoute(parsed.path, nextQuery ? `?${nextQuery}` : '', { isInitial: false });
    },
    [applyGuardedRoute, refreshData, setRouteIfChanged, showToast, subdomainRestaurantId]
  );

  const handleLogout = useCallback(async (forceFull = false) => {
    const cur = getSession();
    const shouldPartialMenuLogout = Boolean(!forceFull && cur?.admin && !cur.menuLoggedOut);
    if (shouldPartialMenuLogout) {
      const result = await logoutFromServer('menu');
      setSessionState(result.session);
      if (typeof window !== 'undefined') {
        if (window.location.pathname === '/') {
          window.location.reload();
        } else {
          window.location.href = '/';
        }
      }
      return;
    }

    await logoutFromServer('all');
    setSessionState(null);
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/') {
        window.location.reload();
      } else {
        window.location.href = '/';
      }
    }
  }, []);

  const isStorefrontRoute = route.page === 'menu' || Boolean(subdomainRestaurantId && route.page === 'home');

  useEffect(() => {
    if (typeof document === 'undefined' || route.page === 'dashboard') return;
    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (manifestLink && manifestLink.getAttribute('href') !== '/manifest.webmanifest') {
      manifestLink.setAttribute('href', '/manifest.webmanifest');
    }
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle && appleTitle.getAttribute('content') !== 'Menu Plus') {
      appleTitle.setAttribute('content', 'Menu Plus');
    }
    const appleTouchLinks = document.querySelectorAll('link[rel="apple-touch-icon"]');
    appleTouchLinks.forEach((el) => {
      const linkEl = el as HTMLLinkElement;
      linkEl.setAttribute('sizes', '180x180');
      if (linkEl.getAttribute('href') !== '/apple-touch-icon.png') {
        linkEl.setAttribute('href', '/apple-touch-icon.png');
      }
    });
    const iconLinks = document.querySelectorAll('link[rel="icon"]');
    iconLinks.forEach((el, idx) => {
      const linkEl = el as HTMLLinkElement;
      const defaultHref = idx === 0 ? '/assets/aistudio/icon_f95f5a07.png' : '/pwa-192x192.png';
      linkEl.setAttribute('type', 'image/png');
      linkEl.setAttribute('sizes', idx === 0 ? '300x300' : '192x192');
      if (linkEl.getAttribute('href') !== defaultHref) {
        linkEl.setAttribute('href', defaultHref);
      }
    });
  }, [route.page]);

  useEffect(() => {
    if (!initialSyncDoneRef.current) return;
    const isMenuRoute =
      route.page === 'menu' || Boolean(subdomainRestaurantId && route.page === 'home');
    const isSiteRoute = !subdomainRestaurantId && route.page === 'home';
    if (isMenuRoute) {
      trackPublicVisit('menu');
    } else if (isSiteRoute) {
      trackPublicVisit('site');
    }
  }, [route, subdomainRestaurantId]);

  const dashboardSession = useMemo(() => {
    if (!session) return null;
    if (session.rid) return session;
    const fallbackRid = session.personalRid || 'demo';
    return { ...session, personalRid: fallbackRid, rid: fallbackRid };
  }, [session]);

  const handleDashboardLogout = useCallback(() => {
    void handleLogout(false);
  }, [handleLogout]);

  const handleAdminLogout = useCallback(() => {
    void handleLogout(true);
  }, [handleLogout]);

  const handleAuthLoginSuccess = useCallback(
    (newSes: Session) => {
      setSessionState(newSes);
      showToast('مرحباً بك!');
    },
    [showToast]
  );

  const resolvedMenuTargetId = useMemo(() => {
    if (route.page !== 'menu') return '';
    return resolveRestaurantByIdOrSlug(route.restaurantId)?.id || route.restaurantId;
  }, [route, dataVersion]);

  return (
    <div className="min-h-screen">
      <OfflineIndicator />
      {/* Toast popup */}
      {toastState && (
        <div
          key={toastState.id}
          className={`toast${isStorefrontRoute ? ' is-top' : ''}`}
          dir="rtl"
          role="status"
          aria-live="polite"
        >
          <span className="toast-text">{toastState.text}</span>
          {!toastState.isError && (
            <span className="toast-check" aria-hidden="true">
              <Check size={10} strokeWidth={3} />
            </span>
          )}
        </div>
      )}

      <Suspense fallback={<RouteSuspenseFallback />}>
        {/* Subdomain storefront takes precedence on <storename>.menuplus.io/ */}
        {subdomainRestaurantId && route.page === 'home' && (
          <PublicMenuView
            restaurantId={subdomainRestaurantId}
            session={session}
            onNavigate={handleNavigate}
            showToast={showToast}
          />
        )}

        {/* Clean Path View Routing */}
        {!subdomainRestaurantId && route.page === 'home' && (
          <HomeView
            home={home}
            site={site}
            plans={plans}
            session={session}
            initialScrollSection={route.scrollSection}
            initialInfoPage={route.infoPage}
            onSelectPlan={setSelectedPlanIndex}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        )}

        {(route.page === 'login' || route.page === 'signup' || route.page === 'forgot') && (
          <AuthView
            mode={route.page}
            site={site}
            plans={plans}
            selectedPlanIndex={selectedPlanIndex}
            onNavigate={handleNavigate}
            onLoginSuccess={handleAuthLoginSuccess}
          />
        )}

        {route.page === 'onboard' && session?.rid && (
          <OnboardingView
            restaurantId={session.rid}
            site={site}
            onNavigate={handleNavigate}
            onRefresh={refreshData}
          />
        )}

        {route.page === 'dashboard' && dashboardSession && (session?.rid || (session?.admin && (!session?.menuLoggedOut || Boolean(route.menuSlug)))) && (
          <DashboardPage
            session={dashboardSession}
            plans={plans}
            site={site}
            initialSubTab={route.tab}
            initialBranchId={route.branchId}
            initialMenuSlug={route.menuSlug}
            onNavigate={handleNavigate}
            onLogout={handleDashboardLogout}
            onRefresh={refreshData}
            showToast={showToast}
          />
        )}

        {route.page === 'admin' && session?.admin && (
          <AdminView
            session={session}
            site={site}
            home={home}
            plans={plans}
            theme={theme}
            initialSubTab={route.tab}
            onNavigate={handleNavigate}
            onLogout={handleAdminLogout}
            onRefresh={refreshData}
            showToast={showToast}
          />
        )}

        {route.page === 'menu' && (
          <PublicMenuView
            restaurantId={resolvedMenuTargetId}
            session={session}
            onNavigate={handleNavigate}
            showToast={showToast}
          />
        )}

        {route.page === 'not_found' && (
          <main
            dir="rtl"
            style={{
              minHeight: '100dvh',
              display: 'grid',
              placeItems: 'center',
              padding: '32px 20px',
              textAlign: 'center',
              background: 'var(--bg, #0b1411)',
              color: 'var(--txt, #f8fafc)',
            }}
          >
            <div style={{ maxWidth: '460px' }}>
              <div
                style={{
                  display: 'inline-block',
                  fontSize: '13px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: 'var(--brand, #10b981)',
                  marginBottom: '12px',
                }}
              >
                404 • NOT FOUND
              </div>
              <h1 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '10px' }}>
                404 — الصفحة غير موجودة
              </h1>
              <p className="muted" style={{ fontSize: '15px', lineHeight: 1.7, marginBottom: '24px' }}>
                عذراً، الصفحة المطلوبة غير موجودة أو تم نقلها.
              </p>
              <button
                type="button"
                className="btn p"
                onClick={() => handleNavigate('/')}
              >
                العودة إلى الرئيسية
              </button>
            </div>
          </main>
        )}
      </Suspense>
    </div>
  );
}
