/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  GitBranch,
  Home,
  Package,
  Palette,
  QrCode,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Tags,
  UtensilsCrossed,
} from 'lucide-react';
import {
  AvailabilitySchedule,
  Category,
  DaySchedule,
  ManualPauseBehavior,
  ManualPauseConfig,
  ManualPauseDurationPreset,
  MediaLibraryItem,
  MenuItem,
  MenuLayout,
  MenuThemeShape,
  Order,
  OrderStatus,
  PricingPlan,
  Restaurant,
  RestaurantAddons,
  Session,
  SiteSettings,
  WorkDayKey,
} from '../../types';
import {
  OwnedMenuSummary,
  applyTheme,
  buildThemeForMode,
  copyTextReliable,
  deleteItem,
  deleteItemAndSync,
  fetchDashboardBootstrapFast,
  fetchDashboardOrdersArchive,
  flushPendingDbSync,
  getAuthHeaders,
  getCollection,
  getDbRevision,
  getItem,
  getOrdersArchiveMeta,
  getOwnedMenusForSession,
  getSite,
  getSlugForRestaurantId,
  getTheme,
  isSlugAvailable,
  putItem,
  putItemAndSync,
  putManyAndSync,
  resolveEffectiveThemeMode,
  setSession,
  subscribeServerRealtime,
  switchMenuWithServer,
  uid,
  uploadCompressedImageToUrl,
  waLink,
} from '../../utils/storage';
import { getDashboardTabPath } from '../../utils/router';
import {
  checkAndNotifyPendingOrders,
  clearPendingBellTone,
  playBellTone,
  unlockBellAudio,
} from '../../utils/orderBell';
import {
  getDashboardNotificationPermission,
  isWebPushSupported,
  requestDashboardNotificationPermission,
  syncDashboardPushSubscription,
  type PushPermissionState,
} from '../../utils/pwaPush';

export { playBellTone, unlockBellAudio };
import { AjaxDialogState, INITIAL_AJAX_DIALOG } from '../../components/AjaxConfirmModal';
import type { PauseModalTarget } from '../../components/PauseVisibilityModal';
import {
  AddonCategoryFilter,
  AddonKey,
  AddonMetaItem,
  buildDefaultAddons,
  getContextualAddonCatalog,
} from '../../data/addonsCatalog';
import {
  ESTORE_HERO_PROMO_IMG,
  seedStoreCatalogForAccount,
} from '../../data/storeSeedCatalog';
import {
  MENU_SHAPES,
  getAddonRequiredPlanLabel,
  getAllowedLayoutsCount,
  getAllowedThemesForPlan,
  getMenuThemeById,
  getSeasonalPairedShape,
  getSeasonalPairedTheme,
  isAddonAllowedForPlan,
  resolveRestaurantPlan,
} from '../../utils/plans';
import {
  DEFAULT_MEDIA_ASSETS,
  DEFAULT_RESTAURANT_TAGLINE,
  ensureRestaurantDefaults,
  generateRandomMenuCode,
  getFullSubdomainUrl,
  getPublicMenuUrlPath,
  getSubdomainBaseDomain,
  getSupportWhatsapp,
  isReservedSlug,
  sanitizeProjectTagline,
  sanitizeSlug,
} from '../../utils/businessDefaults';
import { getBusinessTerms, isStoreProject } from '../../utils/terminology';
import {
  DEFAULT_AVAILABILITY_SCHEDULE,
  computePauseUntil,
  isEntityManuallyPaused,
  normalizeAvailabilitySchedule,
  sanitizeAvailabilityScheduleForSave,
} from '../../utils/availability';

