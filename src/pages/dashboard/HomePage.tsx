/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Eye,
  Flame,
  GitBranch,
  Lightbulb,
  QrCode,
  Receipt,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Tags,
  TrendingDown,
  TrendingUp,
  Truck,
  Utensils,
  Wallet,
} from 'lucide-react';
import { Order } from '../../types';
import { formatNumber } from '../../utils/storage';
import { fetchDashboardTelegramStatusApi } from '../../utils/adminApi';
import { DEFAULT_MEDIA_ASSETS } from '../../utils/businessDefaults';
import { Ml7Text } from '../../components/Ml7Text';
import { dashCardMotion, dashHeroMotion, dashRowMotion, dashSectionMotion } from '../../utils/dashboardMotion';
import { SettingsSectionTab, useDashboard } from './DashboardContext';

type HomeStatsRange = 'today' | '7d' | '30d';
type HomeChartMetric = 'sales' | 'orders';

const HOME_AR_LOCALE = 'ar-IQ-u-nu-latn';

function getHomeOrderMs(o: Order): number | null {
  const rawAt = Number(o.at);
  if (Number.isFinite(rawAt) && rawAt > 0) {
    return rawAt < 1e12 ? rawAt * 1000 : rawAt;
  }
  if (o.createdAt) {
    const parsed = Date.parse(String(o.createdAt));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function toHomeYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const HomePage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [statsRange, setStatsRange] = useState<HomeStatsRange>('7d');
  const [chartMetric, setChartMetric] = useState<HomeChartMetric>('sales');
  const [activeBarIdx, setActiveBarIdx] = useState<number | null>(null);
  const {
    rest,
    resolvedPlan,
    terms,
    currency,
    allCategories,
    allItems,
    allOrders,
    newOrdersCount,
    branchesList,
    viewOnlyMode,
    toggleViewOnlyMode,
    openBranchSwitcherModal,
    setActiveTab,
    openSettingsSection,
    handleSeedStoreCatalog,
    activeRid,
    mainRid,
  } = useDashboard();

  const defaultMedia =
    terms.isStore ? DEFAULT_MEDIA_ASSETS.store : DEFAULT_MEDIA_ASSETS.restaurant;
  const hasCustomLogo = Boolean(rest.logo && rest.logo !== defaultMedia.logo);
  const hasCustomBanner = Boolean(rest.coverImages?.[0] && rest.coverImages[0] !== defaultMedia.banner);
  const hasRichBio = Boolean(rest.aboutText && rest.aboutText.trim().length >= 35);
  const hasSocialLinks = Boolean(
    rest.social?.instagram || rest.social?.tiktok || rest.social?.facebook || rest.mapUrl || rest.wazeUrl
  );
  const hasCustomSlugConfigured = Boolean(rest.slug || rest.subdomain);
  const itemsWithPhotoCount = allItems.filter((item) => Boolean(item.img && item.img.trim())).length;
  const hasItemsPhotos = allItems.length >= 3 && itemsWithPhotoCount >= Math.min(allItems.length, 3);
  const hasWhatsappConfigured = Boolean(
    (rest.ph && rest.ph.trim().length >= 8) ||
      (rest.social?.whatsapp && rest.social.whatsapp.trim().length >= 8)
  );
  const hasWorkHoursConfigured = Boolean(rest.weeklyHours && Object.keys(rest.weeklyHours).length > 0);
  const hasDeliveryZonesConfigured = Boolean(
    Array.isArray(rest.deliveryZones) && rest.deliveryZones.length > 0
  );
  const targetTelegramRid = activeRid || mainRid || rest.id;
  const [serverTelegramLinked, setServerTelegramLinked] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    if (!targetTelegramRid) return;
    void fetchDashboardTelegramStatusApi(targetTelegramRid)
      .then((res) => {
        if (active && typeof res?.linked === 'boolean') {
          setServerTelegramLinked(res.linked);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [targetTelegramRid, rest.telegramPhone, rest.telegramUnlinkedManually]);

  const hasTelegramConnected = Boolean(
    serverTelegramLinked ||
      rest.telegramLinked ||
      (rest.telegramChatId && String(rest.telegramChatId).trim()) ||
      (rest.telegramPhone && String(rest.telegramPhone).trim() && rest.telegramUnlinkedManually !== true)
  );
  const hasMapLocation = Boolean(
    (rest.mapUrl && rest.mapUrl.trim()) || (rest.wazeUrl && rest.wazeUrl.trim())
  );

  interface MenuTip {
    id: string;
    done: boolean;
    label: string;
    targetTab: 'cats' | 'menu' | 'set' | 'qr' | 'appearance';
    settingsSection?: SettingsSectionTab;
  }

  const dynamicTips: MenuTip[] = [
    {
      id: 'cats',
      done: allCategories.length >= 3,
      label:
        allCategories.length >= 3
          ? `الأقسام منظمة (${allCategories.length} أقسام)`
          : `أضف 3 أقسام على الأقل (${allCategories.length}/3)`,
      targetTab: 'cats',
    },
    {
      id: 'items',
      done: allItems.length >= 6,
      label:
        allItems.length >= 6
          ? `${terms.itemsPlural} مكتملة (${allItems.length})`
          : `أضف 6 ${terms.itemsPlural} على الأقل (${allItems.length}/6)`,
      targetTab: 'menu',
    },
    {
      id: 'itemImages',
      done: hasItemsPhotos,
      label: hasItemsPhotos
        ? terms.isStore
          ? 'تمت إضافة صور واضحة للمنتجات'
          : 'تمت إضافة صور واضحة للأصناف'
        : terms.isStore
        ? `أضف صوراً للمنتجات (${Math.min(itemsWithPhotoCount, 3)}/3)`
        : `أضف صوراً للأصناف (${Math.min(itemsWithPhotoCount, 3)}/3)`,
      targetTab: 'menu',
    },
    {
      id: 'whatsapp',
      done: hasWhatsappConfigured,
      label: hasWhatsappConfigured
        ? 'رقم الواتساب لاستقبال الطلبات مفعّل'
        : 'إضافة رقم واتساب لاستقبال الطلبات',
      targetTab: 'set',
      settingsSection: 'links',
    },
    {
      id: 'media',
      done: terms.isStore ? hasCustomLogo && hasCustomBanner : hasCustomLogo,
      label: terms.isStore
        ? hasCustomLogo && hasCustomBanner
          ? 'تم رفع الشعار والغلاف'
          : 'رفع الشعار وصورة الغلاف'
        : hasCustomLogo
        ? 'تم رفع شعار المطعم'
        : 'رفع شعار المطعم',
      targetTab: 'set',
      settingsSection: 'identity',
    },
    {
      id: 'hours',
      done: hasWorkHoursConfigured,
      label: hasWorkHoursConfigured
        ? 'أوقات وساعات الدوام مضبوطة'
        : 'ضبط أوقات وساعات الدوام',
      targetTab: 'set',
      settingsSection: 'ops',
    },
    ...(rest.enabledOrderTypes?.delivery !== false
      ? [
          {
            id: 'deliveryZones',
            done: hasDeliveryZonesConfigured,
            label: hasDeliveryZonesConfigured
              ? 'مناطق وأسعار التوصيل محددة'
              : 'تحديد مناطق وأسعار التوصيل',
            targetTab: 'set' as const,
            settingsSection: 'ops' as const,
          },
        ]
      : []),
    {
      id: 'telegram',
      done: hasTelegramConnected,
      label: hasTelegramConnected
        ? terms.isStore
          ? 'إشعارات بوت تيليجرام لطلبات المتجر مفعّلة'
          : 'إشعارات بوت تيليجرام مفعّلة'
        : terms.isStore
        ? 'ربط بوت تيليجرام لتنبيهات طلبات المتجر'
        : 'ربط بوت تيليجرام لتنبيهات الطلبات',
      targetTab: 'set',
      settingsSection: 'telegram',
    },
    {
      id: 'mapLocation',
      done: hasMapLocation,
      label: hasMapLocation
        ? 'تم تحديد الموقع على الخريطة'
        : 'إضافة رابط الموقع على الخريطة',
      targetTab: 'set',
      settingsSection: 'links',
    },
    {
      id: 'bio',
      done: hasRichBio && hasSocialLinks,
      label:
        hasRichBio && hasSocialLinks
          ? 'النبذة والروابط مكتملة'
          : 'إكمال النبذة وروابط التواصل',
      targetTab: 'set',
      settingsSection: 'identity',
    },
  ];

  if (resolvedPlan.perms.customSlug) {
    dynamicTips.push({
      id: 'slug',
      done: hasCustomSlugConfigured,
      label: hasCustomSlugConfigured
        ? terms.isStore
          ? 'رابط المتجر المخصص مفعّل'
          : 'الرابط الفرعي المخصص مفعّل'
        : terms.isStore
        ? 'حجز رابط المتجر المخصص'
        : 'حجز الرابط الفرعي المخصص',
      targetTab: 'set',
      settingsSection: 'links',
    });
  }

  const orderedTips: MenuTip[] = [
    ...dynamicTips.filter((tip) => !tip.done),
    ...dynamicTips.filter((tip) => tip.done),
  ];

  const completedTipsCount = dynamicTips.filter((x) => x.done).length;
  const readinessPercent = Math.round((completedTipsCount / dynamicTips.length) * 100);
  const allTipsCompleted = completedTipsCount >= dynamicTips.length;

  const activePlanName = resolvedPlan.plan.n;
  const activeBranchDisplayName =
    activeRid !== mainRid
      ? rest.branchName?.trim() || rest.n
      : rest.branchName?.trim() || rest.n;

  const homeAnalytics = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    const daysCount = statsRange === 'today' ? 1 : statsRange === '7d' ? 7 : 30;
    const periodStart = todayStart - (daysCount - 1) * 86_400_000;
    const prevStart = periodStart - daysCount * 86_400_000;
    const prevEnd = periodStart - 1;

    const currentOrders: Order[] = [];
    const previousValidOrders: Order[] = [];

    allOrders.forEach((o) => {
      const ms = getHomeOrderMs(o);
      if (ms === null) return;
      if (ms >= periodStart && ms <= todayEnd) {
        currentOrders.push(o);
      } else if (ms >= prevStart && ms <= prevEnd) {
        const st = String(o.st || o.status || '').toLowerCase();
        if (st !== 'cancelled') previousValidOrders.push(o);
      }
    });

    const validOrders = currentOrders.filter(
      (o) => String(o.st || o.status || '').toLowerCase() !== 'cancelled'
    );
    const completedOrders = currentOrders.filter(
      (o) => String(o.st || o.status || '').toLowerCase() === 'completed'
    ).length;
    const pendingOrders = currentOrders.filter((o) => {
      const st = String(o.st || o.status || '').toLowerCase();
      return st === 'new' || st === 'pending' || st === 'preparing';
    }).length;

    const totalSales = validOrders.reduce(
      (sum, o) => sum + (Number(o.tot ?? o.total ?? 0) || 0),
      0
    );
    const prevSales = previousValidOrders.reduce(
      (sum, o) => sum + (Number(o.tot ?? o.total ?? 0) || 0),
      0
    );
    const salesDeltaPct =
      prevSales > 0
        ? Math.round(((totalSales - prevSales) / prevSales) * 100)
        : totalSales > 0
        ? 100
        : 0;
    const ordersDeltaPct =
      previousValidOrders.length > 0
        ? Math.round(((validOrders.length - previousValidOrders.length) / previousValidOrders.length) * 100)
        : validOrders.length > 0
        ? 100
        : 0;

    const avgOrder = validOrders.length > 0 ? Math.round(totalSales / validOrders.length) : 0;
    const completionRate =
      currentOrders.length > 0 ? Math.round((completedOrders / currentOrders.length) * 100) : 0;
    const availableItemsCount = allItems.filter((i) => i.av !== false && i.published !== false).length;

    const deliveryCount = validOrders.filter(
      (o) => (o.type || o.cu?.orderType || 'delivery') === 'delivery'
    ).length;
    const pickupCount = validOrders.filter((o) => (o.type || o.cu?.orderType) === 'pickup').length;
    const tableCount = validOrders.filter((o) => (o.type || o.cu?.orderType) === 'table').length;

    // Build interactive bar chart (4 time slots for Today, 7 days for 7d/30d)
    interface ChartSlot {
      key: string;
      label: string;
      fullLabel: string;
      orders: number;
      sales: number;
    }

    let slots: ChartSlot[];
    if (statsRange === 'today') {
      slots = [
        { key: 'night', label: 'فجراً', fullLabel: 'فجراً (12ص – 6ص)', orders: 0, sales: 0 },
        { key: 'morning', label: 'صباحاً', fullLabel: 'صباحاً (6ص – 12م)', orders: 0, sales: 0 },
        { key: 'afternoon', label: 'ظهراً', fullLabel: 'ظهراً (12م – 6م)', orders: 0, sales: 0 },
        { key: 'evening', label: 'مساءً', fullLabel: 'مساءً (6م – 12ص)', orders: 0, sales: 0 },
      ];
      validOrders.forEach((o) => {
        const ms = getHomeOrderMs(o);
        if (ms === null) return;
        const hr = new Date(ms).getHours();
        const idx = hr < 6 ? 0 : hr < 12 ? 1 : hr < 18 ? 2 : 3;
        slots[idx].orders += 1;
        slots[idx].sales += Number(o.tot ?? o.total ?? 0) || 0;
      });
    } else {
      const barDays = 7;
      slots = [];
      for (let i = barDays - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        slots.push({
          key: toHomeYmd(d),
          label: new Intl.DateTimeFormat(HOME_AR_LOCALE, { weekday: 'short' }).format(d),
          fullLabel: new Intl.DateTimeFormat(HOME_AR_LOCALE, {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
          }).format(d),
          orders: 0,
          sales: 0,
        });
      }
      const byYmd = new Map(slots.map((s) => [s.key, s]));
      validOrders.forEach((o) => {
        const ms = getHomeOrderMs(o);
        if (ms === null) return;
        const slot = byYmd.get(toHomeYmd(new Date(ms)));
        if (slot) {
          slot.orders += 1;
          slot.sales += Number(o.tot ?? o.total ?? 0) || 0;
        }
      });
    }

    const maxSlotVal = Math.max(
      1,
      ...slots.map((s) => (chartMetric === 'sales' ? s.sales : s.orders))
    );

    // Top 3 selling items in selected period
    const itemStats = new Map<string, { name: string; qty: number; revenue: number }>();
    validOrders.forEach((o) => {
      const orderItems = Array.isArray(o.items) ? o.items : Array.isArray(o.its) ? o.its : [];
      orderItems.forEach((rawIt: any) => {
        const name = String(rawIt?.n || rawIt?.name || 'صنف').trim();
        const qty = Math.max(1, Number(rawIt?.q ?? rawIt?.qty ?? 1) || 1);
        const unitPrice = Number(rawIt?.pr ?? rawIt?.price ?? 0) || 0;
        const lineTotal = Number(rawIt?.tot ?? unitPrice * qty) || 0;
        const key = String(rawIt?.id || name);
        const prev = itemStats.get(key) || { name, qty: 0, revenue: 0 };
        prev.qty += qty;
        prev.revenue += lineTotal;
        itemStats.set(key, prev);
      });
    });

    const topItems = Array.from(itemStats.values())
      .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
      .slice(0, 3);

    return {
      totalOrders: currentOrders.length,
      validOrdersCount: validOrders.length,
      completedOrders,
      pendingOrders,
      totalSales,
      salesDeltaPct,
      ordersDeltaPct,
      avgOrder,
      completionRate,
      availableItemsCount,
      deliveryCount,
      pickupCount,
      tableCount,
      slots,
      maxSlotVal,
      topItems,
    };
  }, [allOrders, allItems, statsRange, chartMetric]);

  const highlightedSlot = useMemo(() => {
    const slots = homeAnalytics.slots;
    if (activeBarIdx !== null && slots[activeBarIdx]) return slots[activeBarIdx];
    let best = slots[slots.length - 1] || slots[0];
    slots.forEach((s) => {
      const val = chartMetric === 'sales' ? s.sales : s.orders;
      const bestVal = chartMetric === 'sales' ? best.sales : best.orders;
      if (val > bestVal) best = s;
    });
    return best;
  }, [homeAnalytics.slots, activeBarIdx, chartMetric]);

  return (
    <div className="mp-home-wrap">
      {/* Floating Welcome Header (transparent to main grid background) */}
      <motion.div
        className="mp-home-welcome"
        {...dashHeroMotion(prefersReducedMotion)}
      >
        <img
          src={rest.logo}
          alt={activeBranchDisplayName}
          decoding="async"
          referrerPolicy="no-referrer"
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            objectFit: 'cover',
            border: '2px solid var(--brand)',
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 'clamp(21px, 3.2vw, 26px)', fontWeight: 900, color: 'var(--ink)' }}>
            {activeBranchDisplayName}
          </h1>
          <div className="mp-home-welcome-meta" style={{ fontSize: '14.5px' }}>
            <span>
              الباقة: <b style={{ color: 'var(--brand-ink, #34D399)' }}>{activePlanName}</b>
            </span>
          </div>
        </div>
      </motion.div>

      {/* Quick Action Shortcuts */}
      <section className="mp-home-shortcuts-section" dir="rtl" aria-label="اختصارات سريعة">
        <div className="mp-home-shortcuts-head">
          <h2 className="mp-home-shortcuts-title">اختصارات يومية</h2>
        </div>

        <div className="mp-home-shortcuts-grid">
          <motion.button
            type="button"
            className="mp-home-shortcut-card"
            onClick={() => setActiveTab('orders')}
            {...dashCardMotion(prefersReducedMotion, 0)}
          >
            <span className="mp-home-shortcut-ico">
              <ShoppingBag size={22} />
            </span>
            <span className="mp-home-shortcut-body">
              <span className="mp-home-shortcut-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                <span>الطلبات</span>
                {newOrdersCount > 0 && (
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: '12px',
                      fontWeight: 900,
                      padding: '1px 8px',
                      borderRadius: '999px',
                      background: 'var(--brand)',
                      color: '#fff',
                    }}
                  >
                    {newOrdersCount}
                  </span>
                )}
              </span>
            </span>
            <ArrowUpRight size={17} className="mp-home-shortcut-arrow" />
          </motion.button>

          <motion.button
            type="button"
            className="mp-home-shortcut-card"
            onClick={() => setActiveTab('menu')}
            {...dashCardMotion(prefersReducedMotion, 1)}
          >
            <span className="mp-home-shortcut-ico">
              <Tag size={22} />
            </span>
            <span className="mp-home-shortcut-body">
              <span className="mp-home-shortcut-label">
                {terms.isStore ? 'المنتجات' : 'الأصناف'}
              </span>
            </span>
            <ArrowUpRight size={17} className="mp-home-shortcut-arrow" />
          </motion.button>

          <motion.button
            type="button"
            className="mp-home-shortcut-card"
            onClick={() => setActiveTab('cats')}
            {...dashCardMotion(prefersReducedMotion, 2)}
          >
            <span className="mp-home-shortcut-ico">
              <Tags size={22} />
            </span>
            <span className="mp-home-shortcut-body">
              <span className="mp-home-shortcut-label">الأقسام</span>
            </span>
            <ArrowUpRight size={17} className="mp-home-shortcut-arrow" />
          </motion.button>

          <motion.button
            type="button"
            role="switch"
            aria-checked={viewOnlyMode}
            className={`mp-home-shortcut-card is-toggle ${viewOnlyMode ? 'is-active-warn' : ''}`}
            onClick={toggleViewOnlyMode}
            {...dashCardMotion(prefersReducedMotion, 3)}
          >
            <span className={`mp-home-shortcut-ico ${viewOnlyMode ? 'is-warn' : ''}`}>
              <Eye size={22} />
            </span>
            <span className="mp-home-shortcut-body">
              <span className="mp-home-shortcut-label">
                {viewOnlyMode ? 'تشغيل الطلبات' : 'إيقاف الطلبات'}
              </span>
            </span>
            <span className={`ios-switch sm ${viewOnlyMode ? 'on' : 'off'}`} aria-hidden="true">
              <span className="ios-switch-thumb" />
            </span>
          </motion.button>

          <motion.button
            type="button"
            className="mp-home-shortcut-card"
            onClick={() => setActiveTab('addons')}
            {...dashCardMotion(prefersReducedMotion, 4)}
          >
            <span className="mp-home-shortcut-ico">
              <Sparkles size={22} />
            </span>
            <span className="mp-home-shortcut-body">
              <span className="mp-home-shortcut-label">الإضافات</span>
            </span>
            <ArrowUpRight size={17} className="mp-home-shortcut-arrow" />
          </motion.button>

          <motion.button
            type="button"
            className="mp-home-shortcut-card"
            onClick={() => setActiveTab('qr')}
            {...dashCardMotion(prefersReducedMotion, 5)}
          >
            <span className="mp-home-shortcut-ico">
              <QrCode size={22} />
            </span>
            <span className="mp-home-shortcut-body">
              <span className="mp-home-shortcut-label">الباركود</span>
            </span>
            <ArrowUpRight size={17} className="mp-home-shortcut-arrow" />
          </motion.button>

          <motion.button
            type="button"
            className="mp-home-shortcut-card"
            onClick={() => {
              if (branchesList.length > 0) {
                openBranchSwitcherModal();
              } else {
                setActiveTab('branches');
              }
            }}
            {...dashCardMotion(prefersReducedMotion, 6)}
          >
            <span className="mp-home-shortcut-ico">
              <GitBranch size={22} />
            </span>
            <span className="mp-home-shortcut-body">
              <span className="mp-home-shortcut-label">
                {branchesList.length > 0 ? activeBranchDisplayName : 'الفروع'}
              </span>
            </span>
            <ArrowUpRight size={17} className="mp-home-shortcut-arrow" />
          </motion.button>

          <motion.button
            type="button"
            className="mp-home-shortcut-card"
            onClick={() => setActiveTab('set')}
            {...dashCardMotion(prefersReducedMotion, 7)}
          >
            <span className="mp-home-shortcut-ico">
              <Settings size={22} />
            </span>
            <span className="mp-home-shortcut-body">
              <span className="mp-home-shortcut-label">الإعدادات</span>
            </span>
            <ArrowUpRight size={17} className="mp-home-shortcut-arrow" />
          </motion.button>
        </div>
      </section>

      {/* Checklist Section: hidden once all steps are completed */}
      {!allTipsCompleted && (
        <section className="mp-home-section">
          <div className="mp-home-section-head">
            <span
              className="mp-home-section-badge"
              style={{
                background: 'rgba(245, 158, 11, 0.14)',
                color: '#f59e0b',
              }}
            >
              <Lightbulb size={16} />
              <span>{`الاكتمال: ${readinessPercent}%`}</span>
            </span>

            <h2 className="mp-home-section-title">
              <Ml7Text
                text={terms.isStore ? 'استكمال جاهزية المتجر' : 'استكمال جاهزية المنيو'}
                mode="mount"
                delay={0.12}
                stagger={0.18}
                duration={2.25}
                isRtl
              />
            </h2>

            {terms.isStore && allItems.length === 0 && (
              <div style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn p s"
                  onClick={() => handleSeedStoreCatalog('append_missing')}
                  style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Sparkles size={15} />
                  <span>إضافة أقسام ومنتجات المتجر الافتراضية</span>
                </button>
              </div>
            )}
          </div>

          <div className="mp-home-tips-box" dir="rtl">
            <div className="mp-home-tips-list">
              {orderedTips.map((tip, idx) => (
                <motion.button
                  key={tip.id}
                  type="button"
                  onClick={() => {
                    if (tip.targetTab === 'set' && tip.settingsSection) {
                      openSettingsSection(tip.settingsSection);
                    } else {
                      setActiveTab(tip.targetTab);
                    }
                  }}
                  className={`btn s mp-home-tip-btn ${tip.done ? 'is-done' : ''}`}
                  dir="rtl"
                  {...dashRowMotion(prefersReducedMotion, idx, true)}
                >
                  <span className="mp-home-tip-icon" aria-hidden="true">
                    {tip.done ? (
                      <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                    ) : (
                      <Sparkles size={18} style={{ color: '#f59e0b' }} />
                    )}
                  </span>

                  <span className="mp-home-tip-label">{tip.label}</span>

                  {!tip.done && (
                    <ArrowUpRight size={15} className="mp-home-tip-arrow" aria-hidden="true" />
                  )}
                </motion.button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Professional Statistics Overview Section */}
      <motion.section
        className="mp-home-analytics-section"
        dir="rtl"
        aria-label="إحصائيات الأداء والمبيعات"
        {...dashSectionMotion(prefersReducedMotion, 1)}
      >
        <div className="mp-home-analytics-header">
          <div className="mp-home-analytics-title-wrap">
            <span className="mp-home-analytics-badge">
              <BarChart3 size={15} />
              <span>ملخص الأداء المباشر</span>
            </span>
            <h2 className="mp-home-analytics-title">إحصائيات المبيعات والطلبات</h2>
          </div>

          <div className="mp-home-analytics-controls">
            <div className="mp-home-range-pills" role="tablist" aria-label="الفترة الزمنية">
              {(
                [
                  { id: 'today', label: 'اليوم' },
                  { id: '7d', label: '7 أيام' },
                  { id: '30d', label: '30 يوماً' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={statsRange === opt.id}
                  className={`mp-home-range-btn ${statsRange === opt.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setStatsRange(opt.id);
                    setActiveBarIdx(null);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn s mp-home-full-stats-btn"
              onClick={() => setActiveTab('stats')}
            >
              <span>التحليلات الكاملة</span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </div>

        {/* 4 KPI Summary Cards */}
        <div className="mp-home-analytics-kpis">
          <div className="mp-home-kpi-card">
            <div className="mp-home-kpi-top">
              <span className="mp-home-kpi-ico is-emerald">
                <Wallet size={18} />
              </span>
              {homeAnalytics.salesDeltaPct !== 0 && (
                <span
                  className={`mp-home-kpi-delta tabular-nums ${
                    homeAnalytics.salesDeltaPct > 0 ? 'is-up' : 'is-down'
                  }`}
                >
                  {homeAnalytics.salesDeltaPct > 0 ? (
                    <TrendingUp size={12} />
                  ) : (
                    <TrendingDown size={12} />
                  )}
                  <span>
                    {homeAnalytics.salesDeltaPct > 0 ? '+' : ''}
                    {homeAnalytics.salesDeltaPct}%
                  </span>
                </span>
              )}
            </div>
            <div className="mp-home-kpi-val tabular-nums">
              {formatNumber(homeAnalytics.totalSales)}{' '}
              <span className="mp-home-kpi-cur">{currency}</span>
            </div>
            <div className="mp-home-kpi-lbl">إجمالي المبيعات</div>
          </div>

          <div className="mp-home-kpi-card">
            <div className="mp-home-kpi-top">
              <span className="mp-home-kpi-ico is-sky">
                <ShoppingBag size={18} />
              </span>
              {homeAnalytics.ordersDeltaPct !== 0 && (
                <span
                  className={`mp-home-kpi-delta tabular-nums ${
                    homeAnalytics.ordersDeltaPct > 0 ? 'is-up' : 'is-down'
                  }`}
                >
                  {homeAnalytics.ordersDeltaPct > 0 ? (
                    <TrendingUp size={12} />
                  ) : (
                    <TrendingDown size={12} />
                  )}
                  <span>
                    {homeAnalytics.ordersDeltaPct > 0 ? '+' : ''}
                    {homeAnalytics.ordersDeltaPct}%
                  </span>
                </span>
              )}
            </div>
            <div className="mp-home-kpi-val tabular-nums">
              {formatNumber(homeAnalytics.validOrdersCount)}
            </div>
            <div className="mp-home-kpi-lbl">
              طلبات نشطة ومكتملة · قيد التجهيز {formatNumber(homeAnalytics.pendingOrders)}
            </div>
          </div>

          <div className="mp-home-kpi-card">
            <div className="mp-home-kpi-top">
              <span className="mp-home-kpi-ico is-violet">
                <Receipt size={18} />
              </span>
            </div>
            <div className="mp-home-kpi-val tabular-nums">
              {formatNumber(homeAnalytics.avgOrder)}{' '}
              <span className="mp-home-kpi-cur">{currency}</span>
            </div>
            <div className="mp-home-kpi-lbl">متوسط قيمة الطلب</div>
          </div>

          <div className="mp-home-kpi-card">
            <div className="mp-home-kpi-top">
              <span className="mp-home-kpi-ico is-amber">
                <CheckCircle2 size={18} />
              </span>
            </div>
            <div className="mp-home-kpi-val tabular-nums">
              {homeAnalytics.completionRate}%
            </div>
            <div className="mp-home-kpi-lbl">
              نسبة الإنجاز · {formatNumber(homeAnalytics.availableItemsCount)}/{formatNumber(allItems.length)}{' '}
              {terms.isStore ? 'منتج متاح' : 'صنف متاح'}
            </div>
          </div>
        </div>

        {/* Chart + Channels & Top Sellers */}
        <div className="mp-home-analytics-grid">
          {/* Interactive Bar Chart Panel */}
          <div className="mp-home-analytics-panel">
            <div className="mp-home-panel-head">
              <div>
                <h3 className="mp-home-panel-title">
                  {statsRange === 'today' ? 'حركة اليوم حسب الفترة' : 'اتجاه النشاط (آخر 7 أيام)'}
                </h3>
                {highlightedSlot && (
                  <p className="mp-home-panel-sub tabular-nums">
                    {highlightedSlot.fullLabel}: <b>{formatNumber(highlightedSlot.orders)} طلب</b> ·{' '}
                    <b>
                      {formatNumber(highlightedSlot.sales)} {currency}
                    </b>
                  </p>
                )}
              </div>

              <div className="mp-home-metric-switch">
                <button
                  type="button"
                  className={chartMetric === 'sales' ? 'is-active' : ''}
                  onClick={() => setChartMetric('sales')}
                >
                  المبيعات
                </button>
                <button
                  type="button"
                  className={chartMetric === 'orders' ? 'is-active' : ''}
                  onClick={() => setChartMetric('orders')}
                >
                  الطلبات
                </button>
              </div>
            </div>

            <div className="mp-home-chart-bars" role="list">
              {homeAnalytics.slots.map((slot, idx) => {
                const rawVal = chartMetric === 'sales' ? slot.sales : slot.orders;
                const heightPct = rawVal > 0 ? Math.max(10, Math.round((rawVal / homeAnalytics.maxSlotVal) * 100)) : 4;
                const isSelected = highlightedSlot?.key === slot.key;
                return (
                  <button
                    key={slot.key}
                    type="button"
                    role="listitem"
                    className={`mp-home-chart-col ${isSelected ? 'is-selected' : ''} ${rawVal === 0 ? 'is-empty' : ''}`}
                    onClick={() => setActiveBarIdx(idx)}
                    aria-label={`${slot.fullLabel}: ${slot.orders} طلب`}
                  >
                    <span className="mp-home-chart-val tabular-nums">
                      {rawVal > 0
                        ? chartMetric === 'sales' && rawVal >= 1000
                          ? `${(rawVal / 1000).toFixed(rawVal % 1000 === 0 ? 0 : 1)}k`
                          : formatNumber(rawVal)
                        : '0'}
                    </span>
                    <span className="mp-home-chart-track">
                      <span
                        className="mp-home-chart-fill"
                        style={{ height: `${heightPct}%` }}
                      />
                    </span>
                    <span className="mp-home-chart-lbl">{slot.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Order Channels + Top Selling Dishes */}
          <div className="mp-home-analytics-panel">
            <div className="mp-home-panel-head">
              <h3 className="mp-home-panel-title">توزيع الطلبات والأكثر مبيعاً</h3>
            </div>

            <div className="mp-home-channels-list">
              {[
                {
                  key: 'delivery',
                  label: 'التوصيل',
                  count: homeAnalytics.deliveryCount,
                  Icon: Truck,
                  color: '#10b981',
                },
                {
                  key: 'pickup',
                  label: terms.pickupLabel || 'الاستلام',
                  count: homeAnalytics.pickupCount,
                  Icon: Store,
                  color: '#0ea5e9',
                },
                {
                  key: 'table',
                  label: terms.isStore ? 'داخل المعرض' : 'الطاولات',
                  count: homeAnalytics.tableCount,
                  Icon: terms.isStore ? Store : Utensils,
                  color: '#f59e0b',
                },
              ].map((ch) => {
                const pct =
                  homeAnalytics.validOrdersCount > 0
                    ? Math.round((ch.count / homeAnalytics.validOrdersCount) * 100)
                    : 0;
                return (
                  <div key={ch.key} className="mp-home-channel-row">
                    <div className="mp-home-channel-meta">
                      <span className="mp-home-channel-name">
                        <ch.Icon size={14} style={{ color: ch.color }} />
                        <span>{ch.label}</span>
                      </span>
                      <span className="mp-home-channel-nums tabular-nums">
                        {formatNumber(ch.count)} ({pct}%)
                      </span>
                    </div>
                    <div className="mp-home-channel-track">
                      <div
                        className="mp-home-channel-bar"
                        style={{ width: `${pct}%`, background: ch.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mp-home-top-items">
              <div className="mp-home-top-items-head">
                <Flame size={14} style={{ color: '#f97316' }} />
                <span>{terms.isStore ? 'الأكثر مبيعاً' : 'الأطباق الأكثر طلباً'}</span>
              </div>

              {homeAnalytics.topItems.length === 0 ? (
                <div className="mp-home-top-empty">
                  لا توجد طلبات مسجلة في هذه الفترة لعرض الأصناف الأكثر طلباً.
                </div>
              ) : (
                <div className="mp-home-top-list">
                  {homeAnalytics.topItems.map((it, idx) => (
                    <div key={`${it.name}_${idx}`} className="mp-home-top-row">
                      <span className="mp-home-top-rank tabular-nums">{idx + 1}</span>
                      <span className="mp-home-top-name">{it.name}</span>
                      <span className="mp-home-top-qty tabular-nums">{formatNumber(it.qty)}×</span>
                      <span className="mp-home-top-rev tabular-nums">
                        {formatNumber(it.revenue)} {currency}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
};
