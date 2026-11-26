/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  HomeSettings,
  PricingPlan,
  ProblemReport,
  Restaurant,
  Session,
  SiteSettings,
  StaffPermissions,
  ThemeSettings,
} from '../types';
import { AppLogo } from '../components/AppLogo';
import { buildPlanComparisonRows } from '../utils/plans';
import { navigateToMainSite } from '../utils/businessDefaults';

const StaffManagementSection = lazy(() =>
  import('../components/admin/StaffManagementSection').then((m) => ({ default: m.StaffManagementSection }))
);
const UnifiedPartnersAccountsSection = lazy(() =>
  import('../components/admin/UnifiedPartnersAccountsSection').then((m) => ({ default: m.UnifiedPartnersAccountsSection }))
);
const OpenNotesScratchpad = lazy(() =>
  import('../components/admin/OpenNotesScratchpad').then((m) => ({ default: m.OpenNotesScratchpad }))
);
const AdminReportsSection = lazy(() =>
  import('../components/admin/AdminReportsSection').then((m) => ({ default: m.AdminReportsSection }))
);
const MyAccountSection = lazy(() =>
  import('../components/admin/MyAccountSection').then((m) => ({ default: m.MyAccountSection }))
);
const AdminHomeLounge = lazy(() =>
  import('../components/admin/AdminHomeLounge').then((m) => ({ default: m.AdminHomeLounge }))
);
const HomePageEditorSection = lazy(() =>
  import('../components/admin/HomePageEditorSection').then((m) => ({ default: m.HomePageEditorSection }))
);
const TelegramSettingsCard = lazy(() =>
  import('../components/admin/TelegramSettingsCard').then((m) => ({ default: m.TelegramSettingsCard }))
);
const PlanFeaturesOrderEditor = lazy(() =>
  import('../components/admin/PlanFeaturesOrderEditor').then((m) => ({ default: m.PlanFeaturesOrderEditor }))
);
import { cleanupUnusedImagesApi } from '../utils/adminApi';
import {
  applyTheme,
  buildThemeForMode,
  flushPendingDbSync,
  getCollection,
  getDbRevision,
  getTheme,
  logActivity,
  putItemAndSync,
  putManyAndSync,
  syncFromServer,
} from '../utils/storage';
import {
  DEFAULT_MOTION_CONFIG,
  dashSectionMotion,
  dashTabMotion,
  syncDashboardMotionFromSite,
} from '../utils/dashboardMotion';
import {
  Home,
  Store,
  Lightbulb,
  Users,
  Settings,
  User,
  LogOut,
  X,
  Eye,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Wallet,
  LayoutTemplate,
  Sun,
  Moon,
  Monitor,
  AlertTriangle,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react';

interface AdminViewProps {
  session: Session;
  site: SiteSettings;
  home: HomeSettings;
  plans: PricingPlan[];
  theme: ThemeSettings;
  initialSubTab?: string;
  onNavigate: (hash: string) => void;
  onLogout: () => void;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

type MainTab = 'home' | 'partners' | 'home_editor' | 'notes' | 'reports' | 'staff' | 'settings' | 'account';

function normalizeInitialTab(sub?: string): MainTab {
  if (!sub) return 'home';
  if (sub === 'accounts') return 'partners';
  if (sub === 'home-editor' || sub === 'plans') return 'home_editor';
  if (['home', 'partners', 'home_editor', 'notes', 'reports', 'staff', 'settings', 'account'].includes(sub)) {
    return sub as MainTab;
  }
  return 'home';
}

const AdminViewInner: React.FC<AdminViewProps> = ({
  session,
  site,
  home,
  plans,
  theme,
  initialSubTab,
  onNavigate,
  onLogout,
  onRefresh,
  showToast,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const isSuperAdmin = !session.staffId;
  const rawPerms: StaffPermissions = session.permissions || {};
  const staffPerms: StaffPermissions = isSuperAdmin
    ? {
        canViewHome: true,
        canManageRestaurants: true,
        canCreatePartner: true,
        canEditPartnerPlan: true,
        canSuspendPartner: true,
        canEditPartnerProfile: true,
        canEditPartnerLinks: true,
        canImpersonatePartner: true,
        canDeletePartner: true,
        canUseNotes: true,
        canViewReports: true,
        canManagePlans: true,
        canManageStaff: true,
        canManageSettings: true,
        canEditTabLabels: true,
        canReorderTabs: true,
        canManageThemeMode: true,
        canManageSubdomains: true,
        canRunMaintenance: true,
        canEditHomePage: true,
      }
    : (() => {
        const canPartners = Boolean(rawPerms.canManageRestaurants || rawPerms.canManageUsers);
        const canPlans = Boolean(rawPerms.canManagePlans);
        const canSettings = Boolean(rawPerms.canManageSettings ?? canPlans);
        return {
          canViewHome: rawPerms.canViewHome !== false,
          canManageRestaurants: canPartners,
          canCreatePartner: Boolean(rawPerms.canCreatePartner ?? canPartners),
          canEditPartnerPlan: Boolean(rawPerms.canEditPartnerPlan || rawPerms.canExtendSubscription),
          canSuspendPartner: Boolean(rawPerms.canSuspendPartner ?? canPartners),
          canEditPartnerProfile: Boolean(rawPerms.canEditPartnerProfile ?? canPartners),
          canEditPartnerLinks: Boolean(rawPerms.canEditPartnerLinks ?? canPartners),
          canImpersonatePartner: Boolean(rawPerms.canImpersonatePartner),
          canDeletePartner: Boolean(rawPerms.canDeletePartner),
          canUseNotes: rawPerms.canUseNotes !== false,
          canViewReports: rawPerms.canViewReports !== false,
          canManagePlans: canPlans,
          canManageStaff: Boolean(rawPerms.canManageStaff),
          canManageSettings: canSettings,
          canEditTabLabels: Boolean(rawPerms.canEditTabLabels ?? canSettings),
          canReorderTabs: Boolean(rawPerms.canReorderTabs ?? canSettings),
          canManageThemeMode: Boolean(rawPerms.canManageThemeMode ?? canSettings),
          canManageSubdomains: Boolean(rawPerms.canManageSubdomains ?? canSettings),
          canRunMaintenance: Boolean(rawPerms.canRunMaintenance ?? canSettings),
          canEditHomePage: Boolean(rawPerms.canEditHomePage ?? canSettings),
        };
      })();

  const [activeTab, setActiveTabState] = useState<MainTab>(() => normalizeInitialTab(initialSubTab));

  useEffect(() => {
    setActiveTabState(normalizeInitialTab(initialSubTab));
  }, [initialSubTab]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dragAdminIdx, setDragAdminIdx] = useState<number | null>(null);
  const [dragDashIdx, setDragDashIdx] = useState<number | null>(null);
  const [cleaningImages, setCleaningImages] = useState(false);
  const [cleanupSummary, setCleanupSummary] = useState('');

  // Editable site settings state
  const [editSite, setEditSite] = useState<SiteSettings>(site);
  const [editPlans, setEditPlans] = useState<PricingPlan[]>(plans);
  const [editTheme, setEditTheme] = useState<ThemeSettings>(() => theme || getTheme());
  const [settingsPlanIdx, setSettingsPlanIdx] = useState<number>(0);
  const [unifiedSaving, setUnifiedSaving] = useState<boolean>(false);

  const siteAutoSaveTimerRef = useRef<number | null>(null);
  const plansAutoSaveTimerRef = useRef<number | null>(null);
  const lastSeenSiteRef = useRef<SiteSettings>(site);
  const lastSeenPlansRef = useRef<PricingPlan[]>(plans);
  const hydratedSiteSigRef = useRef<string>('');
  const hydratedPlansSigRef = useRef<string>('');

  useEffect(() => {
    if (!hydratedSiteSigRef.current) {
      hydratedSiteSigRef.current = JSON.stringify(site);
      lastSeenSiteRef.current = site;
      return;
    }
    if (siteAutoSaveTimerRef.current !== null || site === lastSeenSiteRef.current) return;
    lastSeenSiteRef.current = site;
    const incomingSig = JSON.stringify(site);
    if (incomingSig !== hydratedSiteSigRef.current) {
      hydratedSiteSigRef.current = incomingSig;
      setEditSite(site);
    }
  }, [site]);

  useEffect(() => {
    if (!hydratedPlansSigRef.current) {
      hydratedPlansSigRef.current = JSON.stringify(plans);
      lastSeenPlansRef.current = plans;
      return;
    }
    if (plansAutoSaveTimerRef.current !== null || plans === lastSeenPlansRef.current) return;
    lastSeenPlansRef.current = plans;
    const incomingSig = JSON.stringify(plans);
    if (incomingSig !== hydratedPlansSigRef.current) {
      hydratedPlansSigRef.current = incomingSig;
      setEditPlans(plans);
    }
  }, [plans]);

  useEffect(() => {
    if (theme) setEditTheme(theme);
  }, [theme]);

  useEffect(() => {
    syncDashboardMotionFromSite(editSite, `/admin/${activeTab}`);
  }, [editSite.motionConfig, activeTab]);

  const setActiveTab = (t: MainTab) => {
    setActiveTabState(t);
    window.scrollTo({ top: 0, behavior: 'auto' });
    const targetPath = `/admin/${t}`;
    if (window.location.pathname !== targetPath) {
      onNavigate(targetPath);
    }
  };

  useEffect(() => {
    let active = true;
    void syncFromServer().then((ok) => {
      if (ok && active) onRefresh();
    });
    return () => {
      active = false;
    };
  }, []);

  const dbRev = getDbRevision();

  const newReportsCount = useMemo(() => {
    const reports = getCollection<ProblemReport>('reports');
    return reports.filter((r) => {
      const raw = String(r.st || r.status || 'new').toLowerCase();
      return raw === 'new' || raw === 'pending';
    }).length;
  }, [dbRev]);

  const handleCleanupUnusedImages = async () => {
    if (cleaningImages) return;
    if (!isSuperAdmin && !staffPerms.canRunMaintenance && !staffPerms.canManageSettings) {
      showToast('ليست لديك صلاحية تنظيف الصور المخزنة');
      return;
    }
    setCleaningImages(true);
    setCleanupSummary('');
    try {
      const res = await cleanupUnusedImagesApi();
      const deletedCount = Number(res.strippedUnreferencedImages || 0) + Number(res.removedOrphanRecords || 0);
      const savedKb = (Number(res.reclaimedBytes || 0) / 1024).toFixed(1);
      const msg =
        (res as { message?: string }).message ||
        (deletedCount > 0
          ? `تم حذف ${deletedCount} صورة وملف غير مستخدم وتوفير ${savedKb} كيلوبايت`
          : 'لا توجد صور مخزنة غير مهمة حالياً.');
      setCleanupSummary(msg);
      showToast(msg);
      logActivity(
        session.phone || session.email || 'المدير',
        'تنظيف الصور المخزنة غير المهمة',
        msg,
        'system'
      );
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر تنظيف الصور المخزنة';
      showToast(msg);
    } finally {
      setCleaningImages(false);
    }
  };

  const buildNormalizedSitePayload = useCallback((): SiteSettings => {
    const cleanedAdminLabels: Record<string, string> = {};
    Object.entries(editSite.adminTabLabels || {}).forEach(([k, v]) => {
      if (v && v.trim()) cleanedAdminLabels[k] = v.trim();
    });
    const cleanedDashLabels: Record<string, string> = {};
    Object.entries(editSite.dashboardTabLabels || {}).forEach(([k, v]) => {
      if (v && v.trim()) cleanedDashLabels[k] = v.trim();
    });
    const cleanWa = (editSite.supportWhatsapp || editSite.wa || '07724799679').trim();

    return {
      ...site,
      ...editSite,
      wa: cleanWa,
      supportWhatsapp: cleanWa,
      homeThemeMode:
        editSite.homeThemeMode === 'dark' || editSite.homeThemeMode === 'auto'
          ? editSite.homeThemeMode
          : 'light',
      adminThemeMode:
        editSite.adminThemeMode === 'dark' || editSite.adminThemeMode === 'auto'
          ? editSite.adminThemeMode
          : 'light',
      dashboardThemeMode:
        editSite.dashboardThemeMode === 'dark' || editSite.dashboardThemeMode === 'auto'
          ? editSite.dashboardThemeMode
          : 'light',
      adminBackdrop: editSite.adminBackdrop === 'liquid-image' ? 'liquid-image' : 'grid',
      dashboardBackdrop: editSite.dashboardBackdrop === 'liquid-image' ? 'liquid-image' : 'grid',
      adminTabLabels: cleanedAdminLabels,
      dashboardTabLabels: cleanedDashLabels,
      adminTabOrder: Array.isArray(editSite.adminTabOrder) ? editSite.adminTabOrder : site.adminTabOrder,
      dashboardTabOrder: Array.isArray(editSite.dashboardTabOrder) ? editSite.dashboardTabOrder : site.dashboardTabOrder,
      zainCashNumber: (editSite.zainCashNumber || '').trim(),
      qiCardNumber: (editSite.qiCardNumber || '').trim(),
      paymentNote: (editSite.paymentNote || '').trim(),
      motionConfig: editSite.motionConfig || site.motionConfig || { ...DEFAULT_MOTION_CONFIG },
      googleAuthEnabled: false,
      signupEnabled: false,
      su: 0,
      subdomainRules: site.subdomainRules,
    };
  }, [editSite, site]);

  const buildSanitizedPlansPayload = useCallback(
    () => ({
      list: editPlans.map((pl) => {
        const cleanComparisonItems = Array.isArray(pl.comparisonItems)
          ? pl.comparisonItems
              .filter((it) => it && it.key)
              .map((it) => ({
                key: it.key,
                ...(it.label !== undefined && it.label.trim() ? { label: it.label.trim() } : {}),
                ...(it.included !== undefined ? { included: Boolean(it.included) } : {}),
                visible: it.visible !== false,
              }))
          : undefined;
        const nextPlan: PricingPlan = {
          ...pl,
          ...(cleanComparisonItems ? { comparisonItems: cleanComparisonItems } : {}),
        };
        nextPlan.f = buildPlanComparisonRows(nextPlan, 'ar').map((r) => r.label);
        return nextPlan;
      }),
      planSchemaV2: true,
      planPriceV2: true,
      planCardV3: true,
      planAnnual11V4: true,
      planMultiBranchV5: true,
      planNamesV6: true,
      planThemesV7: true,
      planNoFreeV8: true,
    }),
    [editPlans]
  );

  const persistSiteSettingsAuto = useCallback(
    async (notify = true) => {
      if (!isSuperAdmin && !staffPerms.canManageSettings && !staffPerms.canEditTabLabels && !staffPerms.canReorderTabs && !staffPerms.canManageThemeMode) {
        return;
      }
      const nextSite = buildNormalizedSitePayload();
      const resolvedAdminMode = nextSite.adminThemeMode || 'light';
      hydratedSiteSigRef.current = JSON.stringify(editSite);
      await putItemAndSync('settings/site', nextSite);
      applyTheme(buildThemeForMode(resolvedAdminMode, getTheme()));
      syncDashboardMotionFromSite(nextSite, `/admin/${activeTab}`);
      onRefresh();
      if (notify) {
        showToast('تم حفظ التغيرات');
      }
    },
    [
      buildNormalizedSitePayload,
      editSite,
      isSuperAdmin,
      onRefresh,
      showToast,
      staffPerms.canEditTabLabels,
      staffPerms.canManageSettings,
      staffPerms.canManageThemeMode,
      staffPerms.canReorderTabs,
    ]
  );

  const handleSavePlanFeaturesOnly = useCallback(
    async (notify = true) => {
      if (!isSuperAdmin && !staffPerms.canManagePlans) {
        if (notify) showToast('ليست لديك صلاحية تعديل الباقات والميزات');
        return;
      }
      const plansPayload = buildSanitizedPlansPayload();
      hydratedPlansSigRef.current = JSON.stringify(editPlans);
      await putItemAndSync('settings/plans', plansPayload);
      onRefresh();
      if (notify) {
        showToast('تم حفظ التغيرات');
      }
    },
    [buildSanitizedPlansPayload, editPlans, isSuperAdmin, onRefresh, showToast, staffPerms.canManagePlans]
  );

  const persistSiteAutoRef = useRef(persistSiteSettingsAuto);
  persistSiteAutoRef.current = persistSiteSettingsAuto;

  const savePlansAutoRef = useRef(handleSavePlanFeaturesOnly);
  savePlansAutoRef.current = handleSavePlanFeaturesOnly;

  // Auto-save editSite changes across all Admin Settings inputs (payment, labels, ordering)
  useEffect(() => {
    const nextSig = JSON.stringify(editSite);
    if (nextSig === hydratedSiteSigRef.current) return;
    if (siteAutoSaveTimerRef.current !== null) {
      window.clearTimeout(siteAutoSaveTimerRef.current);
    }
    siteAutoSaveTimerRef.current = window.setTimeout(() => {
      siteAutoSaveTimerRef.current = null;
      void persistSiteAutoRef.current(true);
    }, 150);
    return () => {
      if (siteAutoSaveTimerRef.current !== null) {
        window.clearTimeout(siteAutoSaveTimerRef.current);
      }
    };
  }, [editSite]);

  // Auto-save editPlans changes across PlanFeaturesOrderEditor
  useEffect(() => {
    const nextSig = JSON.stringify(editPlans);
    if (nextSig === hydratedPlansSigRef.current) return;
    if (plansAutoSaveTimerRef.current !== null) {
      window.clearTimeout(plansAutoSaveTimerRef.current);
    }
    plansAutoSaveTimerRef.current = window.setTimeout(() => {
      plansAutoSaveTimerRef.current = null;
      void savePlansAutoRef.current(true);
    }, 150);
    return () => {
      if (plansAutoSaveTimerRef.current !== null) {
        window.clearTimeout(plansAutoSaveTimerRef.current);
      }
    };
  }, [editPlans]);

  const flushAllAdminSaves = useCallback(async () => {
    if (unifiedSaving) return;
    setUnifiedSaving(true);
    try {
      const pendingPut: Record<string, unknown> = {};
      let siteDirty = false;
      let plansDirty = false;

      if (siteAutoSaveTimerRef.current !== null) {
        window.clearTimeout(siteAutoSaveTimerRef.current);
        siteAutoSaveTimerRef.current = null;
        siteDirty = true;
      } else if (JSON.stringify(editSite) !== hydratedSiteSigRef.current) {
        siteDirty = true;
      }

      if (plansAutoSaveTimerRef.current !== null) {
        window.clearTimeout(plansAutoSaveTimerRef.current);
        plansAutoSaveTimerRef.current = null;
        plansDirty = true;
      } else if (JSON.stringify(editPlans) !== hydratedPlansSigRef.current) {
        plansDirty = true;
      }

      if (siteDirty) {
        const nextSite = buildNormalizedSitePayload();
        hydratedSiteSigRef.current = JSON.stringify(editSite);
        pendingPut['settings/site'] = nextSite;
        applyTheme(buildThemeForMode(nextSite.adminThemeMode || 'light', getTheme()));
      }

      if (plansDirty && (isSuperAdmin || staffPerms.canManagePlans)) {
        hydratedPlansSigRef.current = JSON.stringify(editPlans);
        pendingPut['settings/plans'] = buildSanitizedPlansPayload();
      }

      if (Object.keys(pendingPut).length > 0) {
        await putManyAndSync(pendingPut);
      }

      window.dispatchEvent(new CustomEvent('menuplus_admin_flush_save'));
      await flushPendingDbSync();
      onRefresh();
      showToast('تم حفظ التغيرات');
    } finally {
      setUnifiedSaving(false);
    }
  }, [
    buildNormalizedSitePayload,
    buildSanitizedPlansPayload,
    editPlans,
    editSite,
    isSuperAdmin,
    onRefresh,
    showToast,
    staffPerms.canManagePlans,
    unifiedSaving,
  ]);

  const handleSelectAdminThemeMode = async (nextMode: 'light' | 'dark' | 'auto') => {
    if (!isSuperAdmin && !staffPerms.canManageThemeMode) {
      showToast('ليست لديك صلاحية تغيير المظهر');
      return;
    }
    if (siteAutoSaveTimerRef.current !== null) {
      window.clearTimeout(siteAutoSaveTimerRef.current);
      siteAutoSaveTimerRef.current = null;
    }
    const nextSite: SiteSettings = {
      ...site,
      ...editSite,
      adminThemeMode: nextMode,
    };
    hydratedSiteSigRef.current = JSON.stringify(nextSite);
    setEditSite(nextSite);
    applyTheme(buildThemeForMode(nextMode, editTheme));
    await putItemAndSync('settings/site', nextSite);
    onRefresh();
    showToast('تم حفظ التغيرات');
  };

  const handleSelectGlobalDashboardThemeMode = async (nextMode: 'light' | 'dark' | 'auto') => {
    if (!isSuperAdmin && !staffPerms.canManageThemeMode && !staffPerms.canManageSettings) {
      showToast('ليست لديك صلاحية تغيير المظهر');
      return;
    }
    if (siteAutoSaveTimerRef.current !== null) {
      window.clearTimeout(siteAutoSaveTimerRef.current);
      siteAutoSaveTimerRef.current = null;
    }
    const nextSite: SiteSettings = {
      ...site,
      ...editSite,
      dashboardThemeMode: nextMode,
    };
    hydratedSiteSigRef.current = JSON.stringify(nextSite);
    setEditSite(nextSite);
    await putItemAndSync('settings/site', nextSite);
    logActivity(
      session.phone || session.email || 'المدير',
      'تحديث ثيم لوحة تحكم الزبائن',
      `ثيم لوحة التحكم الافتراضي: ${nextMode === 'auto' ? 'حسب جهاز الزبون' : nextMode === 'dark' ? 'داكن' : 'فاتح'}`,
      'system'
    );
    onRefresh();
    showToast('تم حفظ التغيرات');
  };

  const handleSelectHomeThemeMode = async (nextMode: 'light' | 'dark' | 'auto') => {
    if (!isSuperAdmin && !staffPerms.canManageThemeMode && !staffPerms.canManageSettings) {
      showToast('ليست لديك صلاحية تغيير المظهر');
      return;
    }
    if (siteAutoSaveTimerRef.current !== null) {
      window.clearTimeout(siteAutoSaveTimerRef.current);
      siteAutoSaveTimerRef.current = null;
    }
    const nextSite: SiteSettings = {
      ...site,
      ...editSite,
      homeThemeMode: nextMode,
    };
    const nextPublicTheme: ThemeSettings = buildThemeForMode(nextMode, getTheme());
    hydratedSiteSigRef.current = JSON.stringify(nextSite);
    setEditSite(nextSite);
    setEditTheme(nextPublicTheme);
    await putManyAndSync({
      'settings/site': nextSite,
      'settings/theme': nextPublicTheme,
    });
    const resolvedAdminMode = nextSite.adminThemeMode || 'light';
    applyTheme(buildThemeForMode(resolvedAdminMode, nextPublicTheme));
    logActivity(
      session.phone || session.email || 'المدير',
      'تحديث مظهر الموقع العام',
      `مظهر الموقع العام: ${nextMode === 'auto' ? 'حسب جهاز الزائر' : nextMode === 'dark' ? 'داكن' : 'فاتح'}`,
      'system'
    );
    onRefresh();
    showToast('تم حفظ التغيرات');
  };

  const handleApplyDashboardThemeToAllStores = async (nextMode: 'light' | 'dark' | 'auto') => {
    if (!isSuperAdmin && !staffPerms.canManageThemeMode && !staffPerms.canManageSettings) {
      showToast('ليست لديك صلاحية تغيير المظهر');
      return;
    }
    if (siteAutoSaveTimerRef.current !== null) {
      window.clearTimeout(siteAutoSaveTimerRef.current);
      siteAutoSaveTimerRef.current = null;
    }
    const allRests = getCollection<Restaurant>('restaurants');
    const batchEntries: Record<string, unknown> = {};
    for (const r of allRests) {
      if (r.dashboardThemeMode !== nextMode) {
        batchEntries[`restaurants/${r.id}`] = {
          ...r,
          dashboardThemeMode: nextMode,
        };
      }
    }
    const nextSite: SiteSettings = {
      ...site,
      ...editSite,
      dashboardThemeMode: nextMode,
    };
    batchEntries['settings/site'] = nextSite;
    hydratedSiteSigRef.current = JSON.stringify(nextSite);
    setEditSite(nextSite);
    await putManyAndSync(batchEntries);
    onRefresh();
    showToast('تم حفظ التغيرات');
  };

  const customAdminLabel = (id: string, fallback: string) => {
    const custom = site.adminTabLabels?.[id];
    return custom && custom.trim() ? custom.trim() : fallback;
  };

  const DEFAULT_ADMIN_TAB_META: Array<{ id: MainTab; def: string }> = [
    { id: 'home', def: 'الصفحة الرئيسية' },
    { id: 'notes', def: 'الملاحظات' },
    { id: 'partners', def: 'الحسابات' },
    { id: 'staff', def: 'الادارة' },
    { id: 'home_editor', def: 'تعديل الرئيسية' },
    { id: 'reports', def: 'البلاغات' },
    { id: 'settings', def: 'الإعدادات' },
  ];

  const DEFAULT_DASH_TAB_META: Array<{ id: string; def: string; legacyId?: string }> = [
    { id: 'home', def: 'الصفحة الرئيسية' },
    { id: 'stats', def: 'احصائيات احترافية' },
    { id: 'cats', def: 'الأقسام' },
    { id: 'menu', def: 'العناصر', legacyId: 'items' },
    { id: 'orders', def: 'الطلبات', legacyId: 'ord' },
    { id: 'appearance', def: 'المظهر' },
    { id: 'branches', def: 'عدة أفرع' },
    { id: 'addons', def: 'الإضافات' },
    { id: 'qr', def: 'كود QR' },
    { id: 'set', def: 'الإعدادات' },
  ];

  const adminOrderList = (() => {
    const saved = Array.isArray(site.adminTabOrder) ? site.adminTabOrder : [];
    const baseIds = DEFAULT_ADMIN_TAB_META.map((x) => x.id);
    const merged = [...saved.filter((id) => baseIds.includes(id as MainTab)), ...baseIds.filter((id) => !saved.includes(id))];
    return merged as MainTab[];
  })();

  const baseAdminTabs = [
    { id: 'home' as const, Icon: Home, label: customAdminLabel('home', 'الصفحة الرئيسية'), perm: isSuperAdmin || staffPerms.canViewHome !== false },
    {
      id: 'notes' as const,
      Icon: Lightbulb,
      label: customAdminLabel('notes', 'الملاحظات'),
      perm: isSuperAdmin || staffPerms.canUseNotes !== false,
    },
    {
      id: 'partners' as const,
      Icon: Store,
      label: customAdminLabel('partners', 'الحسابات'),
      perm:
        isSuperAdmin ||
        Boolean(
          staffPerms.canManageRestaurants ||
            staffPerms.canEditPartnerPlan ||
            staffPerms.canDeletePartner ||
            staffPerms.canImpersonatePartner
        ),
    },
    {
      id: 'staff' as const,
      Icon: Users,
      label: customAdminLabel('staff', 'الادارة'),
      perm: isSuperAdmin || Boolean(staffPerms.canManageStaff),
    },
    {
      id: 'home_editor' as const,
      Icon: LayoutTemplate,
      label: customAdminLabel('home_editor', 'تعديل الرئيسية'),
      perm: isSuperAdmin || Boolean(staffPerms.canEditHomePage || staffPerms.canManagePlans),
    },
    {
      id: 'reports' as const,
      Icon: AlertTriangle,
      label: customAdminLabel('reports', 'البلاغات'),
      perm: isSuperAdmin || staffPerms.canViewReports !== false,
    },
    {
      id: 'settings' as const,
      Icon: Settings,
      label: customAdminLabel('settings', 'الإعدادات'),
      perm: isSuperAdmin || Boolean(staffPerms.canManageSettings),
    },
  ].filter((t) => t.perm);

  const adminTabs = [...baseAdminTabs].sort(
    (a, b) => adminOrderList.indexOf(a.id) - adminOrderList.indexOf(b.id)
  );

  const activeTabInfo = adminTabs.find((t) => t.id === activeTab) || adminTabs[0];
  const effectiveTab: MainTab = activeTab === 'account' ? 'account' : (activeTabInfo?.id || 'home');
  const activePageTitle = effectiveTab === 'account' ? customAdminLabel('account', 'حسابك') : activeTabInfo?.label;
  const showBottomSaveButton =
    effectiveTab === 'home_editor' ||
    effectiveTab === 'notes' ||
    effectiveTab === 'settings' ||
    effectiveTab === 'account';

  useEffect(() => {
    const titleLabel = activePageTitle || 'لوحة الإدارة';
    const brandName = site.name || 'Menu Plus';
    document.title = `${titleLabel} | ${brandName}`;
  }, [activePageTitle, site.name]);

  return (
    <div className="shell admin-shell" dir="rtl">
      {/* Mobile Slide-over Drawer (تظهر فقط عند الضغط على الثلاث خطوط في الهاتف) */}
      {mobileMenuOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <aside className="drawer-panel" style={{ zIndex: 9999 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 12px', borderBottom: '1px solid var(--line)' }}>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateToMainSite('/', onNavigate, site);
                }}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="الصفحة الرئيسية للموقع"
              >
                <AppLogo size={32} />
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="إغلاق القائمة"
                style={{
                  background: 'var(--mp-glass-control)',
                  border: '1px solid var(--mp-glass-border)',
                  borderRadius: '999px',
                  width: '34px',
                  height: '34px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '12px 10px 18px', overflowY: 'auto', flex: 1 }}>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {adminTabs.map((tab) => {
                  const IconComp = tab.Icon;
                  const isActive = effectiveTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={isActive ? 'on' : ''}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setMobileMenuOpen(false);
                      }}
                    >
                      <IconComp size={17} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.label}</span>
                      {tab.id === 'reports' && newReportsCount > 0 && (
                        <span className="bd">{newReportsCount}</span>
                      )}
                    </button>
                  );
                })}

                <div className="sb-nav-divider" />

                <div className="sb-footer-inline">
                  <button
                    type="button"
                    className="btn s"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigateToMainSite('/', onNavigate, site);
                    }}
                    style={{ width: '100%', justifyContent: 'center', gap: '6px' }}
                  >
                    <Eye size={14} />
                    <span>الموقع العام</span>
                  </button>
                  <button
                    type="button"
                    className="btn s d"
                    onClick={onLogout}
                    style={{ width: '100%', justifyContent: 'center', gap: '6px' }}
                  >
                    <LogOut size={14} />
                    <span>تسجيل الخروج</span>
                  </button>
                </div>
              </nav>
            </div>
          </aside>
        </>
      )}

      {/* Fixed Sidebar for Desktop */}
      <aside className="sb desktop-only">
        <div className="lg">
          <button
            type="button"
            onClick={() => navigateToMainSite('/', onNavigate, site)}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="العودة للصفحة الرئيسية"
          >
            <AppLogo size={36} />
          </button>
        </div>

        <nav>
          {adminTabs.map((tab) => {
            const IconComp = tab.Icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={effectiveTab === tab.id ? 'on' : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                <IconComp size={17} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.label}</span>
                {tab.id === 'reports' && newReportsCount > 0 && (
                  <span className="bd">{newReportsCount}</span>
                )}
              </button>
            );
          })}

          <div className="sb-nav-divider" />

          <div className="sb-footer-inline">
            <button
              type="button"
              className="btn s"
              onClick={() => navigateToMainSite('/', onNavigate, site)}
              style={{ width: '100%', justifyContent: 'center', gap: '7px' }}
            >
              <Eye size={15} />
              <span>الموقع العام</span>
            </button>
            <button
              type="button"
              className="btn s d"
              onClick={onLogout}
              style={{ width: '100%', justifyContent: 'center', gap: '7px' }}
            >
              <LogOut size={15} />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="mn">
        {/* Topbar: Mobile hamburger only, Active tab title, Home link */}
        <header className="app-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <button
              type="button"
              className="hamburger-btn"
              onClick={() => setMobileMenuOpen(true)}
              title="القوائم الجانبية"
              aria-label="القوائم الجانبية"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span style={{ fontWeight: 800, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                {activePageTitle}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              className={`btn${effectiveTab === 'account' ? ' p' : ' s'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '38px',
                height: '38px',
                padding: 0,
                borderRadius: '999px',
                cursor: 'pointer',
              }}
              onClick={() => setActiveTab('account')}
              title={customAdminLabel('account', 'حسابك')}
              aria-label={customAdminLabel('account', 'حسابك')}
            >
              <User size={17} />
            </button>
            <button
              type="button"
              className="btn p"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '38px',
                padding: '0 16px',
                borderRadius: '999px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              onClick={() => navigateToMainSite('/', onNavigate, site)}
              title="الموقع العام"
              aria-label="الموقع العام"
            >
              <Eye size={15} />
              <span>الموقع العام</span>
            </button>
          </div>
        </header>

        <Suspense
          fallback={
            <div style={{ minHeight: '220px', display: 'grid', placeItems: 'center' }} aria-hidden="true">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--brand, #059669)' }} />
            </div>
          }
        >
        <motion.div
          key={effectiveTab}
          {...dashTabMotion(prefersReducedMotion)}
        >
        {/* ============================================================== */}
        {/* TAB 0: HOME REST STATION / LOUNGE (الصفحة الرئيسية - محطة الاستراحة) */}
        {/* ============================================================== */}
        {effectiveTab === 'home' && (
          <AdminHomeLounge
            session={session}
            staffPerms={staffPerms}
            isSuperAdmin={isSuperAdmin}
            pageTitle={site.adminTabLabels?.home?.trim() || undefined}
            onSelectTab={setActiveTab}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 2: UNIFIED PARTNERS & ACCOUNTS (الشركاء والحسابات)         */}
        {/* ============================================================== */}
        {effectiveTab === 'partners' && (
          <UnifiedPartnersAccountsSection
            session={session}
            plans={plans}
            pageTitle={site.adminTabLabels?.partners?.trim() || undefined}
            canManagePartners={isSuperAdmin || Boolean(staffPerms.canManageRestaurants)}
            canCreatePartner={isSuperAdmin || Boolean(staffPerms.canCreatePartner)}
            canSuspendPartner={isSuperAdmin || Boolean(staffPerms.canSuspendPartner)}
            canEditPartnerProfile={isSuperAdmin || Boolean(staffPerms.canEditPartnerProfile)}
            canEditPartnerLinks={isSuperAdmin || Boolean(staffPerms.canEditPartnerLinks)}
            canDeletePartner={isSuperAdmin || Boolean(staffPerms.canDeletePartner)}
            canExtendSubscription={isSuperAdmin || Boolean(staffPerms.canEditPartnerPlan)}
            canEditPartnerPlan={isSuperAdmin || Boolean(staffPerms.canEditPartnerPlan)}
            canImpersonatePartner={isSuperAdmin || Boolean(staffPerms.canImpersonatePartner)}
            onNavigate={onNavigate}
            onRefresh={onRefresh}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: HOME PAGE FULL EDITOR (تعديل الصفحة الرئيسية بالكامل)      */}
        {/* ============================================================== */}
        {effectiveTab === 'home_editor' && (
          <HomePageEditorSection
            site={site}
            home={home}
            plans={plans}
            pageTitle={customAdminLabel('home_editor', 'تعديل الرئيسية')}
            actorLabel={session.phone || session.email || 'المدير'}
            onRefresh={onRefresh}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: OPEN SCRATCHPAD NOTES (مسودة مفتوحة مع حفظ تلقائي)        */}
        {/* ============================================================== */}
        {effectiveTab === 'notes' && (
          <OpenNotesScratchpad
            authorName={session.name || session.phone || session.email || 'الإدارة'}
            pageTitle={site.adminTabLabels?.notes?.trim() || undefined}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: PROBLEM REPORTS (البلاغات الواردة من لوحات الشركاء)         */}
        {/* ============================================================== */}
        {effectiveTab === 'reports' && (
          <AdminReportsSection
            pageTitle={site.adminTabLabels?.reports?.trim() || undefined}
            onRefresh={onRefresh}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 3: PERSISTENT STAFF MANAGEMENT (SUPABASE REST API)         */}
        {/* ============================================================== */}
        {effectiveTab === 'staff' && (
          <StaffManagementSection
            sessionEmail={session.phone || session.email || '07711448594'}
            pageTitle={site.adminTabLabels?.staff?.trim() || undefined}
            canManageStaff={isSuperAdmin || Boolean(staffPerms.canManageStaff)}
            onRefresh={onRefresh}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 7: PLATFORM SETTINGS & SUBDOMAIN GOVERNANCE                 */}
        {/* ============================================================== */}
        {effectiveTab === 'settings' && (() => {
          const curAdminOrder = (() => {
            const saved = Array.isArray(editSite.adminTabOrder) ? editSite.adminTabOrder : [];
            const baseIds = DEFAULT_ADMIN_TAB_META.map((x) => x.id);
            return [...saved.filter((id) => baseIds.includes(id as MainTab)), ...baseIds.filter((id) => !saved.includes(id))];
          })();
          const curDashOrder = (() => {
            const saved = Array.isArray(editSite.dashboardTabOrder) ? editSite.dashboardTabOrder : [];
            const baseIds = DEFAULT_DASH_TAB_META.map((x) => x.id);
            return [...saved.filter((id) => baseIds.includes(id)), ...baseIds.filter((id) => !saved.includes(id))];
          })();

          const moveAdminOrder = (fromIdx: number, toIdx: number) => {
            if (fromIdx === toIdx || toIdx < 0 || toIdx >= curAdminOrder.length) return;
            const copy = [...curAdminOrder];
            const [moved] = copy.splice(fromIdx, 1);
            copy.splice(toIdx, 0, moved);
            setEditSite({ ...editSite, adminTabOrder: copy });
          };

          const moveDashOrder = (fromIdx: number, toIdx: number) => {
            if (fromIdx === toIdx || toIdx < 0 || toIdx >= curDashOrder.length) return;
            const copy = [...curDashOrder];
            const [moved] = copy.splice(fromIdx, 1);
            copy.splice(toIdx, 0, moved);
            setEditSite({ ...editSite, dashboardTabOrder: copy });
          };

          const allowLabels = isSuperAdmin || Boolean(staffPerms.canEditTabLabels);
          const allowReorder = isSuperAdmin || Boolean(staffPerms.canReorderTabs);
          const allowThemePay = isSuperAdmin || Boolean(staffPerms.canManageThemeMode);

          return (
            <div>
              <div className="mp-admin-settings-sections" style={{ gap: '20px', marginTop: '4px' }}>
              {/* Frame 1: Appearance */}
              <motion.div
                id="adm-general"
                className="mp-framed-wrap"
                {...dashSectionMotion(prefersReducedMotion, 0, true)}
              >
                <div className="mp-framed-title">
                  <span>المظهر</span>
                </div>
                  <div className="mp-framed-box" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(() => {
                      const homeMode = editSite.homeThemeMode || 'light';
                      return (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px 14px',
                          }}
                        >
                          <div style={{ fontSize: '13.5px', fontWeight: 800 }}>
                            الموقع العام
                          </div>

                          <div
                            className="mp-seg-group"
                            role="group"
                            aria-label="الموقع العام"
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                              width: 'min(100%, 285px)',
                              flexShrink: 0,
                            }}
                          >
                            <button
                              type="button"
                              disabled={!allowThemePay}
                              className={`mp-seg-btn${homeMode === 'light' ? ' is-active' : ''}`}
                              style={{ justifyContent: 'center', width: '100%' }}
                              onClick={() => void handleSelectHomeThemeMode('light')}
                            >
                              <Sun size={14} />
                              <span>فاتح</span>
                            </button>
                            <button
                              type="button"
                              disabled={!allowThemePay}
                              className={`mp-seg-btn${homeMode === 'dark' ? ' is-active' : ''}`}
                              style={{ justifyContent: 'center', width: '100%' }}
                              onClick={() => void handleSelectHomeThemeMode('dark')}
                            >
                              <Moon size={14} />
                              <span>داكن</span>
                            </button>
                            <button
                              type="button"
                              disabled={!allowThemePay}
                              className={`mp-seg-btn${homeMode === 'auto' ? ' is-active' : ''}`}
                              style={{ justifyContent: 'center', width: '100%' }}
                              onClick={() => void handleSelectHomeThemeMode('auto')}
                            >
                              <Monitor size={14} />
                              <span>حسب الجهاز</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ height: '1px', background: 'var(--line)' }} />

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px 14px',
                      }}
                    >
                      <div style={{ fontSize: '13.5px', fontWeight: 800 }}>
                        لوحة الأدمن
                      </div>

                      <div
                        className="mp-seg-group"
                        role="group"
                        aria-label="لوحة الأدمن"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                          width: 'min(100%, 285px)',
                          flexShrink: 0,
                        }}
                      >
                        <button
                          type="button"
                          disabled={!allowThemePay}
                          className={`mp-seg-btn${(editSite.adminThemeMode || 'light') === 'light' ? ' is-active' : ''}`}
                          style={{ justifyContent: 'center', width: '100%' }}
                          onClick={() => void handleSelectAdminThemeMode('light')}
                        >
                          <Sun size={14} />
                          <span>فاتح</span>
                        </button>
                        <button
                          type="button"
                          disabled={!allowThemePay}
                          className={`mp-seg-btn${editSite.adminThemeMode === 'dark' ? ' is-active' : ''}`}
                          style={{ justifyContent: 'center', width: '100%' }}
                          onClick={() => void handleSelectAdminThemeMode('dark')}
                        >
                          <Moon size={14} />
                          <span>داكن</span>
                        </button>
                        <button
                          type="button"
                          disabled={!allowThemePay}
                          className={`mp-seg-btn${editSite.adminThemeMode === 'auto' ? ' is-active' : ''}`}
                          style={{ justifyContent: 'center', width: '100%' }}
                          onClick={() => void handleSelectAdminThemeMode('auto')}
                        >
                          <Monitor size={14} />
                          <span>حسب الجهاز</span>
                        </button>
                      </div>
                    </div>

                    <div style={{ height: '1px', background: 'var(--line)' }} />

                    {(() => {
                      const globalDashMode = editSite.dashboardThemeMode || 'light';
                      const overriddenCount = getCollection<Restaurant>('restaurants').filter(
                        (r) => r.dashboardThemeMode && r.dashboardThemeMode !== globalDashMode
                      ).length;

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '10px 14px',
                            }}
                          >
                            <div style={{ fontSize: '13.5px', fontWeight: 800 }}>
                              لوحة الزبائن
                            </div>

                            <div
                              className="mp-seg-group"
                              role="group"
                              aria-label="لوحة الزبائن"
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                width: 'min(100%, 285px)',
                                flexShrink: 0,
                              }}
                            >
                              <button
                                type="button"
                                disabled={!allowThemePay}
                                className={`mp-seg-btn${globalDashMode === 'light' ? ' is-active' : ''}`}
                                style={{ justifyContent: 'center', width: '100%' }}
                                onClick={() => void handleSelectGlobalDashboardThemeMode('light')}
                              >
                                <Sun size={14} />
                                <span>فاتح</span>
                              </button>
                              <button
                                type="button"
                                disabled={!allowThemePay}
                                className={`mp-seg-btn${globalDashMode === 'dark' ? ' is-active' : ''}`}
                                style={{ justifyContent: 'center', width: '100%' }}
                                onClick={() => void handleSelectGlobalDashboardThemeMode('dark')}
                              >
                                <Moon size={14} />
                                <span>داكن</span>
                              </button>
                              <button
                                type="button"
                                disabled={!allowThemePay}
                                className={`mp-seg-btn${globalDashMode === 'auto' ? ' is-active' : ''}`}
                                style={{ justifyContent: 'center', width: '100%' }}
                                onClick={() => void handleSelectGlobalDashboardThemeMode('auto')}
                              >
                                <Monitor size={14} />
                                <span>حسب الجهاز</span>
                              </button>
                            </div>
                          </div>

                          {overriddenCount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                              <button
                                type="button"
                                disabled={!allowThemePay}
                                className="btn s"
                                onClick={() => void handleApplyDashboardThemeToAllStores(globalDashMode)}
                                style={{ fontSize: '11.5px', fontWeight: 700, minHeight: '28px', padding: '3px 10px' }}
                              >
                                تعميم على الكل ({overriddenCount})
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </motion.div>

                {/* Frame 2: Payment & WhatsApp */}
                <motion.div
                  id="adm-payment"
                  className="mp-framed-wrap"
                  {...dashSectionMotion(prefersReducedMotion, 0.03, true)}
                >
                  <div className="mp-framed-title">
                    <Wallet size={15} style={{ color: 'var(--brand-ink, #34D399)' }} />
                    <span>الدفع والواتساب</span>
                  </div>
                  <div className="mp-framed-box mp-compact-payment-box">
                    <div className="g2" style={{ gap: '10px' }}>
                      <label className="f" style={{ margin: 0 }}>
                        زين كاش
                        <input
                          dir="ltr"
                          disabled={!allowThemePay}
                          value={editSite.zainCashNumber || ''}
                          onChange={(e) => setEditSite({ ...editSite, zainCashNumber: e.target.value })}
                          placeholder="078..."
                        />
                      </label>
                      <label className="f" style={{ margin: 0 }}>
                        ماستر / كي كارد
                        <input
                          dir="ltr"
                          disabled={!allowThemePay}
                          value={editSite.qiCardNumber || ''}
                          onChange={(e) => setEditSite({ ...editSite, qiCardNumber: e.target.value })}
                          placeholder="رقم البطاقة..."
                        />
                      </label>
                      <label className="f" style={{ margin: 0 }}>
                        واتساب الدعم
                        <input
                          dir="ltr"
                          disabled={!allowThemePay}
                          value={editSite.supportWhatsapp ?? editSite.wa ?? '07724799679'}
                          onChange={(e) =>
                            setEditSite({
                              ...editSite,
                              supportWhatsapp: e.target.value,
                              wa: e.target.value,
                            })
                          }
                          placeholder="07724799679"
                        />
                      </label>
                      <label className="f" style={{ margin: 0 }}>
                        ملاحظة الدفع
                        <input
                          disabled={!allowThemePay}
                          value={editSite.paymentNote || ''}
                          onChange={(e) => setEditSite({ ...editSite, paymentNote: e.target.value })}
                          placeholder="اختياري..."
                        />
                      </label>
                    </div>
                  </div>
                </motion.div>

              {/* Frame 3: Admin Tabs */}
              <motion.div
                id="adm-tabs-admin"
                className="mp-framed-wrap"
                {...dashSectionMotion(prefersReducedMotion, 0.04, true)}
              >
                  <div className="mp-framed-title">
                    <span>قوائم الإدارة</span>
                  </div>
                  <div className="mp-framed-box mp-tabs-col-box">
                    <div className="mp-tab-order-list">
                      {curAdminOrder.map((tabId, idx) => {
                        const meta = DEFAULT_ADMIN_TAB_META.find((m) => m.id === tabId);
                        if (!meta) return null;
                        const rawVal = editSite.adminTabLabels?.[meta.id];
                        const currentVal = rawVal !== undefined ? rawVal : meta.def;
                        return (
                          <div
                            key={meta.id}
                            draggable={allowReorder}
                            onDragStart={() => setDragAdminIdx(idx)}
                            onDragOver={(e) => {
                              if (allowReorder) e.preventDefault();
                            }}
                            onDrop={() => {
                              if (allowReorder && dragAdminIdx !== null) {
                                moveAdminOrder(dragAdminIdx, idx);
                                setDragAdminIdx(null);
                              }
                            }}
                            onDragEnd={() => setDragAdminIdx(null)}
                            className={`mp-tab-order-tile${dragAdminIdx === idx ? ' is-dragging' : ''}`}
                          >
                            {allowReorder && (
                              <span className="mp-tab-order-grip" title="اسحب للترتيب">
                                <GripVertical size={15} />
                              </span>
                            )}
                            <input
                              type="text"
                              disabled={!allowLabels}
                              aria-label={meta.def}
                              value={currentVal}
                              placeholder={meta.def}
                              className="mp-tab-order-input"
                              onChange={(e) =>
                                setEditSite({
                                  ...editSite,
                                  adminTabLabels: {
                                    ...(editSite.adminTabLabels || {}),
                                    [meta.id]: e.target.value,
                                  },
                                })
                              }
                            />
                            {allowReorder && (
                              <div className="mp-tab-order-btns">
                                <button
                                  type="button"
                                  className="mp-tab-order-btn"
                                  disabled={idx === 0}
                                  onClick={() => moveAdminOrder(idx, idx - 1)}
                                  title="لأعلى"
                                  aria-label="لأعلى"
                                >
                                  <ChevronUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="mp-tab-order-btn"
                                  disabled={idx === curAdminOrder.length - 1}
                                  onClick={() => moveAdminOrder(idx, idx + 1)}
                                  title="لأسفل"
                                  aria-label="لأسفل"
                                >
                                  <ChevronDown size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>

              {/* Frame 4: Customer Dashboard Tabs */}
              <motion.div
                id="adm-tabs-dash"
                className="mp-framed-wrap"
                {...dashSectionMotion(prefersReducedMotion, 0.04, true)}
              >
                  <div className="mp-framed-title">
                    <span>قوائم الزبون</span>
                  </div>
                  <div className="mp-framed-box mp-tabs-col-box">
                    <div className="mp-tab-order-list">
                      {curDashOrder.map((tabId, idx) => {
                        const item = DEFAULT_DASH_TAB_META.find((m) => m.id === tabId);
                        if (!item) return null;
                        const labels = editSite.dashboardTabLabels || {};
                        const rawVal =
                          labels[item.id] !== undefined
                            ? labels[item.id]
                            : item.legacyId && labels[item.legacyId] !== undefined
                            ? labels[item.legacyId]
                            : undefined;
                        const currentVal = rawVal !== undefined ? rawVal : item.def;
                        return (
                          <div
                            key={item.id}
                            draggable={allowReorder}
                            onDragStart={() => setDragDashIdx(idx)}
                            onDragOver={(e) => {
                              if (allowReorder) e.preventDefault();
                            }}
                            onDrop={() => {
                              if (allowReorder && dragDashIdx !== null) {
                                moveDashOrder(dragDashIdx, idx);
                                setDragDashIdx(null);
                              }
                            }}
                            onDragEnd={() => setDragDashIdx(null)}
                            className={`mp-tab-order-tile${dragDashIdx === idx ? ' is-dragging' : ''}`}
                          >
                            {allowReorder && (
                              <span className="mp-tab-order-grip" title="اسحب للترتيب">
                                <GripVertical size={15} />
                              </span>
                            )}
                            <input
                              type="text"
                              disabled={!allowLabels}
                              aria-label={item.def}
                              value={currentVal}
                              placeholder={item.def}
                              className="mp-tab-order-input"
                              onChange={(e) => {
                                const nextLabels: Record<string, string> = {
                                  ...(editSite.dashboardTabLabels || {}),
                                  [item.id]: e.target.value,
                                };
                                if (item.legacyId) delete nextLabels[item.legacyId];
                                setEditSite({
                                  ...editSite,
                                  dashboardTabLabels: nextLabels,
                                });
                              }}
                            />
                            {allowReorder && (
                              <div className="mp-tab-order-btns">
                                <button
                                  type="button"
                                  className="mp-tab-order-btn"
                                  disabled={idx === 0}
                                  onClick={() => moveDashOrder(idx, idx - 1)}
                                  title="لأعلى"
                                  aria-label="لأعلى"
                                >
                                  <ChevronUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="mp-tab-order-btn"
                                  disabled={idx === curDashOrder.length - 1}
                                  onClick={() => moveDashOrder(idx, idx + 1)}
                                  title="لأسفل"
                                  aria-label="لأسفل"
                                >
                                  <ChevronDown size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>

              {/* Frame 5: Plan Features Customization & Top-to-Bottom Reordering */}
              {(isSuperAdmin || Boolean(staffPerms.canManagePlans)) && editPlans.length > 0 && (
                <motion.div
                  id="adm-plan-features"
                  className="mp-framed-wrap"
                  {...dashSectionMotion(prefersReducedMotion, 0.04, true)}
                >
                  <div className="mp-framed-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <span>ميزات الباقات</span>
                  </div>
                  <div className="mp-framed-box">
                    <PlanFeaturesOrderEditor
                      plans={editPlans}
                      selectedPlanIdx={settingsPlanIdx}
                      onSelectPlanIdx={setSettingsPlanIdx}
                      onChangePlans={setEditPlans}
                      showPlanTabs={true}
                      showToast={showToast}
                    />
                  </div>
                </motion.div>
              )}

              {/* Frame 6: Telegram Order Notification Bot Settings */}
              <TelegramSettingsCard
                canManageSettings={isSuperAdmin || Boolean(staffPerms.canManageSettings)}
                showToast={showToast}
              />

              {/* Frame 7: Simple Unused Stored Images Cleanup */}
              {(isSuperAdmin || Boolean(staffPerms.canRunMaintenance || staffPerms.canManageSettings)) && (
                <motion.div
                  id="adm-storage-cleanup"
                  className="mp-framed-wrap"
                  {...dashSectionMotion(prefersReducedMotion, 0.04, true)}
                >
                  <div className="mp-framed-title">
                    <Trash2 size={15} style={{ color: 'var(--brand-ink, #34D399)' }} />
                    <span>الصور المخزنة</span>
                  </div>
                  <div className="mp-framed-box mp-cleanup-box">
                    <div style={{ fontSize: '14px', fontWeight: 800 }}>
                      حذف الصور غير المستخدمة
                    </div>
                    <button
                      type="button"
                      className="btn s d mp-cleanup-btn"
                      disabled={cleaningImages}
                      onClick={() => void handleCleanupUnusedImages()}
                    >
                      {cleaningImages ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      <span>{cleaningImages ? 'جارٍ التنظيف...' : 'تنظيف الآن'}</span>
                    </button>
                    {cleanupSummary && (
                      <div className="mp-db-cleanup-result">
                        <span>{cleanupSummary}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
              </div>
            </div>
          );
        })()}

        {/* ============================================================== */}
        {/* TAB 8: PERSONAL ACCOUNT SETTINGS (OWNER & ALL STAFF)           */}
        {/* ============================================================== */}
        {effectiveTab === 'account' && (
          <MyAccountSection
            session={session}
            pageTitle={site.adminTabLabels?.account?.trim() || undefined}
            onRefresh={onRefresh}
            onLogout={onLogout}
            showToast={showToast}
          />
        )}
        </motion.div>
        </Suspense>

        {showBottomSaveButton && (
          <div className="mp-floating-save-wrap" dir="rtl">
            <button
              type="button"
              className="mp-floating-save-btn"
              disabled={unifiedSaving}
              onClick={() => void flushAllAdminSaves()}
            >
              {unifiedSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>حفظ التغيرات</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export const AdminView = React.memo(AdminViewInner);