export interface DashboardViewProps {
  session: Session;
  plans: PricingPlan[];
  site?: SiteSettings;
  initialSubTab?: string;
  initialBranchId?: string;
  initialMenuSlug?: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

export type DashboardTab =
  | 'home'
  | 'cats'
  | 'menu'
  | 'orders'
  | 'stats'
  | 'appearance'
  | 'branches'
  | 'addons'
  | 'qr'
  | 'set';

export type SettingsSectionTab = 'ops' | 'identity' | 'links' | 'telegram';

export type ItemEditorTab = 'info' | 'extras' | 'choices' | 'availability' | 'extraInfo' | 'badges';

export const LAYOUT_DEFINITIONS: Array<{
  id: MenuLayout;
  title: string;
  desc: string;
  icon: string;
}> = [
  {
    id: 'grid4',
    title: 'شبكة من 4 مربعات',
    desc: 'عرض المنتجات 4 بطاقات متساوية في كل صف بصور مستطيلة أفقية',
    icon: '⊞',
  },
  {
    id: 'grid3',
    title: 'شبكة من 3 مربعات',
    desc: 'عرض المنتجات 3 بطاقات متساوية في كل صف بصور مستطيلة أفقية',
    icon: '▦',
  },
  {
    id: 'grid',
    title: 'شبكة من مربعين (2×2)',
    desc: 'عرض المنتجات بطاقتين متساويتين في كل صف بصور مستطيلة أفقية',
    icon: '🍱',
  },
  {
    id: 'list',
    title: 'قائمة كلاسيكية أفقية',
    desc: 'بطاقات أفقية متناسقة بصورة مستطيلة جانبية والاسم والسعر وزر الإضافة',
    icon: '📑',
  },
];

export const WEEK_DAYS_ORDER: Array<{ key: WorkDayKey; label: string }> = [
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الإثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
  { key: 'sat', label: 'السبت' },
];

export type DeliveryZoneDraft = {
  area: string;
  fee: number;
  cities: Array<{ name: string; fee: number }>;
};

function buildWeeklyHoursDraft(rest: Restaurant): Record<WorkDayKey, DaySchedule> {
  const fallbackFrom = rest.h?.f || '09:00';
  const fallbackTo = rest.h?.t || '23:59';
  const out = {} as Record<WorkDayKey, DaySchedule>;
  WEEK_DAYS_ORDER.forEach(({ key }) => {
    const existing = rest.weeklyHours?.[key];
    out[key] = {
      open: existing ? existing.open !== false : true,
      from: existing?.from || fallbackFrom,
      to: existing?.to || fallbackTo,
    };
  });
  return out;
}

function buildDeliveryZonesDraft(rest: Restaurant): DeliveryZoneDraft[] {
  const zones = rest.deliveryZones || [];
  const list: DeliveryZoneDraft[] = [];
  zones.forEach((z) => {
    const areaName = String(z.area || z.name || '').trim();
    const rawCities = Array.isArray(z.cities)
      ? z.cities
          .map((c) => ({
            name: String(c?.name || '').trim(),
            fee: Math.max(0, Number(c?.fee) || 0),
          }))
          .filter((c) => c.name)
      : [];

    if (rawCities.length > 1 || (rawCities.length === 1 && areaName && rawCities[0].name !== areaName)) {
      rawCities.forEach((c) => {
        list.push({
          area: c.name,
          fee: c.fee,
          cities: [],
        });
      });
    } else if (rawCities.length === 1) {
      list.push({
        area: areaName || rawCities[0].name,
        fee: rawCities[0].fee,
        cities: [],
      });
    } else if (areaName) {
      list.push({
        area: areaName,
        fee: Math.max(0, Number(z.fee) || 0),
        cities: [],
      });
    }
  });
  return list;
}

export const SixDotDragHandle: React.FC = () => (
  <svg
    width="14"
    height="20"
    viewBox="0 0 14 20"
    fill="none"
    style={{ color: 'var(--muted)', flexShrink: 0, cursor: 'grab' }}
    aria-hidden="true"
  >
    <circle cx="4" cy="4" r="1.8" fill="currentColor" />
    <circle cx="10" cy="4" r="1.8" fill="currentColor" />
    <circle cx="4" cy="10" r="1.8" fill="currentColor" />
    <circle cx="10" cy="10" r="1.8" fill="currentColor" />
    <circle cx="4" cy="16" r="1.8" fill="currentColor" />
    <circle cx="10" cy="16" r="1.8" fill="currentColor" />
  </svg>
);

export const NAV_TABS = [
  { id: 'home' as const, label: 'الصفحة الرئيسية', Icon: Home },
  { id: 'stats' as const, label: 'احصائيات احترافية', Icon: BarChart3 },
  { id: 'cats' as const, label: 'الأقسام', Icon: Tags },
  { id: 'menu' as const, label: 'العناصر', Icon: UtensilsCrossed },
  { id: 'orders' as const, label: 'الطلبات', Icon: ShoppingBag },
  { id: 'appearance' as const, label: 'المظهر', Icon: Palette },
  { id: 'branches' as const, label: 'عدة أفرع', Icon: GitBranch },
  { id: 'addons' as const, label: 'الإضافات', Icon: Sparkles },
  { id: 'qr' as const, label: 'كود QR', Icon: QrCode },
  { id: 'set' as const, label: 'الإعدادات', Icon: Settings },
];

export const STORE_NAV_TABS = [
  { id: 'home' as const, label: 'رئيسية المتجر', Icon: Store },
  { id: 'cats' as const, label: 'أقسام المتجر', Icon: Tags },
  { id: 'menu' as const, label: 'المنتجات والأسعار', Icon: Package },
  { id: 'orders' as const, label: 'طلبات المتجر', Icon: ShoppingCart },
  { id: 'stats' as const, label: 'تقارير المبيعات', Icon: BarChart3 },
  { id: 'appearance' as const, label: 'واجهة المتجر', Icon: Palette },
  { id: 'branches' as const, label: 'الفروع والمعارض', Icon: GitBranch },
  { id: 'addons' as const, label: 'إضافات المتجر', Icon: Sparkles },
  { id: 'qr' as const, label: 'باركود المتجر والرابط', Icon: QrCode },
  { id: 'set' as const, label: 'إعدادات المتجر', Icon: Settings },
];

function resolveTabFromSub(sub?: string): DashboardTab {
  if (sub === 'lay' || sub === 'appearance' || sub === 'theme') return 'appearance';
  if (sub === 'branches') return 'branches';
  if (sub === 'categories') return 'cats';
  if (sub === 'items') return 'menu';
  if (sub === 'settings' || sub === 'telegram') return 'set';
  if (sub === 'home' || sub === 'overview') return 'home';
  if (
    sub &&
    ['home', 'cats', 'menu', 'orders', 'stats', 'appearance', 'branches', 'addons', 'qr', 'set'].includes(sub)
  ) {
    return sub as DashboardTab;
  }
  return 'home';
}

function useDashboardController({
  session,
  plans,
  site,
  initialSubTab,
  initialBranchId,
  initialMenuSlug,
  onNavigate,
  onLogout,
  onRefresh,
  showToast,
}: DashboardViewProps) {
  const dbRev = getDbRevision();
  const sessionRid = session.rid || 'demo';
  const sessionRest = getItem<Restaurant>(`restaurants/${sessionRid}`);
  const mainRid =
    sessionRest?.isBranch && sessionRest?.parentRid
      ? sessionRest.parentRid
      : sessionRid;
  const branchStorageKey = `mp_active_branch_${mainRid}`;
  const branchSessionConfirmKey = `mp_dash_branch_confirmed_${mainRid}`;

  const branchesList = useMemo(
    () => getCollection<Restaurant>('restaurants').filter((r) => r.parentRid === mainRid),
    [mainRid, dbRev]
  );

  const mainCandidate = getItem<Restaurant>(`restaurants/${mainRid}`);
  const familyRestaurants = useMemo(
    () => [...(mainCandidate ? [mainCandidate] : []), ...branchesList],
    [mainCandidate, branchesList]
  );
  const cleanRequestedSlug = sanitizeSlug(initialMenuSlug || '');
  const slugMatchedRid = cleanRequestedSlug
    ? familyRestaurants.find(
        (r) =>
          sanitizeSlug(String(r.slug || r.subdomain || '')) === cleanRequestedSlug ||
          r.id.toLowerCase() === cleanRequestedSlug
      )?.id || ''
    : '';

  const [ownedMenus, setOwnedMenus] = useState<OwnedMenuSummary[]>([]);

  useEffect(() => {
    let active = true;
    void getOwnedMenusForSession().then((list) => {
      if (active) setOwnedMenus(list);
    });
    return () => {
      active = false;
    };
  }, [session.rid, session.phone, session.accountId, session.admin, branchesList.length]);

  const [activeRid, setActiveRidState] = useState<string>(() => {
    const requested = String(initialBranchId || '').trim();
    if (requested) {
      if (requested === mainRid || branchesList.some((b) => b.id === requested)) {
        return requested;
      }
    }
    if (slugMatchedRid) {
      return slugMatchedRid;
    }
    try {
      const saved = window.localStorage.getItem(branchStorageKey);
      if (saved && (saved === mainRid || branchesList.some((b) => b.id === saved))) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return mainRid;
  });

  const setActiveRid = (nextRid: string) => {
    setActiveRidState(nextRid);
    try {
      window.localStorage.setItem(branchStorageKey, nextRid);
      window.sessionStorage.setItem(branchSessionConfirmKey, '1');
    } catch {
      // ignore storage errors
    }
  };

  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchModalIsStartup, setBranchModalIsStartup] = useState(false);

  // Fallback to mainRid if active branch no longer exists
  const rid =
    activeRid === mainRid || branchesList.some((b) => b.id === activeRid)
      ? activeRid
      : mainRid;

  // Synchronize branch from explicit URL, slug URL, persistent localStorage, or prompt on fresh entry
  useEffect(() => {
    const requested = String(initialBranchId || '').trim();
    if (requested) {
      const isValidRequested = requested === mainRid || branchesList.some((b) => b.id === requested);
      if (isValidRequested) {
        if (activeRid !== requested) {
          setActiveRidState(requested);
        }
        try {
          window.localStorage.setItem(branchStorageKey, requested);
          window.sessionStorage.setItem(branchSessionConfirmKey, '1');
        } catch {
          // ignore storage errors
        }
        return;
      }
    }

    if (slugMatchedRid) {
      if (activeRid !== slugMatchedRid) {
        setActiveRidState(slugMatchedRid);
      }
      try {
        window.localStorage.setItem(branchStorageKey, slugMatchedRid);
        window.sessionStorage.setItem(branchSessionConfirmKey, '1');
      } catch {
        // ignore storage errors
      }
      return;
    }

    let saved = '';
    try {
      saved = window.localStorage.getItem(branchStorageKey) || '';
    } catch {
      // ignore storage errors
    }

    if (saved && saved !== mainRid && branchesList.some((b) => b.id === saved)) {
      if (activeRid !== saved) {
        setActiveRidState(saved);
      }
      const branchUrl = getDashboardTabPath(
        resolveTabFromSub(initialSubTab),
        saved,
        getSlugForRestaurantId(saved)
      );
      if (window.location.pathname !== branchUrl) {
        window.history.replaceState(null, '', `${branchUrl}${window.location.search || ''}`);
      }
      return;
    }

    if (branchesList.length > 0) {
      let alreadyConfirmed = false;
      try {
        alreadyConfirmed = window.sessionStorage.getItem(branchSessionConfirmKey) === '1';
      } catch {
        alreadyConfirmed = false;
      }
      if (!alreadyConfirmed) {
        setBranchModalIsStartup(true);
        setBranchModalOpen(true);
      }
    }
  }, [initialBranchId, slugMatchedRid, mainRid, branchesList.length, branchStorageKey, branchSessionConfirmKey]);

  const mainRest = useMemo(() => {
    const rawMainRest: Restaurant = getItem<Restaurant>(`restaurants/${mainRid}`) || {
      id: mainRid,
      n: 'كاب برجر',
      p: 'باقة الاعمال الشاملة',
      planId: 'vip',
      e: '2030-01-01',
      a: 1,
      o: 0,
      v: 0,
      ow: '07711448594',
      ph: '07724799679',
      lay: 'list',
      color: '#0F766E',
      currency: 'د.ع',
      country: 'العراق',
      region: 'بغداد',
      projectType: 'restaurant',
      isPaid: true,
      done: 1,
    };
    return ensureRestaurantDefaults(rawMainRest);
  }, [mainRid, dbRev]);

  const rest = useMemo(() => {
    const rawActiveRest = getItem<Restaurant>(`restaurants/${rid}`) || mainRest;
    return ensureRestaurantDefaults(rawActiveRest);
  }, [rid, mainRest, dbRev]);

  // Plan tier is always governed by the primary account
  const resolvedPlan = useMemo(() => resolveRestaurantPlan(mainRest, plans), [mainRest, plans]);
  const localizedPlanName = resolvedPlan.plan.n;
  const terms = useMemo(() => getBusinessTerms(rest.projectType), [rest.projectType]);
  const baseDomain = getSubdomainBaseDomain(site);
  const subdomainEnabled = site?.subdomainRules?.enabled === true;
  const supportPhone = getSupportWhatsapp(site);
  const supportWaHref = waLink(
    supportPhone,
    `مرحباً فريق الدعم، أستفسر عن مشروعي "${mainRest.n}" (الباقة: ${localizedPlanName})`
  );

  const customTabLabel = (id: string, fallback: string) => {
    if (terms.isStore) return fallback;
    const labels = site?.dashboardTabLabels;
    const direct =
      labels?.[id]?.trim() ||
      (id === 'menu' ? labels?.items?.trim() : '') ||
      (id === 'orders' ? labels?.ord?.trim() : '');
    return direct || fallback;
  };

  const allowedLayoutsCount = getAllowedLayoutsCount(resolvedPlan);
  const isLayoutAllowed = (layId: MenuLayout): boolean => {
    if (allowedLayoutsCount >= 3) return true;
    if (allowedLayoutsCount === 2) return layId === 'list' || layId === 'grid';
    return layId === 'list';
  };
  const currency = rest.currency || 'د.ع';

  const [activeTab, setActiveTabState] = useState<DashboardTab>(() => resolveTabFromSub(initialSubTab));
  const [settingsSectionTab, setSettingsSectionTab] = useState<SettingsSectionTab>(() =>
    initialSubTab === 'telegram' ? 'telegram' : 'ops'
  );

  useEffect(() => {
    if (!initialSubTab) return;
    setActiveTabState(resolveTabFromSub(initialSubTab));
    if (initialSubTab === 'telegram') {
      setSettingsSectionTab('telegram');
    }
  }, [initialSubTab]);

  const activeBranchPathArg = rid === mainRid ? undefined : rid;
  const activeMenuSlugForUrl = getSlugForRestaurantId(rid) || sanitizeSlug(rest.slug || rest.subdomain || '');

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        'mp_last_dash_path',
        getDashboardTabPath(activeTab, activeBranchPathArg, activeMenuSlugForUrl)
      );
    } catch {
      // ignore storage errors
    }
  }, [activeTab, activeBranchPathArg, activeMenuSlugForUrl]);

  const setActiveTab = (tab: DashboardTab) => {
    setActiveTabState(tab);
    onNavigate(getDashboardTabPath(tab, rid === mainRid ? undefined : rid, activeMenuSlugForUrl));
  };

  const openSettingsSection = (section: SettingsSectionTab) => {
    setSettingsSectionTab(section);
    setActiveTab('set');
  };

  const openBranchSwitcherModal = () => {
    setBranchModalIsStartup(false);
    setBranchModalOpen(true);
  };

  const dismissBranchModal = () => {
    setBranchModalOpen(false);
    setBranchModalIsStartup(false);
    try {
      window.sessionStorage.setItem(branchSessionConfirmKey, '1');
      if (!window.localStorage.getItem(branchStorageKey)) {
        window.localStorage.setItem(branchStorageKey, rid);
      }
    } catch {
      // ignore storage errors
    }
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [purchaseModalPlan, setPurchaseModalPlan] = useState<PricingPlan | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const openShareModal = () => setShareModalOpen(true);

  const openUpgradeModal = (minPlanId?: string) => {
    const paidPlans = plans.filter((p) => Number(p.pr || 0) > 0);
    const target =
      (minPlanId ? plans.find((p) => p.id === minPlanId) : undefined) ||
      paidPlans.find((p) => p.id === 'pro') ||
      paidPlans[0] ||
      plans[plans.length - 1] ||
      null;
    if (target) {
      setPurchaseModalPlan(target);
    } else {
      showToast('تواصل مع الدعم الفني عبر الواتساب للترقية');
    }
  };

  // Force onboarding completion if primary store info is incomplete
  useEffect(() => {
    if (!session.admin && mainRid !== 'demo') {
      const currentRest = getItem<Restaurant>(`restaurants/${mainRid}`);
      if (!currentRest || currentRest.done !== 1) {
        showToast('يجب إكمال معلومات وإعداد متجرك أولاً لتفعيل لوحة التحكم 🚀');
        onNavigate('/onboard');
      }
    }
  }, [mainRid, session.admin, onNavigate, showToast]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 901px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        setDrawerOpen(false);
      }
    };
    handleChange(mq);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // AJAX Confirmation Modal State
  const [ajaxDialog, setAjaxDialog] = useState<AjaxDialogState>(INITIAL_AJAX_DIALOG);
  const [pauseModalTarget, setPauseModalTarget] = useState<PauseModalTarget | null>(null);
  const triggerAjaxConfirm = (
    title: string,
    message: string,
    type: 'warn' | 'danger' | 'info',
    confirmLabel: string,
    action: () => void | Promise<void>,
    successMessage: string
  ) => {
    setAjaxDialog({
      isOpen: true,
      type,
      title,
      message,
      confirmLabel,
      isCompleted: false,
      successMessage,
      onConfirm: async () => {
        await action();
        setAjaxDialog((prev) => ({ ...prev, isCompleted: true }));
        setTimeout(() => {
          setAjaxDialog((prev) => ({ ...prev, isOpen: false, isCompleted: false }));
        }, 1200);
      },
    });
  };

  // Collections for currently active branch (`rid`)
  const allCategories = useMemo(
    () =>
      getCollection<Category>('cats')
        .filter((c) => c.rid === rid)
        .sort((a, b) => (a.o || 0) - (b.o || 0)),
    [rid, dbRev]
  );
  const allItems = useMemo(
    () =>
      getCollection<MenuItem>('items')
        .filter((i) => i.rid === rid)
        .sort((a, b) => (a.o || 0) - (b.o || 0)),
    [rid, dbRev]
  );
  const allOrders = useMemo(
    () =>
      getCollection<Order>('orders')
        .filter((o) => o.rid === rid)
        .sort((a, b) => (b.at || 0) - (a.at || 0)),
    [rid, dbRev]
  );

  const newOrdersCount = useMemo(
    () => allOrders.filter((o) => o.st === 'new' || o.status === 'pending').length,
    [allOrders]
  );

  // MULTI-BRANCH & MULTI-MENU SSO ACTIONS
  const switchActiveBranch = async (
    targetRid: string,
    opts?: { tab?: DashboardTab; settingsSection?: SettingsSectionTab }
  ) => {
    const normalizedTarget =
      targetRid === mainRid || branchesList.some((b) => b.id === targetRid) ? targetRid : mainRid;
    clearPendingBellTone();
    setBranchModalOpen(false);
    setBranchModalIsStartup(false);
    setIsItemEditorOpen(false);
    if (opts?.settingsSection) {
      setSettingsSectionTab(opts.settingsSection);
    }
    const targetTab = opts?.tab || activeTab;
    if (opts?.tab) {
      setActiveTabState(opts.tab);
    }
    setActiveRid(normalizedTarget);

    try {
      await flushPendingDbSync();
    } catch {
      // continue switch even if offline
    }

    const nextSlug = getSlugForRestaurantId(normalizedTarget);
    await fetchDashboardBootstrapFast({
      rid: normalizedTarget,
      slug: nextSlug,
      onlyIfChanged: true,
    }).catch(() => null);
    onRefresh();

    const nextPath = getDashboardTabPath(
      targetTab,
      normalizedTarget === mainRid ? undefined : normalizedTarget,
      nextSlug
    );
    onNavigate(nextPath);
  };

  const switchOwnedMenu = async (targetRid: string, targetSlug?: string) => {
    setBranchModalOpen(false);
    setBranchModalIsStartup(false);
    setIsItemEditorOpen(false);

    if (targetRid === mainRid || branchesList.some((b) => b.id === targetRid)) {
      await switchActiveBranch(targetRid);
      return;
    }

    try {
      await flushPendingDbSync();
    } catch {
      // continue switch even if offline
    }

    const res = await switchMenuWithServer({ rid: targetRid, slug: targetSlug });
    if (!res.ok || !res.session) {
      showToast(res.error || 'تعذر التبديل إلى لوحة المنيو المختارة');
      return;
    }

    setSession({
      ...session,
      ...res.session,
      personalRid: session.personalRid || res.session.personalRid || mainRid,
      menuLoggedOut: false,
    });
    const resolvedSlug =
      targetSlug || getSlugForRestaurantId(targetRid) || sanitizeSlug(res.restaurant?.slug || '');
    await fetchDashboardBootstrapFast({
      rid: targetRid,
      slug: resolvedSlug,
      force: true,
    }).catch(() => null);
    onRefresh();
    onNavigate(getDashboardTabPath(activeTab, undefined, resolvedSlug));
  };

  const cloneCatsAndItemsFromMain = (targetBranchRid: string) => {
    const mainCats = getCollection<Category>('cats')
      .filter((c) => c.rid === mainRid)
      .sort((a, b) => (a.o || 0) - (b.o || 0));
    const mainItems = getCollection<MenuItem>('items')
      .filter((i) => i.rid === mainRid)
      .sort((a, b) => (a.o || 0) - (b.o || 0));

    // Remove existing items/categories of target branch when replacing via explicit clone
    const existingBranchCats = getCollection<Category>('cats').filter((c) => c.rid === targetBranchRid);
    const existingBranchItems = getCollection<MenuItem>('items').filter((i) => i.rid === targetBranchRid);
    existingBranchCats.forEach((c) => deleteItem(`cats/${c.id}`));
    existingBranchItems.forEach((i) => deleteItem(`items/${i.id}`));

    const catMap = new Map<string, string>();
    mainCats.forEach((c, idx) => {
      const newCatId = 'cat_' + uid();
      catMap.set(c.id, newCatId);
      putItem<Category>(`cats/${newCatId}`, {
        ...c,
        id: newCatId,
        rid: targetBranchRid,
        o: idx,
      });
    });

    mainItems.forEach((it, idx) => {
      const newItemId = 'item_' + uid();
      const mappedCat = catMap.get(it.cat) || it.cat;
      putItem<MenuItem>(`items/${newItemId}`, {
        ...it,
        id: newItemId,
        rid: targetBranchRid,
        cat: mappedCat,
        o: idx,
      });
    });
  };

  const createBranch = (
    branchNameRaw: string,
    branchPhoneRaw: string,
    branchAddressRaw: string,
    cloneMainMenu: boolean
  ) => {
    const cleanName = branchNameRaw.trim();
    if (!cleanName) {
      showToast('يرجى كتابة اسم الفرع الجديد');
      return false;
    }
    const maxB = resolvedPlan.maxBranches;
    if (maxB === 0) {
      showToast('ميزة عدة أفرع متاحة في الباقة الاحترافية وباقة الاعمال الشاملة 🔒');
      return false;
    }
    if (maxB !== -1 && branchesList.length >= maxB) {
      showToast(`وصلت للحد الأقصى للأفرع في باقتك (${maxB} فرع) 🔒`);
      return false;
    }

    const newBranchId = 'branch_' + uid();
    const baseSlug = sanitizeSlug(mainRest.slug || '');
    const branchSlugCandidate = resolvedPlan.perms.customSlug && baseSlug
      ? sanitizeSlug(`${baseSlug}-${branchesList.length + 2}`)
      : '';
    const validBranchSlug =
      branchSlugCandidate && isSlugAvailable(branchSlugCandidate) && !isReservedSlug(branchSlugCandidate)
        ? branchSlugCandidate
        : generateRandomMenuCode();

    const branchRecord: Restaurant = ensureRestaurantDefaults({
      ...mainRest,
      id: newBranchId,
      parentRid: mainRid,
      isBranch: true,
      branchName: cleanName,
      n: mainRest.n,
      ph: branchPhoneRaw.trim() || mainRest.ph,
      address: branchAddressRaw.trim() || mainRest.address,
      slug: validBranchSlug,
      subdomain: subdomainEnabled && resolvedPlan.perms.customSlug ? validBranchSlug : '',
      telegramPhone: '',
      telegramChatId: '',
      telegramUsername: '',
      telegramLinked: false,
      telegramUnlinkedManually: true,
      social: {
        ...(mainRest.social || {}),
        whatsapp: branchPhoneRaw.trim() || mainRest.social?.whatsapp || mainRest.ph,
      },
      done: 1,
      a: 1,
      o: 0,
      v: 0,
    });

    putItem<Restaurant>(`restaurants/${newBranchId}`, branchRecord);
    if (cloneMainMenu !== false) {
      cloneCatsAndItemsFromMain(newBranchId);
    }
    setActiveRid(newBranchId);
    onRefresh();
    showToast('تم إنشاء الفرع وتفعيل لوحته المستقلة ✓');
    void flushPendingDbSync()
      .catch(() => {})
      .finally(() => {
        onNavigate(getDashboardTabPath('branches', newBranchId, validBranchSlug));
      });
    return true;
  };

  const cloneMainMenuToBranch = (branchRid: string, branchLabel: string) => {
    triggerAjaxConfirm(
      terms.isStore ? `نسخ منتجات الفرع الرئيسي إلى ${branchLabel}` : `نسخ منيو الفرع الرئيسي إلى ${branchLabel}`,
      terms.isStore
        ? 'سيتم استبدال أقسام ومنتجات هذا المعرض بنسخة مطابقة كاملة من المتجر الرئيسي (يمكنك تعديلها بحرية بعد النسخ دون التأثير على الرئيسي).'
        : 'سيتم استبدال أقسام ومنتجات هذا الفرع بنسخة مطابقة كاملة من الفرع الرئيسي (يمكنك تعديلها بحرية بعد النسخ دون التأثير على الفرع الرئيسي).',
      'warn',
      'تأكيد النسخ',
      () => {
        cloneCatsAndItemsFromMain(branchRid);
        onRefresh();
      },
      terms.isStore
        ? `تم نسخ منتجات المتجر الرئيسي إلى "${branchLabel}" بنجاح ✓`
        : `تم نسخ منيو الفرع الرئيسي إلى "${branchLabel}" بنجاح ✓`
    );
  };

  const deleteBranch = (branchRid: string, branchLabel: string) => {
    triggerAjaxConfirm(
      `حذف فرع: ${branchLabel}`,
      `هل أنت متأكد من حذف "${branchLabel}" وجميع أقسامه ومنتجاته نهائياً؟`,
      'danger',
      'تأكيد الحذف',
      async () => {
        getCollection<Category>('cats')
          .filter((c) => c.rid === branchRid)
          .forEach((c) => deleteItem(`cats/${c.id}`));
        getCollection<MenuItem>('items')
          .filter((i) => i.rid === branchRid)
          .forEach((i) => deleteItem(`items/${i.id}`));
        deleteItem(`restaurants/${branchRid}`);
        if (activeRid === branchRid) {
          setActiveRid(mainRid);
          await flushPendingDbSync().catch(() => {});
          onNavigate(getDashboardTabPath('branches', undefined, getSlugForRestaurantId(mainRid)));
          return;
        }
        onRefresh();
      },
      `تم حذف "${branchLabel}" بنجاح`
    );
  };

  const renameBranch = async (branchRid: string, nextNameRaw: string) => {
    const cleanName = nextNameRaw.trim();
    if (!cleanName) {
      showToast('يرجى إدخال اسم صحيح للفرع');
      return false;
    }
    const target = getItem<Restaurant>(`restaurants/${branchRid}`);
    if (!target) return false;
    const updated: Restaurant = {
      ...target,
      branchName: cleanName,
    };
    await putItemAndSync<Restaurant>(`restaurants/${branchRid}`, updated);
    onRefresh();
    showToast('تم تعديل اسم الفرع ✓');
    return true;
  };

  // Addons state synchronized with Restaurant object
  const [addonsState, setAddonsState] = useState<RestaurantAddons>(() => buildDefaultAddons(rest));
  const addonsStateRef = useRef<RestaurantAddons>(addonsState);
  addonsStateRef.current = addonsState;
  const [addonCategoryFilter, setAddonCategoryFilter] = useState<AddonCategoryFilter>('all');
  const [addonSearchQuery, setAddonSearchQuery] = useState('');
  const [editingAddonKey, setEditingAddonKey] = useState<AddonKey | null>(null);
  const [addonDraft, setAddonDraft] = useState<Record<string, any>>({});
  const [addonEditIntent, setAddonEditIntent] = useState<'edit' | 'enable'>('edit');
  const [addonEditError, setAddonEditError] = useState<string>('');
  const [addonSaving, setAddonSaving] = useState<boolean>(false);
  const [showPopupPreview, setShowPopupPreview] = useState(false);

  // Unlock browser WebAudio cleanly on first interaction inside the dashboard (desktop & mobile)
  useEffect(() => {
    const handleUnlock = () => unlockBellAudio();
    window.addEventListener('pointerdown', handleUnlock, { passive: true });
    window.addEventListener('keydown', handleUnlock, { passive: true });
    window.addEventListener('touchstart', handleUnlock, { passive: true });
    window.addEventListener('touchend', handleUnlock, { passive: true });
    window.addEventListener('click', handleUnlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
      window.removeEventListener('touchstart', handleUnlock);
      window.removeEventListener('touchend', handleUnlock);
      window.removeEventListener('click', handleUnlock);
    };
  }, []);

  // PWA Web Push Notification Permission & Subscription Lifecycle
  const [notificationPermission, setNotificationPermission] = useState<PushPermissionState>(() =>
    getDashboardNotificationPermission()
  );
  const pushSupported = isWebPushSupported();

  const enableDashboardPushNotifications = async (opts?: { silent?: boolean }): Promise<boolean> => {
    const prevPerm = getDashboardNotificationPermission();
    const res = await syncDashboardPushSubscription({ requestPermission: true });
    setNotificationPermission(res.permission);
    if (res.subscribed && !opts?.silent && prevPerm !== 'granted') {
      showToast('تم تفعيل إشعارات الطلبات الجديدة حتى عند إغلاق التطبيق ✓');
    } else if (res.permission === 'denied' && !opts?.silent) {
      showToast('تم حظر الإشعارات من إعدادات المتصفح — يمكنك تفعيلها من إعدادات الموقع');
    }
    return res.subscribed;
  };

  useEffect(() => {
    if (!pushSupported) return;
    let cancelled = false;

    const runSync = async () => {
      const current = getDashboardNotificationPermission();
      if (!cancelled) setNotificationPermission(current);
      if (current === 'granted') {
        await syncDashboardPushSubscription({ requestPermission: false });
      } else if (current === 'default') {
        // Attempt prompt on open (succeeds automatically in Chromium PWAs/browsers where allowed)
        const res = await syncDashboardPushSubscription({ requestPermission: true });
        if (!cancelled) setNotificationPermission(res.permission);
      }
    };

    void runSync();

    // One-time gesture fallback in case browser/iOS Safari requires user tap for Notification.requestPermission()
    const handleFirstTap = async () => {
      if (getDashboardNotificationPermission() === 'default') {
        const perm = await requestDashboardNotificationPermission();
        if (!cancelled) setNotificationPermission(perm);
        if (perm === 'granted') {
          await syncDashboardPushSubscription({ requestPermission: false });
        }
      }
    };
    window.addEventListener('pointerdown', handleFirstTap, { once: true, passive: true });

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', handleFirstTap);
    };
  }, [rid, pushSupported]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'MENUPLUS_NEW_ORDER_PUSH') {
        void fetchDashboardBootstrapFast({ rid, force: true })
          .then(() => {
            onRefresh();
          })
          .catch(() => {});
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onSwMessage);
    };
  }, [rid, onRefresh]);

  // Track whether the current `rid` has completed its initial server bootstrap
  const hydratedRidsRef = useRef<Set<string>>(new Set());
  const [ordersArchiveMeta, setOrdersArchiveMeta] = useState(() => getOrdersArchiveMeta(rid));
  const [loadingOlderOrders, setLoadingOlderOrders] = useState(false);

  useEffect(() => {
    setOrdersArchiveMeta(getOrdersArchiveMeta(rid));
  }, [rid]);

  const loadOlderOrders = async (): Promise<void> => {
    const meta = getOrdersArchiveMeta(rid);
    if (loadingOlderOrders || meta.loadedAll || !meta.ordersTruncated) return;
    setLoadingOlderOrders(true);
    try {
      const res = await fetchDashboardOrdersArchive(rid);
      setOrdersArchiveMeta(getOrdersArchiveMeta(rid));
      if (res.ok) {
        onRefresh();
      }
    } finally {
      setLoadingOlderOrders(false);
    }
  };

  // Subscribe to SSE realtime stream while dashboard is open (with conservative 90s visibility-aware fallback)
  useEffect(() => {
    let active = true;
    let syncing = false;
    let lastWakeCheckAt = 0;
    clearPendingBellTone();

    const getSnapshotSig = () => {
      const ordersSig = getCollection<Order>('orders')
        .filter((o) => o.rid === rid)
        .map((o) => `${o.id}:${o.st || ''}:${o.status || ''}:${o.at || 0}`)
        .sort()
        .join('|');
      const restSig = JSON.stringify(getItem<Restaurant>(`restaurants/${rid}`) || null);
      return `${ordersSig}##${restSig}`;
    };

    const pollOrders = async (isInitialMountPoll = false, bypassTtl = false) => {
      if (!active || syncing || document.visibilityState === 'hidden') return;
      syncing = true;
      try {
        const beforeSig = getSnapshotSig();
        const res = await fetchDashboardBootstrapFast({
          rid,
          onlyIfChanged: true,
          ...(bypassTtl ? { bypassTtl: true } : {}),
        });
        if (!active) return;
        setOrdersArchiveMeta(getOrdersArchiveMeta(rid));
        const firstTimeForRid = !hydratedRidsRef.current.has(rid);
        hydratedRidsRef.current.add(rid);
        if (firstTimeForRid || isInitialMountPoll) {
          // Baseline existing pending orders silently on first load of this menu
          checkAndNotifyPendingOrders(rid, showToast, { isDashboardRoute: true });
        }
        if (!res.ok || res.unchanged) return;
        const afterSig = getSnapshotSig();
        if (afterSig !== beforeSig) {
          onRefresh();
        }
      } catch {
        // ignore transient background poll errors
      } finally {
        syncing = false;
      }
    };

    const handleWake = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastWakeCheckAt < 20_000) return;
      lastWakeCheckAt = now;
      void pollOrders(false, true);
    };

    void pollOrders(true, false);
    const unsubscribeRealtime = subscribeServerRealtime({
      scope: 'dashboard',
      rid,
      onUpdate: () => {
        if (active) void pollOrders(false, true);
      },
    });
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void pollOrders(false, true);
      }
    }, 90_000);
    window.addEventListener('focus', handleWake);
    document.addEventListener('visibilitychange', handleWake);

    return () => {
      active = false;
      unsubscribeRealtime();
      window.clearInterval(timer);
      window.removeEventListener('focus', handleWake);
      document.removeEventListener('visibilitychange', handleWake);
    };
  }, [rid, onRefresh, showToast]);

  // Persistent notification check ONLY after initial server hydration for active `rid`
  useEffect(() => {
    if (!hydratedRidsRef.current.has(rid)) return;
    checkAndNotifyPendingOrders(rid, showToast, { isDashboardRoute: true });
  }, [rid, allOrders, showToast]);

  // Keep dynamic PWA manifest & icons pointed to this restaurant / branch dashboard and logo
  const effectivePwaLogo = (rest.logo || mainRest?.logo || '').trim();
  const effectivePwaSlug = getSlugForRestaurantId(rid) || sanitizeSlug(rest.slug || rest.subdomain || '');
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let logoHash = 'default';
    if (effectivePwaLogo) {
      let h = 2166136261;
      for (let i = 0; i < effectivePwaLogo.length; i += 1) {
        h ^= effectivePwaLogo.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      logoHash = `${(h >>> 0).toString(16)}_${effectivePwaLogo.length}`;
    }

    const pwaDisplayName =
      rid !== mainRid ? rest.branchName?.trim() || rest.n : rest.branchName?.trim() || rest.n;
    const params = new URLSearchParams();
    params.set('rid', rid);
    if (effectivePwaSlug) params.set('slug', effectivePwaSlug);
    if (pwaDisplayName) params.set('name', pwaDisplayName);
    if (rid !== mainRid) params.set('branchId', rid);
    if (effectivePwaLogo) params.set('v', logoHash);

    const manifestHref = `/api/pwa/dashboard-manifest.webmanifest?${params.toString()}`;
    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (manifestLink && manifestLink.getAttribute('href') !== manifestHref) {
      manifestLink.setAttribute('href', manifestHref);
    }

    const iconHref = effectivePwaLogo
      ? `/api/pwa/dashboard-icon?rid=${encodeURIComponent(rid)}&v=${encodeURIComponent(logoHash)}`
      : '/apple-touch-icon.png';

    const appleTouchLinks = document.querySelectorAll('link[rel="apple-touch-icon"]');
    appleTouchLinks.forEach((el) => {
      const linkEl = el as HTMLLinkElement;
      if (effectivePwaLogo) {
        linkEl.removeAttribute('sizes');
      } else {
        linkEl.setAttribute('sizes', '180x180');
      }
      if (linkEl.getAttribute('href') !== iconHref) {
        linkEl.setAttribute('href', iconHref);
      }
    });

    const pageIconHref = effectivePwaLogo ? iconHref : '/assets/aistudio/icon_f95f5a07.png';
    const iconLinks = document.querySelectorAll('link[rel="icon"]');
    iconLinks.forEach((el) => {
      const linkEl = el as HTMLLinkElement;
      if (effectivePwaLogo) {
        linkEl.removeAttribute('sizes');
        linkEl.removeAttribute('type');
      }
      if (linkEl.getAttribute('href') !== pageIconHref) {
        linkEl.setAttribute('href', pageIconHref);
      }
    });

    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    const shortTitle =
      pwaDisplayName && pwaDisplayName.trim().length <= 14
        ? pwaDisplayName.trim()
        : 'لوحة التحكم';
    if (appleTitle) {
      appleTitle.setAttribute('content', shortTitle);
    }
  }, [rid, mainRid, rest.n, rest.branchName, effectivePwaLogo, effectivePwaSlug]);

  // CATEGORIES STATE
  const [searchCatQuery, setSearchCatQuery] = useState('');
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catNameInput, setCatNameInput] = useState('');
  const [catSubtitleInput, setCatSubtitleInput] = useState('');
  const [catEmojiInput, setCatEmojiInput] = useState('');
  const [catImageInput, setCatImageInput] = useState('');
  const [catPublishedInput, setCatPublishedInput] = useState(true);
  const [catScheduleInput, setCatScheduleInput] = useState<AvailabilitySchedule>(() =>
    normalizeAvailabilitySchedule(DEFAULT_AVAILABILITY_SCHEDULE)
  );

  // MENU ITEMS STATE & FULL-PAGE ITEM EDITOR
  const [searchItemQuery, setSearchItemQuery] = useState('');
  const [filterCatId, setFilterCatId] = useState('all');
  const [isItemEditorOpen, setIsItemEditorOpen] = useState(false);
  const [itemEditorTab, setItemEditorTab] = useState<ItemEditorTab>('info');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const [formCat, setFormCat] = useState('');
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState<number | ''>('');
  const [formBeforePrice, setFormBeforePrice] = useState<number | ''>('');
  const [formDesc, setFormDesc] = useState('');
  const [formImage, setFormImage] = useState('');
  const [formPrepTime, setFormPrepTime] = useState('');
  const [formBadgeText, setFormBadgeText] = useState('');
  const [formBadgeType, setFormBadgeType] = useState<'red' | 'gold' | 'green' | 'accent'>('accent');
  const [formAllergens, setFormAllergens] = useState('');
  const [formPublished, setFormPublished] = useState(true);
  const [formDineInOnly, setFormDineInOnly] = useState(false);
  const [formNoDelivery, setFormNoDelivery] = useState(false);
  const [formNoPickup, setFormNoPickup] = useState(false);
  const [formSchedule, setFormSchedule] = useState<AvailabilitySchedule>(() =>
    normalizeAvailabilitySchedule(DEFAULT_AVAILABILITY_SCHEDULE)
  );

  const [hasVariableSizes, setHasVariableSizes] = useState(false);
  const [formSizes, setFormSizes] = useState<Array<{ n: string; p: number | '' }>>([
    { n: '', p: '' },
  ]);

  const [hasExtras, setHasExtras] = useState(false);
  const [formExtras, setFormExtras] = useState<Array<{ n: string; p: number | '' }>>([
    { n: '', p: '' },
  ]);

  const [hasChoices, setHasChoices] = useState(false);
  const [formMaxChoices, setFormMaxChoices] = useState<number>(1);
  const [formChoices, setFormChoices] = useState<string[]>(['']);

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchLinesInput, setBatchLinesInput] = useState('');

  // APPEARANCE STATE
  const normalizeLayoutChoice = (raw?: string): MenuLayout =>
    raw === 'grid4' || raw === 'cards'
      ? 'grid4'
      : raw === 'grid3'
      ? 'grid3'
      : raw === 'grid'
      ? 'grid'
      : 'list';
  const [selectedLayout, setSelectedLayout] = useState<MenuLayout>(() => {
    const candidate = normalizeLayoutChoice(rest.lay);
    return isLayoutAllowed(candidate) ? candidate : 'list';
  });
  const [menuThemeMode, setMenuThemeMode] = useState<'dark' | 'light' | 'auto'>(() =>
    rest.themeMode === 'dark' || rest.themeMode === 'auto' ? rest.themeMode : 'light'
  );
  const resolveDashboardPref = (r?: Restaurant | null): 'dark' | 'light' | 'auto' => {
    if (r?.dashboardThemeMode === 'dark' || r?.dashboardThemeMode === 'light' || r?.dashboardThemeMode === 'auto') {
      return r.dashboardThemeMode;
    }
    const sitePref = getSite().dashboardThemeMode;
    return sitePref === 'dark' || sitePref === 'auto' ? sitePref : 'light';
  };
  const [dashboardThemeMode, setDashboardThemeMode] = useState<'dark' | 'light' | 'auto'>(() =>
    resolveDashboardPref(rest)
  );
  const isInitialStore = isStoreProject(rest.projectType);
  const normalizeShapeChoice = (raw?: string, storeFlag = isInitialStore): MenuThemeShape => {
    if (storeFlag) return 'estore';
    if (raw === 'theme6') return 'theme5';
    return raw === 'silk' ||
      raw === 'editorial' ||
      raw === 'velvet' ||
      raw === 'luxe' ||
      raw === 'toters' ||
      raw === 'theme1' ||
      raw === 'theme2' ||
      raw === 'theme3' ||
      raw === 'theme4' ||
      raw === 'theme5' ||
      raw === 'glass' ||
      raw === 'cartoon' ||
      raw === 'dreamy' ||
      raw === 'pill' ||
      raw === 'sharp' ||
      raw === 'bordered' ||
      raw === 'soft' ||
      raw === 'ramadan' ||
      raw === 'eid' ||
      raw === 'newyear'
      ? raw
      : 'modern';
  };
  const [menuThemePreset, setMenuThemePreset] = useState<string>(() =>
    isInitialStore
      ? 'estore'
      : rest.themePreset === 'theme6-delivery'
      ? 'theme5-shawarmer'
      : rest.themePreset && rest.themePreset !== 'estore'
      ? rest.themePreset
      : rest.themeMode === 'dark'
      ? 'emerald-dark'
      : 'clean-light'
  );
  const [menuThemeShape, setMenuThemeShape] = useState<MenuThemeShape>(() =>
    normalizeShapeChoice(rest.themeShape, isInitialStore)
  );
  const [restColor, setRestColor] = useState<string>(() =>
    isInitialStore ? '#f15a29' : rest.color || '#059669'
  );
  const [restBgColor, setRestBgColor] = useState<string>(() =>
    isInitialStore ? '' : rest.bgColor || ''
  );
  const [coverUrlInput, setCoverUrlInput] = useState(rest.coverImages?.[0] || '');
  const [logoUrlInput, setLogoUrlInput] = useState(rest.logo || '');
  const [aboutTextInput, setAboutTextInput] = useState(rest.aboutText || '');
  const [taxNoteInput, setTaxNoteInput] = useState(rest.taxNote || '');
  const [showLogoUrlField, setShowLogoUrlField] = useState(false);
  const [showBannerUrlField, setShowBannerUrlField] = useState(false);

  // CUSTOM SUBDOMAIN / SLUG STATE
  const [restSlug, setRestSlug] = useState(() => sanitizeSlug(rest.slug || rest.subdomain || ''));
  const [slugCheckState, setSlugCheckState] = useState<{
    checking: boolean;
    available: boolean | null;
    message: string;
    fullUrl?: string;
  }>({ checking: false, available: null, message: '' });

  // ORDERS FILTER
  const [orderFilter, setOrderFilter] = useState<'all' | 'new' | 'completed'>('all');

  // SETTINGS STATE
  const [restProjectType, setRestProjectTypeRaw] = useState<'restaurant' | 'store'>(
    isInitialStore ? 'store' : 'restaurant'
  );
  const [restName, setRestName] = useState(rest.n || '');
  const [restTagline, setRestTagline] = useState(() =>
    sanitizeProjectTagline(rest.tagline, rest.projectType)
  );
  const [restCurrency, setRestCurrency] = useState(rest.currency || 'د.ع');
  const [restActive, setRestActive] = useState(rest.a !== 0);
  const [viewOnlyMode, setViewOnlyModeRaw] = useState(Boolean(rest.viewOnlyMode));
  const [allowDelivery, setAllowDelivery] = useState(
    rest.viewOnlyMode ? false : rest.enabledOrderTypes?.delivery !== false
  );
  const [allowPickup, setAllowPickup] = useState(
    rest.viewOnlyMode ? false : rest.enabledOrderTypes?.pickup !== false
  );
  const [allowTable, setAllowTable] = useState(
    rest.viewOnlyMode ? false : Boolean(rest.enabledOrderTypes?.table)
  );
  const [acceptClosedOrders, setAcceptClosedOrders] = useState(Boolean(rest.acceptOrdersWhenClosed));
  const resolveInitialChannels = (rObj: Restaurant) => {
    let wa =
      rObj.whatsappNotificationsEnabled !== undefined
        ? rObj.whatsappNotificationsEnabled !== false
        : rObj.orderChannel !== 'telegram' && rObj.orderChannel !== 'app';
    let tg =
      rObj.telegramNotificationsEnabled !== undefined
        ? rObj.telegramNotificationsEnabled !== false
        : rObj.orderChannel !== 'whatsapp' && rObj.orderChannel !== 'app';
    let app = rObj.appNotificationsEnabled !== false;
    if (!wa && !tg && !app) {
      wa = true;
    }
    return { wa, tg, app };
  };
  const initialChannels = resolveInitialChannels(rest);
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean>(initialChannels.wa);
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(initialChannels.tg);
  const [appNotificationsEnabled, setAppNotificationsEnabled] = useState<boolean>(initialChannels.app);
  const orderChannel: 'both' | 'telegram' | 'whatsapp' | 'app' =
    whatsappEnabled && telegramEnabled
      ? 'both'
      : telegramEnabled
      ? 'telegram'
      : whatsappEnabled
      ? 'whatsapp'
      : 'app';
  const [restPhone, setRestPhone] = useState(rest.ph || '');
  const [restWa, setRestWa] = useState(rest.social?.whatsapp || rest.ph || '');
  const [restAddress, setRestAddress] = useState(rest.address || 'العراق، بغداد');
  const [restInstagram, setRestInstagram] = useState(rest.social?.instagram || '');
  const [restMapUrl, setRestMapUrl] = useState(
    rest.mapUrl || rest.addons?.locationLinks?.googleMapsUrl || ''
  );
  const [restWazeUrl, setRestWazeUrl] = useState(
    rest.wazeUrl || rest.addons?.locationLinks?.wazeUrl || ''
  );
  const [restGoogleReviewUrl, setRestGoogleReviewUrl] = useState(rest.googleReviewUrl || '');
  const [restFacebook, setRestFacebook] = useState(rest.social?.facebook || '');
  const [restTiktok, setRestTiktok] = useState(rest.social?.tiktok || '');
  const [workMode, setWorkMode] = useState<'24' | 'c'>(rest.h?.m === 'c' ? 'c' : '24');
  const [workFrom, setWorkFrom] = useState(rest.h?.f || '09:00');
  const [workTo, setWorkTo] = useState(rest.h?.t || '23:59');
  const [weeklyHours, setWeeklyHours] = useState<Record<WorkDayKey, DaySchedule>>(() =>
    buildWeeklyHoursDraft(rest)
  );
  const [deliveryZonesState, setDeliveryZonesState] = useState<DeliveryZoneDraft[]>(() =>
    buildDeliveryZonesDraft(rest)
  );

  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [unifiedSaving, setUnifiedSaving] = useState(false);
  const colorSyncTimerRef = useRef<number | null>(null);
  const settingsSyncTimerRef = useRef<number | null>(null);
  const hydratedSettingsSigRef = useRef<string>('');
  const catEditSyncTimerRef = useRef<number | null>(null);
  const hydratedCatEditSigRef = useRef<string>('');
  const itemEditSyncTimerRef = useRef<number | null>(null);
  const hydratedItemEditSigRef = useRef<string>('');

  const appearanceDraftRef = useRef<{
    lay: MenuLayout;
    themeMode: 'dark' | 'light' | 'auto';
    themePreset: string;
    themeShape: MenuThemeShape;
    color: string;
    bgColor: string;
  }>({
    lay: isLayoutAllowed(normalizeLayoutChoice(rest.lay)) ? normalizeLayoutChoice(rest.lay) : 'list',
    themeMode: isInitialStore ? 'light' : rest.themeMode === 'dark' || rest.themeMode === 'auto' ? rest.themeMode : 'light',
    themePreset: isInitialStore
      ? 'estore'
      : rest.themePreset === 'theme6-delivery'
      ? 'theme5-shawarmer'
      : rest.themePreset && rest.themePreset !== 'estore'
      ? rest.themePreset
      : rest.themeMode === 'dark'
      ? 'emerald-dark'
      : 'clean-light',
    themeShape: normalizeShapeChoice(rest.themeShape, isInitialStore),
    color: isInitialStore ? '#f15a29' : rest.color || '#059669',
    bgColor: isInitialStore ? '' : rest.bgColor || '',
  });

  const buildSettingsDigestFromValues = (vals: {
    projectType: 'restaurant' | 'store';
    name: string;
    tagline: string;
    aboutText: string;
    taxNote: string;
    currency: string;
    active: boolean;
    viewOnlyMode: boolean;
    allowDelivery: boolean;
    allowPickup: boolean;
    allowTable: boolean;
    acceptClosedOrders: boolean;
    whatsappEnabled: boolean;
    telegramEnabled: boolean;
    appNotificationsEnabled: boolean;
    orderChannel: 'both' | 'telegram' | 'whatsapp' | 'app';
    phone: string;
    wa: string;
    address: string;
    mapUrl: string;
    wazeUrl: string;
    googleReviewUrl: string;
    instagram: string;
    facebook: string;
    tiktok: string;
    workMode: '24' | 'c';
    workFrom: string;
    workTo: string;
    weeklyHours: Record<WorkDayKey, DaySchedule>;
    deliveryZones: DeliveryZoneDraft[];
    logoUrl: string;
    coverUrl: string;
    slug: string;
  }) =>
    JSON.stringify({
      ...vals,
      deliveryZones: vals.deliveryZones
        .filter((z) => z.area.trim())
        .map((z) => ({
          area: z.area.trim(),
          fee: Math.max(0, Number(z.fee) || 0),
        })),
    });

  const buildAddonsSignature = (rObj: Restaurant, targetRid: string) =>
    `${targetRid}|${Number(rObj.freeDeliveryMin || 0)}|${JSON.stringify(rObj.addons || {})}|${JSON.stringify(rObj.offerPopup || {})}`;

  const buildRestSignature = (rObj: Restaurant, targetRid: string) =>
    `${targetRid}|${rObj.planId || ''}|${rObj.slug || ''}|${rObj.lay || ''}|${rObj.themeMode || ''}|${rObj.dashboardThemeMode || ''}|${rObj.themePreset || ''}|${rObj.themeShape || ''}|${rObj.color || ''}|${rObj.bgColor || ''}|${rObj.currency || ''}|${rObj.logo || ''}|${rObj.coverImages?.[0] || ''}|${rObj.n || ''}|${rObj.orderChannel || ''}|${rObj.whatsappNotificationsEnabled === false ? '0' : '1'}|${rObj.telegramNotificationsEnabled === false ? '0' : '1'}|${rObj.appNotificationsEnabled === false ? '0' : '1'}|${rObj.a === 0 ? '0' : '1'}|${rObj.viewOnlyMode ? '1' : '0'}|${JSON.stringify(rObj.enabledOrderTypes || {})}|${rObj.acceptOrdersWhenClosed ? '1' : '0'}|${rObj.address || ''}|${rObj.ph || ''}|${rObj.mapUrl || ''}|${rObj.wazeUrl || ''}`;

  // Synchronize dashboard form state when switching branch or syncing remote DB
  const syncedRestRef = useRef<string>('');
  const syncedAddonsSigRef = useRef<string>('');
  const syncedRidRef = useRef<string>('');
  useEffect(() => {
    const ridChanged = syncedRidRef.current !== rid;
    const nextAddonsSig = buildAddonsSignature(rest, rid);
    if (ridChanged || syncedAddonsSigRef.current !== nextAddonsSig) {
      syncedAddonsSigRef.current = nextAddonsSig;
      const nextAddons = buildDefaultAddons(rest);
      addonsStateRef.current = nextAddons;
      setAddonsState(nextAddons);
    }

    if (!ridChanged && settingsSyncTimerRef.current !== null) {
      // Do not overwrite user's active in-progress settings edits during background polling
      return;
    }
    const sig = buildRestSignature(rest, rid);
    if (syncedRestRef.current === sig) return;
    syncedRestRef.current = sig;
    syncedRidRef.current = rid;
    const nextProjectType: 'restaurant' | 'store' =
      isStoreProject(rest.projectType) ? 'store' : 'restaurant';
    const nextIsStore = nextProjectType === 'store';
    if (colorSyncTimerRef.current === null) {
      const candidateLay = normalizeLayoutChoice(rest.lay);
      const safeLay = nextIsStore ? 'grid4' : isLayoutAllowed(candidateLay) ? candidateLay : 'list';
      const safeMode: 'dark' | 'light' | 'auto' = nextIsStore
        ? 'light'
        : rest.themeMode === 'dark' || rest.themeMode === 'auto'
        ? rest.themeMode
        : 'light';
      const safePreset = nextIsStore
        ? 'estore'
        : rest.themePreset === 'custom'
        ? 'custom'
        : rest.themePreset === 'theme6-delivery'
        ? 'theme5-shawarmer'
        : rest.themePreset && rest.themePreset !== 'estore'
        ? rest.themePreset
        : safeMode === 'dark'
        ? 'emerald-dark'
        : 'clean-light';
      const safeShape = normalizeShapeChoice(rest.themeShape, nextIsStore);
      const safeColor = nextIsStore ? '#f15a29' : rest.color || '#059669';
      const safeBg = nextIsStore ? '' : rest.bgColor || '';
      appearanceDraftRef.current = {
        lay: safeLay,
        themeMode: safeMode,
        themePreset: safePreset,
        themeShape: safeShape,
        color: safeColor,
        bgColor: safeBg,
      };
      setSelectedLayout(safeLay);
      setMenuThemeMode(safeMode);
      setMenuThemePreset(safePreset);
      setMenuThemeShape(safeShape);
      setRestColor(safeColor);
      setRestBgColor(safeBg);
    }
    const nextCover = rest.coverImages?.[0] || '';
    const nextLogo = rest.logo || '';
    const nextAbout = rest.aboutText || '';
    const nextTax = rest.taxNote || '';
    const nextSlug = sanitizeSlug(rest.slug || rest.subdomain || '');
    const nextName = rest.n || '';
    const nextTagline = sanitizeProjectTagline(rest.tagline, nextProjectType);
    const nextCurrency = rest.currency || 'د.ع';
    const nextActive = rest.a !== 0;
    const nextViewOnly = Boolean(rest.viewOnlyMode);
    const nextDelivery = nextViewOnly ? false : rest.enabledOrderTypes?.delivery !== false;
    const nextPickup = nextViewOnly ? false : rest.enabledOrderTypes?.pickup !== false;
    const nextTable = nextViewOnly ? false : Boolean(rest.enabledOrderTypes?.table);
    const nextClosed = Boolean(rest.acceptOrdersWhenClosed);
    const nextResolvedChannels = resolveInitialChannels(rest);
    const nextChannel: 'both' | 'telegram' | 'whatsapp' | 'app' =
      nextResolvedChannels.wa && nextResolvedChannels.tg
        ? 'both'
        : nextResolvedChannels.tg
        ? 'telegram'
        : nextResolvedChannels.wa
        ? 'whatsapp'
        : 'app';
    const nextPh = rest.ph || '';
    const nextWa = rest.social?.whatsapp || rest.ph || '';
    const nextAddr = rest.address || 'العراق، بغداد';
    const nextIg = rest.social?.instagram || '';
    const nextMap = rest.mapUrl || rest.addons?.locationLinks?.googleMapsUrl || '';
    const nextWaze = rest.wazeUrl || rest.addons?.locationLinks?.wazeUrl || '';
    const nextReview = rest.googleReviewUrl || '';
    const nextFb = rest.social?.facebook || '';
    const nextTt = rest.social?.tiktok || '';
    const nextWorkMode: '24' | 'c' = rest.h?.m === 'c' ? 'c' : '24';
    const nextWorkFrom = rest.h?.f || '09:00';
    const nextWorkTo = rest.h?.t || '23:59';
    const nextWeekly = buildWeeklyHoursDraft(rest);
    const nextZones = buildDeliveryZonesDraft(rest);

    hydratedSettingsSigRef.current = buildSettingsDigestFromValues({
      projectType: nextProjectType,
      name: nextName,
      tagline: nextTagline,
      aboutText: nextAbout,
      taxNote: nextTax,
      currency: nextCurrency,
      active: nextActive,
      viewOnlyMode: nextViewOnly,
      allowDelivery: nextDelivery,
      allowPickup: nextPickup,
      allowTable: nextTable,
      acceptClosedOrders: nextClosed,
      whatsappEnabled: nextResolvedChannels.wa,
      telegramEnabled: nextResolvedChannels.tg,
      appNotificationsEnabled: nextResolvedChannels.app,
      orderChannel: nextChannel,
      phone: nextPh,
      wa: nextWa,
      address: nextAddr,
      mapUrl: nextMap,
      wazeUrl: nextWaze,
      googleReviewUrl: nextReview,
      instagram: nextIg,
      facebook: nextFb,
      tiktok: nextTt,
      workMode: nextWorkMode,
      workFrom: nextWorkFrom,
      workTo: nextWorkTo,
      weeklyHours: nextWeekly,
      deliveryZones: nextZones,
      logoUrl: nextLogo,
      coverUrl: nextCover,
      slug: nextSlug,
    });

    setDashboardThemeMode(resolveDashboardPref(rest));
    setCoverUrlInput(nextCover);
    setLogoUrlInput(nextLogo);
    setAboutTextInput(nextAbout);
    setTaxNoteInput(nextTax);
    setRestSlug(nextSlug);
    setSlugCheckState({ checking: false, available: null, message: '' });
    setRestProjectTypeRaw(nextProjectType);
    setRestName(nextName);
    setRestTagline(nextTagline);
    setRestCurrency(nextCurrency);
    setRestActive(nextActive);
    setViewOnlyModeRaw(nextViewOnly);
    setAllowDelivery(nextDelivery);
    setAllowPickup(nextPickup);
    setAllowTable(nextTable);
    setAcceptClosedOrders(nextClosed);
    setWhatsappEnabled(nextResolvedChannels.wa);
    setTelegramEnabled(nextResolvedChannels.tg);
    setAppNotificationsEnabled(nextResolvedChannels.app);
    setRestPhone(nextPh);
    setRestWa(nextWa);
    setRestAddress(nextAddr);
    setRestInstagram(nextIg);
    setRestMapUrl(nextMap);
    setRestWazeUrl(nextWaze);
    setRestGoogleReviewUrl(nextReview);
    setRestFacebook(nextFb);
    setRestTiktok(nextTt);
    setWorkMode(nextWorkMode);
    setWorkFrom(nextWorkFrom);
    setWorkTo(nextWorkTo);
    setWeeklyHours(nextWeekly);
    setDeliveryZonesState(nextZones);
  }, [rid, rest]);

  const slugCheckSeqRef = useRef(0);

  const checkSubdomainAvailability = async (candidateRaw: string) => {
    const seq = ++slugCheckSeqRef.current;
    const clean = sanitizeSlug(candidateRaw);
    if (!clean) {
      setSlugCheckState({ checking: false, available: null, message: '' });
      return;
    }
    if (!resolvedPlan.perms.customSlug) {
      setSlugCheckState({
        checking: false,
        available: false,
        message: 'الرابط والدومين الفرعي المخصص متاحان في الباقات المدفوعة فقط.',
      });
      return;
    }
    if (clean.length < 3) {
      setSlugCheckState({
        checking: false,
        available: false,
        message: 'يجب أن يتكون من 3 أحرف إنجليزية على الأقل.',
      });
      return;
    }
    if (isReservedSlug(clean)) {
      setSlugCheckState({
        checking: false,
        available: false,
        message: 'هذا الاسم محجوز للنظام، يرجى اختيار اسم آخر.',
      });
      return;
    }
    if (!isSlugAvailable(clean, rid)) {
      setSlugCheckState({
        checking: false,
        available: false,
        message: 'هذا الرابط مستخدم بالفعل من قِبل مشروع آخر.',
      });
      return;
    }

    setSlugCheckState({
      checking: true,
      available: null,
      message: '',
    });
    try {
      const qs = new URLSearchParams({
        slug: clean,
        rid,
        planId: resolvedPlan.plan.id,
      });
      const res = await fetch(`/api/subdomains/check?${qs.toString()}`, { cache: 'no-store' });
      if (seq !== slugCheckSeqRef.current) return;
      if (res.ok) {
        const data = (await res.json()) as {
          available?: boolean;
          message?: string;
          fullUrl?: string;
        };
        if (seq !== slugCheckSeqRef.current) return;
        setSlugCheckState({
          checking: false,
          available: Boolean(data.available),
          message: data.message || (data.available ? 'الرابط متاح للتفعيل!' : 'غير متاح'),
          fullUrl: data.fullUrl,
        });
        return;
      }
    } catch {
      // Fallback to local verification
    }
    if (seq !== slugCheckSeqRef.current) return;
    setSlugCheckState({
      checking: false,
      available: true,
      message: 'الرابط متاح وجاهز للحفظ ✓',
      fullUrl: subdomainEnabled ? `https://${clean}.${baseDomain}` : `https://${baseDomain}/${clean}`,
    });
  };

  const copyLink = (text: string) => {
    void copyTextReliable(text).then((ok) => {
      showToast(ok ? 'تم نسخ الرابط بنجاح ✓' : 'تعذر النسخ');
    });
  };

  const scrollCategoryPills = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      const scrollAmount = direction === 'left' ? -220 : 220;
      categoryScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const persistAddons = (nextAddons: RestaurantAddons) => {
    const latestRest = getItem<Restaurant>(`restaurants/${rid}`) || rest;

    const freeDeliveryEnabled = Boolean(nextAddons.freeDeliveryProgress?.enabled);
    const freeDeliveryThreshold = freeDeliveryEnabled
      ? Math.max(0, Number(nextAddons.freeDeliveryProgress?.minAmount ?? 0) || 0)
      : 0;

    const popupMode = nextAddons.offerPopup?.mode === 'dish' ? 'dish' : 'ad';
    const defaultPopupBtn = popupMode === 'dish' ? 'إضافة إلى السلة' : 'إغلاق';

    const nextPayload: Restaurant = {
      ...latestRest,
      addons: nextAddons,
      freeDeliveryMin: freeDeliveryThreshold,
      offerPopup: {
        ...(latestRest.offerPopup || {}),
        enabled: Boolean(nextAddons.offerPopup?.enabled),
        mode: popupMode,
        itemId: popupMode === 'dish' ? (nextAddons.offerPopup?.itemId || '') : '',
        specialPrice:
          popupMode === 'dish' &&
          nextAddons.offerPopup?.specialPrice !== undefined &&
          nextAddons.offerPopup?.specialPrice !== null
            ? Number(nextAddons.offerPopup.specialPrice)
            : undefined,
        badgeText: nextAddons.offerPopup?.badgeText || '',
        title: nextAddons.offerPopup?.title || '',
        subtitle: nextAddons.offerPopup?.subtitle || '',
        image: nextAddons.offerPopup?.image || '',
        buttonText: nextAddons.offerPopup?.buttonText || defaultPopupBtn,
      },
    };

    const normalizedNext = ensureRestaurantDefaults(nextPayload);
    syncedAddonsSigRef.current = buildAddonsSignature(normalizedNext, rid);
    syncedRestRef.current = buildRestSignature(normalizedNext, rid);
    addonsStateRef.current = nextAddons;
    setAddonsState(nextAddons);

    putItem<Restaurant>(`restaurants/${rid}`, nextPayload);
    onRefresh();
  };

  const handleToggleAddon = (addonMeta: AddonMetaItem) => {
    const localizedTitle =
      getContextualAddonCatalog(terms.isStore).find((a) => a.key === addonMeta.key)?.title ||
      addonMeta.title;
    if (!isAddonAllowedForPlan(addonMeta.key, resolvedPlan)) {
      const reqLabel = getAddonRequiredPlanLabel(addonMeta.key);
      showToast(`هذه الميزة متاحة في ${reqLabel} 🔒`);
      return;
    }
    const latestAddons = addonsStateRef.current;
    const current = (latestAddons[addonMeta.key] || {}) as Record<string, any>;
    const isCurrentlyEnabled = Boolean(current.enabled);

    // Do NOT allow enabling directly — always open the setup/edit popup first!
    if (!isCurrentlyEnabled) {
      handleOpenAddonEdit(addonMeta.key, { enableOnSave: true });
      return;
    }

    const nextAddons: RestaurantAddons = {
      ...latestAddons,
      [addonMeta.key]: {
        ...current,
        configured: true,
        enabled: false,
        ...(addonMeta.key === 'audioBell' ? { mutedByUser: true } : {}),
      },
    };
    persistAddons(nextAddons);
    showToast(`تم إيقاف "${localizedTitle}"`);
  };

  const handleOpenAddonEdit = (key: AddonKey, options?: { enableOnSave?: boolean }) => {
    if (!isAddonAllowedForPlan(key, resolvedPlan)) {
      const reqLabel = getAddonRequiredPlanLabel(key);
      showToast(`تعديل هذه الميزة متاح في ${reqLabel} 🔒`);
      return;
    }
    const defaults = (buildDefaultAddons(rest)[key] || {}) as Record<string, any>;
    const current = {
      ...defaults,
      ...((addonsStateRef.current[key] || {}) as Record<string, any>),
    };
    setAddonDraft({ ...current });
    setAddonEditIntent(options?.enableOnSave ? 'enable' : 'edit');
    setAddonEditError('');
    setEditingAddonKey(key);
  };

  const validateAndBuildAddonSnapshot = (
    keySnapshot: AddonKey,
    draftInput: Record<string, any>,
    shouldEnable: boolean
  ): { ok: true; draftSnapshot: Record<string, any> } | { ok: false; error: string } => {
    const draftSnapshot: Record<string, any> = {
      ...draftInput,
      configured: true,
      enabled: shouldEnable,
    };

    if (keySnapshot === 'offerPopup') {
      const mode = draftSnapshot.mode === 'dish' ? 'dish' : 'ad';
      const itemId = mode === 'dish' ? String(draftSnapshot.itemId || '').trim() : '';
      const linkedDish = itemId ? allItems.find((it) => it.id === itemId) : undefined;
      let title = String(draftSnapshot.title || '').trim();
      if (shouldEnable && mode === 'dish' && !itemId) {
        return {
          ok: false,
          error: terms.isStore ? 'يرجى اختيار المنتج المطلوب للعرض الخاص.' : 'يرجى اختيار الطبق المطلوب للعرض الخاص.',
        };
      }
      if (!title && linkedDish?.n) {
        title = linkedDish.n;
      }
      if (shouldEnable && !title) return { ok: false, error: 'يرجى إدخال عنوان النافذة المنبثقة.' };
      const rawSpecial = draftSnapshot.specialPrice;
      const parsedSpecial =
        mode === 'dish' &&
        rawSpecial !== '' &&
        rawSpecial !== undefined &&
        rawSpecial !== null &&
        Number.isFinite(Number(rawSpecial))
          ? Math.max(0, Number(rawSpecial))
          : undefined;
      const rawBtn = String(draftSnapshot.buttonText || '').trim();
      draftSnapshot.mode = mode;
      draftSnapshot.itemId = itemId;
      draftSnapshot.specialPrice = parsedSpecial;
      draftSnapshot.badgeText = String(draftSnapshot.badgeText || '').trim();
      draftSnapshot.title = title;
      draftSnapshot.subtitle = String(draftSnapshot.subtitle || '').trim();
      draftSnapshot.image = String(draftSnapshot.image || (mode === 'dish' ? linkedDish?.img || '' : '')).trim();
      if (mode === 'ad') {
        draftSnapshot.buttonText =
          !rawBtn || rawBtn === 'إضافة إلى السلة' || rawBtn === 'تصفح المنيو' || rawBtn === 'تصفح المنيو واطلب الآن'
            ? 'إغلاق'
            : rawBtn;
      } else {
        draftSnapshot.buttonText =
          !rawBtn || rawBtn === 'إغلاق' || rawBtn === 'تصفح المنيو' || rawBtn === 'تصفح المنيو واطلب الآن'
            ? 'إضافة إلى السلة'
            : rawBtn;
      }
    }

    if (keySnapshot === 'announcementBar') {
      const text = String(draftSnapshot.text || '').trim();
      if (shouldEnable && !text) return { ok: false, error: 'يرجى إدخال نص الشريط الإعلاني.' };
      draftSnapshot.text = text;
      draftSnapshot.bgColor = draftSnapshot.bgColor || '#C2410C';
      draftSnapshot.textColor = draftSnapshot.textColor || '#ffffff';
    }

    if (keySnapshot === 'countdownTimer') {
      const discountValue = Math.max(0, Number(draftSnapshot.discountValue ?? 0) || 0);
      const endHour = Math.min(23, Math.max(0, Math.floor(Number(draftSnapshot.endHour ?? 23))));
      if (shouldEnable && draftSnapshot.discountType !== 'fixed' && discountValue > 95) {
        return { ok: false, error: 'نسبة الخصم يجب أن لا تتجاوز 95%.' };
      }
      draftSnapshot.title = String(draftSnapshot.title || 'عرض الساعة الذهبية').trim();
      draftSnapshot.discountValue = discountValue;
      draftSnapshot.endHour = endHour;
      draftSnapshot.minOrderAmount = Math.max(0, Number(draftSnapshot.minOrderAmount ?? 0) || 0);
      draftSnapshot.maxDiscountAmount = Math.max(0, Number(draftSnapshot.maxDiscountAmount ?? 0) || 0);
    }

    if (keySnapshot === 'freeDeliveryProgress') {
      const minAmount = Math.max(0, Number(draftSnapshot.minAmount ?? 0) || 0);
      const maxDiscountAmount = Math.max(0, Number(draftSnapshot.maxDiscountAmount ?? 0) || 0);
      draftSnapshot.minAmount = minAmount;
      draftSnapshot.maxDiscountAmount = maxDiscountAmount;
      draftSnapshot.label = String(draftSnapshot.label || 'شريط التوصيل المجاني').trim();
    }

    if (keySnapshot === 'minOrder') {
      const amount = Math.max(0, Number(draftSnapshot.amount ?? 0) || 0);
      const maxAmount = Math.max(0, Number(draftSnapshot.maxAmount ?? 0) || 0);
      if (shouldEnable && amount <= 0) {
        return { ok: false, error: 'يجب تحديد مبلغ أكبر من صفر للحد الأدنى للطلب.' };
      }
      if (shouldEnable && maxAmount > 0 && maxAmount < amount) {
        return { ok: false, error: 'الحد الأعلى للطلب يجب أن يكون أكبر من أو يساوي الحد الأدنى.' };
      }
      draftSnapshot.amount = amount;
      draftSnapshot.maxAmount = maxAmount;
      draftSnapshot.message = String(draftSnapshot.message || 'الحد الأدنى للطلب هو').trim();
    }

    if (keySnapshot === 'freeGiftThreshold') {
      const giftName = String(draftSnapshot.giftName || '').trim();
      if (shouldEnable && !giftName) return { ok: false, error: 'يرجى إدخال اسم الهدية المجانية.' };
      draftSnapshot.giftName = giftName;
      draftSnapshot.minAmount = Math.max(0, Number(draftSnapshot.minAmount ?? 0) || 0);
    }

    if (keySnapshot === 'happyHour') {
      const pct = Math.min(90, Math.max(1, Number(draftSnapshot.discountPercent ?? 15) || 15));
      const startHour = Math.min(23, Math.max(0, Math.floor(Number(draftSnapshot.startHour ?? 14))));
      const endHour = Math.min(23, Math.max(0, Math.floor(Number(draftSnapshot.endHour ?? 17))));
      if (shouldEnable && startHour === endHour) {
        return { ok: false, error: 'ساعة البداية والنهاية لا يمكن أن تكونا متطابقتين.' };
      }
      draftSnapshot.title = String(draftSnapshot.title || 'ساعة السعادة الذهبية').trim();
      draftSnapshot.startHour = startHour;
      draftSnapshot.endHour = endHour;
      draftSnapshot.discountPercent = pct;
      draftSnapshot.minOrderAmount = Math.max(0, Number(draftSnapshot.minOrderAmount ?? 0) || 0);
      draftSnapshot.maxDiscountAmount = Math.max(0, Number(draftSnapshot.maxDiscountAmount ?? 0) || 0);
    }

    if (keySnapshot === 'limitedTimeDiscount') {
      const pct = Math.min(95, Math.max(1, Math.round(Number(draftSnapshot.discountPercent ?? 15) || 15)));
      const days = Math.min(365, Math.max(1, Math.round(Number(draftSnapshot.durationDays ?? 1) || 1)));
      const prevCfg = addonsStateRef.current.limitedTimeDiscount || {};
      const prevExpires = Number(prevCfg.expiresAt || 0);
      const nowTs = Date.now();
      const shouldResetWindow =
        shouldEnable &&
        (!prevCfg.enabled ||
          !prevExpires ||
          prevExpires <= nowTs ||
          Number(prevCfg.durationDays || 1) !== days);
      draftSnapshot.discountPercent = pct;
      draftSnapshot.durationDays = days;
      draftSnapshot.startsAt = shouldResetWindow ? nowTs : (prevCfg.startsAt || nowTs);
      draftSnapshot.expiresAt = shouldResetWindow
        ? nowTs + days * 86400000
        : prevExpires || nowTs + days * 86400000;
      draftSnapshot.minOrderAmount = Math.max(0, Number(draftSnapshot.minOrderAmount ?? 0) || 0);
      draftSnapshot.maxDiscountAmount = Math.max(0, Number(draftSnapshot.maxDiscountAmount ?? 0) || 0);
    }

    if (keySnapshot === 'firstOrderDiscount') {
      draftSnapshot.title = String(draftSnapshot.title || 'هدية الترحيب لطلبك الأول').trim();
      draftSnapshot.discountPercent = Math.min(90, Math.max(1, Number(draftSnapshot.discountPercent ?? 10) || 10));
      draftSnapshot.minOrderAmount = Math.max(0, Number(draftSnapshot.minOrderAmount ?? 0) || 0);
      draftSnapshot.maxDiscountAmount = Math.max(0, Number(draftSnapshot.maxDiscountAmount ?? 0) || 0);
    }

    if (keySnapshot === 'spinWheelPromo') {
      const prizes = String(draftSnapshot.prizesText || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (shouldEnable && prizes.length < 2) {
        return { ok: false, error: 'يرجى إدخال جائزتين على الأقل (كل جائزة في سطر).' };
      }
      draftSnapshot.title = String(draftSnapshot.title || 'جرّب حظك واربح خصماً فورياً!').trim();
      draftSnapshot.prizesText = prizes.join('\n');
    }

    if (keySnapshot === 'audioBell') {
      draftSnapshot.tone = draftSnapshot.tone || 'bell';
      draftSnapshot.mutedByUser = !shouldEnable;
    }

    if (keySnapshot === 'pickupInstantDiscount') {
      draftSnapshot.title = String(draftSnapshot.title || 'خصم الاستلام الذاتي').trim();
      draftSnapshot.discountPercent = Math.min(90, Math.max(1, Number(draftSnapshot.discountPercent ?? 10) || 10));
      draftSnapshot.minOrderAmount = Math.max(0, Number(draftSnapshot.minOrderAmount ?? 0) || 0);
      draftSnapshot.maxDiscountAmount = Math.max(0, Number(draftSnapshot.maxDiscountAmount ?? 0) || 0);
    }

    if (keySnapshot === 'moodMealFinder') {
      draftSnapshot.title = String(
        draftSnapshot.title || (terms.isStore ? 'مستشار التسوق الذكي — اختر الأنسب لاحتياجك!' : 'مستشار المزاج والوجبة الذكي')
      ).trim();
      draftSnapshot.buttonText = String(
        draftSnapshot.buttonText || (terms.isStore ? 'رشّح لي أفضل المنتجات ✨' : 'اختر لي وجبة حسب مزاجي ✨')
      ).trim();
    }

    if (keySnapshot === 'curbsidePickupCar') {
      draftSnapshot.instructions = String(
        draftSnapshot.instructions || (terms.isStore ? 'اركن سيارتك أمام المتجر واضغط وصلت' : 'اركن سيارتك أمام البوابة واضغط وصلت')
      ).trim();
      draftSnapshot.allowArrivedPing = draftSnapshot.allowArrivedPing !== false;
    }

    if (keySnapshot === 'dineInDiscount') {
      const pct = Math.min(90, Math.max(1, Number(draftSnapshot.discountPercent ?? 10) || 10));
      draftSnapshot.title = String(
        draftSnapshot.title || (terms.isStore ? 'خصم خاص للطلبات داخل المعرض' : 'خصم على طلبات الصالة')
      ).trim();
      draftSnapshot.discountPercent = pct;
      draftSnapshot.minOrderAmount = Math.max(0, Number(draftSnapshot.minOrderAmount ?? 0) || 0);
      draftSnapshot.maxDiscountAmount = Math.max(0, Number(draftSnapshot.maxDiscountAmount ?? 0) || 0);
    }

    return { ok: true, draftSnapshot };
  };

  const addonEditSyncTimerRef = useRef<number | null>(null);
  const hydratedAddonSigRef = useRef<string>('');
  useEffect(() => {
    if (editingAddonKey && addonEditIntent === 'edit') {
      if (!hydratedAddonSigRef.current) {
        hydratedAddonSigRef.current = JSON.stringify(addonDraft);
      }
    } else {
      hydratedAddonSigRef.current = '';
    }
  }, [editingAddonKey, addonEditIntent]);

  const flushPendingAddonEdit = () => {
    if (addonEditSyncTimerRef.current !== null) {
      window.clearTimeout(addonEditSyncTimerRef.current);
      addonEditSyncTimerRef.current = null;
    }
    if (!editingAddonKey || addonEditIntent !== 'edit') return;
    const serialized = JSON.stringify(addonDraft);
    if (!hydratedAddonSigRef.current || serialized === hydratedAddonSigRef.current) return;
    const check = validateAndBuildAddonSnapshot(editingAddonKey, addonDraft, Boolean(addonDraft.enabled));
    if (!check.ok) return;
    hydratedAddonSigRef.current = serialized;
    const latestAddons = addonsStateRef.current;
    const currentExisting = (latestAddons[editingAddonKey] || {}) as Record<string, any>;
    const nextAddons: RestaurantAddons = {
      ...latestAddons,
      [editingAddonKey]: {
        ...currentExisting,
        ...check.draftSnapshot,
        configured: true,
        enabled: Boolean(addonDraft.enabled),
      },
    };
    persistAddons(nextAddons);
    showToast('تم حفظ التغيرات');
  };

  const closeAddonEditModal = () => {
    flushPendingAddonEdit();
    setEditingAddonKey(null);
    setAddonEditError('');
    setAddonEditIntent('edit');
  };

  useEffect(() => {
    if (!editingAddonKey || addonEditIntent !== 'edit') return;
    const serialized = JSON.stringify(addonDraft);
    if (!hydratedAddonSigRef.current || serialized === hydratedAddonSigRef.current) return;

    if (addonEditSyncTimerRef.current !== null) {
      window.clearTimeout(addonEditSyncTimerRef.current);
    }
    const keySnapshot = editingAddonKey;
    const draftCopy = { ...addonDraft };
    addonEditSyncTimerRef.current = window.setTimeout(() => {
      addonEditSyncTimerRef.current = null;
      const check = validateAndBuildAddonSnapshot(keySnapshot, draftCopy, Boolean(draftCopy.enabled));
      if (!check.ok) return;
      hydratedAddonSigRef.current = serialized;
      const latestAddons = addonsStateRef.current;
      const currentExisting = (latestAddons[keySnapshot] || {}) as Record<string, any>;
      const nextAddons: RestaurantAddons = {
        ...latestAddons,
        [keySnapshot]: {
          ...currentExisting,
          ...check.draftSnapshot,
          configured: true,
          enabled: Boolean(draftCopy.enabled),
        },
      };
      persistAddons(nextAddons);
      showToast('تم حفظ التغيرات');
    }, 150);

    return () => {
      if (addonEditSyncTimerRef.current !== null) {
        window.clearTimeout(addonEditSyncTimerRef.current);
      }
    };
  }, [editingAddonKey, addonEditIntent, addonDraft]);

  const handleSaveAddonEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAddonKey || addonSaving) return;
    const meta = getContextualAddonCatalog(terms.isStore).find((a) => a.key === editingAddonKey);
    const keySnapshot = editingAddonKey;
    const latestAddons = addonsStateRef.current;
    const currentExisting = (latestAddons[keySnapshot] || {}) as Record<string, any>;
    const shouldEnable =
      addonEditIntent === 'enable' ? true : Boolean(addonDraft.enabled);

    const check = validateAndBuildAddonSnapshot(keySnapshot, addonDraft, shouldEnable);
    if (!check.ok) {
      setAddonEditError(check.error);
      return;
    }

    if (addonEditSyncTimerRef.current !== null) {
      window.clearTimeout(addonEditSyncTimerRef.current);
      addonEditSyncTimerRef.current = null;
    }

    setAddonEditError('');
    setAddonSaving(true);
    try {
      const nextAddons: RestaurantAddons = {
        ...latestAddons,
        [keySnapshot]: {
          ...currentExisting,
          ...check.draftSnapshot,
          configured: true,
          enabled: shouldEnable,
        },
      };
      persistAddons(nextAddons);
      setEditingAddonKey(null);
      setAddonEditIntent('edit');
      const addonTitle = meta?.title || 'الإضافة';
      showToast(shouldEnable ? `تم تفعيل "${addonTitle}"` : `تم إيقاف "${addonTitle}"`);
    } finally {
      setAddonSaving(false);
    }
  };

  const mediaLibraryItems: MediaLibraryItem[] = useMemo(() => {
    const familyMap = new Map<string, Restaurant>();
    const mainRestCandidate = getItem<Restaurant>(`restaurants/${mainRid}`);
    if (mainRestCandidate) familyMap.set(mainRestCandidate.id, mainRestCandidate);
    branchesList.forEach((b) => familyMap.set(b.id, b));
    if (rest && rest.id) familyMap.set(rest.id, rest);

    const familyRests = Array.from(familyMap.values());
    const familyRids = new Set<string>(familyRests.map((r) => r.id));
    familyRids.add(mainRid);
    familyRids.add(rid);

    const hasInitializedFamilyMedia = familyRests.some((r) => Array.isArray(r.mediaLibrary));
    const byUrl = new Map<string, MediaLibraryItem>();

    // Read main restaurant library first, then branches, keeping the highest createdAt timestamp
    const orderedSources: Restaurant[] = [];
    const mainRec = familyMap.get(mainRid);
    if (mainRec) orderedSources.push(mainRec);
    familyRests.forEach((r) => {
      if (r.id !== mainRid) orderedSources.push(r);
    });

    orderedSources.forEach((r) => {
      if (!Array.isArray(r.mediaLibrary)) return;
      r.mediaLibrary.forEach((entry) => {
        const cleanUrl = String(entry?.url || '').trim();
        if (!cleanUrl) return;
        const entryTs = Number(entry?.createdAt) || 0;
        const prev = byUrl.get(cleanUrl);
        if (!prev || entryTs > (Number(prev.createdAt) || 0)) {
          byUrl.set(cleanUrl, {
            id: entry?.id || 'media_' + uid(),
            name: entry?.name || prev?.name || 'صورة',
            url: cleanUrl,
            createdAt: entryTs || Number(prev?.createdAt) || 0,
          });
        }
      });
    });

    if (!hasInitializedFamilyMedia) {
      const defaultsSet = new Set<string>([
        DEFAULT_MEDIA_ASSETS.restaurant.logo,
        DEFAULT_MEDIA_ASSETS.store.logo,
        DEFAULT_MEDIA_ASSETS.store.banner,
      ]);
      getCollection<Category>('cats').forEach((c) => {
        if (!familyRids.has(c.rid)) return;
        const url = String(c.img || '').trim();
        if (url && !defaultsSet.has(url) && !byUrl.has(url)) {
          byUrl.set(url, { id: `media_cat_${c.id}`, name: c.n || 'صورة قسم', url, createdAt: 0 });
        }
      });
      getCollection<MenuItem>('items').forEach((it) => {
        if (!familyRids.has(it.rid)) return;
        const url = String(it.img || '').trim();
        if (url && !defaultsSet.has(url) && !byUrl.has(url)) {
          byUrl.set(url, { id: `media_item_${it.id}`, name: it.n || 'صورة صنف', url, createdAt: 0 });
        }
      });
    }

    return Array.from(byUrl.values()).sort(
      (a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)
    );
  }, [rest, mainRid, rid, branchesList, dbRev]);

  const appendToMediaLibrary = (entries: MediaLibraryItem[]) => {
    if (entries.length === 0) return;
    const now = Date.now();
    const byUrl = new Map<string, MediaLibraryItem>();

    // Seed with existing shared family items first
    mediaLibraryItems.forEach((m) => {
      const cleanUrl = String(m.url || '').trim();
      if (!cleanUrl) return;
      byUrl.set(cleanUrl, {
        ...m,
        url: cleanUrl,
        createdAt: Number(m.createdAt) || 0,
      });
    });

    // Apply newly uploaded items with fresh descending timestamps so newest are always on top
    entries.forEach((entry, idx) => {
      const cleanUrl = String(entry?.url || '').trim();
      if (!cleanUrl) return;
      const ts = Math.max(Number(entry?.createdAt) || 0, now + idx);
      byUrl.set(cleanUrl, {
        id: entry?.id || 'media_' + uid(),
        name: entry?.name || 'image.jpg',
        url: cleanUrl,
        createdAt: ts,
      });
    });

    const nextList = Array.from(byUrl.values()).sort(
      (a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)
    );

    const putBatch: Record<string, unknown> = {};
    const targetIds = new Set<string>([mainRid, rid, ...branchesList.map((b) => b.id)]);
    targetIds.forEach((targetId) => {
      const targetRec =
        getItem<Restaurant>(`restaurants/${targetId}`) || (targetId === rid ? rest : undefined);
      if (targetRec) {
        putBatch[`restaurants/${targetId}`] = {
          ...targetRec,
          mediaLibrary: nextList,
        };
      }
    });

    void putManyAndSync(putBatch).then(() => {
      onRefresh();
    });
    onRefresh();
  };

  const uploadImagesToLibrary = async (files: FileList): Promise<MediaLibraryItem[]> => {
    const added: MediaLibraryItem[] = [];
    let prevTs = Date.now();
    for (const file of Array.from(files)) {
      try {
        const uploadedUrl = await uploadCompressedImageToUrl(file, 'item');
        const ts = Math.max(Date.now(), prevTs + 1);
        prevTs = ts;
        added.push({
          id: 'media_' + uid(),
          name: file.name || 'image.jpg',
          url: uploadedUrl,
          createdAt: ts,
        });
      } catch {
        // skip unreadable file
      }
    }
    if (added.length > 0) {
      appendToMediaLibrary(added);
      showToast('تم تطبيق التغيرات');
    } else {
      showToast('تعذر قراءة الصورة، جرب صورة أخرى');
    }
    return added;
  };

  const removeMediaLibraryItem = (mediaId: string) => {
    const targetItem = mediaLibraryItems.find((m) => m.id === mediaId);
    const deletedUrl = String(targetItem?.url || '').trim();
    const nextList = mediaLibraryItems.filter(
      (m) => m.id !== mediaId && (!deletedUrl || m.url !== deletedUrl)
    );

    const putBatch: Record<string, unknown> = {};
    const allRests = getCollection<Restaurant>('restaurants');
    const relatedRests = allRests.filter(
      (r) => r.id === rid || r.id === mainRid || r.parentRid === mainRid
    );
    const relatedRids = new Set(relatedRests.map((r) => r.id));
    relatedRids.add(rid);
    relatedRids.add(mainRid);

    for (const r of relatedRests) {
      let changed = r.id === rid || r.id === mainRid || Array.isArray(r.mediaLibrary);
      const rMedia = nextList;

      let nextLogo = r.logo;
      if (deletedUrl && r.logo === deletedUrl) {
        nextLogo = '';
        changed = true;
      }
      let nextAboutImage = r.aboutImage;
      if (deletedUrl && r.aboutImage === deletedUrl) {
        nextAboutImage = '';
        changed = true;
      }
      let nextCovers = r.coverImages;
      if (deletedUrl && Array.isArray(r.coverImages) && r.coverImages.includes(deletedUrl)) {
        nextCovers = r.coverImages.filter((c) => c !== deletedUrl);
        changed = true;
      }
      let nextOfferPopup = r.offerPopup;
      if (deletedUrl && r.offerPopup?.image === deletedUrl) {
        nextOfferPopup = { ...r.offerPopup, image: '' };
        changed = true;
      }
      let nextAddons = r.addons;
      if (deletedUrl && r.addons?.offerPopup?.image === deletedUrl) {
        nextAddons = {
          ...r.addons,
          offerPopup: { ...r.addons.offerPopup, image: '' },
        };
        changed = true;
      }

      if (changed) {
        putBatch[`restaurants/${r.id}`] = {
          ...r,
          mediaLibrary: rMedia,
          logo: nextLogo,
          aboutImage: nextAboutImage,
          coverImages: nextCovers,
          offerPopup: nextOfferPopup,
          addons: nextAddons,
        };
      }
    }

    if (deletedUrl) {
      getCollection<Category>('cats').forEach((cat) => {
        if (relatedRids.has(cat.rid) && cat.img === deletedUrl) {
          putBatch[`cats/${cat.id}`] = { ...cat, img: '' };
        }
      });
      getCollection<MenuItem>('items').forEach((it) => {
        if (relatedRids.has(it.rid) && it.img === deletedUrl) {
          putBatch[`items/${it.id}`] = { ...it, img: '' };
        }
      });

      if (logoUrlInput === deletedUrl) setLogoUrlInput('');
      if (coverUrlInput === deletedUrl) setCoverUrlInput('');
      if (catImageInput === deletedUrl) setCatImageInput('');
      if (formImage === deletedUrl) setFormImage('');
      if (addonDraft?.image === deletedUrl) {
        setAddonDraft((prev) => ({ ...prev, image: '' }));
      }
      if (addonsState.offerPopup?.image === deletedUrl) {
        setAddonsState((prev) => ({
          ...prev,
          offerPopup: prev.offerPopup ? { ...prev.offerPopup, image: '' } : prev.offerPopup,
        }));
      }
    }

    const latestRest = getItem<Restaurant>(`restaurants/${rid}`) || rest;
    if (!putBatch[`restaurants/${rid}`]) {
      putBatch[`restaurants/${rid}`] = {
        ...latestRest,
        mediaLibrary: nextList,
      };
    }

    void putManyAndSync(putBatch).then(() => {
      onRefresh();
    });
    if (deletedUrl) {
      void fetch('/api/dashboard/media/delete-file', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url: deletedUrl }),
      }).catch(() => {});
    }
    onRefresh();
    showToast('تم حذف الصورة نهائياً من كل الملفات وقاعدة البيانات');
  };

  const handleDeviceImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    onResult: (dataUrl: string) => void,
    _successLabel = 'تم تطبيق التغيرات',
    variant: 'logo' | 'banner' | 'item' = 'item'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const uploadedUrl = await uploadCompressedImageToUrl(file, variant);
      appendToMediaLibrary([
        {
          id: 'media_' + uid(),
          name: file.name || 'image.jpg',
          url: uploadedUrl,
          createdAt: Date.now(),
        },
      ]);
      onResult(uploadedUrl);
      showToast('تم تطبيق التغيرات');
    } catch {
      showToast('تعذر قراءة الصورة، جرب صورة أخرى');
    }
  };

  const handleReorderCategories = (nextOrderedIds: string[]) => {
    const byId = new Map<string, Category>(allCategories.map((c) => [c.id, c]));
    nextOrderedIds.forEach((catId, index) => {
      const cat = byId.get(catId);
      if (cat && (cat.o ?? -1) !== index) {
        putItem<Category>(`cats/${cat.id}`, { ...cat, o: index });
      }
    });
    onRefresh();
    showToast('تم تطبيق التغيرات');
  };

  const handleToggleCategoryVisibility = (cat: Category) => {
    const currentlyPaused = isEntityManuallyPaused(cat);
    if (currentlyPaused) {
      const nextCat: Category = {
        ...cat,
        published: true,
      };
      delete nextCat.manualPause;
      putItem<Category>(`cats/${cat.id}`, nextCat);
      onRefresh();
      showToast('تم تفعيل القسم وإظهاره');
      return;
    }
    setPauseModalTarget({ kind: 'category', id: cat.id, name: cat.n });
  };

  const handleSaveCategorySchedule = (cat: Category, schedule: AvailabilitySchedule) => {
    putItem<Category>(`cats/${cat.id}`, {
      ...cat,
      availabilitySchedule: sanitizeAvailabilityScheduleForSave(schedule),
    });
    onRefresh();
    showToast('تم تطبيق التغيرات');
  };

  const handleToggleItemVisibility = (item: MenuItem) => {
    const currentlyPaused = isEntityManuallyPaused(item);
    if (currentlyPaused) {
      const nextItem: MenuItem = {
        ...item,
        published: true,
        available: true,
      };
      delete nextItem.manualPause;
      putItem<MenuItem>(`items/${item.id}`, nextItem);
      onRefresh();
      showToast(terms.isStore ? 'تم تفعيل المنتج وإظهاره' : 'تم تفعيل العنصر وإظهاره');
      return;
    }
    setPauseModalTarget({ kind: 'item', id: item.id, name: item.n });
  };

  const handleConfirmManualPause = (
    preset: ManualPauseDurationPreset,
    behavior: ManualPauseBehavior
  ) => {
    const target = pauseModalTarget;
    if (!target) return;

    const until = computePauseUntil(preset);
    const manualPause: ManualPauseConfig = {
      paused: true,
      behavior,
      preset,
      until,
      createdAt: Date.now(),
    };
    const isPermanentHide = behavior === 'hide' && until === null;

    if (target.kind === 'category') {
      const cat = allCategories.find((c) => c.id === target.id);
      if (cat) {
        putItem<Category>(`cats/${cat.id}`, {
          ...cat,
          published: isPermanentHide ? false : true,
          manualPause,
        });
      }
    } else {
      const item = allItems.find((i) => i.id === target.id);
      if (item) {
        putItem<MenuItem>(`items/${item.id}`, {
          ...item,
          published: isPermanentHide ? false : true,
          available: isPermanentHide ? false : true,
          manualPause,
        });
      }
    }

    setPauseModalTarget(null);
    onRefresh();
    showToast(
      behavior === 'badge'
        ? 'تم الإطفاء مع ظهور علامة غير متوفر'
        : 'تم الإطفاء والإخفاء عن الزبائن'
    );
  };

  const handleReorderItems = (nextOrderedSubsetIds: string[]) => {
    if (nextOrderedSubsetIds.length === 0) return;
    const byId = new Map<string, MenuItem>(allItems.map((it) => [it.id, it]));
    const subsetSet = new Set(nextOrderedSubsetIds);
    const reorderedSubset = nextOrderedSubsetIds
      .map((id) => byId.get(id))
      .filter((it): it is MenuItem => Boolean(it));

    let subPtr = 0;
    const finalItems = allItems.map((it) =>
      subsetSet.has(it.id) && subPtr < reorderedSubset.length ? reorderedSubset[subPtr++] : it
    );

    finalItems.forEach((it, index) => {
      if ((it.o ?? -1) !== index) {
        putItem<MenuItem>(`items/${it.id}`, { ...it, o: index });
      }
    });
    onRefresh();
    showToast('تم تطبيق التغيرات');
  };

  const handleSaveItemSchedule = (item: MenuItem, schedule: AvailabilitySchedule) => {
    putItem<MenuItem>(`items/${item.id}`, {
      ...item,
      availabilitySchedule: sanitizeAvailabilityScheduleForSave(schedule),
    });
    onRefresh();
    showToast('تم تطبيق التغيرات');
  };

  const openNewCategoryModal = () => {
    if (resolvedPlan.maxCats !== -1 && allCategories.length >= resolvedPlan.maxCats) {
      showToast(`وصلت للحد الأقصى للأقسام في باقتك (${resolvedPlan.maxCats} أقسام). يمكنك الترقية لباقة أعلى.`);
      return;
    }
    setEditingCatId(null);
    setCatNameInput('');
    setCatSubtitleInput('');
    setCatEmojiInput('');
    setCatImageInput('');
    setCatPublishedInput(true);
    setCatScheduleInput(normalizeAvailabilitySchedule(DEFAULT_AVAILABILITY_SCHEDULE));
    setShowCatModal(true);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNameInput.trim()) {
      showToast('يرجى كتابة اسم القسم');
      return;
    }
    const cleanName = catNameInput.trim();
    const isEdit = Boolean(editingCatId);
    if (!isEdit && resolvedPlan.maxCats !== -1 && allCategories.length >= resolvedPlan.maxCats) {
      showToast(`وصلت للحد الأقصى للأقسام في باقتك (${resolvedPlan.maxCats} أقسام)`);
      return;
    }

    const catId = editingCatId || 'cat_' + uid();
    const existing = allCategories.find((c) => c.id === catId);

    putItem<Category>(`cats/${catId}`, {
      ...(existing || {}),
      id: catId,
      rid,
      n: cleanName,
      subtitle: catSubtitleInput.trim() || undefined,
      emoji: catEmojiInput.trim() || undefined,
      img: catImageInput.trim() || undefined,
      date: existing?.date || new Date().toLocaleDateString('ar-IQ-u-nu-latn'),
      published: existing ? existing.published !== false : catPublishedInput,
      availabilitySchedule: sanitizeAvailabilityScheduleForSave(catScheduleInput),
      o: existing ? existing.o : allCategories.length,
    });

    setShowCatModal(false);
    setEditingCatId(null);
    setCatNameInput('');
    setCatSubtitleInput('');
    setCatEmojiInput('');
    setCatImageInput('');
    setCatScheduleInput(normalizeAvailabilitySchedule(DEFAULT_AVAILABILITY_SCHEDULE));
    onRefresh();
    showToast('تم حفظ التغيرات');
  };

  const handleOpenEditCategory = (cat: Category) => {
    const normSched = normalizeAvailabilitySchedule(cat.availabilitySchedule);
    hydratedCatEditSigRef.current = JSON.stringify({
      n: cat.n,
      subtitle: cat.subtitle || '',
      emoji: cat.emoji || '',
      img: cat.img || '',
      sched: normSched,
    });
    setEditingCatId(cat.id);
    setCatNameInput(cat.n);
    setCatSubtitleInput(cat.subtitle || '');
    setCatEmojiInput(cat.emoji || '');
    setCatImageInput(cat.img || '');
    setCatPublishedInput(cat.published !== false);
    setCatScheduleInput(normSched);
    setShowCatModal(true);
  };

  useEffect(() => {
    if (!showCatModal || !editingCatId) return;
    const cleanName = catNameInput.trim();
    if (!cleanName) return;
    const sig = JSON.stringify({
      n: catNameInput,
      subtitle: catSubtitleInput,
      emoji: catEmojiInput,
      img: catImageInput,
      sched: catScheduleInput,
    });
    if (sig === hydratedCatEditSigRef.current) return;

    if (catEditSyncTimerRef.current !== null) {
      window.clearTimeout(catEditSyncTimerRef.current);
    }
    const targetCatId = editingCatId;
    catEditSyncTimerRef.current = window.setTimeout(() => {
      catEditSyncTimerRef.current = null;
      hydratedCatEditSigRef.current = sig;
      const existing = allCategories.find((c) => c.id === targetCatId);
      putItem<Category>(`cats/${targetCatId}`, {
        ...(existing || {}),
        id: targetCatId,
        rid,
        n: cleanName,
        subtitle: catSubtitleInput.trim() || undefined,
        emoji: catEmojiInput.trim() || undefined,
        img: catImageInput.trim() || undefined,
        date: existing?.date || new Date().toLocaleDateString('ar-IQ-u-nu-latn'),
        published: existing ? existing.published !== false : catPublishedInput,
        availabilitySchedule: sanitizeAvailabilityScheduleForSave(catScheduleInput),
        o: existing ? existing.o : allCategories.length,
      });
      onRefresh();
      showToast('تم حفظ التغيرات');
    }, 150);

    return () => {
      if (catEditSyncTimerRef.current !== null) {
        window.clearTimeout(catEditSyncTimerRef.current);
      }
    };
  }, [
    showCatModal,
    editingCatId,
    catNameInput,
    catSubtitleInput,
    catEmojiInput,
    catImageInput,
    catScheduleInput,
  ]);

  const handleDeleteCategory = (cat: Category) => {
    triggerAjaxConfirm(
      'تأكيد حذف القسم',
      `هل أنت متأكد من حذف القسم "${cat.n}"؟ لا يمكن التراجع عن هذا الإجراء.`,
      'danger',
      'تأكيد الحذف',
      () => {
        deleteItem(`cats/${cat.id}`);
        onRefresh();
      },
      'تم الحذف بنجاح'
    );
  };

  const openNewItemEditor = () => {
    if (resolvedPlan.maxItems !== -1 && allItems.length >= resolvedPlan.maxItems) {
      showToast(`وصلت للحد الأقصى للعناصر في باقتك (${resolvedPlan.maxItems} عنصر). يمكنك الترقية لباقة أعلى.`);
      return;
    }
    setEditingItemId(null);
    setItemEditorTab('info');
    setFormName('');
    setFormCat(allCategories[0]?.id || '');
    setFormPrice('');
    setFormBeforePrice('');
    setFormDesc('');
    setFormImage('');
    setFormPrepTime('');
    setFormBadgeText('');
    setFormBadgeType('accent');
    setFormAllergens('');
    setFormPublished(true);
    setFormDineInOnly(false);
    setFormNoDelivery(false);
    setFormNoPickup(false);
    setFormSchedule(normalizeAvailabilitySchedule(DEFAULT_AVAILABILITY_SCHEDULE));
    setHasVariableSizes(false);
    setFormSizes(
      terms.isStore
        ? [
            { n: '128GB', p: '' },
            { n: '256GB', p: '' },
          ]
        : [
            { n: 'سنجل', p: '' },
            { n: 'دبل', p: '' },
          ]
    );
    setHasExtras(false);
    setFormExtras([{ n: '', p: '' }]);
    setHasChoices(false);
    setFormMaxChoices(1);
    setFormChoices(['']);
    setIsItemEditorOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openBatchModal = () => {
    if (resolvedPlan.maxItems !== -1 && allItems.length >= resolvedPlan.maxItems) {
      showToast(`وصلت للحد الأقصى للعناصر في باقتك (${resolvedPlan.maxItems} عنصر)`);
      return;
    }
    setShowBatchModal(true);
  };

  const buildItemPayloadFromForm = (targetItemId: string): MenuItem | null => {
    if (!formName.trim()) return null;
    const cleanSizes = hasVariableSizes
      ? formSizes
          .map((s) => ({ n: s.n.trim(), p: Number(s.p) || 0 }))
          .filter((s) => s.n)
      : [];
    if (hasVariableSizes && cleanSizes.length === 0) return null;
    if (!hasVariableSizes && formPrice === '') return null;

    const cleanExtras = hasExtras
      ? formExtras
          .map((ex) => ({ n: ex.n.trim(), p: Number(ex.p) || 0 }))
          .filter((ex) => ex.n)
      : [];
    const cleanChoices = hasChoices
      ? formChoices.map((ch) => ch.trim()).filter(Boolean)
      : [];
    const computedBasePrice = hasVariableSizes
      ? Math.min(...cleanSizes.map((s) => s.p))
      : Number(formPrice) || 0;
    const catToUse = formCat || allCategories[0]?.id || 'default_cat';
    const existing = allItems.find((i) => i.id === targetItemId);
    const wasPaused = existing ? isEntityManuallyPaused(existing) : false;
    let nextPublished = formPublished;
    let nextAvailable = formPublished;
    let nextManualPause: ManualPauseConfig | undefined = existing?.manualPause;

    if (formPublished) {
      nextPublished = true;
      nextAvailable = true;
      nextManualPause = undefined;
    } else if (wasPaused && existing) {
      nextPublished = existing.published !== false;
      nextAvailable = existing.available !== false;
      nextManualPause = existing.manualPause;
    } else {
      nextPublished = false;
      nextAvailable = false;
      nextManualPause = {
        paused: true,
        behavior: 'hide',
        preset: 'permanent',
        until: null,
        createdAt: Date.now(),
      };
    }

    return {
      ...(existing || {}),
      id: targetItemId,
      rid,
      cat: catToUse,
      n: formName.trim(),
      pr: computedBasePrice,
      beforePrice: resolvedPlan.perms.itemDiscounts && formBeforePrice ? Number(formBeforePrice) : undefined,
      d: formDesc.trim(),
      img:
        formImage.trim() ||
        (terms.isStore
          ? allCategories.find((c) => c.id === catToUse)?.img || ESTORE_HERO_PROMO_IMG
          : 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80'),
      sizes: cleanSizes.length > 0 ? cleanSizes : [],
      extras: cleanExtras.length > 0 ? cleanExtras : [],
      choices: cleanChoices.length > 0 ? cleanChoices : [],
      maxChoices: cleanChoices.length > 0 ? Math.max(1, Number(formMaxChoices) || 1) : undefined,
      allergens: formAllergens.trim() || undefined,
      available: nextAvailable,
      published: nextPublished,
      manualPause: nextManualPause,
      availabilitySchedule: sanitizeAvailabilityScheduleForSave(formSchedule),
      dineInOnly: formDineInOnly || undefined,
      noDelivery: formDineInOnly ? undefined : formNoDelivery || undefined,
      noPickup: formDineInOnly ? undefined : formNoPickup || undefined,
      prepTime: !terms.isStore && formPrepTime ? `${formPrepTime} دقيقة` : undefined,
      badges: formBadgeText.trim() ? [{ type: formBadgeType, text: formBadgeText.trim() }] : [],
      date: existing?.date || new Date().toLocaleDateString('ar-IQ-u-nu-latn'),
      o: existing ? existing.o : allItems.length,
    };
  };

  const handleSaveItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!resolvedPlan.perms.priceProductControl) {
      showToast('التحكم بالأسعار والمنتجات غير مفعل في باقتك الحالية');
      return;
    }
    if (!editingItemId && resolvedPlan.maxItems !== -1 && allItems.length >= resolvedPlan.maxItems) {
      showToast(`وصلت للحد الأقصى ${terms.isStore ? 'للمنتجات' : 'للعناصر'} في باقتك (${resolvedPlan.maxItems})`);
      return;
    }
    if (!formName.trim()) {
      setItemEditorTab('info');
      showToast(`يرجى إدخال اسم ${terms.isStore ? 'المنتج' : 'العنصر'} أولاً`);
      return;
    }

    const cleanSizes = hasVariableSizes
      ? formSizes
          .map((s) => ({ n: s.n.trim(), p: Number(s.p) || 0 }))
          .filter((s) => s.n)
      : [];

    if (hasVariableSizes && cleanSizes.length === 0) {
      setItemEditorTab('info');
      showToast('يرجى إضافة حجم واحد على الأقل مع السعر، أو إطفاء خيار الأسعار المتغيرة');
      return;
    }

    if (!hasVariableSizes && formPrice === '') {
      setItemEditorTab('info');
      showToast('يرجى إدخال سعر العنصر');
      return;
    }

    if (itemEditSyncTimerRef.current !== null) {
      window.clearTimeout(itemEditSyncTimerRef.current);
      itemEditSyncTimerRef.current = null;
    }

    const itemId = editingItemId || 'item_' + uid();
    const itemPayload = buildItemPayloadFromForm(itemId);
    if (!itemPayload) return;

    putItem<MenuItem>(`items/${itemId}`, itemPayload);
    setIsItemEditorOpen(false);
    setEditingItemId(null);
    onRefresh();
    showToast('تم حفظ التغيرات');
  };

  const handleQuickUpdateItemPrice = (item: MenuItem, rawPrice: number): boolean => {
    if (!resolvedPlan.perms.priceProductControl) {
      showToast('التحكم بالأسعار والمنتجات غير مفعل في باقتك الحالية');
      return false;
    }
    if (!Number.isFinite(rawPrice) || rawPrice < 0) {
      showToast('يرجى إدخال سعر صحيح (0 أو أكبر)');
      return false;
    }
    const cleanPrice = Math.max(0, Math.round(rawPrice));
    const nextSizes =
      Array.isArray(item.sizes) && item.sizes.length > 0
        ? (() => {
            const minSizePrice = Math.min(...item.sizes.map((s) => Number(s.p) || 0));
            let updatedOnce = false;
            return item.sizes.map((s) => {
              if (!updatedOnce && (Number(s.p) || 0) === minSizePrice) {
                updatedOnce = true;
                return { ...s, p: cleanPrice };
              }
              return s;
            });
          })()
        : item.sizes;

    putItem<MenuItem>(`items/${item.id}`, {
      ...item,
      pr: cleanPrice,
      ...(nextSizes ? { sizes: nextSizes } : {}),
    });
    onRefresh();
    showToast('تم تطبيق التغيرات');
    return true;
  };

  const handleDeleteItem = (item: MenuItem) => {
    triggerAjaxConfirm(
      terms.isStore ? 'تأكيد حذف المنتج' : 'تأكيد حذف العنصر',
      terms.isStore
        ? `هل أنت متأكد من حذف المنتج "${item.n}" نهائياً من المتجر؟`
        : `هل أنت متأكد من حذف العنصر "${item.n}" نهائياً من القائمة؟`,
      'danger',
      'تأكيد الحذف',
      () => {
        deleteItem(`items/${item.id}`);
        onRefresh();
      },
      'تم الحذف بنجاح'
    );
  };

  const handleBatchAddItems = () => {
    const lines = batchLinesInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      showToast('يرجى إدخال سطر واحد على الأقل بصيغة: الاسم - السعر');
      return;
    }
    if (resolvedPlan.maxItems !== -1 && allItems.length + lines.length > resolvedPlan.maxItems) {
      const remaining = Math.max(0, resolvedPlan.maxItems - allItems.length);
      showToast(`يتجاوز العدد المتاح في باقتك (${remaining} متبقي من أصل ${resolvedPlan.maxItems})`);
      return;
    }
    const targetCat = allCategories[0]?.id || 'default_cat';
    triggerAjaxConfirm(
      terms.isStore ? 'إضافة مجموعة منتجات' : 'إضافة مجموعة عناصر',
      terms.isStore
        ? `هل أنت متأكد من إضافة ${lines.length} منتج إلى المتجر دفعة واحدة؟`
        : `هل أنت متأكد من إضافة ${lines.length} عنصر إلى المنيو دفعة واحدة؟`,
      'info',
      'تأكيد الإضافة',
      () => {
        lines.forEach((line, idx) => {
          const parts = line.split(/[-–|,]/).map((s) => s.trim());
          const name = parts[0] || `${terms.isStore ? 'منتج' : 'طبق'} ${idx + 1}`;
          const priceNum = Number(String(parts[1] || '5000').replace(/\D/g, '')) || 5000;
          const desc = parts[2] || '';
          const itemId = 'item_' + uid();
          putItem<MenuItem>(`items/${itemId}`, {
            id: itemId,
            rid,
            cat: targetCat,
            n: name,
            pr: priceNum,
            d: desc,
            available: true,
            published: true,
            o: allItems.length + idx,
          });
        });
        setBatchLinesInput('');
        setShowBatchModal(false);
        onRefresh();
      },
      `تمت إضافة ${lines.length} ${terms.isStore ? 'منتج' : 'عنصر'} بنجاح`
    );
  };

  const handleEditItem = (item: MenuItem) => {
    const existingSizes = (item.sizes || [])
      .map((s: any) => ({
        n: String(s?.n || s?.label || s?.name || '').trim(),
        p: Number(s?.p ?? s?.pr ?? s?.price ?? 0) as number | '',
      }))
      .filter((s) => s.n);

    const existingExtras = (item.extras || [])
      .map((ex: any) => ({
        n: String(ex?.n || ex?.label || ex?.name || '').trim(),
        p: Number(ex?.p ?? ex?.pr ?? ex?.price ?? 0) as number | '',
      }))
      .filter((ex) => ex.n);

    const existingChoices = (item.choices || [])
      .map((ch: any) => (typeof ch === 'string' ? ch.trim() : String(ch?.n || ch?.label || ch?.name || '').trim()))
      .filter(Boolean);

    const normSched = normalizeAvailabilitySchedule(item.availabilitySchedule);
    const nextHasSizes = existingSizes.length > 0;
    const nextSizes =
      existingSizes.length > 0
        ? existingSizes
        : terms.isStore
        ? [
            { n: '128GB', p: '' as number | '' },
            { n: '256GB', p: '' as number | '' },
          ]
        : [
            { n: 'سنجل', p: '' as number | '' },
            { n: 'دبل', p: '' as number | '' },
          ];
    const nextHasExtras = existingExtras.length > 0;
    const nextExtras = existingExtras.length > 0 ? existingExtras : [{ n: '', p: '' as number | '' }];
    const nextHasChoices = existingChoices.length > 0;
    const nextChoices = existingChoices.length > 0 ? existingChoices : [''];
    const nextMaxChoices = Math.max(1, Number(item.maxChoices) || 1);
    const nextPrep = !terms.isStore && item.prepTime ? String(item.prepTime).replace(/\D/g, '') : '';
    const nextBadgeText = item.badges?.[0]?.text || '';
    const nextBadgeType = (item.badges?.[0]?.type as 'red' | 'gold' | 'green' | 'accent') || 'accent';
    const nextAllergens = Array.isArray(item.allergens) ? item.allergens.join('، ') : item.allergens || '';
    const nextPub = !isEntityManuallyPaused(item);

    hydratedItemEditSigRef.current = JSON.stringify({
      cat: item.cat,
      n: item.n,
      pr: item.pr,
      beforePrice: item.beforePrice || '',
      d: item.d || '',
      img: item.img || '',
      prep: nextPrep,
      badgeText: nextBadgeText,
      badgeType: nextBadgeType,
      allergens: nextAllergens,
      pub: nextPub,
      dineInOnly: Boolean(item.dineInOnly),
      noDelivery: Boolean(item.noDelivery),
      noPickup: Boolean(item.noPickup),
      sched: normSched,
      hasSizes: nextHasSizes,
      sizes: nextSizes,
      hasExtras: nextHasExtras,
      extras: nextExtras,
      hasChoices: nextHasChoices,
      maxChoices: nextMaxChoices,
      choices: nextChoices,
    });

    setEditingItemId(item.id);
    setItemEditorTab('info');
    setFormName(item.n);
    setFormCat(item.cat);
    setFormPrice(item.pr);
    setFormBeforePrice(item.beforePrice || '');
    setFormDesc(item.d || '');
    setFormImage(item.img || '');
    setFormPrepTime(nextPrep);
    setFormBadgeText(nextBadgeText);
    setFormBadgeType(nextBadgeType);
    setFormAllergens(nextAllergens);
    setFormPublished(nextPub);
    setFormDineInOnly(Boolean(item.dineInOnly));
    setFormNoDelivery(Boolean(item.noDelivery));
    setFormNoPickup(Boolean(item.noPickup));
    setFormSchedule(normSched);

    setHasVariableSizes(nextHasSizes);
    setFormSizes(nextSizes);

    setHasExtras(nextHasExtras);
    setFormExtras(nextExtras);

    setHasChoices(nextHasChoices);
    setFormMaxChoices(nextMaxChoices);
    setFormChoices(nextChoices);

    setIsItemEditorOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!isItemEditorOpen || !editingItemId) return;
    if (!resolvedPlan.perms.priceProductControl) return;
    const sig = JSON.stringify({
      cat: formCat,
      n: formName,
      pr: formPrice,
      beforePrice: formBeforePrice,
      d: formDesc,
      img: formImage,
      prep: formPrepTime,
      badgeText: formBadgeText,
      badgeType: formBadgeType,
      allergens: formAllergens,
      pub: formPublished,
      dineInOnly: formDineInOnly,
      noDelivery: formNoDelivery,
      noPickup: formNoPickup,
      sched: formSchedule,
      hasSizes: hasVariableSizes,
      sizes: formSizes,
      hasExtras,
      extras: formExtras,
      hasChoices,
      maxChoices: formMaxChoices,
      choices: formChoices,
    });
    if (sig === hydratedItemEditSigRef.current) return;

    const targetItemId = editingItemId;
    if (itemEditSyncTimerRef.current !== null) {
      window.clearTimeout(itemEditSyncTimerRef.current);
    }
    itemEditSyncTimerRef.current = window.setTimeout(() => {
      itemEditSyncTimerRef.current = null;
      const payload = buildItemPayloadFromForm(targetItemId);
      if (!payload) return;
      hydratedItemEditSigRef.current = sig;
      putItem<MenuItem>(`items/${targetItemId}`, payload);
      onRefresh();
      showToast('تم حفظ التغيرات');
    }, 150);

    return () => {
      if (itemEditSyncTimerRef.current !== null) {
        window.clearTimeout(itemEditSyncTimerRef.current);
      }
    };
  }, [
    isItemEditorOpen,
    editingItemId,
    formCat,
    formName,
    formPrice,
    formBeforePrice,
    formDesc,
    formImage,
    formPrepTime,
    formBadgeText,
    formBadgeType,
    formAllergens,
    formPublished,
    formDineInOnly,
    formNoDelivery,
    formNoPickup,
    formSchedule,
    hasVariableSizes,
    formSizes,
    hasExtras,
    formExtras,
    hasChoices,
    formMaxChoices,
    formChoices,
  ]);

  const commitAppearanceDraft = async (
    patch: Partial<{
      lay: MenuLayout;
      themeMode: 'dark' | 'light' | 'auto';
      themePreset: string;
      themeShape: MenuThemeShape;
      color: string;
      bgColor: string;
    }>
  ) => {
    const merged = { ...appearanceDraftRef.current, ...patch };
    appearanceDraftRef.current = merged;
    if (colorSyncTimerRef.current !== null) {
      window.clearTimeout(colorSyncTimerRef.current);
      colorSyncTimerRef.current = null;
    }
    const latestRest = getItem<Restaurant>(`restaurants/${rid}`) || rest;
    const isStore = restProjectType === 'store' || isStoreProject(latestRest.projectType);
    const isCustom = !isStore && merged.themePreset === 'custom' && resolvedPlan.perms.customColors;
    const nextPayload: Restaurant = {
      ...latestRest,
      lay: isStore ? 'grid4' : merged.lay,
      themeMode: isStore ? 'light' : merged.themeMode,
      themePreset: isStore ? 'estore' : merged.themePreset,
      themeShape: isStore ? 'estore' : merged.themeShape,
      color: isStore ? '#f15a29' : merged.color,
      bgColor: isStore ? undefined : isCustom ? (merged.bgColor.trim() || undefined) : undefined,
    };
    syncedRestRef.current = buildRestSignature(ensureRestaurantDefaults(nextPayload), rid);
    await putItemAndSync<Restaurant>(`restaurants/${rid}`, nextPayload);
    onRefresh();
  };

  const flushPendingAppearanceSave = async () => {
    if (colorSyncTimerRef.current !== null) {
      window.clearTimeout(colorSyncTimerRef.current);
      colorSyncTimerRef.current = null;
      await commitAppearanceDraft({});
    }
  };

  useEffect(() => {
    return () => {
      if (colorSyncTimerRef.current !== null) {
        window.clearTimeout(colorSyncTimerRef.current);
        colorSyncTimerRef.current = null;
        const merged = appearanceDraftRef.current;
        const latestRest = getItem<Restaurant>(`restaurants/${rid}`) || rest;
        const isCustom = merged.themePreset === 'custom' && resolvedPlan.perms.customColors;
        putItem<Restaurant>(`restaurants/${rid}`, {
          ...latestRest,
          lay: merged.lay,
          themeMode: merged.themeMode,
          themePreset: merged.themePreset,
          themeShape: merged.themeShape,
          color: merged.color,
          bgColor: isCustom ? (merged.bgColor.trim() || undefined) : undefined,
        });
      }
    };
  }, [rid]);

  const handleInstantLayoutSelect = (
    layId: MenuLayout,
    options?: { forceShape?: MenuThemeShape }
  ) => {
    if (!isLayoutAllowed(layId)) {
      showToast('هذا النمط متاح في الباقات الأعلى 🔒');
      return;
    }
    setSelectedLayout(layId);
    if (options?.forceShape) {
      setMenuThemeShape(options.forceShape);
    }
    void commitAppearanceDraft({
      lay: layId,
      ...(options?.forceShape ? { themeShape: options.forceShape } : {}),
    });
    showToast('تم تطبيق التغيرات');
  };

  const handleSelectThemeMode = (mode: 'dark' | 'light' | 'auto') => {
    if (!resolvedPlan.perms.lightDarkMode) {
      showToast('تغيير المظهر الفاتح/الغامق غير متاح في باقتك الحالية 🔒');
      return;
    }
    const effectiveMode = resolveEffectiveThemeMode(mode);
    const curPreset = appearanceDraftRef.current.themePreset;
    const isCustom = curPreset === 'custom' && resolvedPlan.perms.customColors;
    const allowed = getAllowedThemesForPlan(resolvedPlan);
    const nextPreset = isCustom
      ? 'custom'
      : allowed.some((t) => t.id === curPreset)
      ? curPreset
      : allowed[0]?.id || (effectiveMode === 'light' ? 'clean-light' : 'emerald-dark');
    const chosenTheme = getMenuThemeById(nextPreset === 'custom' ? undefined : nextPreset, effectiveMode);
    const resolvedPreset = isCustom ? 'custom' : chosenTheme.id;
    const resolvedColor = isCustom ? appearanceDraftRef.current.color : chosenTheme.brand;
    const resolvedBg = isCustom ? appearanceDraftRef.current.bgColor : '';
    setMenuThemeMode(mode);
    setMenuThemePreset(resolvedPreset);
    if (!isCustom) {
      setRestColor(resolvedColor);
      setRestBgColor('');
    }
    void commitAppearanceDraft({
      themeMode: mode,
      themePreset: resolvedPreset,
      color: resolvedColor,
      bgColor: resolvedBg,
    });
    showToast('تم تطبيق التغيرات');
  };

  const handleSelectDashboardThemeMode = async (mode: 'dark' | 'light' | 'auto') => {
    setDashboardThemeMode(mode);
    applyTheme(buildThemeForMode(mode, getTheme()), { silent: true });
    const latestRest = getItem<Restaurant>(`restaurants/${rid}`) || rest;
    await putItemAndSync<Restaurant>(`restaurants/${rid}`, {
      ...latestRest,
      dashboardThemeMode: mode,
    });
    onRefresh();
    showToast('تم تطبيق التغيرات');
  };

  const handleSelectMenuTheme = (
    presetId: string,
    options?: { keepCurrentShape?: boolean; forceShape?: MenuThemeShape }
  ) => {
    if (presetId === 'custom') {
      if (!resolvedPlan.perms.customColors) {
        openUpgradeModal('vip');
        return;
      }
      const nextBrand = (appearanceDraftRef.current.color || restColor).trim() || '#10B981';
      const nextBg = (appearanceDraftRef.current.bgColor || restBgColor).trim();
      setMenuThemePreset('custom');
      setRestColor(nextBrand);
      if (options?.forceShape) {
        setMenuThemeShape(options.forceShape);
      }
      void commitAppearanceDraft({
        themePreset: 'custom',
        color: nextBrand,
        bgColor: nextBg,
        ...(options?.forceShape ? { themeShape: options.forceShape } : {}),
      });
      showToast('تم تطبيق التغيرات');
      return;
    }

    const allowed = getAllowedThemesForPlan(resolvedPlan);
    if (!allowed.some((t) => t.id === presetId)) {
      showToast('هذا المظهر متاح في الباقات الأعلى 🔒');
      return;
    }
    const effectiveMode = resolveEffectiveThemeMode(appearanceDraftRef.current.themeMode);
    const chosenTheme = getMenuThemeById(presetId, effectiveMode);
    const themeLabel = chosenTheme.name;
    const nextShape =
      options?.forceShape || (options?.keepCurrentShape ? undefined : getSeasonalPairedShape(chosenTheme.id) || undefined);
    setMenuThemePreset(chosenTheme.id);
    setRestColor(chosenTheme.brand);
    setRestBgColor('');
    if (nextShape) {
      setMenuThemeShape(nextShape);
    }
    void commitAppearanceDraft({
      themePreset: chosenTheme.id,
      color: chosenTheme.brand,
      bgColor: '',
      ...(nextShape ? { themeShape: nextShape } : {}),
    });
    showToast(
      !options?.keepCurrentShape && nextShape === 'toters'
        ? 'تم تفعيل مظهر توترز الكامل (القوائم والصفحات والتصميم) ✓'
        : !options?.keepCurrentShape && nextShape
        ? `تم تفعيل ${themeLabel} بكامل أشكاله وأنيميشنه ✓`
        : 'تم تطبيق التغيرات'
    );
  };

  const handleUpdateCustomColors = (
    nextBrand?: string,
    nextBg?: string,
    forceShape?: MenuThemeShape
  ) => {
    if (!resolvedPlan.perms.customColors) {
      openUpgradeModal('vip');
      return;
    }
    const curDraft = appearanceDraftRef.current;
    const resolvedBrand = (nextBrand !== undefined ? nextBrand : curDraft.color).trim() || '#10B981';
    const resolvedBg = nextBg !== undefined ? nextBg.trim() : curDraft.bgColor.trim();
    appearanceDraftRef.current = {
      ...curDraft,
      themePreset: 'custom',
      color: resolvedBrand,
      bgColor: resolvedBg,
      ...(forceShape ? { themeShape: forceShape } : {}),
    };
    setMenuThemePreset('custom');
    if (forceShape) setMenuThemeShape(forceShape);
    if (nextBrand !== undefined) setRestColor(resolvedBrand);
    if (nextBg !== undefined) setRestBgColor(resolvedBg);
    if (colorSyncTimerRef.current !== null) {
      window.clearTimeout(colorSyncTimerRef.current);
    }
    colorSyncTimerRef.current = window.setTimeout(async () => {
      colorSyncTimerRef.current = null;
      await commitAppearanceDraft({});
      showToast('تم حفظ التغيرات');
    }, 120);
  };

  const handleSelectThemeShape = (shapeId: MenuThemeShape) => {
    const pairedThemeId = getSeasonalPairedTheme(shapeId);
    setMenuThemeShape(shapeId);
    if (pairedThemeId) {
      const isReadySignature =
        shapeId === 'toters' ||
        shapeId === 'theme1' ||
        shapeId === 'theme2' ||
        shapeId === 'theme3' ||
        shapeId === 'theme4' ||
        shapeId === 'theme5';
      const baseTheme = getMenuThemeById(pairedThemeId);
      const targetMode: 'dark' | 'light' | 'auto' = isReadySignature
        ? baseTheme.mode
        : appearanceDraftRef.current.themeMode;
      const effectiveMode = resolveEffectiveThemeMode(targetMode);
      const chosenTheme = getMenuThemeById(pairedThemeId, effectiveMode);
      const shapeTitle = MENU_SHAPES.find((s) => s.id === shapeId)?.name || chosenTheme.name;
      if (isReadySignature) {
        setMenuThemeMode(targetMode);
      }
      setMenuThemePreset(chosenTheme.id);
      setRestColor(chosenTheme.brand);
      setRestBgColor('');
      void commitAppearanceDraft({
        themeShape: shapeId,
        ...(isReadySignature ? { themeMode: targetMode } : {}),
        themePreset: chosenTheme.id,
        color: chosenTheme.brand,
        bgColor: '',
      });
      showToast(
        isReadySignature
          ? `تم تعيين ${shapeTitle} بنجاح ✓`
          : `تم تفعيل ${chosenTheme.name} مع الأشكال والأنيميشن ✓`
      );
      return;
    }
    void commitAppearanceDraft({ themeShape: shapeId });
    showToast('تم تطبيق التغيرات');
  };

  const handleActivateCustomAppearance = () => {
    const curShape = appearanceDraftRef.current.themeShape;
    const isReadyShape =
      curShape === 'toters' ||
      curShape === 'theme1' ||
      curShape === 'theme2' ||
      curShape === 'theme3' ||
      curShape === 'theme4' ||
      curShape === 'theme5';
    const nextShape: MenuThemeShape = isReadyShape ? 'modern' : curShape;
    const curPreset = appearanceDraftRef.current.themePreset;
    const isReadyPreset =
      curPreset === 'toters' ||
      curPreset === 'theme1-enab' ||
      curPreset === 'theme2-urbanbite' ||
      curPreset === 'theme3-menux' ||
      curPreset === 'theme4-kudo' ||
      curPreset === 'theme5-shawarmer';
    const effectiveMode = resolveEffectiveThemeMode(appearanceDraftRef.current.themeMode);
    let nextPreset = curPreset;
    let nextColor = appearanceDraftRef.current.color;
    let nextBg = appearanceDraftRef.current.bgColor;
    if (isReadyPreset) {
      const fallbackTheme = getMenuThemeById(
        effectiveMode === 'dark' ? 'emerald-dark' : 'clean-light',
        effectiveMode
      );
      nextPreset = fallbackTheme.id;
      nextColor = fallbackTheme.brand;
      nextBg = '';
      setMenuThemePreset(nextPreset);
      setRestColor(nextColor);
      setRestBgColor('');
    }
    setMenuThemeShape(nextShape);
    void commitAppearanceDraft({
      themeShape: nextShape,
      themePreset: nextPreset,
      color: nextColor,
      bgColor: nextBg,
    });
    showToast('تم تفعيل المظهر المخصص ✓');
  };

  const handleSaveAppearance = async () => {
    if (appearanceSaving) return;
    setAppearanceSaving(true);
    try {
      await commitAppearanceDraft({});
      onRefresh();
      showToast('تم تطبيق التغيرات');
    } finally {
      setAppearanceSaving(false);
    }
  };

  const handleUpdateQrDesign = async (patch: Partial<NonNullable<Restaurant['qrDesign']>>) => {
    const latestRest = getItem<Restaurant>(`restaurants/${rid}`) || rest;
    const nextQrDesign = { ...(latestRest.qrDesign || {}), ...patch };
    await putItemAndSync<Restaurant>(`restaurants/${rid}`, {
      ...latestRest,
      qrDesign: nextQrDesign,
    });
    onRefresh();
  };

  const handleCurrencyChange = (nextCurrency: string) => {
    setRestCurrency(nextCurrency);
    const latestRest = getItem<Restaurant>(`restaurants/${rid}`) || rest;
    putItem<Restaurant>(`restaurants/${rid}`, {
      ...latestRest,
      currency: nextCurrency,
    });
    onRefresh();
    showToast('تم تطبيق التغيرات');
  };

  const applyTimeToOpenDays = (fromTime: string, toTime: string) => {
    setWeeklyHours((prev) => {
      const next = { ...prev };
      WEEK_DAYS_ORDER.forEach(({ key }) => {
        if (next[key]?.open) {
          next[key] = { ...next[key], from: fromTime, to: toTime };
        }
      });
      return next;
    });
    showToast('تم تطبيق التغيرات');
  };

  const buildSettingsPayloadFromState = (): Restaurant => {
    const latestRest = getItem<Restaurant>(`restaurants/${rid}`) || rest;
    const cleanSlug = sanitizeSlug(restSlug);
    const slugIsValid =
      resolvedPlan.perms.customSlug &&
      cleanSlug.length >= 3 &&
      !isReservedSlug(cleanSlug) &&
      isSlugAvailable(cleanSlug, rid);

    const cleanZones = deliveryZonesState
      .filter((z) => z.area.trim())
      .map((z) => {
        const areaLabel = z.area.trim();
        const baseFee = Math.max(0, Number(z.fee) || 0);
        return {
          area: areaLabel,
          fee: baseFee,
          cities: [{ name: areaLabel, fee: baseFee }],
        };
      });

    const mergedApp = appearanceDraftRef.current;
    const isStore = restProjectType === 'store';
    const isCustomTheme = !isStore && mergedApp.themePreset === 'custom' && resolvedPlan.perms.customColors;
    const chosenTheme = getMenuThemeById(
      isStore ? 'estore' : isCustomTheme ? undefined : mergedApp.themePreset,
      isStore ? 'light' : mergedApp.themeMode
    );
    const firstOpenDay = WEEK_DAYS_ORDER.map((d) => weeklyHours[d.key]).find((d) => d?.open);

    return {
      ...latestRest,
      projectType: restProjectType,
      lay: isStore ? 'grid4' : isLayoutAllowed(mergedApp.lay) ? mergedApp.lay : 'list',
      themeMode: isStore ? 'light' : mergedApp.themeMode,
      ...(latestRest.dashboardThemeMode ? { dashboardThemeMode } : {}),
      themePreset: isStore ? 'estore' : isCustomTheme ? 'custom' : chosenTheme.id,
      themeShape: isStore ? 'estore' : mergedApp.themeShape,
      color: isStore ? '#f15a29' : isCustomTheme ? (mergedApp.color.trim() || chosenTheme.brand) : chosenTheme.brand,
      bgColor: isStore ? undefined : isCustomTheme ? (mergedApp.bgColor.trim() || undefined) : undefined,
      n: restName.trim() || latestRest.n,
      tagline: sanitizeProjectTagline(restTagline, restProjectType),
      aboutText: aboutTextInput.trim(),
      taxNote: taxNoteInput.trim(),
      currency: restCurrency || 'د.ع',
      a: latestRest.a !== undefined ? latestRest.a : 1,
      ...(resolvedPlan.perms.customSlug
        ? {
            slug: slugIsValid
              ? cleanSlug
              : !cleanSlug
              ? latestRest.slug || generateRandomMenuCode()
              : latestRest.slug || generateRandomMenuCode(),
            subdomain: subdomainEnabled
              ? slugIsValid
                ? cleanSlug
                : latestRest.subdomain || ''
              : '',
          }
        : {
            slug: latestRest.slug || generateRandomMenuCode(),
            subdomain: '',
          }),
      viewOnlyMode: Boolean(viewOnlyMode),
      enabledOrderTypes: {
        ...(latestRest.enabledOrderTypes || {}),
        delivery: viewOnlyMode ? false : resolvedPlan.perms.deliveryOrders ? allowDelivery : false,
        pickup: viewOnlyMode ? false : resolvedPlan.perms.pickupOrders ? allowPickup : false,
        table: viewOnlyMode ? false : resolvedPlan.perms.tableOrders ? allowTable : false,
      },
      acceptOrdersWhenClosed: acceptClosedOrders,
      orderChannel,
      whatsappNotificationsEnabled: whatsappEnabled,
      telegramNotificationsEnabled: telegramEnabled,
      appNotificationsEnabled,
      ph: restPhone.trim() || latestRest.ph,
      address: restAddress.trim(),
      mapUrl: restMapUrl.trim(),
      wazeUrl: restWazeUrl.trim(),
      googleReviewUrl: restGoogleReviewUrl.trim(),
      logo: logoUrlInput.trim() || undefined,
      coverImages: restProjectType === 'store' && coverUrlInput.trim() ? [coverUrlInput.trim()] : [],
      h: {
        m: workMode,
        f: firstOpenDay?.from || workFrom,
        t: firstOpenDay?.to || workTo,
      },
      weeklyHours,
      deliveryZones: cleanZones,
      social: {
        ...latestRest.social,
        whatsapp: restWa.trim() || restPhone.trim() || latestRest.ph,
        instagram: restInstagram.trim(),
        facebook: restFacebook.trim(),
        tiktok: restTiktok.trim(),
      },
    };
  };

  const commitSettingsDraftNow = async (opts?: { showNotification?: boolean; currentDigest?: string }) => {
    if (settingsSyncTimerRef.current !== null) {
      window.clearTimeout(settingsSyncTimerRef.current);
      settingsSyncTimerRef.current = null;
    }
    const updatedPayload = buildSettingsPayloadFromState();
    syncedRestRef.current = buildRestSignature(ensureRestaurantDefaults(updatedPayload), rid);
    if (opts?.currentDigest) {
      hydratedSettingsSigRef.current = opts.currentDigest;
    }
    await putItemAndSync<Restaurant>(`restaurants/${rid}`, updatedPayload);
    onRefresh();
    if (opts?.showNotification !== false) {
      showToast('تم حفظ التغيرات');
    }
  };

  const currentSettingsDigest = buildSettingsDigestFromValues({
    projectType: restProjectType,
    name: restName,
    tagline: sanitizeProjectTagline(restTagline, restProjectType),
    aboutText: aboutTextInput,
    taxNote: taxNoteInput,
    currency: restCurrency,
    active: restActive,
    viewOnlyMode,
    allowDelivery,
    allowPickup,
    allowTable,
    acceptClosedOrders,
    whatsappEnabled,
    telegramEnabled,
    appNotificationsEnabled,
    orderChannel,
    phone: restPhone,
    wa: restWa,
    address: restAddress,
    mapUrl: restMapUrl,
    wazeUrl: restWazeUrl,
    googleReviewUrl: restGoogleReviewUrl,
    instagram: restInstagram,
    facebook: restFacebook,
    tiktok: restTiktok,
    workMode,
    workFrom,
    workTo,
    weeklyHours,
    deliveryZones: deliveryZonesState,
    logoUrl: logoUrlInput,
    coverUrl: coverUrlInput,
    slug: restSlug,
  });

  useEffect(() => {
    if (!hydratedSettingsSigRef.current) {
      hydratedSettingsSigRef.current = currentSettingsDigest;
      return;
    }
    if (currentSettingsDigest === hydratedSettingsSigRef.current) return;

    if (settingsSyncTimerRef.current !== null) {
      window.clearTimeout(settingsSyncTimerRef.current);
    }
    settingsSyncTimerRef.current = window.setTimeout(() => {
      settingsSyncTimerRef.current = null;
      void commitSettingsDraftNow({
        showNotification: true,
        currentDigest: currentSettingsDigest,
      });
    }, 150);

    return () => {
      if (settingsSyncTimerRef.current !== null) {
        window.clearTimeout(settingsSyncTimerRef.current);
      }
    };
  }, [currentSettingsDigest]);

  const toggleViewOnlyMode = () => {
    const next = !viewOnlyMode;
    setViewOnlyModeRaw(next);
    if (next) {
      setAllowDelivery(false);
      setAllowPickup(false);
      setAllowTable(false);
    } else if (!allowDelivery && !allowPickup && !allowTable) {
      if (resolvedPlan.perms.deliveryOrders) setAllowDelivery(true);
      if (resolvedPlan.perms.pickupOrders) setAllowPickup(true);
      if (!resolvedPlan.perms.deliveryOrders && !resolvedPlan.perms.pickupOrders && resolvedPlan.perms.tableOrders) {
        setAllowTable(true);
      }
    }
  };

  const toggleOrderType = (type: 'delivery' | 'pickup' | 'table') => {
    const nextDelivery = type === 'delivery' ? !allowDelivery : allowDelivery;
    const nextPickup = type === 'pickup' ? !allowPickup : allowPickup;
    const nextTable = type === 'table' ? !allowTable : allowTable;

    if (type === 'delivery') setAllowDelivery(nextDelivery);
    if (type === 'pickup') setAllowPickup(nextPickup);
    if (type === 'table') setAllowTable(nextTable);

    const anyEnabled =
      (resolvedPlan.perms.deliveryOrders && nextDelivery) ||
      (resolvedPlan.perms.pickupOrders && nextPickup) ||
      (resolvedPlan.perms.tableOrders && nextTable);

    if (!anyEnabled) {
      setViewOnlyModeRaw(true);
    } else if (viewOnlyMode) {
      setViewOnlyModeRaw(false);
    }
  };

  const handleSeedStoreCatalog = (mode: 'if_empty' | 'append_missing' = 'append_missing') => {
    const res = seedStoreCatalogForAccount(rid, restCurrency || 'د.ع', mode);
    if (!coverUrlInput || coverUrlInput === DEFAULT_MEDIA_ASSETS.restaurant.banner) {
      setCoverUrlInput(ESTORE_HERO_PROMO_IMG);
    }
    onRefresh();
    if (res.catsAdded > 0 || res.itemsAdded > 0) {
      showToast(`تم تجهيز ${res.catsAdded} أقسام و ${res.itemsAdded} منتج متجر بنجاح ✓`);
    } else if (mode === 'append_missing') {
      showToast('جميع أقسام ومنتجات المتجر الافتراضية مضافة بالفعل ✓');
    }
  };

  const setRestProjectType = (nextType: 'restaurant' | 'store') => {
    setRestProjectTypeRaw(nextType);
    if (nextType === 'store') {
      appearanceDraftRef.current = {
        ...appearanceDraftRef.current,
        lay: 'grid4',
        themeMode: 'light',
        themePreset: 'estore',
        themeShape: 'estore',
        color: '#f15a29',
        bgColor: '',
      };
      setSelectedLayout('grid4');
      setMenuThemeMode('light');
      setMenuThemePreset('estore');
      setMenuThemeShape('estore');
      setRestColor('#f15a29');
      setRestBgColor('');
      if (restTagline.trim() === DEFAULT_RESTAURANT_TAGLINE) {
        setRestTagline('');
      }
      if (!coverUrlInput || coverUrlInput === DEFAULT_MEDIA_ASSETS.restaurant.banner) {
        setCoverUrlInput(ESTORE_HERO_PROMO_IMG);
      }
      if (allItems.length === 0) {
        const seeded = seedStoreCatalogForAccount(rid, restCurrency || 'د.ع', 'if_empty');
        onRefresh();
        if (seeded.itemsAdded > 0) {
          showToast('تم تفعيل وضع المتجر وتجهيز الأقسام والمنتجات الافتراضية ✓');
          return;
        }
      }
      showToast('تم تفعيل وضع المتجر وتحديث الواجهة والقوائم ✓');
    } else {
      setCoverUrlInput('');
      if (
        appearanceDraftRef.current.themePreset === 'estore' ||
        appearanceDraftRef.current.themeShape === 'estore'
      ) {
        appearanceDraftRef.current = {
          ...appearanceDraftRef.current,
          lay: 'list',
          themeMode: 'light',
          themePreset: 'clean-light',
          themeShape: 'modern',
          color: '#0F766E',
          bgColor: '',
        };
        setSelectedLayout('list');
        setMenuThemeMode('light');
        setMenuThemePreset('clean-light');
        setMenuThemeShape('modern');
        setRestColor('#0F766E');
        setRestBgColor('');
      }
    }
  };

  const handleSaveSettings = () => {
    const cleanSlug = sanitizeSlug(restSlug);
    if (resolvedPlan.perms.customSlug && cleanSlug) {
      if (cleanSlug.length < 3 || isReservedSlug(cleanSlug)) {
        showToast('الرابط المخصص يجب أن يتكون من 3 أحرف على الأقل وألا يكون اسماً محجوزاً');
        return;
      }
      if (!isSlugAvailable(cleanSlug, rid)) {
        showToast('الرابط المخصص مستخدم بالفعل من قِبل مشروع آخر، اختر اسماً مختلفاً');
        return;
      }
    }

    if (whatsappEnabled && !restWa.trim() && !restPhone.trim()) {
      showToast('يرجى إدخال رقم الواتساب لاستقبال الطلبات أو إيقاف خيار استلام رسائل وتساب');
      return;
    }

    void commitSettingsDraftNow({
      showNotification: true,
      currentDigest: currentSettingsDigest,
    });
  };

  const flushAllPendingSaves = async () => {
    if (unifiedSaving) return;
    setUnifiedSaving(true);
    try {
      await flushPendingAppearanceSave();
      if (currentSettingsDigest !== hydratedSettingsSigRef.current || settingsSyncTimerRef.current !== null) {
        await commitSettingsDraftNow({
          showNotification: false,
          currentDigest: currentSettingsDigest,
        });
      }
      if (showCatModal && editingCatId && catNameInput.trim()) {
        if (catEditSyncTimerRef.current !== null) {
          window.clearTimeout(catEditSyncTimerRef.current);
          catEditSyncTimerRef.current = null;
        }
        const existingCat = allCategories.find((c) => c.id === editingCatId);
        putItem<Category>(`cats/${editingCatId}`, {
          ...(existingCat || {}),
          id: editingCatId,
          rid,
          n: catNameInput.trim(),
          subtitle: catSubtitleInput.trim() || undefined,
          emoji: catEmojiInput.trim() || undefined,
          img: catImageInput.trim() || undefined,
          date: existingCat?.date || new Date().toLocaleDateString('ar-IQ-u-nu-latn'),
          published: existingCat ? existingCat.published !== false : catPublishedInput,
          availabilitySchedule: sanitizeAvailabilityScheduleForSave(catScheduleInput),
          o: existingCat ? existingCat.o : allCategories.length,
        });
      }
      if (isItemEditorOpen && editingItemId) {
        if (itemEditSyncTimerRef.current !== null) {
          window.clearTimeout(itemEditSyncTimerRef.current);
          itemEditSyncTimerRef.current = null;
        }
        const itemPayload = buildItemPayloadFromForm(editingItemId);
        if (itemPayload) {
          putItem<MenuItem>(`items/${editingItemId}`, itemPayload);
        }
      }
      if (editingAddonKey && addonEditIntent === 'edit') {
        if (addonEditSyncTimerRef.current !== null) {
          window.clearTimeout(addonEditSyncTimerRef.current);
          addonEditSyncTimerRef.current = null;
        }
        const check = validateAndBuildAddonSnapshot(editingAddonKey, addonDraft, Boolean(addonDraft.enabled));
        if (check.ok) {
          const latestAddons = addonsStateRef.current;
          const currentExisting = (latestAddons[editingAddonKey] || {}) as Record<string, any>;
          persistAddons({
            ...latestAddons,
            [editingAddonKey]: {
              ...currentExisting,
              ...check.draftSnapshot,
              configured: true,
              enabled: Boolean(addonDraft.enabled),
            },
          });
        }
      }
      window.dispatchEvent(new CustomEvent('menuplus_dashboard_flush_save'));
      await flushPendingDbSync();
      onRefresh();
      showToast('تم حفظ التغيرات');
    } finally {
      setUnifiedSaving(false);
    }
  };

  const handleUpdateOrderStatus = (orderId: string, nextStatus: string) => {
    const target = allOrders.find((x) => x.id === orderId);
    if (!target) return;
    const normalizedStatus = nextStatus === 'new' ? 'pending' : nextStatus;
    putItem<Order>(`orders/${orderId}`, {
      ...target,
      st: nextStatus,
      status: normalizedStatus as OrderStatus,
    });
    onRefresh();
    showToast('تم تطبيق التغيرات');
  };

  const handleDeleteOrder = (orderId: string, onAfterConfirm?: () => void) => {
    const target = allOrders.find((x) => x.id === orderId);
    if (!target) return;
    triggerAjaxConfirm(
      'حذف الطلب نهائياً',
      'هل أنت متأكد من حذف هذا الطلب نهائياً؟ لا يمكن التراجع عن هذا الإجراء.',
      'danger',
      'نعم، احذف نهائياً',
      async () => {
        await deleteItemAndSync(`orders/${orderId}`);
        onAfterConfirm?.();
        onRefresh();
      },
      'تم حذف الطلب نهائياً ✓'
    );
  };

  const handleCompleteAllOrders = async () => {
    const incomplete = allOrders.filter((o) => {
      const st = String(o.st || o.status || 'new');
      return st !== 'completed' && st !== 'cancelled';
    });
    if (incomplete.length === 0) {
      showToast('جميع الطلبات مكتملة بالفعل ✓');
      return;
    }
    const batch: Record<string, unknown> = {};
    for (const ord of incomplete) {
      batch[`orders/${ord.id}`] = {
        ...ord,
        st: 'completed',
        status: 'completed' as OrderStatus,
      };
    }
    await putManyAndSync(batch);
    onRefresh();
    showToast(`تم إكمال ${incomplete.length} طلب بنجاح ✓`);
  };

  const deferredCatQuery = useDeferredValue(searchCatQuery);
  const filteredCategories = useMemo(() => {
    const q = deferredCatQuery.trim().toLowerCase();
    if (!q) return allCategories;
    return allCategories.filter(
      (c) => c.n.toLowerCase().includes(q) || (c.subtitle && c.subtitle.toLowerCase().includes(q))
    );
  }, [allCategories, deferredCatQuery]);

  const deferredItemQuery = useDeferredValue(searchItemQuery);
  const filteredItems = useMemo(() => {
    const q = deferredItemQuery.trim().toLowerCase();
    return allItems.filter((i) => {
      const matchesCat = filterCatId === 'all' || i.cat === filterCatId;
      if (!matchesCat) return false;
      if (!q) return true;
      return i.n.toLowerCase().includes(q) || (i.d && i.d.toLowerCase().includes(q));
    });
  }, [allItems, filterCatId, deferredItemQuery]);

  const filteredOrders = useMemo(
    () =>
      allOrders.filter((o) => {
        if (orderFilter === 'all') return true;
        if (orderFilter === 'new') return o.st === 'new' || o.status === 'pending';
        return o.st === orderFilter || o.status === orderFilter;
      }),
    [allOrders, orderFilter]
  );

  const fullSubdomainUrl = getFullSubdomainUrl(rest, site, resolvedPlan);
  const publicPath = getPublicMenuUrlPath(rest, resolvedPlan);
  const liveMenuUrl = fullSubdomainUrl || `${window.location.origin}${publicPath}`;

  return {
    session,
    navTabs: terms.isStore ? STORE_NAV_TABS : NAV_TABS,
    layoutDefinitions: LAYOUT_DEFINITIONS,
    weekDaysOrder: WEEK_DAYS_ORDER,
    site,
    baseDomain,
    supportPhone,
    supportWaHref,
    customTabLabel,
    mainRid,
    activeRid,
    rid,
    mainRest,
    rest,
    branchesList,
    ownedMenus,
    switchActiveBranch,
    switchOwnedMenu,
    branchModalOpen,
    setBranchModalOpen,
    branchModalIsStartup,
    openBranchSwitcherModal,
    dismissBranchModal,
    createBranch,
    cloneMainMenuToBranch,
    renameBranch,
    deleteBranch,
    resolvedPlan,
    plans,
    purchaseModalPlan,
    setPurchaseModalPlan,
    openUpgradeModal,
    terms,
    isLayoutAllowed,
    currency,
    activeTab,
    setActiveTab,
    settingsSectionTab,
    setSettingsSectionTab,
    openSettingsSection,
    drawerOpen,
    setDrawerOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    ajaxDialog,
    setAjaxDialog,
    allCategories,
    allItems,
    allOrders,
    hasOlderOrders: Boolean(ordersArchiveMeta.ordersTruncated && !ordersArchiveMeta.loadedAll),
    loadingOlderOrders,
    loadOlderOrders,
    newOrdersCount,
    filteredCategories,
    filteredItems,
    filteredOrders,
    fullSubdomainUrl,
    subdomainEnabled,
    publicPath,
    liveMenuUrl,
    copyLink,
    shareModalOpen,
    setShareModalOpen,
    openShareModal,
    onNavigate,
    onLogout,
    onRefresh,
    showToast,
    // Custom Subdomain
    restSlug,
    setRestSlug,
    slugCheckState,
    setSlugCheckState,
    checkSubdomainAvailability,
    // Addons
    addonsState,
    addonCategoryFilter,
    setAddonCategoryFilter,
    addonSearchQuery,
    setAddonSearchQuery,
    editingAddonKey,
    setEditingAddonKey,
    addonDraft,
    setAddonDraft,
    addonEditIntent,
    setAddonEditIntent,
    addonEditError,
    setAddonEditError,
    addonSaving,
    showPopupPreview,
    setShowPopupPreview,
    handleToggleAddon,
    handleOpenAddonEdit,
    handleSaveAddonEdit,
    closeAddonEditModal,
    // Categories
    searchCatQuery,
    setSearchCatQuery,
    showCatModal,
    setShowCatModal,
    editingCatId,
    setEditingCatId,
    catNameInput,
    setCatNameInput,
    catSubtitleInput,
    setCatSubtitleInput,
    catEmojiInput,
    setCatEmojiInput,
    catImageInput,
    setCatImageInput,
    catPublishedInput,
    setCatPublishedInput,
    catScheduleInput,
    setCatScheduleInput,
    openNewCategoryModal,
    handleToggleCategoryVisibility,
    handleSaveCategory,
    handleOpenEditCategory,
    handleDeleteCategory,
    handleReorderCategories,
    handleSaveCategorySchedule,
    pauseModalTarget,
    setPauseModalTarget,
    handleConfirmManualPause,
    // Items
    searchItemQuery,
    setSearchItemQuery,
    filterCatId,
    setFilterCatId,
    isItemEditorOpen,
    setIsItemEditorOpen,
    itemEditorTab,
    setItemEditorTab,
    editingItemId,
    categoryScrollRef,
    scrollCategoryPills,
    formCat,
    setFormCat,
    formName,
    setFormName,
    formPrice,
    setFormPrice,
    formBeforePrice,
    setFormBeforePrice,
    formDesc,
    setFormDesc,
    formImage,
    setFormImage,
    formPrepTime,
    setFormPrepTime,
    formBadgeText,
    setFormBadgeText,
    formBadgeType,
    setFormBadgeType,
    formAllergens,
    setFormAllergens,
    formPublished,
    setFormPublished,
    formDineInOnly,
    setFormDineInOnly,
    formNoDelivery,
    setFormNoDelivery,
    formNoPickup,
    setFormNoPickup,
    formSchedule,
    setFormSchedule,
    hasVariableSizes,
    setHasVariableSizes,
    formSizes,
    setFormSizes,
    hasExtras,
    setHasExtras,
    formExtras,
    setFormExtras,
    hasChoices,
    setHasChoices,
    formMaxChoices,
    setFormMaxChoices,
    formChoices,
    setFormChoices,
    showBatchModal,
    setShowBatchModal,
    batchLinesInput,
    setBatchLinesInput,
    openNewItemEditor,
    openBatchModal,
    handleSaveItem,
    handleQuickUpdateItemPrice,
    handleDeleteItem,
    handleBatchAddItems,
    handleEditItem,
    handleToggleItemVisibility,
    handleReorderItems,
    handleSaveItemSchedule,
    handleDeviceImageUpload,
    mediaLibraryItems,
    uploadImagesToLibrary,
    removeMediaLibraryItem,
    // Appearance & Settings
    selectedLayout,
    menuThemeMode,
    handleSelectThemeMode,
    dashboardThemeMode,
    handleSelectDashboardThemeMode,
    menuThemePreset,
    handleSelectMenuTheme,
    handleUpdateCustomColors,
    menuThemeShape,
    handleSelectThemeShape,
    handleActivateCustomAppearance,
    restColor,
    setRestColor,
    restBgColor,
    setRestBgColor,
    coverUrlInput,
    setCoverUrlInput,
    logoUrlInput,
    setLogoUrlInput,
    aboutTextInput,
    setAboutTextInput,
    taxNoteInput,
    setTaxNoteInput,
    showLogoUrlField,
    setShowLogoUrlField,
    showBannerUrlField,
    setShowBannerUrlField,
    handleInstantLayoutSelect,
    handleSaveAppearance,
    flushPendingAppearanceSave,
    flushAllPendingSaves,
    unifiedSaving,
    appearanceSaving,
    handleUpdateQrDesign,
    handleCurrencyChange,
    handleSaveSettings,
    orderFilter,
    setOrderFilter,
    handleUpdateOrderStatus,
    handleDeleteOrder,
    handleCompleteAllOrders,
    restProjectType,
    setRestProjectType,
    handleSeedStoreCatalog,
    restName,
    setRestName,
    restTagline,
    setRestTagline,
    restCurrency,
    restActive,
    setRestActive,
    viewOnlyMode,
    toggleViewOnlyMode,
    toggleOrderType,
    allowDelivery,
    setAllowDelivery,
    allowPickup,
    setAllowPickup,
    allowTable,
    setAllowTable,
    acceptClosedOrders,
    setAcceptClosedOrders,
    orderChannel,
    whatsappEnabled,
    telegramEnabled,
    appNotificationsEnabled,
    toggleOrderDeliveryChannel: (channel: 'whatsapp' | 'telegram' | 'app') => {
      const nextWa = channel === 'whatsapp' ? !whatsappEnabled : whatsappEnabled;
      const nextTg = channel === 'telegram' ? !telegramEnabled : telegramEnabled;
      const nextApp = channel === 'app' ? !appNotificationsEnabled : appNotificationsEnabled;
      if (!nextWa && !nextTg && !nextApp) {
        showToast('يجب تفعيل خيار واحد على الأقل لاستلام الطلبات');
        return;
      }
      const nextOrderChannel: 'both' | 'telegram' | 'whatsapp' | 'app' =
        nextWa && nextTg
          ? 'both'
          : nextTg
          ? 'telegram'
          : nextWa
          ? 'whatsapp'
          : 'app';

      if (settingsSyncTimerRef.current !== null) {
        window.clearTimeout(settingsSyncTimerRef.current);
        settingsSyncTimerRef.current = null;
      }

      hydratedSettingsSigRef.current = buildSettingsDigestFromValues({
        projectType: restProjectType,
        name: restName,
        tagline: sanitizeProjectTagline(restTagline, restProjectType),
        aboutText: aboutTextInput,
        taxNote: taxNoteInput,
        currency: restCurrency,
        active: restActive,
        viewOnlyMode,
        allowDelivery,
        allowPickup,
        allowTable,
        acceptClosedOrders,
        whatsappEnabled: nextWa,
        telegramEnabled: nextTg,
        appNotificationsEnabled: nextApp,
        orderChannel: nextOrderChannel,
        phone: restPhone,
        wa: restWa,
        address: restAddress,
        mapUrl: restMapUrl,
        wazeUrl: restWazeUrl,
        googleReviewUrl: restGoogleReviewUrl,
        instagram: restInstagram,
        facebook: restFacebook,
        tiktok: restTiktok,
        workMode,
        workFrom,
        workTo,
        weeklyHours,
        deliveryZones: deliveryZonesState,
        logoUrl: logoUrlInput,
        coverUrl: coverUrlInput,
        slug: restSlug,
      });

      const basePayload = buildSettingsPayloadFromState();
      const updatedPayload: Restaurant = {
        ...basePayload,
        orderChannel: nextOrderChannel,
        whatsappNotificationsEnabled: nextWa,
        telegramNotificationsEnabled: nextTg,
        appNotificationsEnabled: nextApp,
      };
      syncedRestRef.current = buildRestSignature(ensureRestaurantDefaults(updatedPayload), rid);

      setWhatsappEnabled(nextWa);
      setTelegramEnabled(nextTg);
      setAppNotificationsEnabled(nextApp);

      void putItemAndSync<Restaurant>(`restaurants/${rid}`, updatedPayload)
        .then(() => {
          onRefresh();
          showToast('تم حفظ التغيرات');
        })
        .catch(() => {
          onRefresh();
        });

      if (channel === 'app' && nextApp && pushSupported && notificationPermission !== 'granted') {
        void enableDashboardPushNotifications();
      }
    },
    restPhone,
    setRestPhone,
    restWa,
    setRestWa,
    restAddress,
    setRestAddress,
    restInstagram,
    setRestInstagram,
    restMapUrl,
    setRestMapUrl,
    restWazeUrl,
    setRestWazeUrl,
    restGoogleReviewUrl,
    setRestGoogleReviewUrl,
    restFacebook,
    setRestFacebook,
    restTiktok,
    setRestTiktok,
    workMode,
    setWorkMode,
    workFrom,
    setWorkFrom,
    workTo,
    setWorkTo,
    weeklyHours,
    setWeeklyHours,
    applyTimeToOpenDays,
    deliveryZonesState,
    setDeliveryZonesState,
    notificationPermission,
    pushSupported,
    enableDashboardPushNotifications,
  };
}

export type DashboardContextValue = ReturnType<typeof useDashboardController>;

const DashboardContext = createContext<DashboardContextValue | null>(null);

export const DashboardProvider: React.FC<{
  valueProps: DashboardViewProps;
  children: React.ReactNode;
}> = ({ valueProps, children }) => {
  const controller = useDashboardController(valueProps);
  return <DashboardContext.Provider value={controller}>{children}</DashboardContext.Provider>;
};

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error('useDashboard must be used within DashboardProvider');
  }
  return ctx;
}
