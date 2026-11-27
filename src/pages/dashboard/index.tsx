/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, ChevronDown, Eye, Loader2, LogOut, MessageCircle, Save, Share2, Store, X } from 'lucide-react';
import { AppLogo } from '../../components/AppLogo';
import { AjaxConfirmModal } from '../../components/AjaxConfirmModal';
import { PauseVisibilityModal } from '../../components/PauseVisibilityModal';
import { BranchSwitcherModal } from '../../components/BranchSwitcherModal';
import {
  DashboardPWAInstallBanner,
  DashboardPushPermissionBanner,
  DashboardSidebarInstallButton,
} from '../../components/DashboardPWAInstallPrompt';
import { DEFAULT_SITE, getSlugForRestaurantId } from '../../utils/storage';
import { getMainSiteUrl, navigateToMainSite, sanitizeSlug } from '../../utils/businessDefaults';
import { getDashboardTabPath } from '../../utils/router';
import { dashTabMotion } from '../../utils/dashboardMotion';
import {
  DashboardProvider,
  DashboardTab,
  DashboardViewProps,
  useDashboard,
} from './DashboardContext';

const PlanPurchaseModal = lazy(() =>
  import('../../components/PlanPurchaseModal').then((m) => ({ default: m.PlanPurchaseModal }))
);
const ShareMenuModal = lazy(() =>
  import('../../components/ShareMenuModal').then((m) => ({ default: m.ShareMenuModal }))
);
const ReportProblemModal = lazy(() =>
  import('../../components/ReportProblemModal').then((m) => ({ default: m.ReportProblemModal }))
);
const HomePage = lazy(() => import('./HomePage').then((m) => ({ default: m.HomePage })));
const StatsPage = lazy(() => import('./StatsPage').then((m) => ({ default: m.StatsPage })));
const CategoriesPage = lazy(() => import('./CategoriesPage').then((m) => ({ default: m.CategoriesPage })));
const ItemsPage = lazy(() => import('./ItemsPage').then((m) => ({ default: m.ItemsPage })));
const AddonsPage = lazy(() => import('./AddonsPage').then((m) => ({ default: m.AddonsPage })));
const AppearancePage = lazy(() => import('./AppearancePage').then((m) => ({ default: m.AppearancePage })));
const BranchesPage = lazy(() => import('./BranchesPage').then((m) => ({ default: m.BranchesPage })));
const OrdersPage = lazy(() => import('./OrdersPage').then((m) => ({ default: m.OrdersPage })));
const QrPage = lazy(() => import('./QrPage').then((m) => ({ default: m.QrPage })));
const SettingsPage = lazy(() => import('./SettingsPage').then((m) => ({ default: m.SettingsPage })));

const TAB_PREFETCHERS: Partial<Record<DashboardTab, () => Promise<unknown>>> = {
  home: () => import('./HomePage'),
  cats: () => import('./CategoriesPage'),
  menu: () => import('./ItemsPage'),
  orders: () => import('./OrdersPage'),
  stats: () => import('./StatsPage'),
  appearance: () => import('./AppearancePage'),
  branches: () => import('./BranchesPage'),
  addons: () => import('./AddonsPage'),
  qr: () => import('./QrPage'),
  set: () => import('./SettingsPage'),
};

const TabFallback = () => (
  <div style={{ minHeight: '220px', display: 'grid', placeItems: 'center' }} aria-hidden="true">
    <Loader2 size={24} className="animate-spin" style={{ color: 'var(--brand, #059669)' }} />
  </div>
);

const DashboardShell: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [reportModalOpen, setReportModalOpen] = React.useState(false);
  const {
    session,
    navTabs,
    site,
    mainRid,
    activeRid,
    mainRest,
    rest,
    branchesList,
    ownedMenus,
    switchActiveBranch,
    switchOwnedMenu,
    branchModalOpen,
    branchModalIsStartup,
    openBranchSwitcherModal,
    dismissBranchModal,
    resolvedPlan,
    purchaseModalPlan,
    setPurchaseModalPlan,
    terms,
    customTabLabel,
    supportWaHref,
    publicPath,
    liveMenuUrl,
    shareModalOpen,
    setShareModalOpen,
    openShareModal,
    activeTab,
    setActiveTab,
    drawerOpen,
    setDrawerOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    isItemEditorOpen,
    setIsItemEditorOpen,
    editingItemId,
    newOrdersCount,
    ajaxDialog,
    setAjaxDialog,
    pauseModalTarget,
    setPauseModalTarget,
    handleConfirmManualPause,
    flushPendingAppearanceSave,
    flushAllPendingSaves,
    unifiedSaving,
    onNavigate,
    onLogout,
    showToast,
    notificationPermission,
    pushSupported,
    enableDashboardPushNotifications,
  } = useDashboard();

  const isTabLocked = (tabId: DashboardTab): boolean => {
    if (tabId === 'stats') return !resolvedPlan.perms.analytics;
    if (tabId === 'branches') return resolvedPlan.maxBranches === 0;
    if (tabId === 'qr') return !resolvedPlan.perms.qrCode;
    return false;
  };

  // Respect admin site?.dashboardTabOrder when defined, otherwise keep default navTabs order
  const orderedTabs = (() => {
    const customOrder = site?.dashboardTabOrder;
    if (Array.isArray(customOrder) && customOrder.length > 0) {
      const rank = new Map<string, number>();
      customOrder.forEach((id, idx) => {
        rank.set(id === 'items' ? 'menu' : id === 'ord' ? 'orders' : id, idx);
      });
      return [...navTabs].sort((a, b) => {
        const ra = rank.has(a.id) ? rank.get(a.id)! : 999;
        const rb = rank.has(b.id) ? rank.get(b.id)! : 999;
        return ra - rb;
      });
    }
    return [...navTabs];
  })();

  const activeNavTab = navTabs.find((t) => t.id === activeTab);
  const activeTabTitle = activeNavTab
    ? customTabLabel(activeNavTab.id, activeNavTab.label)
    : terms.isStore
    ? 'لوحة تحكم المتجر'
    : 'لوحة التحكم';
  const activeBranchDisplayName =
    activeRid === mainRid
      ? mainRest.branchName?.trim() || mainRest.n
      : rest.branchName?.trim() || rest.n;

  const activeMenuSlugForUrl =
    getSlugForRestaurantId(activeRid) || sanitizeSlug(rest.slug || rest.subdomain || '');
  const getTabHref = (tabId: DashboardTab) =>
    getDashboardTabPath(tabId, activeRid === mainRid ? undefined : activeRid, activeMenuSlugForUrl);
  const isModifiedLinkEvent = (e: React.MouseEvent<HTMLAnchorElement>) =>
    e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

  useEffect(() => {
    document.title = `${activeTabTitle} | ${activeBranchDisplayName || 'Menu Plus'}`;
  }, [activeTabTitle, activeBranchDisplayName]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefetchRemainingTabs = () => {
      Object.entries(TAB_PREFETCHERS).forEach(([tabId, loader]) => {
        if (tabId !== activeTab && loader) {
          void loader().catch(() => {});
        }
      });
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const idleId = w.requestIdleCallback(prefetchRemainingTabs, { timeout: 1400 });
      return () => {
        w.cancelIdleCallback?.(idleId);
      };
    }
    const timer = window.setTimeout(prefetchRemainingTabs, 450);
    return () => window.clearTimeout(timer);
  }, []);

  const localizedPlanTitle = resolvedPlan.plan.n;
  const lockedTooltip = 'متاح في الباقات الأعلى';

  const showBottomSaveButton =
    activeTab === 'set' ||
    activeTab === 'appearance' ||
    (activeTab === 'qr' && resolvedPlan.perms.qrCode) ||
    (activeTab === 'menu' && isItemEditorOpen && Boolean(editingItemId));

  const renderStoreSummaryCard = (compact?: boolean, closeDrawer?: boolean) => {
    const canSwitchBranches = branchesList.length > 0;
    const triggerSwitch = () => {
      if (!canSwitchBranches) return;
      if (closeDrawer) setDrawerOpen(false);
      openBranchSwitcherModal();
    };
    return (
      <div
        className={`mp-sb-store-card ${compact ? 'is-compact' : ''}`}
        role={canSwitchBranches ? 'button' : undefined}
        tabIndex={canSwitchBranches ? 0 : undefined}
        onClick={canSwitchBranches ? triggerSwitch : undefined}
        onKeyDown={
          canSwitchBranches
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  triggerSwitch();
                }
              }
            : undefined
        }
        style={canSwitchBranches ? { cursor: 'pointer' } : undefined}
        title={canSwitchBranches ? 'اضغط لتبديل الفرع' : activeBranchDisplayName}
      >
        <div className="mp-sb-store-row">
          <Store size={14} className="mp-sb-store-ico" />
          <span className="mp-sb-store-name" title={activeBranchDisplayName}>
            {activeBranchDisplayName}
          </span>
          {canSwitchBranches && (
            <ChevronDown
              size={14}
              style={{
                marginInlineStart: 'auto',
                flexShrink: 0,
                color: 'var(--brand-ink, var(--brand))',
              }}
            />
          )}
        </div>
        <div className="mp-sb-store-plan">{localizedPlanTitle}</div>
      </div>
    );
  };

  const renderNavFooter = (closeDrawer?: boolean) => (
    <>
      <div className="sb-nav-divider" />

      <div className="sb-footer-inline">
        {closeDrawer && (
          <DashboardSidebarInstallButton
            restaurantName={mainRest.n}
            branchName={activeRid !== mainRid ? rest.branchName || rest.n : undefined}
            storageKeyId={activeRid}
            showToast={showToast}
            onAction={() => setDrawerOpen(false)}
          />
        )}

        <button
          type="button"
          className="sb-footer-item"
          onClick={() => {
            if (closeDrawer) setDrawerOpen(false);
            setReportModalOpen(true);
          }}
        >
          <AlertTriangle size={17} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span>إبلاغ عن مشكلة</span>
        </button>

        <a
          href={supportWaHref}
          target="_blank"
          rel="noopener noreferrer"
          className="sb-footer-item"
          onClick={() => {
            if (closeDrawer) setDrawerOpen(false);
          }}
        >
          <MessageCircle size={17} style={{ color: '#25D366', flexShrink: 0 }} />
          <span>احصل على مساعدة</span>
        </a>

        <button
          type="button"
          className="sb-footer-item is-danger"
          onClick={() => {
            if (closeDrawer) setDrawerOpen(false);
            onLogout();
          }}
        >
          <LogOut size={17} style={{ flexShrink: 0 }} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </>
  );

  return (
    <div
      className={`shell customer-shell ${sidebarCollapsed ? 'collapsed' : ''}`}
      dir="rtl"
    >
      {/* SLIDE-OVER DRAWER (Mobile Hamburger Menu) */}
      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="drawer-panel" style={{ zIndex: 9999 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 12px', borderBottom: '1px solid var(--line)' }}>
              <a
                href={getMainSiteUrl('/', site)}
                onClick={(e) => {
                  if (isModifiedLinkEvent(e)) {
                    setDrawerOpen(false);
                    return;
                  }
                  e.preventDefault();
                  setDrawerOpen(false);
                  navigateToMainSite('/', onNavigate, site);
                }}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', textDecoration: 'none' }}
                title="الصفحة الرئيسية للموقع"
              >
                <AppLogo size={32} />
              </a>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="إغلاق القائمة"
                style={{
                  background: 'var(--mp-glass-control)',
                  border: '1px solid var(--mp-glass-border, var(--line))',
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
              <div className="mp-sb-header-stack">
                {renderStoreSummaryCard(true, true)}
              </div>

              <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {orderedTabs.map((tab) => {
                  const IconComp = tab.Icon;
                  const isActive = activeTab === tab.id;
                  const isLocked = isTabLocked(tab.id);
                  const label = customTabLabel(tab.id, tab.label);
                  return (
                    <a
                      key={tab.id}
                      href={getTabHref(tab.id)}
                      className={isActive ? 'on' : ''}
                      onPointerEnter={() => void TAB_PREFETCHERS[tab.id]?.()}
                      onFocus={() => void TAB_PREFETCHERS[tab.id]?.()}
                      onClick={(e) => {
                        if (isModifiedLinkEvent(e)) {
                          setDrawerOpen(false);
                          return;
                        }
                        e.preventDefault();
                        setActiveTab(tab.id);
                        setIsItemEditorOpen(false);
                        setDrawerOpen(false);
                      }}
                      style={isLocked ? { opacity: 0.62 } : undefined}
                    >
                      <IconComp size={17} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                      {tab.id === 'orders' && newOrdersCount > 0 && (
                        <span className="bd">{newOrdersCount}</span>
                      )}
                      {isLocked && (
                        <span style={{ fontSize: '11px', flexShrink: 0 }} title={lockedTooltip}>
                          🔒
                        </span>
                      )}
                    </a>
                  );
                })}

                {renderNavFooter(true)}
              </nav>
            </div>
          </aside>
        </>
      )}

      {/* DESKTOP SIDEBAR (Matches Admin Sidebar Design) */}
      <aside className="sb desktop-only">
        <div className="lg">
          <a
            href={getMainSiteUrl('/', site)}
            onClick={(e) => {
              if (isModifiedLinkEvent(e)) return;
              e.preventDefault();
              navigateToMainSite('/', onNavigate, site);
            }}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', textDecoration: 'none' }}
            title="العودة للصفحة الرئيسية"
          >
            <AppLogo size={36} />
          </a>

          <div className="mp-sb-header-stack" style={{ marginTop: '10px' }}>
            {renderStoreSummaryCard()}
          </div>
        </div>

        <nav>
          {orderedTabs.map((tab) => {
            const IconComp = tab.Icon;
            const isActive = activeTab === tab.id;
            const isLocked = isTabLocked(tab.id);
            const label = customTabLabel(tab.id, tab.label);
            return (
              <a
                key={tab.id}
                href={getTabHref(tab.id)}
                className={isActive ? 'on' : ''}
                style={isLocked ? { opacity: 0.62 } : undefined}
                onPointerEnter={() => void TAB_PREFETCHERS[tab.id]?.()}
                onFocus={() => void TAB_PREFETCHERS[tab.id]?.()}
                onClick={(e) => {
                  if (isModifiedLinkEvent(e)) return;
                  e.preventDefault();
                  setActiveTab(tab.id);
                  setIsItemEditorOpen(false);
                }}
              >
                <IconComp size={17} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {label}
                </span>
                {tab.id === 'orders' && newOrdersCount > 0 && (
                  <span className="bd">{newOrdersCount}</span>
                )}
                {isLocked && (
                  <span style={{ fontSize: '11px', flexShrink: 0 }} title={lockedTooltip}>
                    🔒
                  </span>
                )}
              </a>
            );
          })}

          {renderNavFooter(false)}
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="mn">
        <header className="app-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <button
              type="button"
              className="hamburger-btn"
              onClick={() => {
                if (window.innerWidth <= 900) {
                  setDrawerOpen(true);
                } else {
                  setSidebarCollapsed((prev) => !prev);
                }
              }}
              title={sidebarCollapsed ? 'إظهار القائمة الجانبية' : 'إخفاء / إظهار القائمة'}
              aria-label="القائمة"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>

            <span style={{ fontWeight: 800, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
              {activeTabTitle}
            </span>
          </div>

          <div className="mp-dash-topbar-actions">
            <button
              type="button"
              className="mp-dash-topbar-btn"
              onClick={openShareModal}
              aria-label={terms.isStore ? 'مشاركة المتجر' : 'مشاركة المنيو'}
              title={terms.isStore ? 'مشاركة المتجر' : 'مشاركة المنيو'}
            >
              <Share2 size={18} />
              <span className="mp-dash-topbar-label">{terms.isStore ? 'مشاركة المتجر' : 'مشاركة المنيو'}</span>
            </button>

            <a
              href={publicPath}
              className="mp-dash-topbar-btn is-primary"
              style={{ textDecoration: 'none' }}
              onClick={(e) => {
                if (isModifiedLinkEvent(e)) return;
                e.preventDefault();
                void flushPendingAppearanceSave();
                onNavigate(publicPath);
              }}
              aria-label={terms.isStore ? 'معاينة المتجر' : 'معاينة المنيو'}
              title={terms.isStore ? 'معاينة المتجر' : 'معاينة المنيو'}
            >
              <Eye size={18} />
              <span className="mp-dash-topbar-label">{terms.isStore ? 'معاينة المتجر' : 'معاينة المنيو'}</span>
            </a>
          </div>
        </header>

        <DashboardPWAInstallBanner
          restaurantName={mainRest.n}
          branchName={activeRid !== mainRid ? rest.branchName || rest.n : undefined}
          storageKeyId={activeRid}
          showToast={showToast}
        />

        {pushSupported && (
          <DashboardPushPermissionBanner
            permission={notificationPermission}
            onEnable={() => void enableDashboardPushNotifications()}
          />
        )}

        <Suspense fallback={<TabFallback />}>
          <motion.div
            key={activeTab}
            {...dashTabMotion(prefersReducedMotion)}
          >
            {activeTab === 'home' && <HomePage />}
            {activeTab === 'cats' && <CategoriesPage />}
            {activeTab === 'menu' && <ItemsPage />}
            {activeTab === 'orders' && <OrdersPage />}
            {activeTab === 'stats' && <StatsPage />}
            {activeTab === 'appearance' && <AppearancePage />}
            {activeTab === 'branches' && <BranchesPage />}
            {activeTab === 'addons' && <AddonsPage />}
            {activeTab === 'qr' && <QrPage />}
            {activeTab === 'set' && <SettingsPage />}
          </motion.div>
        </Suspense>

        {showBottomSaveButton && (
          <div className="mp-floating-save-wrap" dir="rtl">
            <button
              type="button"
              className="mp-floating-save-btn"
              disabled={unifiedSaving}
              onClick={() => void flushAllPendingSaves()}
            >
              {unifiedSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>حفظ التغيرات</span>
            </button>
          </div>
        )}
      </main>

      <AjaxConfirmModal
        dialog={ajaxDialog}
        onClose={() => setAjaxDialog((prev) => ({ ...prev, isOpen: false }))}
      />

      <PauseVisibilityModal
        target={pauseModalTarget}
        isStore={terms.isStore}
        onClose={() => setPauseModalTarget(null)}
        onConfirm={handleConfirmManualPause}
      />

      <BranchSwitcherModal
        isOpen={branchModalOpen && branchesList.length > 0}
        isStartupPrompt={branchModalIsStartup}
        mainRid={mainRid}
        activeRid={activeRid}
        mainRest={mainRest}
        branchesList={branchesList}
        ownedMenus={ownedMenus}
        isStore={terms.isStore}
        onSelectBranch={(targetRid) => void switchActiveBranch(targetRid)}
        onSelectMenu={(targetRid, targetSlug) => void switchOwnedMenu(targetRid, targetSlug)}
        onClose={dismissBranchModal}
        showToast={showToast}
      />

      {Boolean(purchaseModalPlan) && (
        <Suspense fallback={null}>
          <PlanPurchaseModal
            isOpen={true}
            plan={purchaseModalPlan}
            site={site || DEFAULT_SITE}
            restaurantName={mainRest.n}
            onClose={() => setPurchaseModalPlan(null)}
          />
        </Suspense>
      )}

      {shareModalOpen && (
        <Suspense fallback={null}>
          <ShareMenuModal
            isOpen={true}
            onClose={() => setShareModalOpen(false)}
            menuName={rest.n}
            menuUrl={liveMenuUrl}
            description={rest.tagline}
            isStore={terms.isStore}
            onCopied={showToast}
          />
        </Suspense>
      )}

      {reportModalOpen && (
        <Suspense fallback={null}>
          <ReportProblemModal
            isOpen={true}
            onClose={() => setReportModalOpen(false)}
            rest={rest}
            session={session}
            showToast={showToast}
          />
        </Suspense>
      )}
    </div>
  );
};

export const DashboardPage: React.FC<DashboardViewProps> = React.memo((props) => (
  <DashboardProvider
    key={`${props.session.rid || ''}:${props.initialMenuSlug || ''}:${props.initialBranchId || ''}`}
    valueProps={props}
  >
    <DashboardShell />
  </DashboardProvider>
));
