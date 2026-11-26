/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Ban,
  Car,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Flame,
  Gift,
  GitBranch,
  Home,
  Info,
  LayoutGrid,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Moon,
  Palette,
  Plus,
  RotateCw,
  Search,
  Send,
  Share,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Smile,
  Sparkles,
  Star,
  Store,
  Sun,
  Trash2,
  Truck,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import {
  Category,
  LoyaltyCustomer,
  MenuItem,
  MenuItemBadge,
  MenuItemExtra,
  MenuItemSize,
  MenuThemeShape,
  Order,
  OrderItem,
  OrderType,
  Restaurant,
  RestaurantAddons,
  RestaurantReview,
  Session,
  WorkDayKey,
} from '../types';
import {
  applyPlatformTypography,
  fetchPopularItemsCached,
  fetchPublicMenuFast,
  formatNumber,
  getCollection,
  getDbRevision,
  getItem,
  getPlans,
  getSite,
  getSlugForRestaurantId,
  getTheme,
  isRestaurantOpenNow,
  putItem,
  putItemAndSync,
  resolveRestaurantByIdOrSlug,
  submitReviewToServer,
  subscribeServerRealtime,
  uid,
  waLink,
} from '../utils/storage';
import { getDashboardTabPath, isDashboardPath } from '../utils/router';
import {
  dashHeroMotion,
  dashModalMotion,
  dashPillMotion,
  syncDashboardMotionFromSite,
} from '../utils/dashboardMotion';
import { ensureRestaurantDefaults, navigateToMainSite } from '../utils/businessDefaults';
import { getBusinessTerms } from '../utils/terminology';
import { AppLogo } from '../components/AppLogo';
import { AppSelect } from '../components/AppSelect';
import { SeasonalHeroRibbon, SeasonalMenuOverlay } from '../components/SeasonalMenuDecor';
import { MenuPromoTickets, buildMenuPromoTickets } from '../components/menu/MenuPromoTickets';

const ShareMenuModal = lazy(() =>
  import('../components/ShareMenuModal').then((m) => ({ default: m.ShareMenuModal }))
);
const EstoreStorefront = lazy(() =>
  import('../components/storefront/EstoreStorefront').then((m) => ({ default: m.EstoreStorefront }))
);
import {
  ActiveMenuDiscount,
  applyMenuPriceDiscount,
  computeOrderLevelDiscount,
  getActiveMenuDiscount,
} from '../data/addonsCatalog';
import {
  MENU_THEMES,
  getContrastInk,
  getMenuThemeById,
  isAddonAllowedForPlan,
  resolveRestaurantPlan,
} from '../utils/plans';
import {
  CategoryAvailabilityResult,
  ItemAvailabilityResult,
  evaluateCategoryAvailability,
  evaluateItemAvailability,
  formatTime12,
} from '../utils/availability';

interface DemoViewerOption {
  id: string;
  label: string;
  sub: string;
  shape?: MenuThemeShape;
  preset?: string;
  mode?: 'light' | 'dark';
  lay?: 'list' | 'grid' | 'grid3' | 'grid4';
}

interface DemoViewerOverride {
  id: string;
  shape: MenuThemeShape;
  preset: string;
  mode: 'light' | 'dark';
  lay?: 'list' | 'grid' | 'grid3' | 'grid4';
}

const DEMO_VIEWER_STORAGE_KEY = 'mp_demo_viewer_appearance';

const DEMO_THEME_OPTIONS: DemoViewerOption[] = [
  { id: 'default', label: 'الافتراضي', sub: 'الإعداد المحفوظ في المنصة' },
  { id: 'toters', label: 'مظهر توترز', sub: 'بطاقة عائمة وقوائم توصيل', shape: 'toters', preset: 'toters', mode: 'light', lay: 'list' },
  { id: 'theme1', label: 'مظهر 1', sub: 'متجر أنيق وبسيط (Enab)', shape: 'theme1', preset: 'theme1-enab', mode: 'light', lay: 'grid4' },
  { id: 'theme2', label: 'مظهر 2', sub: 'هوية ليلية (UrbanBite)', shape: 'theme2', preset: 'theme2-urbanbite', mode: 'dark', lay: 'list' },
  { id: 'theme3', label: 'مظهر 3', sub: 'سريع وحيوي (MenuX)', shape: 'theme3', preset: 'theme3-menux', mode: 'light', lay: 'grid3' },
  { id: 'theme4', label: 'مظهر 4', sub: 'كوميك جريء (Kudo)', shape: 'theme4', preset: 'theme4-kudo', mode: 'light', lay: 'grid' },
  { id: 'theme5', label: 'مظهر 5', sub: 'تطبيق توصيل دافئ (شاورمر)', shape: 'theme5', preset: 'theme5-shawarmer', mode: 'light', lay: 'list' },
  { id: 'modern-grid', label: 'شبكة عصرية', sub: 'بطاقات شبكية متناسقة', shape: 'modern', preset: 'emerald', mode: 'dark', lay: 'grid' },
];

function readDemoViewerAppearance(): DemoViewerOverride | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DEMO_VIEWER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string') return null;
    const matched = DEMO_THEME_OPTIONS.find((opt) => opt.id === parsed.id && opt.id !== 'default');
    if (!matched || !matched.shape || !matched.preset) return null;
    return {
      id: matched.id,
      shape: matched.shape,
      preset: matched.preset,
      mode: parsed.mode === 'light' || parsed.mode === 'dark' ? parsed.mode : matched.mode || 'light',
      lay: matched.lay,
    };
  } catch {
    return null;
  }
}

function applyDemoViewerAppearance(
  optionId: string,
  modeOverride?: 'light' | 'dark',
  fallbackShape: MenuThemeShape = 'modern',
  fallbackPreset = 'emerald'
): DemoViewerOverride | null {
  if (typeof window === 'undefined') return null;
  let nextOverride: DemoViewerOverride | null = null;
  try {
    if (optionId === 'default' && !modeOverride) {
      window.sessionStorage.removeItem(DEMO_VIEWER_STORAGE_KEY);
      nextOverride = null;
    } else {
      const matched = DEMO_THEME_OPTIONS.find((o) => o.id === optionId && o.id !== 'default');
      if (matched && matched.shape && matched.preset) {
        const nextPayload: DemoViewerOverride = {
          id: matched.id,
          shape: matched.shape,
          preset: matched.preset,
          mode: modeOverride || matched.mode || 'light',
          lay: matched.lay,
        };
        window.sessionStorage.setItem(DEMO_VIEWER_STORAGE_KEY, JSON.stringify(nextPayload));
        nextOverride = nextPayload;
      } else if (modeOverride) {
        const nextPayload: DemoViewerOverride = {
          id: optionId || 'default',
          shape: fallbackShape,
          preset: fallbackPreset,
          mode: modeOverride,
        };
        window.sessionStorage.setItem(DEMO_VIEWER_STORAGE_KEY, JSON.stringify(nextPayload));
        nextOverride = nextPayload;
      } else {
        window.sessionStorage.removeItem(DEMO_VIEWER_STORAGE_KEY);
        nextOverride = null;
      }
    }
  } catch {
    // ignore sessionStorage restrictions
  }
  return nextOverride;
}

interface PublicMenuViewProps {
  restaurantId: string;
  session: Session | null;
  onNavigate: (hash: string) => void;
  showToast: (msg: string) => void;
}

interface PublicMenuContentProps extends PublicMenuViewProps {
  hasMultipleBranches: boolean;
  branchShortLabel: string;
  onOpenBranchPicker: () => void;
  familyBranches?: Restaurant[];
  selectedBranchId?: string;
  onSelectBranch?: (branchId: string) => void;
}

interface CartLine {
  key: string;
  itemId: string;
  name: string;
  catName?: string;
  unitPrice: number;
  origUnitPrice?: number;
  qty: number;
  size?: string;
  choices: string[];
  extras: string[];
  img?: string;
  notes?: string;
}

const DAY_LABELS: Array<{ key: WorkDayKey; label: string }> = [
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الإثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
  { key: 'sat', label: 'السبت' },
];

function getOptionPrice(opt: any): number {
  const val = Number(opt?.p ?? opt?.pr ?? opt?.price ?? 0);
  return Number.isFinite(val) ? val : 0;
}

function getSizeLabel(sz: any): string {
  if (typeof sz === 'string') return sz.trim();
  return String(sz?.n || sz?.label || sz?.name || '').trim();
}

function getChoiceLabel(ch: any): string {
  if (typeof ch === 'string') return ch.trim();
  return String(ch?.n || ch?.label || ch?.name || '').trim();
}

function getExtraLabel(ex: any): string {
  if (typeof ex === 'string') return ex.trim();
  return String(ex?.n || ex?.label || ex?.name || '').trim();
}

function formatMoneyValue(amount: number, currency: string): string {
  return `${formatNumber(amount)} ${currency}`;
}

function getPriceDisplay(
  it: MenuItem,
  currency: string,
  activeDiscount: ActiveMenuDiscount = {
    active: false,
    type: 'percent',
    value: 0,
    sourceLabel: '',
    minOrderAmount: 0,
    maxDiscountAmount: 0,
  },
  allowItemDiscounts = true
) {
  const validSizes = (it.sizes || []).filter((s) => getSizeLabel(s));
  if (validSizes.length > 0) {
    const rawPrices = validSizes.map((s) => getOptionPrice(s));
    const rawMin = Math.min(...rawPrices);
    const rawMax = Math.max(...rawPrices);
    const min = applyMenuPriceDiscount(rawMin, activeDiscount);
    const max = applyMenuPriceDiscount(rawMax, activeDiscount);
    const main =
      min !== max
        ? `${formatNumber(min)} - ${formatNumber(max)} ${currency}`
        : formatMoneyValue(min, currency);
    return {
      main,
      min,
      rawBefore: activeDiscount.active && min < rawMin ? rawMin : 0,
      savings: activeDiscount.active ? Math.max(0, rawMin - min) : 0,
    };
  }
  const rawPrice = Number(it.pr) || 0;
  const finalPrice = applyMenuPriceDiscount(rawPrice, activeDiscount);
  const compareBefore =
    activeDiscount.active && finalPrice < rawPrice
      ? Math.max(rawPrice, allowItemDiscounts ? Number(it.beforePrice) || 0 : 0)
      : allowItemDiscounts && it.beforePrice && it.beforePrice > rawPrice
      ? it.beforePrice
      : 0;
  const savings = compareBefore > finalPrice ? compareBefore - finalPrice : 0;
  return {
    main: formatMoneyValue(finalPrice, currency),
    min: finalPrice,
    rawBefore: compareBefore,
    savings,
  };
}

function parseCaloriesNum(raw?: string | number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  const m = String(raw || '').match(/\d+/);
  return m ? Math.max(0, parseInt(m[0], 10)) : 0;
}

function renderBadge(badge: MenuItemBadge, idx: number) {
  const cls =
    badge.type === 'red'
      ? 'pm-badge red'
      : badge.type === 'gold'
      ? 'pm-badge gold'
      : badge.type === 'green'
      ? 'pm-badge green'
      : 'pm-badge accent';
  return (
    <span key={`${badge.text}-${idx}`} className={cls}>
      {badge.type === 'red' && <Flame size={11} />}
      {badge.type === 'gold' && <Sparkles size={11} />}
      {badge.text}
    </span>
  );
}

function getReadableAccent(hex: string): string {
  const clean = (hex || '').trim().replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(clean)) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luminance < 0.36) return '#34D399';
  }
  return hex || '#34D399';
}

function formatT6ClosingTime(rest: Restaurant | undefined, nowDate: Date): string {
  if (!rest) return '11:30 PM';
  const dayOrder: WorkDayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const todayKey = dayOrder[nowDate.getDay()];
  const daySched = rest.weeklyHours?.[todayKey];
  if (daySched && daySched.open === false) {
    return 'مغلق اليوم';
  }
  const rawClose = (daySched?.open && daySched.to ? daySched.to : '') || (rest.h?.m === '24' ? '24h' : rest.h?.t || '');
  if (rawClose === '24h') return '24 ساعة';
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(rawClose).trim());
  if (!match) return '11:30 PM';
  const h24 = parseInt(match[1], 10);
  const mins = match[2];
  if (!Number.isFinite(h24) || h24 < 0 || h24 > 23) return '11:30 PM';
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mins} ${suffix}`;
}

function getTableFromUrl(): string {
  try {
    const searchTable = new URLSearchParams(window.location.search).get('table');
    if (searchTable) return searchTable;
    const hashMatch = window.location.hash.match(/table=([^&]+)/);
    if (hashMatch) return decodeURIComponent(hashMatch[1]);
  } catch {
    // ignore malformed URL
  }
  return '';
}

function computeCountdownString(endHourRaw: number | undefined, refMs: number): string {
  const endHour = Math.min(23, Math.max(0, Number(endHourRaw ?? 23)));
  const target = new Date(refMs);
  target.setHours(endHour, 59, 59, 999);
  if (target.getTime() <= refMs) {
    target.setDate(target.getDate() + 1);
  }
  const diffSec = Math.max(0, Math.floor((target.getTime() - refMs) / 1000));
  const hrs = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const LiveCountdownText: React.FC<{ endHour?: number }> = React.memo(({ endHour }) => {
  const [tickMs, setTickMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setTickMs(Date.now());
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return <>{computeCountdownString(endHour, tickMs)}</>;
});

interface MemoCustomerItemProps {
  it: MenuItem;
  qty: number;
  priceMain: string;
  priceRawBefore: number;
  formattedBeforePrice: string;
  unavailable: boolean;
  showUnavailableBadge: boolean;
  displayOnly: boolean;
  isPopular: boolean;
  accentText: string;
  brandColor: string;
  brandInk: string;
  layout?: 'grid4' | 'grid3' | 'grid' | 'list';
  onOpenProduct: (it: MenuItem) => void;
  onQuickAdd: (it: MenuItem, e?: React.MouseEvent) => void;
  onDecrement: (itemId: string, e?: React.MouseEvent) => void;
}

const MemoTotersItemRow = React.memo<MemoCustomerItemProps>(
  ({
    it,
    qty,
    priceMain,
    priceRawBefore,
    formattedBeforePrice,
    unavailable,
    showUnavailableBadge,
    displayOnly,
    isPopular,
    onOpenProduct,
    onQuickAdd,
    onDecrement,
  }) => (
    <article
      className={`pm-toters-row ${showUnavailableBadge || unavailable ? 'unavailable is-unavailable' : ''}`}
      onClick={() => onOpenProduct(it)}
    >
      {/* Start (Right in RTL): Title, Description, Price & Subtle Inline Tags */}
      <div className="pm-toters-row-info">
        <h3 className="pm-toters-row-title">{it.n}</h3>
        {it.d && <p className="pm-toters-row-desc">{it.d}</p>}
        <div className="pm-toters-row-meta">
          <span className="pm-toters-row-price tabular-nums">{priceMain}</span>
          {priceRawBefore > 0 && (
            <span className="pm-toters-row-old tabular-nums">{formattedBeforePrice}</span>
          )}
          {isPopular && (
            <span className="pm-toters-popular-tag">
              <Flame size={12} fill="#f97316" color="#f97316" /> الأكثر طلباً
            </span>
          )}
        </div>
      </div>

      {/* End (Left in RTL): Square Rounded Thumb + Floating Circular + */}
      <div className={`pm-toters-row-thumb ${showUnavailableBadge || unavailable ? 'is-unavailable' : ''}`}>
        {it.img ? (
          <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        ) : (
          <div className="pm-toters-thumb-empty">
            <Utensils size={22} />
          </div>
        )}
        {(showUnavailableBadge || unavailable) && (
          <>
            <div className="pm-unavailable-wash" aria-hidden="true" />
            <span className="pm-unavailable-pill">غير متوفر</span>
          </>
        )}
        {!displayOnly && (
          !unavailable && qty > 0 ? (
            <div
              className="pm-toters-qty-pill"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="pm-toters-qty-pill-btn"
                aria-label={qty === 1 ? `حذف ${it.n} من السلة` : `إنقاص كمية ${it.n}`}
                onClick={(e) => onDecrement(it.id, e)}
              >
                {qty === 1 ? <Trash2 size={13} strokeWidth={2.3} /> : <Minus size={14} strokeWidth={2.6} />}
              </button>
              <span className="pm-toters-qty-pill-val tabular-nums">{qty}</span>
              <button
                type="button"
                className="pm-toters-qty-pill-btn"
                aria-label={`زيادة كمية ${it.n}`}
                onClick={(e) => onQuickAdd(it, e)}
              >
                <Plus size={14} strokeWidth={2.7} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`pm-toters-plus-btn ${unavailable ? 'is-unavailable-plus' : ''}`}
              disabled={unavailable}
              aria-label={unavailable ? `${it.n} غير متوفر` : `أضف للسلة: ${it.n}`}
              onClick={(e) => onQuickAdd(it, e)}
            >
              <Plus size={16} strokeWidth={2.6} />
            </button>
          )
        )}
      </div>
    </article>
  )
);

const MemoListItemRow = React.memo<MemoCustomerItemProps>(
  ({
    it,
    qty,
    priceMain,
    priceRawBefore,
    formattedBeforePrice,
    unavailable,
    showUnavailableBadge,
    displayOnly,
    accentText,
    brandColor,
    brandInk,
    onOpenProduct,
    onQuickAdd,
  }) => (
    <article
      className={`pm-product-row ${showUnavailableBadge || unavailable ? 'unavailable is-unavailable' : ''}`}
      onClick={() => onOpenProduct(it)}
    >
      {/* Horizontal rectangular food image */}
      <div className={`pm-product-thumb ${showUnavailableBadge || unavailable ? 'is-unavailable' : ''}`}>
        {it.img ? (
          <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--pm-muted)',
              background: 'var(--pm-soft)',
            }}
          >
            <Utensils size={22} />
          </div>
        )}
        {(showUnavailableBadge || unavailable) && (
          <>
            <div className="pm-unavailable-wash" aria-hidden="true" />
            <span className="pm-unavailable-pill is-compact">غير متوفر</span>
          </>
        )}
        {!displayOnly && qty > 0 && !unavailable && (
          <span className="pm-qty-badge tabular-nums">{qty} ×</span>
        )}
      </div>

      {/* Dish Name, Price & Plus Button Only (No description) */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h3
            style={{
              margin: 0,
              fontSize: '14px',
              fontWeight: 800,
              color: 'var(--pm-ink)',
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {it.n}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span
              className="tabular-nums"
              style={{
                color: accentText,
                fontWeight: 900,
                fontSize: '14px',
              }}
            >
              {priceMain}
            </span>
            {priceRawBefore > 0 && (
              <span
                className="tabular-nums"
                style={{
                  color: 'var(--pm-muted)',
                  textDecoration: 'line-through',
                  fontSize: '11.5px',
                  fontWeight: 600,
                }}
              >
                {formattedBeforePrice}
              </span>
            )}
          </div>
        </div>

        {!displayOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              type="button"
              className={`pm-list-add-btn ${unavailable ? 'is-unavailable-plus' : ''}`}
              disabled={unavailable}
              aria-label={unavailable ? `${it.n} غير متوفر` : `أضف للسلة: ${it.n}`}
              onClick={(e) => onQuickAdd(it, e)}
              style={
                unavailable
                  ? { width: '32px', padding: 0 }
                  : { width: '32px', padding: 0, background: brandColor, color: brandInk }
              }
            >
              <Plus size={16} strokeWidth={2.6} />
            </button>
          </div>
        )}
      </div>
    </article>
  )
);

const MemoGridItemCard = React.memo<MemoCustomerItemProps>(
  ({
    it,
    qty,
    priceMain,
    priceRawBefore,
    formattedBeforePrice,
    unavailable,
    showUnavailableBadge,
    displayOnly,
    accentText,
    brandColor,
    brandInk,
    layout = 'grid',
    onOpenProduct,
    onQuickAdd,
  }) => {
    const isCompact = layout === 'grid4' || layout === 'grid3';
    return (
      <article
        onClick={() => onOpenProduct(it)}
        className={`pm-menu-card ${showUnavailableBadge || unavailable ? 'unavailable is-unavailable' : ''}`}
      >
        <div className={`pm-menu-card-media ${showUnavailableBadge || unavailable ? 'is-unavailable' : ''}`}>
          {it.img ? (
            <img
              src={it.img}
              alt={it.n}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--pm-muted)',
              }}
            >
              <Utensils size={layout === 'grid4' ? 18 : isCompact ? 22 : 28} />
            </div>
          )}
          {(showUnavailableBadge || unavailable) && (
            <>
              <div className="pm-unavailable-wash" aria-hidden="true" />
              <span className={`pm-unavailable-pill ${isCompact ? 'is-compact' : ''}`}>غير متوفر</span>
            </>
          )}
          {!displayOnly && qty > 0 && !unavailable && (
            <span className="pm-qty-badge tabular-nums">{qty} ×</span>
          )}
        </div>

        <div className="pm-menu-card-body">
          <b className="pm-menu-card-title">{it.n}</b>

          <div className="pm-menu-card-footer">
            <div style={{ minWidth: 0 }}>
              <span
                className="pm-menu-card-price tabular-nums"
                style={{ color: accentText }}
              >
                {priceMain}
              </span>
              {priceRawBefore > 0 && (
                <span className="pm-menu-card-old-price tabular-nums">
                  {formattedBeforePrice}
                </span>
              )}
            </div>
            {!displayOnly && (
              <button
                type="button"
                disabled={unavailable}
                aria-label={unavailable ? `${it.n} غير متوفر` : `أضف للسلة: ${it.n}`}
                onClick={(e) => onQuickAdd(it, e)}
                className={`pm-menu-card-add ${unavailable ? 'is-unavailable-plus' : ''}`}
                style={
                  unavailable
                    ? { padding: 0 }
                    : { background: brandColor, color: brandInk, padding: 0 }
                }
              >
                <Plus size={layout === 'grid4' ? 13 : isCompact ? 14 : 16} strokeWidth={2.6} />
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }
);

const PublicMenuContent: React.FC<PublicMenuContentProps> = ({
  restaurantId,
  session,
  onNavigate,
  showToast,
  hasMultipleBranches,
  branchShortLabel,
  onOpenBranchPicker,
  familyBranches,
  selectedBranchId,
  onSelectBranch,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [syncTick, setSyncTick] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const nowDate = useMemo(() => new Date(nowMs), [nowMs]);
  const dbRev = getDbRevision();
  void dbRev;

  useEffect(() => {
    syncDashboardMotionFromSite(getSite(), typeof window !== 'undefined' ? window.location.pathname : '/');
  }, []);

  useEffect(() => {
    let active = true;
    let lastFocusRefreshAt = 0;

    const refreshFromServer = (bypassTtl = false) => {
      void fetchPublicMenuFast(restaurantId, {
        onlyIfChanged: true,
        ...(bypassTtl ? { bypassTtl: true } : {}),
      }).then((res) => {
        if (res.ok && active) {
          syncDashboardMotionFromSite(getSite(), window.location.pathname);
          applyPlatformTypography(getTheme());
          setSyncTick((prev) => prev + 1);
        }
      });
    };
    const handleDbUpdated = () => {
      if (active) {
        syncDashboardMotionFromSite(getSite(), window.location.pathname);
        applyPlatformTypography(getTheme());
        setSyncTick((prev) => prev + 1);
      }
    };
    const handleFocus = () => {
      if (!active || document.visibilityState === 'hidden') return;
      const now = Date.now();
      setNowMs(now);
      if (now - lastFocusRefreshAt < 30_000) return;
      lastFocusRefreshAt = now;
      setSyncTick((prev) => prev + 1);
      refreshFromServer(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };

    refreshFromServer(false);
    const unsubscribeRealtime = subscribeServerRealtime({
      scope: 'menu',
      rid: restaurantId,
      onUpdate: () => {
        if (active) refreshFromServer(true);
      },
    });
    window.addEventListener('menuplus_db_updated', handleDbUpdated);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    const handleSchemeChange = () => {
      if (active) setSyncTick((prev) => prev + 1);
    };
    if (mq) {
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handleSchemeChange);
      else mq.addListener(handleSchemeChange);
    }

    return () => {
      active = false;
      unsubscribeRealtime();
      window.removeEventListener('menuplus_db_updated', handleDbUpdated);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (mq) {
        if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', handleSchemeChange);
        else mq.removeListener(handleSchemeChange);
      }
    };
  }, [restaurantId]);

  const rawRest = useMemo(
    () =>
      getItem<Restaurant>(`restaurants/${restaurantId}`) ||
      resolveRestaurantByIdOrSlug(restaurantId),
    [restaurantId, dbRev, syncTick]
  );
  const rest = useMemo(() => {
    const normalized =
      rawRest && rawRest.isBranch && rawRest.branchName?.trim()
        ? { ...rawRest, n: rawRest.branchName.trim() }
        : rawRest;
    return normalized ? ensureRestaurantDefaults(normalized) : undefined;
  }, [rawRest]);
  const resolvedPlan = useMemo(() => resolveRestaurantPlan(rest, getPlans()), [rest, dbRev, syncTick]);
  const terms = useMemo(() => getBusinessTerms(rest?.projectType), [rest?.projectType]);
  const ORDER_TYPE_META = useMemo<Record<OrderType, { label: string; icon: React.ReactNode }>>(
    () => ({
      delivery: { label: 'توصيل', icon: <Truck size={15} /> },
      pickup: { label: terms.pickupLabel, icon: <Store size={15} /> },
      table: { label: terms.dineInOrBranchNote, icon: <Utensils size={15} /> },
    }),
    [terms.pickupLabel, terms.dineInOrBranchNote]
  );
  const isEstore = terms.isStore;
  const [demoViewerOverrideState, setDemoViewerOverrideState] = useState<DemoViewerOverride | null>(() =>
    readDemoViewerAppearance()
  );
  useEffect(() => {
    if (restaurantId === 'demo') {
      setDemoViewerOverrideState(readDemoViewerAppearance());
    }
  }, [restaurantId]);
  const demoViewerOverride = restaurantId === 'demo' && !isEstore ? demoViewerOverrideState : null;
  const resolvedThemePreset = demoViewerOverride
    ? demoViewerOverride.preset
    : isEstore
    ? 'estore'
    : rest?.themePreset;
  const resolvedThemeMode = demoViewerOverride
    ? demoViewerOverride.mode
    : isEstore
    ? 'light'
    : rest?.themeMode;
  const activeTheme = getMenuThemeById(resolvedThemePreset, resolvedThemeMode);
  const rawCandidateShape = demoViewerOverride ? demoViewerOverride.shape : rest?.themeShape;
  const candidateShape = (rawCandidateShape as string) === 'theme6' ? 'theme5' : rawCandidateShape;
  const activeShape: MenuThemeShape = isEstore
    ? 'estore'
    : candidateShape === 'silk' ||
      candidateShape === 'editorial' ||
      candidateShape === 'velvet' ||
      candidateShape === 'luxe' ||
      candidateShape === 'toters' ||
      candidateShape === 'theme1' ||
      candidateShape === 'theme2' ||
      candidateShape === 'theme3' ||
      candidateShape === 'theme4' ||
      candidateShape === 'theme5' ||
      candidateShape === 'glass' ||
      candidateShape === 'cartoon' ||
      candidateShape === 'dreamy' ||
      candidateShape === 'pill' ||
      candidateShape === 'sharp' ||
      candidateShape === 'bordered' ||
      candidateShape === 'soft' ||
      candidateShape === 'ramadan' ||
      candidateShape === 'eid' ||
      candidateShape === 'newyear'
    ? candidateShape
    : 'modern';
  const isToters = !isEstore && activeShape === 'toters';
  const isTheme1 = !isEstore && activeShape === 'theme1';
  const isTheme2 = !isEstore && activeShape === 'theme2';
  const isTheme3 = !isEstore && activeShape === 'theme3';
  const isTheme4 = !isEstore && activeShape === 'theme4';
  const isTheme6 = !isEstore && activeShape === 'theme5';
  const isCustomPreset =
    !demoViewerOverride && !isEstore && rest?.themePreset === 'custom' && resolvedPlan.perms.customColors;
  const hasKnownPreset = Boolean(
    !isEstore &&
    resolvedThemePreset &&
    resolvedThemePreset !== 'custom' &&
    MENU_THEMES.some((t) => t.id === resolvedThemePreset)
  );
  const currency = String(rest?.currency || 'د.ع').trim();
  const brandColor = isEstore
    ? '#222222'
    : demoViewerOverride
    ? activeTheme.brand
    : isCustomPreset
    ? (rest?.color || activeTheme.brand)
    : hasKnownPreset
    ? activeTheme.brand
    : (resolvedPlan.perms.customColors && rest?.color ? rest.color : activeTheme.brand);
  const customBgColor = isEstore
    ? '#ffffff'
    : demoViewerOverride
    ? activeTheme.bg
    : isCustomPreset && rest?.bgColor
    ? rest.bgColor
    : rest?.themeMode === 'auto'
    ? activeTheme.bg
    : resolvedPlan.perms.customColors && rest?.bgColor
    ? rest.bgColor
    : activeTheme.bg;
  const isLightMenu = isEstore
    ? true
    : demoViewerOverride
    ? activeTheme.mode === 'light'
    : isCustomPreset && rest?.bgColor
    ? getContrastInk(rest.bgColor) === '#0f172a'
    : activeTheme.mode === 'light';
  const effectiveSurface = isEstore
    ? '#ffffff'
    : demoViewerOverride
    ? activeTheme.surface
    : isCustomPreset && rest?.bgColor
    ? isLightMenu
      ? `color-mix(in srgb, ${customBgColor} 35%, #ffffff)`
      : `color-mix(in srgb, ${customBgColor} 80%, #ffffff)`
    : activeTheme.surface;
  const effectiveSurfaceSoft = isEstore
    ? '#f8f8f8'
    : demoViewerOverride
    ? activeTheme.surfaceSoft
    : isCustomPreset && rest?.bgColor
    ? isLightMenu
      ? `color-mix(in srgb, ${customBgColor} 88%, #0f172a)`
      : `color-mix(in srgb, ${customBgColor} 88%, #ffffff)`
    : activeTheme.surfaceSoft;
  const effectiveInk = isEstore
    ? '#222222'
    : demoViewerOverride
    ? activeTheme.text
    : isCustomPreset && rest?.bgColor
    ? isLightMenu
      ? '#0f172a'
      : '#f8fafc'
    : activeTheme.text;
  const effectiveMuted = isEstore
    ? '#7e7e7e'
    : demoViewerOverride
    ? activeTheme.muted
    : isCustomPreset && rest?.bgColor
    ? isLightMenu
      ? '#475569'
      : '#94a3b8'
    : activeTheme.muted;
  const effectiveLine = isEstore
    ? '#eaeaea'
    : demoViewerOverride
    ? activeTheme.line
    : isCustomPreset && rest?.bgColor
    ? isLightMenu
      ? 'rgba(15, 23, 42, 0.14)'
      : 'rgba(255, 255, 255, 0.15)'
    : activeTheme.line;
  const accentText = isEstore ? '#222222' : isLightMenu ? brandColor : getReadableAccent(brandColor);
  const brandInk = isEstore ? '#ffffff' : getContrastInk(brandColor);

  const rawAddons = rest?.addons || {};
  const addons = useMemo<RestaurantAddons>(() => {
    const filtered: Record<string, any> = {};
    Object.keys(rawAddons).forEach((k) => {
      if (isAddonAllowedForPlan(k, resolvedPlan) || (isToters && k === 'loyaltyPoints')) {
        filtered[k] = (rawAddons as Record<string, any>)[k];
      }
    });
    return filtered as RestaurantAddons;
  }, [rawAddons, resolvedPlan, isToters]);

  // Available order types (gated by plan permissions + restaurant toggles + viewOnlyMode)
  const enabledTypes = useMemo<OrderType[]>(() => {
    if (rest?.viewOnlyMode) return [];
    const cfg = rest?.enabledOrderTypes;
    const list: OrderType[] = [];
    if (resolvedPlan.perms.deliveryOrders && cfg?.delivery !== false) list.push('delivery');
    if (resolvedPlan.perms.pickupOrders && cfg?.pickup !== false) list.push('pickup');
    if (resolvedPlan.perms.tableOrders && cfg?.table === true) list.push('table');
    return list;
  }, [
    rest?.viewOnlyMode,
    rest?.enabledOrderTypes,
    resolvedPlan.perms.deliveryOrders,
    resolvedPlan.perms.pickupOrders,
    resolvedPlan.perms.tableOrders,
  ]);

  const openNow = useMemo(() => isRestaurantOpenNow(rest, nowDate), [rest, nowDate]);
  const canOrderNow = openNow || Boolean(rest?.acceptOrdersWhenClosed);
  const isCatalogViewOnly =
    Boolean(rest?.viewOnlyMode) || enabledTypes.length === 0 || !canOrderNow;

  const [orderType, setOrderType] = useState<OrderType>('delivery');

  useEffect(() => {
    if (enabledTypes.length > 0 && !enabledTypes.includes(orderType)) {
      setOrderType(enabledTypes[0]);
    }
  }, [enabledTypes, orderType]);

  useEffect(() => {
    if (isCatalogViewOnly) {
      setCartOpen(false);
      setOrderTypeModalOpen(false);
    }
  }, [isCatalogViewOnly]);

  // Storefront SEO: Dynamic title, meta description, canonical & Schema.org Restaurant + Menu JSON-LD
  useEffect(() => {
    if (typeof document === 'undefined' || !rest) return;
    const storeName = rest.n || 'منيو إلكتروني';
    const title = `${storeName} — المنيو الإلكتروني وطلبات الواتساب | Menu Plus`;
    const desc =
      (rest.tagline || rest.aboutText || '').trim() ||
      `تصفح قائمة الطعام والمنتجات والأسعار في ${storeName} واطلب مباشرة عبر واتساب بسرعة وسهولة عبر منصة Menu Plus.`;
    document.title = title;

    const upsertMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    const origin = window.location.origin;
    const rawCover = (isEstore && Array.isArray(rest.coverImages) && rest.coverImages[0]) || rest.logo || '';
    const embedImgUrl =
      rawCover && !String(rawCover).startsWith('data:')
        ? /^https?:\/\//i.test(String(rawCover))
          ? String(rawCover)
          : `${origin}${String(rawCover).startsWith('/') ? rawCover : `/${rawCover}`}`
        : `${origin}/assets/logo.png`;
    const canonicalUrl = `${origin}${window.location.pathname}`;
    upsertMeta('name', 'description', desc);
    upsertMeta('property', 'og:site_name', 'Menu Plus');
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:image', embedImgUrl);
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', desc);
    upsertMeta('name', 'twitter:url', canonicalUrl);
    upsertMeta('name', 'twitter:image', embedImgUrl);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const writeMenuJsonLd = () => {
      document.getElementById('mp-ssr-jsonld')?.remove();
      const seoNow = new Date();
      const rawSeoCats = getCollection<Category>('cats').filter((c) => c.rid === restaurantId);
      const seoCatMap = new Map<string, Category>(rawSeoCats.map((c) => [c.id, c]));
      const restCats = rawSeoCats.filter((c) => !evaluateCategoryAvailability(c, seoNow).hidden);
      const restItems = getCollection<MenuItem>('items').filter(
        (i) => i.rid === restaurantId && !evaluateItemAvailability(i, seoCatMap.get(i.cat), seoNow).hidden
      );

      const schema = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${origin}/#website`,
            name: 'Menu Plus',
            alternateName: ['Menu Plus', 'منيو بلس'],
            url: `${origin}/`,
          },
          {
            '@type': rest.projectType === 'store' ? 'Store' : 'Restaurant',
            name: storeName,
            description: desc,
            url: canonicalUrl,
            image: embedImgUrl,
            ...(rest.ph ? { telephone: rest.ph } : {}),
            hasMenu: {
              '@type': 'Menu',
              name: `قائمة ${storeName}`,
              url: canonicalUrl,
              hasMenuSection: restCats.slice(0, 10).map((cat) => ({
                '@type': 'MenuSection',
                name: cat.n,
                hasMenuItem: restItems
                  .filter((it) => it.cat === cat.id)
                  .slice(0, 12)
                  .map((it) => ({
                    '@type': 'MenuItem',
                    name: it.n,
                    ...(it.d ? { description: it.d } : {}),
                    offers: {
                      '@type': 'Offer',
                      price: String(Number(it.pr) || 0),
                      priceCurrency: currency === 'د.ع' ? 'IQD' : 'USD',
                    },
                  })),
              })),
            },
          },
        ],
      };

      let ldEl = document.getElementById('mp-store-jsonld') as HTMLScriptElement | null;
      if (!ldEl) {
        ldEl = document.createElement('script');
        ldEl.id = 'mp-store-jsonld';
        ldEl.type = 'application/ld+json';
        document.head.appendChild(ldEl);
      }
      ldEl.textContent = JSON.stringify(schema);
    };

    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let cleanupTimer: (() => void) | undefined;
    if (typeof w.requestIdleCallback === 'function') {
      const idleId = w.requestIdleCallback(writeMenuJsonLd, { timeout: 600 });
      cleanupTimer = () => w.cancelIdleCallback?.(idleId);
    } else {
      const timerId = window.setTimeout(writeMenuJsonLd, 0);
      cleanupTimer = () => window.clearTimeout(timerId);
    }
    return cleanupTimer;
  }, [rest?.id, rest?.n, rest?.tagline, rest?.aboutText, rest?.logo, rest?.coverImages, rest?.projectType, rest?.ph, isEstore, currency, restaurantId]);

  // Carousel banner index (used for online store storefront only)
  const [bannerIdx, setBannerIdx] = useState(0);
  const coverImages = useMemo(
    () => (isEstore ? (rest?.coverImages || []).filter(Boolean) : []),
    [isEstore, rest?.coverImages]
  );
  useEffect(() => {
    if (coverImages.length <= 1) return;
    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setBannerIdx((i) => (i + 1) % coverImages.length);
      }
    }, 4500);
    return () => clearInterval(timer);
  }, [coverImages.length]);

  // Scheduled item/category availability, working hours & discount tick (30s interval — 1s clock ticks live inside LiveCountdownText)
  const hasScheduledMenuEntries = useMemo(() => {
    const hasScheduledCat = getCollection<Category>('cats').some(
      (c) =>
        c.rid === restaurantId &&
        (Boolean(c.availabilitySchedule?.enabled) ||
          (c.manualPause?.paused && typeof c.manualPause.until === 'number'))
    );
    if (hasScheduledCat) return true;
    return getCollection<MenuItem>('items').some(
      (i) =>
        i.rid === restaurantId &&
        (Boolean(i.availabilitySchedule?.enabled) ||
          (i.manualPause?.paused && typeof i.manualPause.until === 'number'))
    );
  }, [restaurantId, rest?.id, dbRev, syncTick]);

  const hasWorkingHoursSchedule = Boolean(
    rest &&
      (rest.h?.m === 'c' || (rest.weeklyHours && Object.keys(rest.weeklyHours).length > 0))
  );

  useEffect(() => {
    const hasActiveTimeWindow =
      Boolean(addons.countdownTimer?.enabled || addons.happyHour?.enabled) ||
      hasScheduledMenuEntries ||
      hasWorkingHoursSchedule;
    if (!hasActiveTimeWindow) return;
    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setNowMs(Date.now());
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [
    addons.countdownTimer?.enabled,
    addons.happyHour?.enabled,
    hasScheduledMenuEntries,
    hasWorkingHoursSchedule,
  ]);

  // Interactive Addons State (Spin Wheel, Cutlery, Bill Split, Mood Finder, Curbside)
  const [hasOrderedBefore, setHasOrderedBefore] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`emenu_ordered_${restaurantId}`) === '1';
    } catch {
      return false;
    }
  });
  const [loyaltyBalance, setLoyaltyBalance] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(`emenu_points_${restaurantId}`) || 0);
    } catch {
      return 0;
    }
  });
  const [lastSavedOrderCart, setLastSavedOrderCart] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(`emenu_last_order_${restaurantId}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [needCutlery, setNeedCutlery] = useState(true);
  const [splitPeople, setSplitPeople] = useState(1);
  const [moodModalOpen, setMoodModalOpen] = useState(false);
  const [selectedMood, setSelectedMood] = useState<'fast' | 'light' | 'spicy' | 'sweet'>('fast');
  const [curbsideCarInfo, setCurbsideCarInfo] = useState('');

  // Spin Wheel Modal State
  const [spinModalOpen, setSpinModalOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelDeg, setWheelDeg] = useState(0);
  const [spinWonReward, setSpinWonReward] = useState<{ label: string; percent: number; freeDelivery: boolean } | null>(() => {
    try {
      const raw = sessionStorage.getItem(`emenu_spin_${restaurantId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Modals & Popups state
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [catsModalOpen, setCatsModalOpen] = useState(false);
  const [orderTypeModalOpen, setOrderTypeModalOpen] = useState(false);
  const [workModalOpen, setWorkModalOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [t6ViewMode, setT6ViewMode] = useState<'list' | 'large'>('list');
  const [t6StickyVisible, setT6StickyVisible] = useState(false);
  const [t6BranchSheetOpen, setT6BranchSheetOpen] = useState(false);
  const [t6PendingBranchId, setT6PendingBranchId] = useState<string>(selectedBranchId || restaurantId);
  const t6StickySentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setT6PendingBranchId(selectedBranchId || restaurantId);
  }, [selectedBranchId, restaurantId]);

  useEffect(() => {
    if (!isTheme6) {
      setT6StickyVisible(false);
      return;
    }
    const el = t6StickySentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setT6StickyVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
        }
      },
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isTheme6, restaurantId, Boolean(rest)]);

  useEffect(() => {
    if (!isTheme1) return;
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTheme1]);

  // Offer popup (shown on every page refresh when enabled)
  const offerPopupCfg = addons.offerPopup || rest?.offerPopup;
  const offerPopupMode: 'ad' | 'dish' = offerPopupCfg?.mode === 'dish' ? 'dish' : 'ad';
  const offerPopupItemId = offerPopupMode === 'dish' ? String(offerPopupCfg?.itemId || '').trim() : '';
  const offerPopupBadge = String(offerPopupCfg?.badgeText || '').trim();
  const offerPopupSpecialPrice =
    offerPopupMode === 'dish' &&
    offerPopupCfg?.specialPrice !== undefined &&
    offerPopupCfg?.specialPrice !== null &&
    String(offerPopupCfg.specialPrice).trim() !== '' &&
    Number.isFinite(Number(offerPopupCfg.specialPrice))
      ? Math.max(0, Number(offerPopupCfg.specialPrice))
      : undefined;
  const offerPopupLinkedItem = useMemo(() => {
    if (offerPopupMode !== 'dish' || !offerPopupItemId) return null;
    const candidate =
      getCollection<MenuItem>('items').find(
        (it) => it.id === offerPopupItemId && it.rid === restaurantId
      ) || null;
    if (!candidate) return null;
    const parentCat = getCollection<Category>('cats').find((c) => c.id === candidate.cat) || null;
    const evalRes = evaluateItemAvailability(candidate, parentCat, new Date(nowMs));
    return evalRes.hidden ? null : candidate;
  }, [offerPopupMode, offerPopupItemId, restaurantId, rest?.id, nowMs]);
  const offerPopupTitle =
    offerPopupCfg?.title || (offerPopupMode === 'dish' ? offerPopupLinkedItem?.n : '') || '';
  const offerPopupSubtitle =
    offerPopupCfg?.subtitle || (offerPopupMode === 'dish' ? offerPopupLinkedItem?.d : '') || '';
  const offerPopupImage =
    offerPopupCfg?.image || (offerPopupMode === 'dish' ? offerPopupLinkedItem?.img : '') || '';
  const rawOfferPopupBtnText = String(offerPopupCfg?.buttonText || '').trim();
  const offerPopupBtnText =
    offerPopupMode === 'dish'
      ? !rawOfferPopupBtnText ||
        rawOfferPopupBtnText === 'إغلاق' ||
        rawOfferPopupBtnText === 'تصفح المنيو واطلب الآن' ||
        rawOfferPopupBtnText === 'تصفح المنيو'
        ? 'إضافة إلى السلة'
        : rawOfferPopupBtnText
      : !rawOfferPopupBtnText ||
        rawOfferPopupBtnText === 'إضافة إلى السلة' ||
        rawOfferPopupBtnText === 'تصفح المنيو واطلب الآن' ||
        rawOfferPopupBtnText === 'تصفح المنيو'
      ? 'إغلاق'
      : rawOfferPopupBtnText;
  const offerPopupEnabled =
    resolvedPlan.perms.popupAd &&
    (addons.offerPopup ? addons.offerPopup.enabled === true : rest?.offerPopup?.enabled === true);

  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const shownOfferOnMountRef = useRef<string>('');
  useEffect(() => {
    if (!offerPopupEnabled || !offerPopupTitle) {
      setOfferModalOpen(false);
      return;
    }
    if (shownOfferOnMountRef.current === restaurantId) return;
    shownOfferOnMountRef.current = restaurantId;
    const timer = setTimeout(() => {
      setOfferModalOpen(true);
    }, 320);
    return () => clearTimeout(timer);
  }, [restaurantId, offerPopupEnabled, offerPopupTitle]);

  // Active category tracking
  const [activeCatId, setActiveCatId] = useState<string>('');
  const [estoreCatFilter, setEstoreCatFilter] = useState<string>('all');

  // Auto-update active category highlight on scroll (throttled via rAF to keep scrolling 60fps smooth)
  useEffect(() => {
    let rafId: number | null = null;
    const updateActiveCat = () => {
      rafId = null;
      const sections = document.querySelectorAll<HTMLElement>('section[id^="mc-"]');
      if (sections.length === 0) return;
      let currentId = sections[0].id.slice(3);
      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        if (sec.getBoundingClientRect().top <= 165) {
          currentId = sec.id.slice(3);
        }
      }
      setActiveCatId((prev) => (prev === currentId ? prev : currentId));
    };
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(updateActiveCat);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    if (!activeCatId) return;
    const strips = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.pm-cat-strip, .pm-t1-cat-strip, .pm-t2-cat-strip, .pm-t3-cat-strip, .pm-t4-cat-strip, .pm-t6-cat-strip'
      )
    );
    strips.forEach((strip) => {
      const chip = strip.querySelector<HTMLElement>(`[data-cat-id="${activeCatId}"]`);
      if (chip) {
        const stripRect = strip.getBoundingClientRect();
        const chipRect = chip.getBoundingClientRect();
        if (stripRect.width > 0 && chipRect.width > 0) {
          const deltaX = chipRect.left + chipRect.width / 2 - (stripRect.left + stripRect.width / 2);
          if (Math.abs(deltaX) > 4) {
            strip.scrollBy({
              left: deltaX,
              behavior: 'smooth',
            });
          }
        }
      }
    });
  }, [activeCatId]);

  // Product Detail Modal State
  const [activeProduct, setActiveProduct] = useState<MenuItem | null>(null);
  const [selectedSize, setSelectedSize] = useState<MenuItemSize | null>(null);
  const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
  const [selectedExtras, setSelectedExtras] = useState<MenuItemExtra[]>([]);
  const [modalQty, setModalQty] = useState(1);
  const [modalItemNote, setModalItemNote] = useState('');
  const [allergensOpen, setAllergensOpen] = useState(false);

  // Cart & Checkout State (Persisted in localStorage so cart items are never lost)
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const saved = localStorage.getItem(`menuplus_cart_${restaurantId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback to empty
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(`menuplus_cart_${restaurantId}`, JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart, restaurantId]);

  useEffect(() => {
    if (orderType === 'table') return;
    const dineInOnlyIds = new Set(
      getCollection<MenuItem>('items')
        .filter((i) => i.rid === restaurantId && i.dineInOnly)
        .map((i) => i.id)
    );
    if (dineInOnlyIds.size === 0) return;
    setCart((prev) => {
      const next = prev.filter((line) => !dineInOnlyIds.has(line.itemId));
      return next.length === prev.length ? prev : next;
    });
  }, [orderType, restaurantId, syncTick]);

  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'details' | 'done'>('cart');
  const [selectedAreaIdx, setSelectedAreaIdx] = useState<number>(-1);
  const [selectedCityIdx, setSelectedCityIdx] = useState<number>(0);
  const [unlistedAreaSelected, setUnlistedAreaSelected] = useState<boolean>(false);
  const [zoneDropdownOpen, setZoneDropdownOpen] = useState<boolean>(false);
  const [zoneSearchQuery, setZoneSearchQuery] = useState<string>('');
  const [checkoutTriedSubmit, setCheckoutTriedSubmit] = useState<boolean>(false);

  // Cross-menu saved customer details (auto-filled across all restaurant menus; GPS stays live per visit)
  const readSharedCustomerProfile = () => {
    const out = { name: '', phone: '', address: '', notes: '' };
    if (typeof window === 'undefined') return out;
    try {
      const rawCookie = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('mp_cust_profile='));
      if (rawCookie) {
        const parsedCookie = JSON.parse(decodeURIComponent(rawCookie.slice('mp_cust_profile='.length)));
        if (parsedCookie && typeof parsedCookie === 'object') {
          if (typeof parsedCookie.name === 'string') out.name = parsedCookie.name;
          if (typeof parsedCookie.phone === 'string') out.phone = parsedCookie.phone;
          if (typeof parsedCookie.address === 'string') out.address = parsedCookie.address;
          if (typeof parsedCookie.notes === 'string') out.notes = parsedCookie.notes;
        }
      }
    } catch {
      // ignore cookie parse error
    }
    try {
      const rawLocal = localStorage.getItem('menuplus_shared_customer_profile_v1');
      if (rawLocal) {
        const parsedLocal = JSON.parse(rawLocal);
        if (parsedLocal && typeof parsedLocal === 'object') {
          if (!out.name && typeof parsedLocal.name === 'string') out.name = parsedLocal.name;
          if (!out.phone && typeof parsedLocal.phone === 'string') out.phone = parsedLocal.phone;
          if (!out.address && typeof parsedLocal.address === 'string') out.address = parsedLocal.address;
          if (!out.notes && typeof parsedLocal.notes === 'string') out.notes = parsedLocal.notes;
        }
      }
    } catch {
      // ignore storage error
    }
    return out;
  };

  const initialSharedProfile = useMemo(() => readSharedCustomerProfile(), []);
  const [customerName, setCustomerName] = useState(initialSharedProfile.name);
  const [customerPhone, setCustomerPhone] = useState(initialSharedProfile.phone);
  const [customerAddress, setCustomerAddress] = useState(initialSharedProfile.address);
  const [customerNotes, setCustomerNotes] = useState(initialSharedProfile.notes);
  const profileSyncTimerRef = useRef<number | null>(null);
  const persistSharedProfile = useCallback(
    (profile: { name: string; phone: string; address: string; notes: string }, syncServerNow = false) => {
      const clean = {
        name: profile.name.trim(),
        phone: profile.phone.trim(),
        address: profile.address.trim(),
        notes: profile.notes.trim(),
      };
      try {
        localStorage.setItem('menuplus_shared_customer_profile_v1', JSON.stringify(clean));
      } catch {
        // ignore storage error
      }
      try {
        const siteBase = getSite().baseDomain?.trim().toLowerCase() || '';
        const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
        const domainAttr =
          siteBase && (host === siteBase || host.endsWith(`.${siteBase}`))
            ? `; Domain=.${siteBase}`
            : '';
        const secureAttr = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `mp_cust_profile=${encodeURIComponent(
          JSON.stringify(clean)
        )}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${domainAttr}${secureAttr}`;
      } catch {
        // ignore cookie error
      }
      if (syncServerNow) {
        void fetch('/api/customer-profile', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clean),
        }).catch(() => {});
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    void fetch('/api/customer-profile', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { profile?: { name?: string; phone?: string; address?: string; notes?: string } | null } | null) => {
        if (!active || !data?.profile) return;
        const p = data.profile;
        if (p.name) {
          setCustomerName((prev) => prev || p.name || '');
        }
        if (p.phone) {
          setCustomerPhone((prev) => prev || p.phone || '');
        }
        if (p.address) {
          setCustomerAddress((prev) => prev || p.address || '');
        }
        if (p.notes) {
          setCustomerNotes((prev) => prev || p.notes || '');
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!customerName && !customerPhone && !customerAddress && !customerNotes) return;
    if (profileSyncTimerRef.current !== null) {
      window.clearTimeout(profileSyncTimerRef.current);
    }
    const snapshot = {
      name: customerName,
      phone: customerPhone,
      address: customerAddress,
      notes: customerNotes,
    };
    persistSharedProfile(snapshot, false);
    profileSyncTimerRef.current = window.setTimeout(() => {
      profileSyncTimerRef.current = null;
      persistSharedProfile(snapshot, true);
    }, 550);
    return () => {
      if (profileSyncTimerRef.current !== null) {
        window.clearTimeout(profileSyncTimerRef.current);
      }
    };
  }, [customerName, customerPhone, customerAddress, customerNotes, persistSharedProfile]);

  const fetchServerLoyaltyWallet = useCallback(
    async (phoneVal: string) => {
      const cleanPhone = String(phoneVal || '').replace(/[\s\-()+]/g, '').replace(/[^\d]/g, '');
      if (cleanPhone.length < 7 || !restaurantId) return;
      try {
        const res = await fetch(
          `/api/loyalty/wallet?rid=${encodeURIComponent(restaurantId)}&phone=${encodeURIComponent(cleanPhone)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          found?: boolean;
          customer?: LoyaltyCustomer;
        };
        if (data.ok && data.found && data.customer) {
          const pts = Math.max(0, Number(data.customer.points || 0));
          setLoyaltyBalance(pts);
          try {
            localStorage.setItem(`emenu_points_${restaurantId}`, String(pts));
          } catch {
            // ignore
          }
          if (data.customer.name) {
            setCustomerName((prev) => prev || data.customer?.name || '');
          }
        } else if (data.ok && data.found === false) {
          setLoyaltyBalance(0);
        }
      } catch {
        // ignore network errors
      }
    },
    [restaurantId]
  );

  useEffect(() => {
    if (!addons.loyaltyPoints?.enabled) return;
    const cleanPhone = customerPhone.replace(/[\s\-()+]/g, '').replace(/[^\d]/g, '');
    if (cleanPhone.length < 7) return;
    const t = window.setTimeout(() => {
      void fetchServerLoyaltyWallet(cleanPhone);
    }, 350);
    return () => window.clearTimeout(t);
  }, [addons.loyaltyPoints?.enabled, customerPhone, fetchServerLoyaltyWallet]);

  const handleRegisterLoyaltyCustomer = useCallback(
    async (name: string, phone: string): Promise<{ ok: boolean; customer?: LoyaltyCustomer; error?: string }> => {
      try {
        const res = await fetch('/api/loyalty/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rid: restaurantId, name, phone }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          customer?: LoyaltyCustomer;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.customer) {
          return { ok: false, error: data.error || 'تعذر حفظ البطاقة.' };
        }
        const saved = data.customer;
        setCustomerName(saved.name);
        setCustomerPhone(saved.phone);
        const pts = Math.max(0, Number(saved.points || 0));
        setLoyaltyBalance(pts);
        try {
          localStorage.setItem(`emenu_points_${restaurantId}`, String(pts));
        } catch {
          // ignore
        }
        persistSharedProfile(
          {
            name: saved.name,
            phone: saved.phone,
            address: customerAddress,
            notes: customerNotes,
          },
          true
        );
        return { ok: true, customer: saved };
      } catch {
        return { ok: false, error: 'تعذر الاتصال بالخادم، حاول مجدداً.' };
      }
    },
    [restaurantId, customerAddress, customerNotes, persistSharedProfile]
  );

  const [selectedTable, setSelectedTable] = useState<string>(() => getTableFromUrl());
  const [gpsCoords, setGpsCoords] = useState<{ lat: string; lng: string } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsAttempted, setGpsAttempted] = useState(false);
  const [gpsErrorMsg, setGpsErrorMsg] = useState('');
  const gpsSectionRef = useRef<HTMLDivElement | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [lastOrderSummary, setLastOrderSummary] = useState<{
    id: string;
    orderSeq?: number;
    waUrl: string;
    total: number;
    items: OrderItem[];
    channel?: 'both' | 'telegram' | 'whatsapp' | 'app';
    unlistedArea?: boolean;
  } | null>(null);

  // Rating Form State
  const [revName, setRevName] = useState('');
  const [revPhone, setRevPhone] = useState('');
  const [revRate, setRevRate] = useState(5);
  const [revComment, setRevComment] = useState('');

  // Only show owner controls if logged in as the menu owner (including demo/admin previewing their menu or any child branch)
  const isOwner = Boolean(
    session &&
    (
      (session.admin && !session.menuLoggedOut) ||
      session.rid === restaurantId ||
      session.personalRid === restaurantId ||
      (rest?.parentRid && (session.rid === rest.parentRid || session.personalRid === rest.parentRid))
    )
  );

  const parentRestForActive = rest?.parentRid
    ? getItem<Restaurant>(`restaurants/${rest.parentRid}`)
    : undefined;
  const isMenuSuspended = rest
    ? rest.parentRid && parentRestForActive
      ? parentRestForActive.a === 0
      : rest.a === 0
    : false;

  const useWhatsapp =
    rest?.whatsappNotificationsEnabled !== undefined
      ? rest.whatsappNotificationsEnabled !== false
      : rest?.orderChannel !== 'telegram' && rest?.orderChannel !== 'app';
  const useTelegram =
    rest?.telegramNotificationsEnabled !== undefined
      ? rest.telegramNotificationsEnabled !== false
      : rest?.orderChannel !== 'whatsapp' && rest?.orderChannel !== 'app';
  const orderChannel: 'both' | 'telegram' | 'whatsapp' | 'app' =
    useWhatsapp && useTelegram
      ? 'both'
      : useTelegram
      ? 'telegram'
      : useWhatsapp
      ? 'whatsapp'
      : 'app';

  const { rawCatById, categoryEvalMap, allCategories } = useMemo(() => {
    const rawCats = getCollection<Category>('cats')
      .filter((c) => c.rid === restaurantId && c.published !== false)
      .filter((c) => {
        if (!isCatalogViewOnly && orderType === 'delivery' && c.noDelivery) return false;
        if (!isCatalogViewOnly && orderType === 'pickup' && c.noPickup) return false;
        return true;
      })
      .sort((a, b) => (a.o || 0) - (b.o || 0));

    const catById = new Map<string, Category>(rawCats.map((c) => [c.id, c]));
    const evalMap = new Map<string, CategoryAvailabilityResult>();
    rawCats.forEach((c) => {
      evalMap.set(c.id, evaluateCategoryAvailability(c, nowDate));
    });

    const visibleCats = rawCats.filter((c) => !evalMap.get(c.id)?.hidden);
    return {
      rawCatById: catById,
      categoryEvalMap: evalMap,
      allCategories: visibleCats,
    };
  }, [restaurantId, isCatalogViewOnly, orderType, nowDate, dbRev, syncTick]);

  const { itemEvalMap, allItems, itemsByCatMap } = useMemo(() => {
    const rawItems = getCollection<MenuItem>('items')
      .filter((i) => i.rid === restaurantId && i.published !== false && i.available !== false)
      .filter((i) => {
        if (i.dineInOnly) return true;
        if (!isCatalogViewOnly && orderType === 'delivery' && i.noDelivery) return false;
        if (!isCatalogViewOnly && orderType === 'pickup' && i.noPickup) return false;
        return true;
      })
      .sort((a, b) => (a.o || 0) - (b.o || 0));

    const evalMap = new Map<string, ItemAvailabilityResult>();
    const visibleItems = rawItems.filter((i) => {
      const parentCat = rawCatById.get(i.cat);
      if (!parentCat) return false;
      const evalRes = evaluateItemAvailability(i, parentCat, nowDate);
      evalMap.set(i.id, evalRes);
      return !evalRes.hidden;
    });

    const byCat = new Map<string, MenuItem[]>();
    for (let i = 0; i < visibleItems.length; i++) {
      const it = visibleItems[i];
      const bucket = byCat.get(it.cat);
      if (bucket) {
        bucket.push(it);
      } else {
        byCat.set(it.cat, [it]);
      }
    }

    return {
      itemEvalMap: evalMap,
      allItems: visibleItems,
      itemsByCatMap: byCat,
    };
  }, [restaurantId, isCatalogViewOnly, orderType, rawCatById, nowDate, dbRev, syncTick]);

  const rawLay = demoViewerOverride?.lay || rest?.lay;
  const layout: 'grid4' | 'grid3' | 'grid' | 'list' =
    rawLay === 'grid4' || rawLay === 'cards'
      ? 'grid4'
      : rawLay === 'grid3'
      ? 'grid3'
      : rawLay === 'grid'
      ? 'grid'
      : 'list';

  // Active automatic menu discount (Countdown Timer discount OR Happy Hour discount)
  const activeMenuDiscount = useMemo(() => getActiveMenuDiscount(addons, nowMs), [addons, nowMs]);

  const [serverPopularCounts, setServerPopularCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    if (!restaurantId) {
      setServerPopularCounts({});
      return;
    }
    void fetchPopularItemsCached(restaurantId, { force: Boolean(lastOrderSummary?.id) })
      .then((counts) => {
        if (active && counts && typeof counts === 'object') {
          setServerPopularCounts(counts);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [restaurantId, lastOrderSummary?.id]);

  // Real order frequency map per item name strictly from database orders
  const itemOrderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    Object.entries(serverPopularCounts).forEach(([k, val]) => {
      const key = String(k || '').trim().toLowerCase();
      const qty = Math.max(0, Number(val) || 0);
      if (key && qty > 0) counts.set(key, qty);
    });

    const localCounts = new Map<string, number>();
    const restOrders = getCollection<Order>('orders').filter(
      (o) => o.rid === restaurantId && o.st !== 'cancelled' && o.status !== 'cancelled'
    );
    restOrders.forEach((o) => {
      (o.items || []).forEach((line) => {
        const key = String(line.n || '').trim().toLowerCase();
        if (!key) return;
        localCounts.set(key, (localCounts.get(key) || 0) + Math.max(1, Number(line.q) || 1));
      });
    });

    localCounts.forEach((qty, key) => {
      const existing = counts.get(key) || 0;
      if (qty > existing) counts.set(key, qty);
    });

    return counts;
  }, [restaurantId, serverPopularCounts, syncTick, lastOrderSummary?.id]);

  // Real database-backed most-ordered ranking (only items with actual DB orders)
  const { mostOrderedItems, popularItemIds } = useMemo(() => {
    const ranked = allItems
      .map((it) => ({
        it,
        qty: itemOrderCounts.get(it.n.trim().toLowerCase()) || 0,
      }))
      .filter((entry) => entry.qty > 0)
      .sort((a, b) => b.qty - a.qty);

    const topIds = new Set<string>();
    if (ranked.length > 0) {
      const cutoffIdx = Math.min(2, ranked.length - 1);
      const minTopQty = ranked[cutoffIdx].qty;
      ranked.forEach((entry, idx) => {
        if (idx <= cutoffIdx || entry.qty >= minTopQty) {
          topIds.add(entry.it.id);
        }
      });
    }

    return {
      mostOrderedItems: ranked.map((entry) => entry.it),
      popularItemIds: topIds,
    };
  }, [allItems, itemOrderCounts]);

  // Cart totals, quantity map, discounts, minOrder & Free delivery calculation
  const { totalCount, subtotal, cartQtyById } = useMemo(() => {
    let count = 0;
    let sum = 0;
    const qtyMap = new Map<string, number>();
    for (let i = 0; i < cart.length; i++) {
      const line = cart[i];
      count += line.qty;
      sum += line.unitPrice * line.qty;
      qtyMap.set(line.itemId, (qtyMap.get(line.itemId) || 0) + line.qty);
    }
    return { totalCount: count, subtotal: sum, cartQtyById: qtyMap };
  }, [cart]);

  const deliveryZones = rest?.deliveryZones || [];
  const hasSelectedDeliveryZone =
    !unlistedAreaSelected && selectedAreaIdx >= 0 && selectedAreaIdx < deliveryZones.length;
  const activeZone = hasSelectedDeliveryZone ? deliveryZones[selectedAreaIdx] : undefined;
  const zoneCities = activeZone?.cities || [];
  const safeCityIdx = Math.min(Math.max(0, selectedCityIdx), Math.max(0, zoneCities.length - 1));
  const activeCity = zoneCities[safeCityIdx];
  const hasMultipleSubCities =
    zoneCities.length > 1 ||
    (zoneCities.length === 1 && zoneCities[0].name.trim() !== activeZone?.area?.trim());
  const rawDeliveryFee =
    orderType === 'delivery' && activeZone
      ? Number(activeCity?.fee ?? (activeZone as { fee?: number }).fee ?? 0) || 0
      : 0;

  const freeDeliveryEnabled = Boolean(addons.freeDeliveryProgress?.enabled);
  const freeDeliveryMin = freeDeliveryEnabled
    ? Math.max(0, Number(addons.freeDeliveryProgress?.minAmount ?? 0) || 0)
    : 0;
  const freeDeliveryMaxDiscount = freeDeliveryEnabled
    ? Math.max(0, Number(addons.freeDeliveryProgress?.maxDiscountAmount ?? 0) || 0)
    : 0;
  const spinFreeDelivery = Boolean(addons.spinWheelPromo?.enabled && spinWonReward?.freeDelivery);
  const qualifiesFreeDelivery =
    orderType === 'delivery' &&
    !unlistedAreaSelected &&
    ((freeDeliveryEnabled && (freeDeliveryMin === 0 || subtotal >= freeDeliveryMin)) || spinFreeDelivery);
  const effectiveDeliveryFee = qualifiesFreeDelivery
    ? freeDeliveryMaxDiscount > 0 && !spinFreeDelivery
      ? Math.max(0, rawDeliveryFee - freeDeliveryMaxDiscount)
      : 0
    : rawDeliveryFee;

  // Cart-level menu discount when minOrderAmount > 0 or maxDiscountAmount > 0
  const isOrderLevelMenuDiscount =
    activeMenuDiscount.active &&
    (activeMenuDiscount.minOrderAmount > 0 || activeMenuDiscount.maxDiscountAmount > 0);
  const menuOrderDiscountAmt = isOrderLevelMenuDiscount
    ? computeOrderLevelDiscount(
        subtotal,
        activeMenuDiscount.type,
        activeMenuDiscount.value,
        activeMenuDiscount.minOrderAmount,
        activeMenuDiscount.maxDiscountAmount
      )
    : 0;
  const menuDiscountMinRemaining =
    isOrderLevelMenuDiscount && activeMenuDiscount.minOrderAmount > subtotal
      ? activeMenuDiscount.minOrderAmount - subtotal
      : 0;

  // First-order discount & Spin wheel percent discount
  const firstOrderPct =
    addons.firstOrderDiscount?.enabled && !hasOrderedBefore
      ? Math.max(0, Math.min(90, Number(addons.firstOrderDiscount.discountPercent) || 0))
      : 0;
  const firstOrderMinOrder = Math.max(0, Number(addons.firstOrderDiscount?.minOrderAmount ?? 0) || 0);
  const firstOrderMaxDiscount = Math.max(0, Number(addons.firstOrderDiscount?.maxDiscountAmount ?? 0) || 0);
  const firstOrderDiscountAmt =
    firstOrderPct > 0
      ? computeOrderLevelDiscount(
          Math.max(0, subtotal - menuOrderDiscountAmt),
          'percent',
          firstOrderPct,
          firstOrderMinOrder,
          firstOrderMaxDiscount
        )
      : 0;

  const spinPct =
    addons.spinWheelPromo?.enabled && spinWonReward && spinWonReward.percent > 0
      ? spinWonReward.percent
      : 0;
  const spinDiscountAmt =
    spinPct > 0
      ? Math.round((Math.max(0, subtotal - menuOrderDiscountAmt - firstOrderDiscountAmt) * spinPct) / 100)
      : 0;

  // Free Gift Threshold
  const freeGiftEnabled = Boolean(addons.freeGiftThreshold?.enabled && addons.freeGiftThreshold.giftName);
  const freeGiftMin = Number(addons.freeGiftThreshold?.minAmount || 0);
  const qualifiesFreeGift = freeGiftEnabled && subtotal >= freeGiftMin;
  const freeGiftPct = freeGiftMin > 0 ? Math.min(100, Math.round((subtotal / freeGiftMin) * 100)) : 100;

  // Min / Max order addon
  const minOrderEnabled =
    addons.minOrder?.enabled === true && Number(addons.minOrder.amount) > 0;
  const minOrderAmount = minOrderEnabled ? Number(addons.minOrder?.amount) || 0 : 0;
  const minOrderMaxAmount =
    addons.minOrder?.enabled === true ? Math.max(0, Number(addons.minOrder?.maxAmount ?? 0) || 0) : 0;
  const belowMinOrder = minOrderEnabled && subtotal < minOrderAmount;
  const aboveMaxOrder = addons.minOrder?.enabled === true && minOrderMaxAmount > 0 && subtotal > minOrderMaxAmount;
  const orderLimitBlocked = belowMinOrder || aboveMaxOrder;

  const fmtMoney = useCallback((amt: number) => formatMoneyValue(amt, currency), [currency]);

  // Pickup Instant Discount
  const pickupPct =
    addons.pickupInstantDiscount?.enabled && orderType === 'pickup'
      ? Math.max(0, Math.min(60, Number(addons.pickupInstantDiscount.discountPercent) || 10))
      : 0;
  const pickupMinOrder = Math.max(0, Number(addons.pickupInstantDiscount?.minOrderAmount ?? 0) || 0);
  const pickupMaxDiscount = Math.max(0, Number(addons.pickupInstantDiscount?.maxDiscountAmount ?? 0) || 0);
  const pickupDiscountAmt =
    pickupPct > 0
      ? computeOrderLevelDiscount(
          Math.max(0, subtotal - menuOrderDiscountAmt - firstOrderDiscountAmt - spinDiscountAmt),
          'percent',
          pickupPct,
          pickupMinOrder,
          pickupMaxDiscount
        )
      : 0;

  // Dine-In Table Discount
  const dineInPct =
    addons.dineInDiscount?.enabled && orderType === 'table'
      ? Math.max(0, Math.min(90, Number(addons.dineInDiscount.discountPercent ?? 10) || 10))
      : 0;
  const dineInMinOrder = Math.max(0, Number(addons.dineInDiscount?.minOrderAmount ?? 0) || 0);
  const dineInMaxDiscount = Math.max(0, Number(addons.dineInDiscount?.maxDiscountAmount ?? 0) || 0);
  const dineInDiscountAmt =
    dineInPct > 0
      ? computeOrderLevelDiscount(
          Math.max(
            0,
            subtotal - menuOrderDiscountAmt - firstOrderDiscountAmt - spinDiscountAmt - pickupDiscountAmt
          ),
          'percent',
          dineInPct,
          dineInMinOrder,
          dineInMaxDiscount
        )
      : 0;

  const finalTotal =
    Math.max(
      0,
      subtotal -
        menuOrderDiscountAmt -
        firstOrderDiscountAmt -
        spinDiscountAmt -
        pickupDiscountAmt -
        dineInDiscountAmt
    ) +
    effectiveDeliveryFee;

  // Loyalty points (matches server accrual: per 1,000 currency of final order total)
  const earnedLoyaltyPoints = addons.loyaltyPoints?.enabled
    ? Math.floor(Math.max(0, finalTotal) / 1000) * Math.max(1, Number(addons.loyaltyPoints.pointsPerThousand) || 1)
    : 0;

  const freeDeliveryRemaining = Math.max(0, freeDeliveryMin - subtotal);
  const freeDeliveryPct =
    freeDeliveryMin > 0 ? Math.min(100, Math.round((subtotal / freeDeliveryMin) * 100)) : 0;

  const reviewsEnabled = addons.customerReviews?.enabled === true;
  const reviewsAllowSubmit = reviewsEnabled && addons.customerReviews?.allowSubmit !== false;
  const reviewsShowOnMenu = reviewsEnabled && addons.customerReviews?.showOnMenu !== false;
  const restaurantReviews = rest?.reviews || [];

  // Live countdown timer string
  const countdownDisplay = useMemo(() => {
    if (!addons.countdownTimer?.enabled) return null;
    const endHour = Math.min(23, Math.max(0, Number(addons.countdownTimer.endHour ?? 23)));
    const target = new Date(nowMs);
    target.setHours(endHour, 59, 59, 999);
    if (target.getTime() <= nowMs) {
      target.setDate(target.getDate() + 1);
    }
    const diffSec = Math.max(0, Math.floor((target.getTime() - nowMs) / 1000));
    const hrs = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [addons.countdownTimer?.enabled, addons.countdownTimer?.endHour, nowMs]);

  const canSelectTable = enabledTypes.includes('table');
  const handleSwitchToTableOrder = useCallback(() => {
    if (canSelectTable) {
      setOrderType('table');
      showToast('تم تفعيل الطلب داخل الصالة وتطبيق الخصم ✓');
    }
  }, [canSelectTable, showToast]);

  const promoTickets = useMemo(
    () =>
      buildMenuPromoTickets({
        addons,
        activeMenuDiscount,
        orderType,
        currency,
        formatMoney: fmtMoney,
        firstOrderPct,
        pickupPct,
        canSelectTable,
        freeDeliveryEnabled,
        freeDeliveryMin,
        qualifiesFreeDelivery,
        spinFreeDelivery,
        minOrderEnabled,
        minOrderAmount,
        loyaltyBalance,
        loyaltyCustomerName: customerName,
        loyaltyCustomerPhone: customerPhone,
        restaurantName: rest?.n || '',
        googleMapsUrl: rest?.mapUrl || addons.locationLinks?.googleMapsUrl || '',
        wazeUrl: rest?.wazeUrl || addons.locationLinks?.wazeUrl || '',
      }),
    [
      addons,
      activeMenuDiscount,
      orderType,
      currency,
      firstOrderPct,
      pickupPct,
      canSelectTable,
      freeDeliveryEnabled,
      freeDeliveryMin,
      qualifiesFreeDelivery,
      spinFreeDelivery,
      minOrderEnabled,
      minOrderAmount,
      loyaltyBalance,
      customerName,
      customerPhone,
      rest?.n,
      rest?.mapUrl,
      rest?.wazeUrl,
      fmtMoney,
    ]
  );

  // Helpers (memoized to preserve React.memo item cards & EstoreStorefront)
  const getItemCartQty = useCallback(
    (itemId: string) => cartQtyById.get(itemId) || 0,
    [cartQtyById]
  );

  const isDisplayOnlyItem = useCallback(
    (it: MenuItem) => isCatalogViewOnly || Boolean(it.dineInOnly && orderType !== 'table'),
    [isCatalogViewOnly, orderType]
  );

  const getItemOriginalBaseUnit = useCallback(
    (it: MenuItem, sizeOpt?: MenuItemSize | null): number => {
      if (sizeOpt) {
        return getOptionPrice(sizeOpt);
      }
      const rawBase = Number(it.pr) || 0;
      if (resolvedPlan.perms.itemDiscounts && it.beforePrice && Number(it.beforePrice) > rawBase) {
        return Number(it.beforePrice);
      }
      return rawBase;
    },
    [resolvedPlan.perms.itemDiscounts]
  );

  const openProductModal = useCallback(
    (it: MenuItem) => {
      const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, rawCatById.get(it.cat), nowDate);
      if (!itemEval.available && !isDisplayOnlyItem(it)) {
        showToast(itemEval.reasonText || 'هذا الصنف غير متوفر حالياً');
        return;
      }
      const validSizes = (it.sizes || [])
        .map((s) => ({ ...s, n: getSizeLabel(s), p: getOptionPrice(s) }))
        .filter((s) => s.n);
      setActiveProduct(it);
      setSelectedSize(validSizes.length > 0 ? validSizes[0] : null);
      setSelectedChoices([]);
      setSelectedExtras([]);
      setModalQty(1);
      setModalItemNote('');
      setAllergensOpen(false);
    },
    [itemEvalMap, rawCatById, nowDate, isDisplayOnlyItem, showToast]
  );

  const quickAddOrOpenModal = useCallback(
    (it: MenuItem, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (isDisplayOnlyItem(it)) {
        return;
      }
      const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, rawCatById.get(it.cat), nowDate);
      if (!itemEval.available) {
        showToast(itemEval.reasonText || 'هذا الصنف غير متوفر حالياً');
        return;
      }
      const hasSizes = (it.sizes || []).some((s) => Boolean(getSizeLabel(s)));
      const hasChoices = (it.choices || []).some((c) => Boolean(getChoiceLabel(c)));
      const hasExtras = (it.extras || []).some((x) => Boolean(getExtraLabel(x)));
      if (hasSizes || hasChoices || hasExtras) {
        openProductModal(it);
        return;
      }
      const catObj = rawCatById.get(it.cat);
      const key = `${it.id}|||`;
      const discountedUnit = applyMenuPriceDiscount(Number(it.pr) || 0, activeMenuDiscount);
      const origUnit = getItemOriginalBaseUnit(it, null);
      setCart((prev) => {
        const idx = prev.findIndex((x) => x.key === key);
        if (idx >= 0) {
          return prev.map((x, i) =>
            i === idx ? { ...x, qty: x.qty + 1, unitPrice: discountedUnit, origUnitPrice: origUnit } : x
          );
        }
        return [
          ...prev,
          {
            key,
            itemId: it.id,
            name: it.n,
            catName: catObj?.n,
            unitPrice: discountedUnit,
            origUnitPrice: origUnit,
            qty: 1,
            choices: [],
            extras: [],
            img: it.img,
          },
        ];
      });
      showToast(`تمت إضافة "${it.n}" للسلة`);
    },
    [isDisplayOnlyItem, itemEvalMap, rawCatById, nowDate, showToast, openProductModal, activeMenuDiscount, getItemOriginalBaseUnit]
  );

  const decrementItemFromCart = useCallback((itemId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCart((prev) => {
      let targetIdx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].itemId === itemId) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx === -1) return prev;
      const target = prev[targetIdx];
      if (target.qty <= 1) {
        return prev.filter((_, i) => i !== targetIdx);
      }
      return prev.map((line, i) => (i === targetIdx ? { ...line, qty: line.qty - 1 } : line));
    });
  }, []);

  const addSpecialCustomLine = (id: string, name: string, price: number, notes?: string, img?: string) => {
    if (isCatalogViewOnly) return;
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.key === id);
      if (idx >= 0) {
        return prev.map((x, i) => (i === idx ? { ...x, qty: x.qty + 1, unitPrice: price } : x));
      }
      return [
        ...prev,
        {
          key: id,
          itemId: id,
          name,
          unitPrice: price,
          origUnitPrice: price,
          qty: 1,
          choices: [],
          extras: [],
          img,
          notes,
        },
      ];
    });
    showToast(`تمت إضافة "${name}" للسلة ✓`);
  };

  const modalBaseRaw = activeProduct
    ? selectedSize
      ? getOptionPrice(selectedSize)
      : Number(activeProduct.pr) || 0
    : 0;
  const modalBaseDiscounted = applyMenuPriceDiscount(modalBaseRaw, activeMenuDiscount);
  const modalExtrasSum = selectedExtras.reduce((sum, ex) => sum + getOptionPrice(ex), 0);
  const modalUnitPrice = activeProduct ? modalBaseDiscounted + modalExtrasSum : 0;

  const handleAddConfiguredToCart = () => {
    if (!activeProduct || isDisplayOnlyItem(activeProduct)) return;
    const validSizes = (activeProduct.sizes || []).filter((s) => getSizeLabel(s));
    if (validSizes.length > 0 && !selectedSize) {
      showToast('يرجى اختيار الحجم أولاً');
      return;
    }
    const catObj = allCategories.find((c) => c.id === activeProduct.cat);
    const sizeName = selectedSize ? getSizeLabel(selectedSize) : '';
    const chSorted = [...selectedChoices].sort();
    const exSorted = [...selectedExtras].map((e) => getExtraLabel(e)).sort();
    const cleanNote = modalItemNote.trim();
    const key = cleanNote
      ? `${activeProduct.id}|${sizeName}|${chSorted.join(',')}|${exSorted.join(',')}|${cleanNote}`
      : `${activeProduct.id}|${sizeName}|${chSorted.join(',')}|${exSorted.join(',')}`;
    const origUnit = getItemOriginalBaseUnit(activeProduct, selectedSize) + modalExtrasSum;

    setCart((prev) => {
      const idx = prev.findIndex((x) => x.key === key);
      if (idx >= 0) {
        return prev.map((x, i) =>
          i === idx
            ? { ...x, qty: x.qty + modalQty, unitPrice: modalUnitPrice, origUnitPrice: origUnit }
            : x
        );
      }
      return [
        ...prev,
        {
          key,
          itemId: activeProduct.id,
          name: activeProduct.n,
          catName: catObj?.n,
          unitPrice: modalUnitPrice,
          origUnitPrice: origUnit,
          qty: modalQty,
          size: sizeName || undefined,
          choices: selectedChoices,
          extras: selectedExtras.map((e) => getExtraLabel(e)),
          img: activeProduct.img,
          notes: cleanNote || undefined,
        },
      ];
    });

    showToast(`تمت إضافة ${modalQty} × ${activeProduct.n} للسلة`);
    setActiveProduct(null);
  };

  const updateCartLineQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => (line.key === key ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0)
    );
  };

  const normalizeArabicDigits = (val: string) =>
    val
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

  const isTwoPartNameValid = (val: string) => {
    const clean = val.trim();
    const parts = clean.split(/\s+/).filter((p) => p.length >= 2);
    return clean.length >= 4 && parts.length >= 2;
  };

  const isValidWhatsAppPhone = (val: string) => {
    const digits = normalizeArabicDigits(val).replace(/[^\d]/g, '');
    if (digits.length < 10 || digits.length > 15) return false;
    if (/^(\d)\1+$/.test(digits) || /^(\d)\1+$/.test(digits.slice(-8))) return false;
    if (digits.startsWith('07') && digits.length !== 11) return false;
    return true;
  };

  const handleGetGps = () => {
    setGpsAttempted(true);
    setGpsErrorMsg('');
    if (!navigator.geolocation) {
      setGpsErrorMsg('تعذر دعم تحديد الموقع على هذا المتصفح، يمكنك كتابة عنوانك التفصيلي بالأسفل.');
      showToast('المتصفح لا يدعم تحديد الموقع التلقائي');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
        setGpsLoading(false);
        setGpsErrorMsg('');
        showToast('تم تحديد موقعك بنجاح ✓');
      },
      () => {
        setGpsLoading(false);
        setGpsErrorMsg('تعذر الوصول للموقع تلقائياً، يرجى كتابة عنوانك التفصيلي بالأسفل.');
        showToast('تعذر الوصول للموقع، يرجى كتابة عنوانك التفصيلي');
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  };

  const handleSpinWheel = () => {
    if (isSpinning) return;
    const defaultPrizes = 'خصم 5%\nخصم 10%\nخصم 15%\nتوصيل مجاني';
    const prizes = (addons.spinWheelPromo?.prizesText || defaultPrizes)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (prizes.length === 0) return;
    setIsSpinning(true);
    const chosenIdx = Math.floor(Math.random() * prizes.length);
    const sliceDeg = 360 / prizes.length;
    const extraTurns = 360 * 5 + (360 - chosenIdx * sliceDeg);
    setWheelDeg((prev) => prev + extraTurns);

    setTimeout(() => {
      const label = prizes[chosenIdx];
      const isFreeDel = /توصيل|گەیاندن|free\s*delivery|delivery/i.test(label);
      const pctMatch = label.match(/(\d+)/);
      const pct = isFreeDel ? 0 : pctMatch ? Math.min(50, Number(pctMatch[1])) : 10;
      const reward = { label, percent: pct, freeDelivery: isFreeDel };
      setSpinWonReward(reward);
      try {
        sessionStorage.setItem(`emenu_spin_${restaurantId}`, JSON.stringify(reward));
      } catch {
        // ignore
      }
      setIsSpinning(false);
      showToast(`مبروك! ربحت "${label}" وسيُطبق في السلة تلقائياً`);
    }, 3400);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingOrder || isCatalogViewOnly) return;
    setCheckoutTriedSubmit(true);
    if (!canOrderNow) {
      showToast('مغلق حالياً ولا يستقبل الطلبات');
      return;
    }
    if (cart.length === 0) return;

    if (belowMinOrder) {
      showToast(
        `${addons.minOrder?.message || 'الحد الأدنى للطلب هو'} ${formatNumber(minOrderAmount)} ${currency}`
      );
      return;
    }
    if (aboveMaxOrder) {
      showToast(`الحد الأعلى للطلب هو ${formatNumber(minOrderMaxAmount)} ${currency}`);
      return;
    }

    if (!isTwoPartNameValid(customerName)) {
      showToast('يرجى كتابة الاسم الثنائي (الاسم الأول واسم الأب أو اللقب)');
      return;
    }

    if (!isValidWhatsAppPhone(customerPhone)) {
      showToast('يرجى إدخال رقم هاتف واتساب صحيح (مثال: 07XXXXXXXXX)');
      return;
    }

    if (orderType === 'delivery' && deliveryZones.length > 0 && !activeZone && !unlistedAreaSelected) {
      setZoneDropdownOpen(true);
      showToast('يرجى الضغط على "اختر منطقة التوصيل" وتحديد منطقتك');
      return;
    }

    if (orderType === 'delivery' && !gpsCoords && !gpsAttempted) {
      gpsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('يرجى الضغط على زر "تحديد موقعي الحالي" أولاً لتحديد موقعك');
      return;
    }

    if (orderType === 'delivery' && !gpsCoords && gpsAttempted && customerAddress.trim().length < 5) {
      gpsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('يرجى كتابة عنوانك التفصيلي بوضوح');
      return;
    }

    setIsSubmittingOrder(true);
    try {
      const targetWaPhone = rest?.ph || rest?.social?.whatsapp || '';
      const orderId = uid();
      const tableVal = orderType === 'table' ? selectedTable.trim() || '1' : undefined;
      const resolvedCartLines = cart.map((line) => {
        const matchedMenuItem = allItems.find((m) => m.id === line.itemId);
        const fallbackOrigUnit = matchedMenuItem
          ? (() => {
              const matchedSize = line.size
                ? (matchedMenuItem.sizes || []).find((s) => getSizeLabel(s) === line.size) || null
                : null;
              const origBase = getItemOriginalBaseUnit(matchedMenuItem, matchedSize);
              const extrasSum = (line.extras || []).reduce((sum, exName) => {
                const exObj = (matchedMenuItem.extras || []).find((ex) => getExtraLabel(ex) === exName);
                return sum + (exObj ? getOptionPrice(exObj) : 0);
              }, 0);
              return origBase + extrasSum;
            })()
          : line.unitPrice;
        const origUnitPrice =
          typeof line.origUnitPrice === 'number' && line.origUnitPrice > line.unitPrice
            ? line.origUnitPrice
            : fallbackOrigUnit > line.unitPrice
            ? fallbackOrigUnit
            : line.unitPrice;
        const hasDisc = origUnitPrice > line.unitPrice && origUnitPrice > 0;
        const discPct = hasDisc
          ? Math.max(1, Math.round(((origUnitPrice - line.unitPrice) / origUnitPrice) * 100))
          : 0;
        const discAmt = hasDisc ? (origUnitPrice - line.unitPrice) * line.qty : 0;
        return {
          ...line,
          origUnitPrice,
          hasDisc,
          discPct,
          discAmt,
        };
      });

      const orderItems: OrderItem[] = resolvedCartLines.map((line) => ({
        n: line.name,
        q: line.qty,
        p: line.unitPrice,
        origPrice: line.hasDisc ? line.origUnitPrice : undefined,
        discountPct: line.hasDisc ? line.discPct : undefined,
        discountAmt: line.hasDisc ? line.discAmt : undefined,
        c: line.catName,
        size: line.size,
        choices: line.choices.length ? line.choices : undefined,
        extras: line.extras.length ? line.extras : undefined,
        notes: line.notes?.trim() || undefined,
      }));

      const origSubtotal = resolvedCartLines.reduce((s, line) => s + line.origUnitPrice * line.qty, 0);
      const itemsDiscountTotal = Math.max(0, origSubtotal - subtotal);
      const orderLevelDiscountTotal =
        menuOrderDiscountAmt +
        firstOrderDiscountAmt +
        spinDiscountAmt +
        pickupDiscountAmt +
        dineInDiscountAmt;
      const totalDiscount = itemsDiscountTotal + orderLevelDiscountTotal;
      const pickupLabelText = addons.pickupInstantDiscount?.title || 'خصم الاستلام الفوري';
      const rawDineInTitle = (addons.dineInDiscount?.title || '').trim();
      const dineInLabelText =
        !rawDineInTitle || rawDineInTitle === 'خصم طلبات الصالة' || rawDineInTitle === 'خصم خاص لطلبات الصالة'
          ? 'خصم على طلبات الصالة'
          : rawDineInTitle;
      const menuDiscountLabelText =
        itemsDiscountTotal > 0 || menuOrderDiscountAmt > 0
          ? activeMenuDiscount.sourceLabel || 'خصم على الأطباق'
          : undefined;

      const isUnlistedDeliveryArea = orderType === 'delivery' && unlistedAreaSelected;
      const cu = {
        n: customerName.trim(),
        ph: normalizeArabicDigits(customerPhone).trim(),
        nt: customerNotes.trim(),
        orderType,
        area:
          orderType === 'delivery'
            ? isUnlistedDeliveryArea
              ? 'منطقة غير مدرجة (يتم تحديد التوصيل والسعر مع الكاشير)'
              : activeZone?.area
            : undefined,
        city: orderType === 'delivery' && !isUnlistedDeliveryArea ? activeCity?.name : undefined,
        deliveryFee: orderType === 'delivery' && !isUnlistedDeliveryArea ? effectiveDeliveryFee : 0,
        address: orderType === 'delivery' ? customerAddress.trim() || (gpsCoords ? 'تحديد الموقع عبر GPS' : '') : undefined,
        lat: gpsCoords?.lat,
        lng: gpsCoords?.lng,
        table: tableVal,
      };

      const nowTs = Date.now();
      const existingOrdersCount = getCollection<Order>('orders').filter((o) => o.rid === restaurantId).length;
      const fallbackOrderSeq = Math.max(Number(rest?.o || 0) || 0, existingOrdersCount) + 1;

      const extraOrderNotes: string[] = [];
      if (cu.nt) extraOrderNotes.push(cu.nt);
      if (addons.curbsidePickupCar?.enabled && orderType === 'pickup' && curbsideCarInfo.trim()) {
        extraOrderNotes.push(`🚗 سيارة الاستلام: ${curbsideCarInfo.trim()}`);
      }
      const combinedNotes = extraOrderNotes.join(' | ');

      const savedOrder = await putItemAndSync<Order>(`orders/${orderId}`, {
        id: orderId,
        rid: restaurantId,
        at: nowTs,
        createdAt: new Date(nowTs).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit' }),
        items: orderItems,
        origSubtotal: origSubtotal > subtotal ? origSubtotal : undefined,
        itemsDiscountTotal: itemsDiscountTotal > 0 ? itemsDiscountTotal : undefined,
        menuDiscountLabel: menuDiscountLabelText,
        menuOrderDiscount: menuOrderDiscountAmt > 0 ? menuOrderDiscountAmt : undefined,
        tot: finalTotal,
        total: finalTotal,
        cu: { ...cu, nt: combinedNotes },
        type: orderType,
        name: cu.n,
        phone: cu.ph,
        address: cu.address,
        notes: combinedNotes || undefined,
        table: tableVal,
        firstOrderDiscount: firstOrderDiscountAmt > 0 ? firstOrderDiscountAmt : undefined,
        firstOrderDiscountPct: firstOrderDiscountAmt > 0 ? firstOrderPct : undefined,
        spinDiscount: spinDiscountAmt > 0 ? spinDiscountAmt : undefined,
        spinRewardLabel: spinDiscountAmt > 0 && spinWonReward ? spinWonReward.label : undefined,
        pickupDiscount: pickupDiscountAmt > 0 ? pickupDiscountAmt : undefined,
        pickupDiscountLabel: pickupDiscountAmt > 0 ? pickupLabelText : undefined,
        dineInDiscount: dineInDiscountAmt > 0 ? dineInDiscountAmt : undefined,
        dineInDiscountLabel: dineInDiscountAmt > 0 ? dineInLabelText : undefined,
        totalDiscount: totalDiscount > 0 ? totalDiscount : undefined,
        freeGiftName: qualifiesFreeGift && addons.freeGiftThreshold?.giftName ? addons.freeGiftThreshold.giftName : undefined,
        needCutlery: addons.cutleryOption?.enabled ? needCutlery : undefined,
        st: 'new',
        status: 'pending',
      });

      const resolvedOrderSeq =
        Number(savedOrder?.orderSeq || savedOrder?.seq || 0) || fallbackOrderSeq;

      const discountedOrdersTotal = Math.max(
        0,
        subtotal -
          menuOrderDiscountAmt -
          firstOrderDiscountAmt -
          spinDiscountAmt -
          pickupDiscountAmt -
          dineInDiscountAmt
      );
      const overallDiscPct =
        origSubtotal > 0 && totalDiscount > 0
          ? Math.max(1, Math.round((totalDiscount / origSubtotal) * 100))
          : 0;

      const itemLines = resolvedCartLines.map((x) => {
        const parts = [x.size, ...(x.choices || []), ...(x.extras || [])].filter(Boolean);
        const optsStr = parts.length ? ` (${parts.join('، ')})` : '';
        const noteStr = x.notes?.trim() ? `\n   ↳ ملاحظة: ${x.notes.trim()}` : '';
        const itemDiscPct = x.hasDisc ? x.discPct : overallDiscPct;
        const discPart = itemDiscPct > 0 ? ` خصم ${itemDiscPct}% 🚨` : '';
        return `• ${x.name}${optsStr} (عدد ${x.qty})${discPart}${noteStr}`;
      });

      const typeEmoji = orderType === 'delivery' ? '🛵' : orderType === 'pickup' ? '🛍️' : '🍽️';
      const typeLabel = ORDER_TYPE_META[orderType].label;
      const ordersPriceLine =
        overallDiscPct > 0
          ? `سعر الطلبات: ${formatNumber(discountedOrdersTotal)} (مع الخصم ${overallDiscPct}% 🚨)`
          : `سعر الطلبات: ${formatNumber(discountedOrdersTotal)}`;

      const lines: string[] = [
        'طلب جديد 📌',
        `النوع: ${typeLabel} ${typeEmoji}`,
        `رقم الطلب: #${resolvedOrderSeq}`,
        ...(tableVal ? [`الطاولة: ${tableVal}`] : []),
        '',
        '----------------',
        ...itemLines,
        '----------------',
      ];

      if (combinedNotes) {
        lines.push('', `ملاحظات: ${combinedNotes}`);
      }

      lines.push('', ordersPriceLine);

      if (orderType === 'delivery') {
        if (isUnlistedDeliveryArea) {
          lines.push('التوصيل: ⚠️ منطقتي غير موجودة في القائمة — أرجو التحقق من التوصيل وتحديد سعر التوصيل');
        } else {
          lines.push(
            `التوصيل: ${
              qualifiesFreeDelivery
                ? spinFreeDelivery
                  ? 'مجاني (مكافأة)'
                  : 'مجاني'
                : formatNumber(effectiveDeliveryFee)
            }`
          );
        }
      }
      if (qualifiesFreeGift && addons.freeGiftThreshold?.giftName) {
        lines.push(`الهدية: ${addons.freeGiftThreshold.giftName}`);
      }
      if (addons.cutleryOption?.enabled) {
        lines.push(`أدوات الطعام: ${needCutlery ? 'مطلوبة' : 'غير مطلوبة'}`);
      }
      lines.push(
        isUnlistedDeliveryArea
          ? `المجموع (قبل التوصيل): ${formatNumber(finalTotal)} — يُحدد سعر التوصيل مع الكاشير`
          : `المجموع: ${formatNumber(finalTotal)}`
      );

      const customerBlock: string[] = [];
      if (orderType === 'delivery') {
        const areaFallback = isUnlistedDeliveryArea
          ? 'منطقة غير موجودة في القائمة (تحتاج تحديد سعر التوصيل)'
          : activeZone?.area && activeCity?.name && activeZone.area !== activeCity.name && !activeZone.area.includes(activeCity.name)
          ? `${activeZone.area} - ${activeCity.name}`
          : activeZone?.area || activeCity?.name || '';
        const addrText = customerAddress.trim();
        if (areaFallback) customerBlock.push(`المنطقة: ${areaFallback}`);
        if (addrText) customerBlock.push(`العنوان التفصيلي: ${addrText}`);
      }
      if (cu.n) customerBlock.push(`الزبون: ${cu.n}`);
      if (cu.ph) customerBlock.push(`الهاتف: ${cu.ph}`);
      if (orderType === 'delivery' && gpsCoords) {
        if (customerBlock.length > 0) customerBlock.push('');
        customerBlock.push(`📍 خرائط جوجل: https://www.google.com/maps?q=${gpsCoords.lat},${gpsCoords.lng}`);
        customerBlock.push(`🚗 ويز (Waze): https://waze.com/ul?ll=${gpsCoords.lat},${gpsCoords.lng}&navigate=yes`);
      }
      if (customerBlock.length > 0) {
        lines.push('', ...customerBlock);
      }

      persistSharedProfile(
        {
          name: cu.n,
          phone: cu.ph,
          address: customerAddress,
          notes: customerNotes,
        },
        true
      );

      const waUrl = (useWhatsapp || isUnlistedDeliveryArea) && targetWaPhone ? waLink(targetWaPhone, lines.join('\n')) : '';

      // Directly trigger WhatsApp in new tab without window.open when WhatsApp channel is active or area needs cashier confirmation
      if (waUrl) {
        const a = document.createElement('a');
        a.href = waUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      // Persist Quick Reorder, First Order & Loyalty Points
      try {
        localStorage.setItem(`emenu_last_order_${restaurantId}`, JSON.stringify(cart));
        setLastSavedOrderCart(cart);
        localStorage.setItem(`emenu_ordered_${restaurantId}`, '1');
        setHasOrderedBefore(true);
        if (earnedLoyaltyPoints > 0) {
          const nextPts = loyaltyBalance + earnedLoyaltyPoints;
          localStorage.setItem(`emenu_points_${restaurantId}`, String(nextPts));
          setLoyaltyBalance(nextPts);
        }
        if (addons.loyaltyPoints?.enabled && cu.ph) {
          window.setTimeout(() => {
            void fetchServerLoyaltyWallet(cu.ph);
          }, 900);
        }
        localStorage.removeItem(`menuplus_cart_${restaurantId}`);
      } catch {
        // ignore
      }

      setLastOrderSummary({
        id: orderId,
        orderSeq: resolvedOrderSeq,
        waUrl,
        total: finalTotal,
        items: orderItems,
        channel: orderChannel,
        unlistedArea: isUnlistedDeliveryArea,
      });
      setCart([]);
      setCheckoutTriedSubmit(false);
      setCheckoutStep('done');
      showToast(
        isUnlistedDeliveryArea
          ? 'تم تسجيل طلبك — تواصل مع الكاشير عبر الواتساب لتأكيد التوصيل والسعر ✓'
          : orderChannel === 'telegram'
          ? 'تم إرسال الطلب مباشرة إلى المتجر وتيليجرام ✓'
          : orderChannel === 'app'
          ? 'تم إرسال الطلب إلى المتجر ✓'
          : 'تم إرسال الطلب وحفظه في قائمة الطلبات ✓'
      );
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rest) return;
    if (!revName.trim() || !revComment.trim()) {
      showToast('يرجى كتابة الاسم والتعليق');
      return;
    }
    const newRev: RestaurantReview = {
      id: uid(),
      name: revName.trim(),
      phone: revPhone.trim() || undefined,
      rate: revRate,
      comment: revComment.trim(),
      at: Date.now(),
    };
    const nextReviews = [newRev, ...(rest.reviews || [])];
    putItem<Restaurant>(`restaurants/${restaurantId}`, {
      ...rest,
      reviews: nextReviews,
    });
    void submitReviewToServer(restaurantId, {
      name: newRev.name,
      rate: revRate,
      comment: newRev.comment,
    });
    setRevName('');
    setRevPhone('');
    setRevComment('');
    setRevRate(5);
    setRateModalOpen(false);
    showToast('شكراً لتقييمك! تم تسجيل رأيك بنجاح ★');
    setSyncTick((t) => t + 1);
  };

  const handleShareMenu = useCallback(() => {
    setMenuDrawerOpen(false);
    setShareModalOpen(true);
  }, []);

  const getEstorePriceInfo = useCallback(
    (it: MenuItem) =>
      getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts),
    [currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts]
  );

  const openCartModal = useCallback(() => {
    if (isCatalogViewOnly) return;
    setCheckoutTriedSubmit(false);
    setCheckoutStep('cart');
    setCartOpen(true);
  }, [isCatalogViewOnly]);
  const openMenuDrawerModal = useCallback(() => setMenuDrawerOpen(true), []);
  const openCatsModalDialog = useCallback(() => setCatsModalOpen(true), []);
  const openOrderTypeModalDialog = useCallback(() => setOrderTypeModalOpen(true), []);
  const openWorkModalDialog = useCallback(() => setWorkModalOpen(true), []);
  const openAboutModalDialog = useCallback(() => setAboutModalOpen(true), []);
  const openRateModalDialog = useCallback(() => setRateModalOpen(true), []);
  const openMoodModalDialog = useCallback(() => setMoodModalOpen(true), []);
  const openSpinModalDialog = useCallback(() => setSpinModalOpen(true), []);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchResults = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return allItems.filter(
      (it) => it.n.toLowerCase().includes(q) || (it.d || '').toLowerCase().includes(q)
    );
  }, [allItems, deferredSearchQuery]);

  if (!rest || (isMenuSuspended && !isOwner)) {
    return (
      <div className="wz" dir="rtl" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h1 style={{ fontSize: '26px', marginBottom: '10px' }}>
          {isEstore ? 'المتجر غير متاح' : 'المنيو غير متاح'}
        </h1>
        <p className="muted" style={{ marginBottom: '20px' }}>
          {isEstore
            ? 'هذا المتجر غير موجود أو موقوف حالياً من قِبل الإدارة.'
            : 'هذا المنيو غير موجود أو موقوف حالياً من قِبل الإدارة.'}
        </p>
        <button type="button" className="btn p" onClick={() => navigateToMainSite('/', onNavigate, getSite())}>
          العودة للرئيسية
        </button>
      </div>
    );
  }

  return (
    <div
      className={`pm-page ${isLightMenu ? 'pm-light' : ''} ${isEstore ? 'pm-estore-page' : ''}`}
      data-shape={activeShape}
      data-mode={isLightMenu ? 'light' : 'dark'}
      data-storefront={isEstore ? 'estore' : undefined}
      dir="rtl"
      style={{
        '--pm-brand': brandColor,
        '--brand': brandColor,
        '--pm-on-brand': brandInk,
        '--pm-bg': customBgColor,
        '--pm-card': effectiveSurface,
        '--pm-soft': effectiveSurfaceSoft,
        '--pm-ink': effectiveInk,
        '--pm-muted': effectiveMuted,
        '--pm-line': effectiveLine,
        backgroundColor: customBgColor,
        color: effectiveInk,
      } as React.CSSProperties}
    >
      {!isEstore && <SeasonalMenuOverlay shape={activeShape} isLight={isLightMenu} />}
      {/* Announcement Bar Addon */}
      {addons.announcementBar?.enabled && addons.announcementBar.text && (
        <div
          className="pm-announcement-bar"
          style={{
            background: addons.announcementBar.bgColor || brandColor,
            color: addons.announcementBar.textColor || '#ffffff',
            padding: '8px 14px',
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: 800,
          }}
        >
          {addons.announcementBar.text}
        </div>
      )}

      {/* Owner Preview Top Bar: ONLY 'Back to Edit' button */}
      {isOwner && (
        <div className="pm-owner-preview-bar">
          <button
            type="button"
            className="pm-owner-back-btn"
            style={{
              background: brandColor,
              color: brandInk,
            }}
            onClick={() => {
              let target = getDashboardTabPath(
                'home',
                undefined,
                getSlugForRestaurantId(restaurantId) || rest.slug
              );
              try {
                const saved = window.sessionStorage.getItem('mp_last_dash_path');
                if (saved && isDashboardPath(saved)) target = saved;
              } catch {
                // ignore storage errors
              }
              onNavigate(target);
            }}
          >
            <ArrowRight size={15} />
            <span>عد للتعديل</span>
          </button>
        </div>
      )}

      {/* Demo Platform Top Bar + Ephemeral Theme Switcher (Viewer-only session preview, never saved to DB) */}
      {restaurantId === 'demo' && !isEstore && (
        <div className="pm-demo-bar">
          {!isOwner && (
            <button
              type="button"
              className="pm-demo-back-btn"
              onClick={() => navigateToMainSite('/', onNavigate, getSite())}
              aria-label="العودة للرئيسية"
            >
              <ArrowRight size={14} />
              <span>الرئيسية</span>
            </button>
          )}

          <div className="pm-demo-switcher-wrap">
            <button
              type="button"
              className="pm-demo-switcher-btn"
              title="اضغط للتبديل المباشر إلى الشكل التالي"
              onClick={() => {
                const currentId = demoViewerOverride?.id || 'default';
                const currentIdx = Math.max(
                  0,
                  DEMO_THEME_OPTIONS.findIndex((o) => o.id === currentId)
                );
                let nextIdx = (currentIdx + 1) % DEMO_THEME_OPTIONS.length;
                if (
                  currentId === 'default' &&
                  DEMO_THEME_OPTIONS[nextIdx]?.shape === activeShape
                ) {
                  nextIdx = (nextIdx + 1) % DEMO_THEME_OPTIONS.length;
                }
                setDemoViewerOverrideState(
                  applyDemoViewerAppearance(DEMO_THEME_OPTIONS[nextIdx]?.id || 'default')
                );
              }}
            >
              <Palette size={14} style={{ color: accentText, flexShrink: 0 }} />
              <span className="pm-demo-switcher-label">
                الشكل:{' '}
                {DEMO_THEME_OPTIONS.find((o) => o.id === (demoViewerOverride?.id || 'default'))?.label ||
                  'الافتراضي'}
              </span>
              <RotateCw size={12} style={{ opacity: 0.78, flexShrink: 0 }} />
            </button>

            <button
              type="button"
              className="pm-demo-mode-btn"
              title={isLightMenu ? 'تبديل إلى الوضع الليلي' : 'تبديل إلى الوضع النهاري'}
              aria-label={isLightMenu ? 'تبديل إلى الوضع الليلي' : 'تبديل إلى الوضع النهاري'}
              onClick={() =>
                setDemoViewerOverrideState(
                  applyDemoViewerAppearance(
                    demoViewerOverride?.id || 'default',
                    isLightMenu ? 'dark' : 'light',
                    activeShape,
                    activeTheme.id
                  )
                )
              }
            >
              {isLightMenu ? <Moon size={15} /> : <Sun size={15} />}
            </button>
          </div>

          {!isOwner && (
            <button
              type="button"
              className="pm-demo-cta-btn"
              style={{
                background: brandColor,
                color: brandInk,
                border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
              }}
              onClick={() => onNavigate('/signup')}
            >
              امتلك منيو
            </button>
          )}
        </div>
      )}

      {isEstore ? (
        <Suspense
          fallback={
            <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }} aria-hidden="true">
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  border: '3px solid var(--line, rgba(15, 23, 42, 0.12))',
                  borderTopColor: brandColor || 'var(--brand, #059669)',
                  animation: 'spin 0.7s linear infinite',
                }}
              />
            </div>
          }
        >
          <EstoreStorefront
            rest={rest}
            currency={currency}
            allCategories={allCategories}
            allItems={allItems}
            categoryEvalMap={categoryEvalMap}
            itemEvalMap={itemEvalMap}
            getPriceInfo={getEstorePriceInfo}
            formatMoney={fmtMoney}
            activeMenuDiscount={activeMenuDiscount}
            addons={addons}
            countdownDisplay={countdownDisplay}
            coverImages={coverImages}
            bannerIdx={bannerIdx}
            setBannerIdx={setBannerIdx}
            openNow={openNow}
            orderType={orderType}
            enabledTypes={enabledTypes}
            isCatalogViewOnly={isCatalogViewOnly}
            orderTypeMeta={ORDER_TYPE_META}
            hasMultipleBranches={hasMultipleBranches}
            branchShortLabel={branchShortLabel}
            onOpenBranchPicker={onOpenBranchPicker}
            totalCount={totalCount}
            subtotal={subtotal}
            freeDeliveryEnabled={freeDeliveryEnabled}
            freeDeliveryMin={freeDeliveryMin}
            freeDeliveryRemaining={freeDeliveryRemaining}
            freeDeliveryPct={freeDeliveryPct}
            qualifiesFreeDelivery={qualifiesFreeDelivery}
            getItemCartQty={getItemCartQty}
            isDisplayOnlyItem={isDisplayOnlyItem}
            openProductModal={openProductModal}
            quickAddOrOpenModal={quickAddOrOpenModal}
            decrementItemFromCart={decrementItemFromCart}
            openCart={openCartModal}
            openMenuDrawer={openMenuDrawerModal}
            openCatsModal={openCatsModalDialog}
            openOrderTypeModal={openOrderTypeModalDialog}
            openWorkModal={openWorkModalDialog}
            openAboutModal={openAboutModalDialog}
            openRateModal={openRateModalDialog}
            openShareModal={handleShareMenu}
            openMoodModal={openMoodModalDialog}
            openSpinModal={openSpinModalDialog}
            spinWonLabel={spinWonReward?.label || null}
            reviewsShowOnMenu={reviewsShowOnMenu}
            reviewsAllowSubmit={reviewsAllowSubmit}
            restaurantReviews={restaurantReviews}
            onNavigate={onNavigate}
            selectedCatId={estoreCatFilter}
            onSelectCatId={setEstoreCatFilter}
            promoTickets={promoTickets}
            onRegisterLoyalty={handleRegisterLoyaltyCustomer}
            onSwitchToTable={handleSwitchToTableOrder}
          />
        </Suspense>
      ) : (
        <>
          {isToters ? (
        <>
          {/* TOTERS CLEAN TOP ACTION BAR (NO BANNER) */}
          <header className="pm-toters-topbar">
            <div className="pm-toters-topbar-inner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="pm-toters-circle-btn"
                  onClick={() => setMenuDrawerOpen(true)}
                  aria-label="قائمة المطعم"
                >
                  <Menu size={19} />
                </button>

                {!isCatalogViewOnly && (
                  <button
                    type="button"
                    className="pm-toters-mode-pill"
                    onClick={() => {
                      if (enabledTypes.length > 1) setOrderTypeModalOpen(true);
                    }}
                    style={enabledTypes.length <= 1 ? { cursor: 'default' } : undefined}
                  >
                    <span style={{ color: brandColor, display: 'inline-flex' }}>{ORDER_TYPE_META[orderType].icon}</span>
                    <span>{ORDER_TYPE_META[orderType].label}</span>
                    {enabledTypes.length > 1 && <ChevronDown size={13} />}
                  </button>
                )}

                {hasMultipleBranches && (
                  <button
                    type="button"
                    className="pm-toters-mode-pill pm-branch-pill"
                    onClick={onOpenBranchPicker}
                    title={`تبديل الفرع — الحالي: ${branchShortLabel}`}
                    aria-label="تبديل الفرع"
                  >
                    <GitBranch size={13} style={{ color: brandColor, flexShrink: 0 }} />
                    <span className="pm-branch-pill-label">تبديل الفرع</span>
                    <ChevronDown size={12} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="pm-toters-circle-btn"
                  onClick={handleShareMenu}
                  aria-label="مشاركة المنيو"
                  title="مشاركة المنيو"
                >
                  <Share2 size={17} />
                </button>
                <button
                  type="button"
                  className="pm-toters-circle-btn"
                  onClick={() => setSearchOpen(true)}
                  aria-label="بحث في المنيو"
                >
                  <Search size={18} />
                </button>
              </div>
            </div>
          </header>

          <div className="pm-container">
            <SeasonalHeroRibbon shape={activeShape} />

            {/* Toters Store Info Card */}
            <motion.section
              className="pm-toters-store-card"
              {...dashHeroMotion(prefersReducedMotion)}
            >
              <div className="pm-toters-store-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                  <div className="pm-toters-logo-badge">
                    {rest.logo ? (
                      <img src={rest.logo} alt={rest.n} decoding="async" referrerPolicy="no-referrer" />
                    ) : (
                      <span>{(rest.n || 'M').slice(0, 2)}</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h1 className="pm-toters-store-title">{rest.n}</h1>
                      <button
                        type="button"
                        onClick={() => setWorkModalOpen(true)}
                        className={`pm-toters-status-tag ${openNow ? 'open' : 'closed'}`}
                      >
                        {openNow ? 'مفتوح' : 'مغلق'}
                      </button>
                    </div>
                    {rest.tagline && (
                      <p className="pm-toters-store-tagline">{rest.tagline}</p>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  {rest.ph && (
                    <a
                      href={waLink(rest.ph, `مرحباً ${rest.n}، أود الاستفسار عن المنيو`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pm-toters-info-icon"
                      title="واتساب"
                      style={{ color: accentText }}
                    >
                      <MessageCircle size={18} />
                    </a>
                  )}
                  <button
                    type="button"
                    className="pm-toters-info-icon"
                    onClick={() => setMenuDrawerOpen(true)}
                    aria-label="معلومات المتجر"
                    title="معلومات المتجر"
                  >
                    <Store size={18} />
                  </button>
                </div>
              </div>
            </motion.section>

            {/* Horizontal Promo Ticket Cards + Detail Bottom Sheet */}
            <MenuPromoTickets
              tickets={promoTickets}
              isLightSurface={isLightMenu}
              onRegisterLoyalty={handleRegisterLoyaltyCustomer}
              onSwitchToTable={handleSwitchToTableOrder}
            />
          </div>
        </>
      ) : isTheme1 ? (
        <>
          {/* THEME 1 ("مظهر 1" — Enab Minimalist Storefront Style) */}
          <header className="pm-t1-header">
            <div className="pm-t1-header-inner">
              <button
                type="button"
                className="pm-t1-brand-btn"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <div className="pm-t1-brand-logo">
                  {rest.logo ? (
                    <img src={rest.logo} alt={rest.n} decoding="async" referrerPolicy="no-referrer" />
                  ) : (
                    <span>{(rest.n || 'M').slice(0, 2)}</span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <span className="pm-t1-brand-name">{rest.n}</span>
                  <span className="pm-t1-brand-sub">
                    {rest.tagline || (openNow ? 'مفتوح للطلبات الآن' : 'قائمة الطعام')}
                  </span>
                </div>
              </button>

              <nav className="pm-t1-nav" aria-label="تنقل القائمة">
                <button
                  type="button"
                  className="pm-t1-nav-btn active"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                  الرئيسية
                </button>
                <button type="button" className="pm-t1-nav-btn" onClick={() => setCatsModalOpen(true)}>
                  الأصناف
                </button>
                <button type="button" className="pm-t1-nav-btn" onClick={() => setAboutModalOpen(true)}>
                  عنّا
                </button>
              </nav>

              <div className="pm-t1-actions">
                <button
                  type="button"
                  className="pm-t1-search-pill"
                  onClick={() => setSearchOpen(true)}
                  aria-label="ابحث عن صنف"
                >
                  <Search size={17} />
                  <span>ابحث…</span>
                  <kbd dir="ltr">Ctrl K</kbd>
                </button>
                <button
                  type="button"
                  className="pm-t1-circle-icon pm-t1-search-mobile-btn"
                  onClick={() => setSearchOpen(true)}
                  aria-label="ابحث عن صنف"
                >
                  <Search size={20} />
                </button>
                {!isCatalogViewOnly && (
                  <button
                    type="button"
                    className="pm-order-type-pill"
                    onClick={() => {
                      if (enabledTypes.length > 1) setOrderTypeModalOpen(true);
                    }}
                    style={enabledTypes.length <= 1 ? { cursor: 'default' } : undefined}
                  >
                    <span style={{ color: accentText }}>{ORDER_TYPE_META[orderType].icon}</span>
                    <span>{ORDER_TYPE_META[orderType].label}</span>
                    {enabledTypes.length > 1 && <ChevronDown size={13} />}
                  </button>
                )}
                {hasMultipleBranches && (
                  <button
                    type="button"
                    className="pm-order-type-pill pm-branch-pill"
                    onClick={onOpenBranchPicker}
                    aria-label="تبديل الفرع"
                  >
                    <GitBranch size={13} style={{ color: accentText }} />
                    <span className="pm-branch-pill-label">تبديل الفرع</span>
                  </button>
                )}
                <button
                  type="button"
                  className="pm-t1-circle-icon"
                  onClick={handleShareMenu}
                  aria-label="مشاركة المنيو"
                >
                  <Share2 size={17} />
                </button>
                <button
                  type="button"
                  className="pm-t1-circle-icon"
                  onClick={() => setMenuDrawerOpen(true)}
                  aria-label="القائمة"
                >
                  <Menu size={18} />
                </button>
              </div>
            </div>
          </header>

          <div className="pm-container">
            <SeasonalHeroRibbon shape={activeShape} />

            <div className="pm-t1-meta-inline">
              <button
                type="button"
                onClick={() => setWorkModalOpen(true)}
                style={{
                  border: openNow ? '1px solid rgba(52, 211, 153, 0.36)' : '1px solid rgba(248, 113, 113, 0.36)',
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: openNow ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color: openNow ? (isLightMenu ? '#047857' : '#34D399') : (isLightMenu ? '#B91C1C' : '#FCA5A5'),
                }}
              >
                {openNow ? 'مفتوح الآن' : 'مغلق'}
              </button>
              {!isCatalogViewOnly && freeDeliveryEnabled && freeDeliveryMin > 0 && orderType === 'delivery' && (
                <span
                  style={{
                    borderRadius: '999px',
                    border: '1px solid var(--pm-line)',
                    background: 'var(--pm-card)',
                    padding: '3px 10px',
                    fontSize: '12px',
                    color: accentText,
                    fontWeight: 500,
                  }}
                >
                  توصيل مجاني فوق {fmtMoney(freeDeliveryMin)}
                </span>
              )}
              {rest.ph && (
                <a
                  href={waLink(rest.ph, `مرحباً ${rest.n}، أود الاستفسار عن المنيو`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    borderRadius: '999px',
                    border: '1px solid var(--pm-line)',
                    background: 'var(--pm-card)',
                    padding: '3px 10px',
                    fontSize: '12px',
                    color: isLightMenu ? '#047857' : '#34D399',
                    fontWeight: 500,
                    textDecoration: 'none',
                  }}
                >
                  <MessageCircle size={14} />
                  <span>واتساب</span>
                </a>
              )}
            </div>

            <MenuPromoTickets
              tickets={promoTickets}
              isLightSurface={isLightMenu}
              onRegisterLoyalty={handleRegisterLoyaltyCustomer}
              onSwitchToTable={handleSwitchToTableOrder}
            />
          </div>
        </>
      ) : isTheme2 ? (
        <>
          {/* THEME 2 ("مظهر 2" — UrbanBite Dark-First Overlapping Profile Style) */}
          <header className="pm-t2-header">
            <div className="pm-t2-header-inner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'nowrap' }}>
                <button
                  type="button"
                  className="pm-t2-icon-btn"
                  onClick={() => setMenuDrawerOpen(true)}
                  aria-label="قائمة المطعم"
                >
                  <Menu size={18} />
                </button>
                {!isCatalogViewOnly && (
                  <button
                    type="button"
                    className="pm-order-type-pill"
                    onClick={() => {
                      if (enabledTypes.length > 1) setOrderTypeModalOpen(true);
                    }}
                    style={enabledTypes.length <= 1 ? { cursor: 'default' } : undefined}
                  >
                    <span style={{ color: accentText }}>{ORDER_TYPE_META[orderType].icon}</span>
                    <span>{ORDER_TYPE_META[orderType].label}</span>
                    {enabledTypes.length > 1 && <ChevronDown size={13} />}
                  </button>
                )}
                {hasMultipleBranches && (
                  <button
                    type="button"
                    className="pm-order-type-pill pm-branch-pill"
                    onClick={onOpenBranchPicker}
                    aria-label="تبديل الفرع"
                  >
                    <GitBranch size={13} style={{ color: accentText }} />
                    <span className="pm-branch-pill-label">تبديل الفرع</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="pm-t2-icon-btn"
                  onClick={handleShareMenu}
                  aria-label="مشاركة المنيو"
                >
                  <Share2 size={17} />
                </button>
                <button
                  type="button"
                  className="pm-t2-icon-btn"
                  onClick={() => setSearchOpen(true)}
                  aria-label="بحث في المنيو"
                >
                  <Search size={17} />
                </button>
              </div>
            </div>
          </header>

          <div className="pm-t2-hero-wrap">
            <div className="pm-t2-logo-overlap">
              {rest.logo ? (
                <img src={rest.logo} alt={rest.n} decoding="async" referrerPolicy="no-referrer" />
              ) : (
                <span>{(rest.n || 'M').slice(0, 2)}</span>
              )}
            </div>

            <div className="pm-t2-profile-text">
              <h1 className="pm-t2-profile-title">{rest.n}</h1>
              {rest.tagline && <p className="pm-t2-profile-sub">{rest.tagline}</p>}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  marginTop: '10px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setWorkModalOpen(true)}
                  style={{
                    borderRadius: '999px',
                    border: openNow ? '1px solid rgba(52, 211, 153, 0.36)' : '1px solid rgba(248, 113, 113, 0.36)',
                    padding: '4px 12px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: openNow ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                    color: openNow ? (isLightMenu ? '#047857' : '#34D399') : (isLightMenu ? '#B91C1C' : '#FCA5A5'),
                  }}
                >
                  {openNow ? 'مفتوح الآن' : 'مغلق'}
                </button>
                {rest.ph && (
                  <a
                    href={waLink(rest.ph, `مرحباً ${rest.n}، أود الاستفسار عن المنيو`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      borderRadius: '999px',
                      padding: '4px 12px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: isLightMenu ? '#047857' : '#34D399',
                      textDecoration: 'none',
                    }}
                  >
                    <MessageCircle size={13} />
                    <span>واتساب</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="pm-container">
            <SeasonalHeroRibbon shape={activeShape} />
            <MenuPromoTickets
              tickets={promoTickets}
              isLightSurface={isLightMenu}
              onRegisterLoyalty={handleRegisterLoyaltyCustomer}
              onSwitchToTable={handleSwitchToTableOrder}
            />
          </div>
        </>
      ) : isTheme3 ? (
        <>
          {/* THEME 3 ("مظهر 3" — MenuX / Super Chicken Bold Fast-Food Style) */}
          <header className="pm-topbar">
            <div className="pm-topbar-inner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="pm-icon-btn"
                  onClick={() => setMenuDrawerOpen(true)}
                  aria-label="قائمة المطعم"
                >
                  <Menu size={20} />
                </button>
                {!isCatalogViewOnly && (
                  <button
                    type="button"
                    className="pm-order-type-pill"
                    onClick={() => {
                      if (enabledTypes.length > 1) setOrderTypeModalOpen(true);
                    }}
                    style={enabledTypes.length <= 1 ? { cursor: 'default' } : undefined}
                  >
                    <span style={{ color: accentText }}>{ORDER_TYPE_META[orderType].icon}</span>
                    <span>{ORDER_TYPE_META[orderType].label}</span>
                    {enabledTypes.length > 1 && <ChevronDown size={14} style={{ color: 'var(--pm-muted)' }} />}
                  </button>
                )}
                {hasMultipleBranches && (
                  <button
                    type="button"
                    className="pm-order-type-pill pm-branch-pill"
                    onClick={onOpenBranchPicker}
                    aria-label="تبديل الفرع"
                  >
                    <GitBranch size={14} style={{ color: accentText }} />
                    <span className="pm-branch-pill-label">تبديل الفرع</span>
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="pm-icon-btn"
                  onClick={handleShareMenu}
                  aria-label="مشاركة المنيو"
                >
                  <Share2 size={18} />
                </button>
                <button
                  type="button"
                  className="pm-icon-btn"
                  onClick={() => setWorkModalOpen(true)}
                  aria-label="أوقات العمل"
                >
                  <Clock size={18} />
                </button>
              </div>
            </div>
          </header>

          <div className="pm-container">
            <SeasonalHeroRibbon shape={activeShape} />
            <div className="pm-t3-hero-card">
              <div className="pm-t3-hero-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                  <div className="pm-t3-hero-logo">
                    {rest.logo ? (
                      <img src={rest.logo} alt={rest.n} decoding="async" referrerPolicy="no-referrer" />
                    ) : (
                      <span>{(rest.n || 'M').slice(0, 2)}</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h1 style={{ margin: 0, fontSize: '18.5px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                        {rest.n}
                      </h1>
                      <button
                        type="button"
                        onClick={() => setWorkModalOpen(true)}
                        style={{
                          borderRadius: '999px',
                          border: openNow ? '1px solid rgba(52, 211, 153, 0.36)' : '1px solid rgba(248, 113, 113, 0.36)',
                          padding: '3px 10px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: openNow ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                          color: openNow ? (isLightMenu ? '#047857' : '#34D399') : (isLightMenu ? '#B91C1C' : '#FCA5A5'),
                        }}
                      >
                        {openNow ? 'مفتوح الآن' : 'مغلق'}
                      </button>
                    </div>
                    {rest.tagline && (
                      <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--pm-muted)' }}>
                        {rest.tagline}
                      </p>
                    )}
                  </div>
                </div>
                {rest.ph && (
                  <a
                    href={waLink(rest.ph, `مرحباً ${rest.n}، أود الاستفسار عن المنيو`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-icon-btn"
                    title="واتساب"
                    style={{
                      color: isLightMenu ? '#047857' : '#34D399',
                      borderColor: 'rgba(16, 185, 129, 0.35)',
                      background: 'rgba(16, 185, 129, 0.14)',
                    }}
                  >
                    <MessageCircle size={18} />
                  </a>
                )}
              </div>
            </div>

            <div className="pm-t3-search-box">
              <Search size={17} style={{ color: accentText, flexShrink: 0 }} />
              <input
                type="search"
                className="pm-plain-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن البرجر، السندويش أو الصنف..."
                aria-label="بحث في الأصناف"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="مسح البحث"
                  style={{
                    border: 0,
                    background: 'transparent',
                    color: 'var(--pm-muted)',
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <MenuPromoTickets
              tickets={promoTickets}
              isLightSurface={isLightMenu}
              onRegisterLoyalty={handleRegisterLoyaltyCustomer}
              onSwitchToTable={handleSwitchToTableOrder}
            />
          </div>
        </>
      ) : isTheme4 ? (
        <>
          {/* THEME 4 ("مظهر 4" — Kudo Kudo Neo-Brutalist Comic Poster Style) */}
          <header className="pm-t4-header">
            <div className="pm-t4-header-inner">
              <button
                type="button"
                className="pm-t4-logo-row"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <div className="pm-t4-logo-circle">
                  {rest.logo ? (
                    <img src={rest.logo} alt={rest.n} decoding="async" referrerPolicy="no-referrer" />
                  ) : (
                    <span>{(rest.n || 'M').slice(0, 2)}</span>
                  )}
                </div>
                <span className="pm-t4-brand-name">{rest.n}</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {hasMultipleBranches && (
                  <button
                    type="button"
                    className="pm-t4-chip"
                    onClick={onOpenBranchPicker}
                    aria-label="تبديل الفرع"
                  >
                    <GitBranch size={13} />
                    <span>تبديل الفرع</span>
                  </button>
                )}
                <button
                  type="button"
                  className="pm-t4-icon-btn"
                  onClick={() => setSearchOpen(true)}
                  aria-label="بحث في المنيو"
                >
                  <Search size={18} />
                </button>
                <button
                  type="button"
                  className="pm-t4-icon-btn"
                  onClick={() => setMenuDrawerOpen(true)}
                  aria-label="قائمة المطعم"
                >
                  <Menu size={18} />
                </button>
                {!isCatalogViewOnly && (
                  <button
                    type="button"
                    className="pm-t4-icon-btn"
                    onClick={openCartModal}
                    aria-label="سلة الطلبات"
                  >
                    <ShoppingBag size={18} />
                    {totalCount > 0 && <span className="pm-t4-cart-corner tabular-nums">{totalCount}</span>}
                  </button>
                )}
              </div>
            </div>
          </header>

          <section className="pm-t4-hero">
            <div className="pm-t4-hero-inner">
              <div>
                <span className="pm-t4-eyebrow">
                  {openNow ? 'مفتوح الآن للطلبات' : 'القائمة الرقمية'}
                </span>
                <h1 className="pm-t4-hero-title">{rest.n}</h1>
                {rest.tagline && <p className="pm-t4-hero-sub">{rest.tagline}</p>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
                  {!isCatalogViewOnly && (
                    <button
                      type="button"
                      className="pm-t4-chip"
                      onClick={() => {
                        if (enabledTypes.length > 1) setOrderTypeModalOpen(true);
                      }}
                    >
                      {ORDER_TYPE_META[orderType].icon}
                      <span>{ORDER_TYPE_META[orderType].label}</span>
                      {enabledTypes.length > 1 && <ChevronDown size={13} />}
                    </button>
                  )}
                  <button type="button" className="pm-t4-chip" onClick={handleShareMenu}>
                    <Share2 size={14} />
                    <span>مشاركة</span>
                  </button>
                </div>
              </div>

              {rest.logo && (
                <div className="pm-t4-hero-img-frame">
                  <img
                    src={rest.logo}
                    alt={rest.n}
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </div>

            <svg className="pm-t4-wave" viewBox="0 0 1440 54" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0,18 C320,54 1120,0 1440,32 L1440,54 L0,54 Z" fill="var(--pm-bg)" />
            </svg>
          </section>

          <div className="pm-container">
            <SeasonalHeroRibbon shape={activeShape} />
            <details className="pm-t4-details">
              <summary>
                <span>معلومات {terms.entityDef} وأوقات الدوام</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: openNow ? '#16a34a' : '#dc2626' }}>
                    {openNow ? 'مفتوح الآن' : 'مغلق'}
                  </span>
                  <ChevronDown size={15} />
                </span>
              </summary>
              <div className="pm-t4-details-body">
                {rest.tagline && <span>{rest.tagline}</span>}
                {!isCatalogViewOnly && freeDeliveryEnabled && freeDeliveryMin > 0 && orderType === 'delivery' && (
                  <span>توصيل مجاني فوق {fmtMoney(freeDeliveryMin)}</span>
                )}
                {!isCatalogViewOnly && !openNow && rest.acceptOrdersWhenClosed && (
                  <span>نستقبل الطلبات المسبقة</span>
                )}
                <button
                  type="button"
                  onClick={() => setWorkModalOpen(true)}
                  style={{
                    border: 0,
                    background: 'transparent',
                    color: accentText,
                    fontWeight: 800,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  عرض ساعات الدوام ←
                </button>
                {rest.ph && (
                  <a
                    href={waLink(rest.ph, `مرحباً ${rest.n}، أود الاستفسار عن المنيو`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#16a34a', fontWeight: 800, textDecoration: 'none' }}
                  >
                    مراسلة عبر واتساب ↗
                  </a>
                )}
              </div>
            </details>

            <MenuPromoTickets
              tickets={promoTickets}
              isLightSurface={isLightMenu}
              onRegisterLoyalty={handleRegisterLoyaltyCustomer}
              onSwitchToTable={handleSwitchToTableOrder}
            />
          </div>
        </>
      ) : isTheme6 ? (
        <>
          {/* THEME 6 ("مظهر 6" — Delivery App Clean Patterned Hero & Info Strip) */}
          {t6StickyVisible && (
            <div className="pm-t6-sticky-bar">
              <div className="pm-t6-sticky-inner">
                <div className="pm-t6-sticky-top">
                  <button
                    type="button"
                    className="pm-t6-circle-btn"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    aria-label="العودة للأعلى"
                  >
                    <ChevronRight size={20} strokeWidth={2.2} />
                  </button>
                  <span className="pm-t6-sticky-title">{rest.n}</span>
                  <button
                    type="button"
                    className="pm-t6-circle-btn"
                    onClick={() => setSearchOpen(true)}
                    aria-label="بحث في المنيو"
                  >
                    <Search size={18} strokeWidth={2.2} />
                  </button>
                </div>

                {allCategories.length > 0 && (
                  <div className="pm-t6-cat-row is-sticky">
                    <button
                      type="button"
                      className="pm-t6-menu-list-btn"
                      onClick={() => setCatsModalOpen(true)}
                      aria-label="القائمة"
                    >
                      <FileText size={19} strokeWidth={2} />
                    </button>
                    <span className="pm-t6-cat-sep" aria-hidden="true" />
                    <div className="pm-t6-cat-strip">
                      {allCategories.map((c) => {
                        const isActive = (activeCatId || allCategories[0]?.id) === c.id;
                        return (
                          <button
                            key={`t6_stk_${c.id}`}
                            type="button"
                            data-cat-id={c.id}
                            className={`pm-t6-cat-pill ${isActive ? 'active' : ''}`}
                            onClick={() => {
                              setActiveCatId(c.id);
                              document.getElementById(`mc-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                          >
                            {c.n}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <header className="pm-t6-hero-header">
            <div className="pm-t6-hero-pattern" aria-hidden="true" />
            <div className="pm-t6-hero-actions">
              <button
                type="button"
                className="pm-t6-circle-btn"
                onClick={() => {
                  if (typeof window !== 'undefined' && window.history.length > 1) {
                    window.history.back();
                  } else {
                    onNavigate('/');
                  }
                }}
                aria-label="رجوع"
              >
                <ChevronRight size={20} strokeWidth={2.2} />
              </button>

              <div className="pm-t6-hero-left-actions">
                <button
                  type="button"
                  className="pm-t6-circle-btn"
                  onClick={() => setSearchOpen(true)}
                  aria-label="بحث في المنيو"
                >
                  <Search size={18} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  className="pm-t6-circle-btn"
                  onClick={handleShareMenu}
                  aria-label="مشاركة المنيو"
                >
                  <Share size={17} strokeWidth={2.2} />
                </button>
              </div>
            </div>
          </header>

          <div className="pm-container pm-t6-container">
            <SeasonalHeroRibbon shape={activeShape} />

            {/* Overlapping Square Logo */}
            <div className="pm-t6-logo-wrap">
              <div className="pm-t6-logo-box">
                {rest.logo ? (
                  <img src={rest.logo} alt={rest.n} decoding="async" referrerPolicy="no-referrer" />
                ) : (
                  <span className="pm-t6-logo-fallback">{(rest.n || 'M').slice(0, 2)}</span>
                )}
              </div>
            </div>

            {/* Store Title + Subtitle / Badge */}
            <div className="pm-t6-identity">
              <h1 className="pm-t6-title">{rest.n}</h1>
              <div className="pm-t6-subtitle-row">
                <span className="pm-t6-tagline">
                  {(rest.tagline || '').trim() || 'عربي، وجبات سريعة، أخرى'}
                </span>
                <span className="pm-t6-sub-sep" aria-hidden="true">|</span>
                <button
                  type="button"
                  className="pm-t6-status-chip"
                  onClick={() => setMenuDrawerOpen(true)}
                  title="معلومات المتجر"
                >
                  {openNow ? 'متاح الآن' : 'مغلق'}
                </button>
              </div>
            </div>

            {/* 4-Column Store Metrics Strip */}
            <div className="pm-t6-metrics-strip">
              <div className="pm-t6-metric-cell">
                <strong className="pm-t6-metric-val">
                  {String((rest as Record<string, unknown>).distanceLabel || rest.region || '2.7 كم')}
                </strong>
                <span className="pm-t6-metric-lbl">المسافة</span>
              </div>

              <button
                type="button"
                className="pm-t6-metric-cell is-clickable"
                onClick={() => setWorkModalOpen(true)}
              >
                <strong className="pm-t6-metric-val" dir="ltr">
                  {openNow ? formatT6ClosingTime(rest, nowDate) : 'مغلق'}
                </strong>
                <span className="pm-t6-metric-lbl">{openNow ? 'يغلق عند' : 'أوقات العمل'}</span>
              </button>

              <button
                type="button"
                className="pm-t6-metric-cell is-clickable"
                onClick={() => {
                  if (!isCatalogViewOnly && enabledTypes.length > 1) setOrderTypeModalOpen(true);
                }}
              >
                <strong className="pm-t6-metric-val">
                  {String((rest as Record<string, unknown>).deliveryTime || '35 دقيقة')}
                </strong>
                <span className="pm-t6-metric-lbl">
                  {orderType === 'pickup' ? terms.pickupLabel : 'وقت التوصيل'}
                </span>
              </button>

              <div className="pm-t6-metric-cell">
                <strong className="pm-t6-metric-val tabular-nums">
                  {minOrderEnabled && minOrderAmount > 0 ? fmtMoney(minOrderAmount) : fmtMoney(0)}
                </strong>
                <span className="pm-t6-metric-lbl">الحد الأدنى للطلب</span>
              </div>
            </div>

            {/* Branch / Store Location Selector Bar */}
            <div
              role="button"
              tabIndex={0}
              className="pm-t6-branch-bar"
              onClick={() => setT6BranchSheetOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setT6BranchSheetOpen(true);
                }
              }}
            >
              <div className="pm-t6-branch-right">
                <Store size={19} strokeWidth={1.9} className="pm-t6-branch-icon" />
                <span className="pm-t6-branch-text">
                  {hasMultipleBranches
                    ? (rest.branchName || '').trim() || 'متاح أكثر من فرع'
                    : String((rest as Record<string, unknown>).address || rest.region || rest.n)}
                </span>
              </div>
              <span className="pm-t6-branch-action">تغيير</span>
            </div>

            <MenuPromoTickets
              tickets={promoTickets}
              isLightSurface={isLightMenu}
              onRegisterLoyalty={handleRegisterLoyaltyCustomer}
              onSwitchToTable={handleSwitchToTableOrder}
            />

            {/* "المنتجات" Header Row + View Toggle Pill */}
            <div className="pm-t6-products-head">
              <h2 className="pm-t6-products-heading">المنتجات</h2>
              <div className="pm-t6-view-toggle" role="group" aria-label="طريقة عرض المنتجات">
                <button
                  type="button"
                  className={`pm-t6-toggle-btn ${t6ViewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setT6ViewMode('list')}
                  aria-pressed={t6ViewMode === 'list'}
                  aria-label="عرض القائمة"
                  title="عرض القائمة"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <rect x="2.5" y="4" width="3.5" height="3.5" rx="0.9" fill="currentColor" />
                    <path d="M8.5 5.75H17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <rect x="2.5" y="9" width="3.5" height="3.5" rx="0.9" fill="currentColor" />
                    <path d="M8.5 10.75H17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <rect x="2.5" y="14" width="3.5" height="3.5" rx="0.9" fill="currentColor" />
                    <path d="M8.5 15.75H17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`pm-t6-toggle-btn ${t6ViewMode === 'large' ? 'active' : ''}`}
                  onClick={() => setT6ViewMode('large')}
                  aria-pressed={t6ViewMode === 'large'}
                  aria-label="عرض البطاقات الكبيرة"
                  title="عرض البطاقات الكبيرة"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <rect x="3" y="3.5" width="14" height="7" rx="2" fill="currentColor" />
                    <path d="M3.5 13.5H16.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                    <path d="M3.5 16.8H11.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div ref={t6StickySentinelRef} style={{ height: '1px', width: '100%' }} aria-hidden="true" />
          </div>
        </>
      ) : (
        <>
          {/* Top Sticky Action Bar (Standard Shapes) */}
          <header className="pm-topbar">
            <div className="pm-topbar-inner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="pm-icon-btn"
                  onClick={() => setMenuDrawerOpen(true)}
                  aria-label="قائمة المطعم"
                >
                  <Menu size={20} />
                </button>

                {!isCatalogViewOnly && (
                  <button
                    type="button"
                    className="pm-order-type-pill"
                    onClick={() => {
                      if (enabledTypes.length > 1) setOrderTypeModalOpen(true);
                    }}
                    style={enabledTypes.length <= 1 ? { cursor: 'default' } : undefined}
                  >
                    <span style={{ color: accentText }}>{ORDER_TYPE_META[orderType].icon}</span>
                    <span>{ORDER_TYPE_META[orderType].label}</span>
                    {enabledTypes.length > 1 && <ChevronDown size={14} style={{ color: 'var(--pm-muted)' }} />}
                  </button>
                )}

                {hasMultipleBranches && (
                  <button
                    type="button"
                    className="pm-order-type-pill pm-branch-pill"
                    onClick={onOpenBranchPicker}
                    title={`تبديل الفرع — الحالي: ${branchShortLabel}`}
                    aria-label="تبديل الفرع"
                  >
                    <GitBranch size={14} style={{ color: accentText, flexShrink: 0 }} />
                    <span className="pm-branch-pill-label">تبديل الفرع</span>
                    <ChevronDown size={13} style={{ color: 'var(--pm-muted)', flexShrink: 0 }} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="pm-icon-btn"
                  onClick={handleShareMenu}
                  aria-label="مشاركة المنيو"
                  title="مشاركة المنيو"
                >
                  <Share2 size={18} />
                </button>
                <button
                  type="button"
                  className="pm-icon-btn"
                  onClick={() => setSearchOpen(true)}
                  aria-label="بحث في المنيو"
                >
                  <Search size={18} />
                </button>
              </div>
            </div>
          </header>

          <div className="pm-container">
            <SeasonalHeroRibbon shape={activeShape} />

            {/* Restaurant Identity Card */}
            <motion.section
              className="pm-profile-card"
              {...dashHeroMotion(prefersReducedMotion)}
            >
              <div className="pm-logo-box">
                {rest.logo ? (
                  <img src={rest.logo} alt={rest.n} decoding="async" referrerPolicy="no-referrer" />
                ) : (
                  <span>{(rest.n || 'M').slice(0, 2)}</span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: '17.5px', fontWeight: 800, color: 'var(--pm-ink)' }}>
                    {rest.n}
                  </h1>
                  <button
                    type="button"
                    className="pm-shape-pill"
                    onClick={() => setWorkModalOpen(true)}
                    style={{
                      border: openNow ? '1px solid rgba(52, 211, 153, 0.36)' : '1px solid rgba(248, 113, 113, 0.36)',
                      padding: '3px 10px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: openNow ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                      color: openNow ? (isLightMenu ? '#047857' : '#34D399') : (isLightMenu ? '#B91C1C' : '#FCA5A5'),
                    }}
                  >
                    {openNow ? 'مفتوح الآن' : 'مغلق'}
                  </button>
                </div>

                {rest.tagline && (
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--pm-muted)', fontWeight: 500 }}>
                    {rest.tagline}
                  </p>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                    marginTop: '8px',
                    fontSize: '12px',
                    color: 'var(--pm-muted)',
                  }}
                >
                  {!isCatalogViewOnly && freeDeliveryEnabled && freeDeliveryMin > 0 && orderType === 'delivery' ? (
                    <span style={{ color: accentText, fontWeight: 700 }}>
                      توصيل مجاني فوق {fmtMoney(freeDeliveryMin)}
                    </span>
                  ) : null}
                  {!isCatalogViewOnly && !openNow && rest.acceptOrdersWhenClosed && (
                    <span style={{ color: isLightMenu ? '#b45309' : '#FCD34D' }}>
                      · نستقبل الطلبات المسبقة
                    </span>
                  )}
                </div>
              </div>

              {rest.ph && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                  <a
                    href={waLink(
                      rest.ph,
                      `مرحباً ${rest.n}، أود الاستفسار عن المنيو`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-icon-btn"
                    title="واتساب"
                    style={{
                      color: isLightMenu ? '#047857' : '#34D399',
                      borderColor: 'rgba(16, 185, 129, 0.35)',
                      background: 'rgba(16, 185, 129, 0.14)',
                    }}
                  >
                    <MessageCircle size={18} />
                  </a>
                </div>
              )}
            </motion.section>

            {/* Horizontal Promo Ticket Cards + Detail Bottom Sheet */}
            <MenuPromoTickets
              tickets={promoTickets}
              isLightSurface={isLightMenu}
              onRegisterLoyalty={handleRegisterLoyaltyCustomer}
              onSwitchToTable={handleSwitchToTableOrder}
            />
          </div>
        </>
      )}

      <div className="pm-container">

        {/* Happy Hour Banner Addon */}
        {addons.happyHour?.enabled && activeMenuDiscount.sourceLabel === (addons.happyHour.title || 'ساعة السعادة') && (
          <div
            className="pm-addon-card"
            style={{
              marginTop: '10px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#ffffff',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              fontSize: '13px',
              fontWeight: 800,
            }}
          >
            <span>
              {addons.happyHour.title || 'ساعة السعادة'} مفعّلة الآن
            </span>
            <span>
              {`خصم ${addons.happyHour.discountPercent || 15}% على كل المنيو`}
            </span>
          </div>
        )}

        {/* Countdown Timer Addon — Actually Applies Live Discount Across All Prices */}
        {addons.countdownTimer?.enabled && (
          <div
            className="pm-addon-card"
            style={{
              marginTop: '10px',
              color: 'var(--pm-ink)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 800 }}>
              ⏳ {addons.countdownTimer.title || 'عرض لفترة محدودة'}
              {(addons.countdownTimer.discountValue ?? 0) > 0 && (
                <span
                  className="pm-shape-pill"
                  style={{
                    background: '#10b981',
                    color: '#052e16',
                    padding: '2px 8px',
                    fontSize: '11.5px',
                    fontWeight: 900,
                    marginInlineStart: '8px',
                  }}
                >
                  خصم فوري{' '}
                  {addons.countdownTimer.discountType === 'fixed'
                    ? `${formatNumber(addons.countdownTimer.discountValue || 0)} ${currency}`
                    : `${addons.countdownTimer.discountValue}%`}
                </span>
              )}
              {addons.countdownTimer.discountText && (
                <span style={{ color: isLightMenu ? '#b45309' : '#fbbf24', marginInlineStart: '8px' }}>
                  — {addons.countdownTimer.discountText}
                </span>
              )}
            </div>
            <span
              dir="ltr"
              className="tabular-nums pm-shape-btn"
              style={{
                background: brandColor,
                border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                color: brandInk,
                padding: '4px 10px',
                fontSize: '12.5px',
                fontWeight: 900,
              }}
            >
              <LiveCountdownText endHour={addons.countdownTimer.endHour} />
            </span>
          </div>
        )}

        {/* Active Smart Deal Pills: Pickup Instant Discount, Dine-In Discount & Mood Finder */}
        {((!isCatalogViewOnly && addons.pickupInstantDiscount?.enabled && orderType === 'pickup') ||
          (!isCatalogViewOnly && addons.dineInDiscount?.enabled && orderType === 'table') ||
          addons.moodMealFinder?.enabled) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            {addons.moodMealFinder?.enabled && (
              <button
                type="button"
                className="pm-shape-btn"
                onClick={() => setMoodModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: brandColor,
                  color: brandInk,
                  border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                <Smile size={15} />
                <span>{addons.moodMealFinder.buttonText || 'اختر وجبتك حسب مزاجك'}</span>
              </button>
            )}
            {!isCatalogViewOnly && addons.pickupInstantDiscount?.enabled && orderType === 'pickup' && (
              <span
                className="pm-shape-pill"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 11px',
                  fontSize: '12px',
                  fontWeight: 800,
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  color: isLightMenu ? '#b45309' : '#fcd34d',
                }}
              >
                🏃 {addons.pickupInstantDiscount.title || 'خصم الاستلام الفوري'}: {addons.pickupInstantDiscount.discountPercent || 10}% تلقائي
              </span>
            )}
            {!isCatalogViewOnly && addons.dineInDiscount?.enabled && orderType === 'table' && (
              <span
                className="pm-shape-pill"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 11px',
                  fontSize: '12px',
                  fontWeight: 800,
                  background: 'rgba(16, 185, 129, 0.14)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: isLightMenu ? '#047857' : '#6ee7b7',
                }}
              >
                🍽️ {(!addons.dineInDiscount.title || addons.dineInDiscount.title === 'خصم طلبات الصالة' || addons.dineInDiscount.title === 'خصم خاص لطلبات الصالة') ? 'خصم على طلبات الصالة' : addons.dineInDiscount.title}: {addons.dineInDiscount.discountPercent || 10}% تلقائي
              </span>
            )}
          </div>
        )}

        {/* Toters Discovery Shelves: "اطلب مجدداً" (only if ordered before) & "الأكثر طلباً" */}
        {isToters && allItems.length > 0 && (() => {
          const reorderItems: MenuItem[] = [];
          if (hasOrderedBefore && lastSavedOrderCart.length > 0) {
            const byId = new Map<string, MenuItem>(allItems.map((it) => [it.id, it]));
            const seen = new Set<string>();
            lastSavedOrderCart.forEach((l) => {
              if (seen.has(l.itemId)) return;
              const found = byId.get(l.itemId);
              if (found) {
                seen.add(found.id);
                reorderItems.push(found);
              }
            });
          }

          const mostOrderedShelf = mostOrderedItems.slice(0, 8);

          const renderShelf = (heading: string, items: MenuItem[]) => {
            if (items.length === 0) return null;
            return (
              <section className="pm-toters-shelf-wrap">
                <h2 className="pm-toters-shelf-heading">{heading}</h2>
                <div className="pm-toters-shelf">
                  {items.map((it) => {
                    const qty = getItemCartQty(it.id);
                    const priceInfo = getPriceDisplay(
                      it,
                      currency,
                      activeMenuDiscount,
                      resolvedPlan.perms.itemDiscounts
                    );
                    const itemEval = itemEvalMap.get(it.id);
                    const displayOnly = isDisplayOnlyItem(it);
                    const unavailable = !displayOnly && (itemEval ? !itemEval.available : false);
                    const showUnavailableBadge =
                      unavailable || Boolean(itemEval && !itemEval.available && !itemEval.outOfSchedule);
                    return (
                      <article
                        key={`${heading}_${it.id}`}
                        className={`pm-toters-shelf-card ${showUnavailableBadge || unavailable ? 'unavailable is-unavailable' : ''}`}
                        onClick={() => openProductModal(it)}
                      >
                        <div className={`pm-toters-shelf-thumb ${showUnavailableBadge || unavailable ? 'is-unavailable' : ''}`}>
                          {it.img ? (
                            <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="pm-toters-thumb-empty">
                              <Utensils size={24} />
                            </div>
                          )}
                          {(showUnavailableBadge || unavailable) && (
                            <>
                              <div className="pm-unavailable-wash" aria-hidden="true" />
                              <span className="pm-unavailable-pill is-compact">غير متوفر</span>
                            </>
                          )}
                          {!displayOnly && (
                            !unavailable && qty > 0 ? (
                              <div
                                className="pm-toters-qty-pill"
                                dir="rtl"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="pm-toters-qty-pill-btn"
                                  aria-label={qty === 1 ? `حذف ${it.n} من السلة` : `إنقاص كمية ${it.n}`}
                                  onClick={(e) => decrementItemFromCart(it.id, e)}
                                >
                                  {qty === 1 ? <Trash2 size={13} strokeWidth={2.3} /> : <Minus size={14} strokeWidth={2.6} />}
                                </button>
                                <span className="pm-toters-qty-pill-val tabular-nums">{qty}</span>
                                <button
                                  type="button"
                                  className="pm-toters-qty-pill-btn"
                                  aria-label={`زيادة كمية ${it.n}`}
                                  onClick={(e) => quickAddOrOpenModal(it, e)}
                                >
                                  <Plus size={14} strokeWidth={2.7} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={`pm-toters-plus-btn ${unavailable ? 'is-unavailable-plus' : ''}`}
                                disabled={unavailable}
                                aria-label={unavailable ? `${it.n} غير متوفر` : `أضف للسلة: ${it.n}`}
                                onClick={(e) => quickAddOrOpenModal(it, e)}
                              >
                                <Plus size={16} strokeWidth={2.6} />
                              </button>
                            )
                          )}
                        </div>
                        <b className="pm-toters-shelf-title">{it.n}</b>
                        <span className="pm-toters-shelf-price tabular-nums">{priceInfo.main}</span>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          };

          return (
            <>
              {reorderItems.length > 0 && renderShelf('اطلب مجدداً', reorderItems.slice(0, 8))}
              {mostOrderedShelf.length > 0 && renderShelf('الأكثر طلباً', mostOrderedShelf)}
            </>
          );
        })()}

        {/* Horizontal Category Strip (Shape-Aware for Themes 1-4 & Standard) */}
        {allCategories.length > 0 && isTheme1 ? (
          <nav className="pm-t1-cat-wrap" aria-label="الأصناف">
            <div className="pm-t1-cat-row">
              <button
                type="button"
                className="pm-t1-cat-all-btn"
                onClick={() => setCatsModalOpen(true)}
                aria-label="كل الأصناف"
              >
                <span>الكل</span>
                <ChevronDown size={16} />
              </button>
              <div className="pm-t1-cat-strip">
                {allCategories.map((c) => {
                  const isActive = activeCatId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-cat-id={c.id}
                      className={`pm-t1-cat-chip ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        setActiveCatId(c.id);
                        document.getElementById(`mc-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      {c.img && <img src={c.img} alt={c.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
                      <span>{c.n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>
        ) : allCategories.length > 0 && isTheme2 ? (
          <div className="pm-t2-cat-wrap">
            <div className="pm-t2-cat-strip">
              {allCategories.map((c) => {
                const isActive = activeCatId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-cat-id={c.id}
                    className={`pm-t2-cat-card ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setActiveCatId(c.id);
                      document.getElementById(`mc-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    <div className="pm-t2-cat-icon-box">
                      {c.img ? (
                        <img src={c.img} alt={c.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                      ) : (
                        <Utensils size={20} style={{ color: isActive ? accentText : 'var(--pm-muted)' }} />
                      )}
                    </div>
                    <span className="pm-t2-cat-label">{c.n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : allCategories.length > 0 && isTheme3 ? (
          <div className="pm-t3-cat-wrap">
            <div className="pm-t3-cat-strip">
              {allCategories.map((c) => {
                const isActive = activeCatId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-cat-id={c.id}
                    className={`pm-t3-cat-pill ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setActiveCatId(c.id);
                      document.getElementById(`mc-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    <span>{c.n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : allCategories.length > 0 && isTheme4 ? (
          <div className="pm-t4-cat-wrap">
            <div className="pm-t4-cat-strip">
              {allCategories.map((c) => {
                const isActive = activeCatId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-cat-id={c.id}
                    className={`pm-t4-chip ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setActiveCatId(c.id);
                      document.getElementById(`mc-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    <span>{c.n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : allCategories.length > 0 && isTheme6 ? (
          <div className="pm-t6-cat-wrap" style={t6StickyVisible ? { visibility: 'hidden' } : undefined}>
            <div className="pm-t6-cat-row">
              <button
                type="button"
                className="pm-t6-menu-list-btn"
                onClick={() => setCatsModalOpen(true)}
                aria-label="القائمة"
              >
                <FileText size={19} strokeWidth={2} />
              </button>
              <span className="pm-t6-cat-sep" aria-hidden="true" />
              <div className="pm-t6-cat-strip">
                {allCategories.map((c) => {
                  const isActive = (activeCatId || allCategories[0]?.id) === c.id;
                  return (
                    <button
                      key={`t6_inl_${c.id}`}
                      type="button"
                      data-cat-id={c.id}
                      className={`pm-t6-cat-pill ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        setActiveCatId(c.id);
                        document.getElementById(`mc-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      {c.n}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : allCategories.length > 0 ? (
          <div className="pm-cat-strip-wrap">
            <div className="pm-cat-strip">
              <button
                type="button"
                className="pm-cat-chip"
                onClick={() => setCatsModalOpen(true)}
                style={{
                  fontWeight: 800,
                  background: 'var(--pm-soft)',
                  color: 'var(--pm-ink)',
                  borderColor: 'var(--pm-line)',
                }}
              >
                <LayoutGrid size={14} style={{ color: accentText }} />
                <span>القائمة</span>
              </button>

              {allCategories.map((c, cIdx) => {
                const isActive = activeCatId === c.id;
                const catEval = categoryEvalMap.get(c.id);
                return (
                  <motion.button
                    key={c.id}
                    type="button"
                    data-cat-id={c.id}
                    className={`pm-cat-chip ${isActive ? 'active' : ''}`}
                    {...dashPillMotion(prefersReducedMotion, cIdx, false)}
                    onClick={() => {
                      setActiveCatId(c.id);
                      document.getElementById(`mc-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    {c.img && (
                      <img
                        src={c.img}
                        alt={c.n}
                        className="pm-cat-chip-img"
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <span>{c.n}</span>
                    {catEval?.outOfSchedule ? (
                      <Clock size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    ) : catEval && !catEval.available ? (
                      <Ban size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    ) : null}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Theme 3 Inline Live Search Results */}
        {isTheme3 && deferredSearchQuery.trim() && !searchOpen && (
          <div style={{ marginTop: '14px', marginBottom: '20px' }}>
            <div className="pm-sec-title" style={{ gap: '8px' }}>
              <h2>نتائج البحث ({searchResults.length})</h2>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ border: 0, background: 'transparent', color: accentText, fontWeight: 700, cursor: 'pointer', fontSize: '12.5px' }}
              >
                عرض كل الأقسام
              </button>
            </div>
            {searchResults.length === 0 ? (
              <div className="pm-addon-card" style={{ padding: '26px', textAlign: 'center', color: 'var(--pm-muted)' }}>
                لا توجد أصناف مطابقة لـ "{deferredSearchQuery}"
              </div>
            ) : (
              <div className="pm-t3-grid">
                {searchResults.map((it) => {
                  const qty = getItemCartQty(it.id);
                  const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                  const itemEval = itemEvalMap.get(it.id);
                  const displayOnly = isDisplayOnlyItem(it);
                  const unavailable = !displayOnly && (itemEval ? !itemEval.available : false);
                  const formattedBeforePrice = priceInfo.rawBefore > 0 ? fmtMoney(priceInfo.rawBefore) : '';
                  return (
                    <article
                      key={`t3_srch_${it.id}`}
                      className={`pm-t3-card ${unavailable ? 'unavailable is-unavailable' : ''}`}
                      onClick={() => openProductModal(it)}
                    >
                      <div className="pm-t3-card-media">
                        {it.img ? (
                          <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--pm-muted)' }}>
                            <Utensils size={26} />
                          </div>
                        )}
                        {popularItemIds.has(it.id) && (
                          <span className="pm-t3-popular-tag">الأكثر طلباً</span>
                        )}
                        {unavailable && (
                          <>
                            <div className="pm-unavailable-wash" aria-hidden="true" />
                            <span className="pm-unavailable-pill is-compact">غير متوفر</span>
                          </>
                        )}
                      </div>
                      <div className="pm-t3-card-body">
                        <h3 className="pm-t3-card-title">{it.n}</h3>
                        {it.d && <p className="pm-t3-card-desc">{it.d}</p>}
                        <div className="pm-t3-card-foot">
                          <div style={{ minWidth: 0 }}>
                            <span className="tabular-nums" style={{ fontWeight: 900, fontSize: '14px', color: accentText }}>
                              {priceInfo.main}
                            </span>
                            {priceInfo.rawBefore > 0 && (
                              <span className="pm-menu-card-old-price tabular-nums" style={{ display: 'block' }}>
                                {formattedBeforePrice}
                              </span>
                            )}
                          </div>
                          {!displayOnly && !unavailable && (
                            qty > 0 ? (
                              <div className="pm-t3-qty-pill" dir="rtl" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="pm-t3-qty-pill-btn"
                                  onClick={(e) => decrementItemFromCart(it.id, e)}
                                  aria-label={qty === 1 ? `حذف ${it.n}` : `إنقاص ${it.n}`}
                                >
                                  {qty === 1 ? <Trash2 size={13} /> : <Minus size={14} />}
                                </button>
                                <span className="pm-t3-qty-pill-val tabular-nums">{qty}</span>
                                <button
                                  type="button"
                                  className="pm-t3-qty-pill-btn"
                                  onClick={(e) => quickAddOrOpenModal(it, e)}
                                  aria-label={`زيادة ${it.n}`}
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="pm-t3-add-btn"
                                onClick={(e) => quickAddOrOpenModal(it, e)}
                              >
                                <Plus size={14} />
                                <span>إضافة</span>
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Categories & Menu Items */}
        <div style={{ marginTop: '14px' }}>
          {allCategories.length === 0 ? (
            <div
              className="pm-addon-card"
              style={{
                padding: '44px 18px',
                textAlign: 'center',
                color: 'var(--pm-muted)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px', color: 'var(--pm-muted)' }}>
                <Utensils size={28} />
              </div>
              <b style={{ display: 'block', color: 'var(--pm-ink)', marginBottom: '4px' }}>
                المنيو قيد الإعداد
              </b>
              <span style={{ fontSize: '12.5px' }}>
                سيتم عرض الأقسام والأصناف هنا فور إضافتها من لوحة التحكم.
              </span>
            </div>
          ) : (
            allCategories.map((cat) => {
              const catItems = itemsByCatMap.get(cat.id) || [];
              if (catItems.length === 0) return null;
              const catEval = categoryEvalMap.get(cat.id);
              const isManualCatBadgePause = Boolean(catEval && !catEval.available && !catEval.outOfSchedule);

              return (
                <section
                  key={cat.id}
                  id={`mc-${cat.id}`}
                  style={{ marginBottom: '20px', scrollMarginTop: '126px' }}
                >
                  <div className="pm-sec-title" style={{ gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h2>{cat.n}</h2>
                      {isManualCatBadgePause ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '8px',
                            background: 'rgba(245, 158, 11, 0.14)',
                            color: '#f59e0b',
                            border: '1px solid rgba(245, 158, 11, 0.32)',
                          }}
                        >
                          <Ban size={11} />
                          <span>غير متوفر حالياً</span>
                        </span>
                      ) : catEval?.hasSchedule ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '8px',
                            background: catEval.available
                              ? 'color-mix(in srgb, var(--pm-brand) 12%, transparent)'
                              : 'rgba(245, 158, 11, 0.14)',
                            color: catEval.available ? accentText : '#f59e0b',
                            border: catEval.available
                              ? '1px solid color-mix(in srgb, var(--pm-brand) 28%, transparent)'
                              : '1px solid rgba(245, 158, 11, 0.32)',
                          }}
                        >
                          <Clock size={11} />
                          <span>
                            {catEval.available
                              ? `متاح ${catEval.badgeText}`
                              : `متوفر ${catEval.badgeText}`}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    {!isTheme6 && (
                      <span
                        className={isTheme1 ? 'pm-t1-cat-count tabular-nums' : undefined}
                        style={isTheme1 ? undefined : { fontSize: '12px', color: 'var(--pm-muted)', fontWeight: 600 }}
                      >
                        {catItems.length} أصناف
                      </span>
                    )}
                  </div>

                  {/* THEME 1 ("مظهر 1" — Enab Minimalist Grid) */}
                  {isTheme1 ? (
                    <div className="pm-t1-grid">
                      {catItems.map((it) => {
                        const qty = getItemCartQty(it.id);
                        const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                        const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, cat, nowDate);
                        const displayOnly = isDisplayOnlyItem(it);
                        const unavailable = !displayOnly && !itemEval.available;
                        const formattedBeforePrice = priceInfo.rawBefore > 0 ? fmtMoney(priceInfo.rawBefore) : '';
                        return (
                          <article
                            key={it.id}
                            className={`pm-t1-card ${unavailable ? 'unavailable is-unavailable' : ''}`}
                            onClick={() => openProductModal(it)}
                          >
                            <div className="pm-t1-card-media">
                              {it.img ? (
                                <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--pm-muted)' }}>
                                  <Utensils size={26} />
                                </div>
                              )}
                              {unavailable && (
                                <>
                                  <div className="pm-unavailable-wash" aria-hidden="true" />
                                  <span className="pm-unavailable-pill is-compact">غير متوفر</span>
                                </>
                              )}
                            </div>
                            <h3 className="pm-t1-card-title">{it.n}</h3>
                            <div className="pm-t1-card-foot">
                              <div className="pm-t1-card-price-row">
                                <span className="pm-t1-card-price tabular-nums">{priceInfo.main}</span>
                                {priceInfo.rawBefore > 0 && (
                                  <span className="pm-t1-card-old tabular-nums">{formattedBeforePrice}</span>
                                )}
                              </div>
                              {!displayOnly && !unavailable && (
                                qty > 0 ? (
                                  <div className="pm-t1-qty-pill" dir="rtl" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={(e) => decrementItemFromCart(it.id, e)}
                                      aria-label={qty === 1 ? `حذف ${it.n}` : `إنقاص ${it.n}`}
                                    >
                                      {qty === 1 ? <Trash2 size={12} /> : <Minus size={13} />}
                                    </button>
                                    <span className="tabular-nums">{qty}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => quickAddOrOpenModal(it, e)}
                                      aria-label={`زيادة ${it.n}`}
                                    >
                                      <Plus size={13} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="pm-t1-add-btn"
                                    onClick={(e) => quickAddOrOpenModal(it, e)}
                                    aria-label={`أضف للسلة: ${it.n}`}
                                  >
                                    <Plus size={16} strokeWidth={2.5} />
                                  </button>
                                )
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : isTheme2 ? (
                    <div className="pm-t2-list">
                      {catItems.map((it) => {
                        const qty = getItemCartQty(it.id);
                        const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                        const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, cat, nowDate);
                        const displayOnly = isDisplayOnlyItem(it);
                        const unavailable = !displayOnly && !itemEval.available;
                        const formattedBeforePrice = priceInfo.rawBefore > 0 ? fmtMoney(priceInfo.rawBefore) : '';
                        return (
                          <article
                            key={it.id}
                            className={`pm-t2-row ${unavailable ? 'unavailable is-unavailable' : ''}`}
                            onClick={() => openProductModal(it)}
                          >
                            <div className="pm-t2-row-info">
                              <h3 className="pm-t2-row-title">{it.n}</h3>
                              {it.d && <p className="pm-t2-row-desc">{it.d}</p>}
                              <div className="pm-t2-row-foot">
                                <span className="pm-t2-row-price tabular-nums">{priceInfo.main}</span>
                                {priceInfo.rawBefore > 0 && (
                                  <span className="pm-menu-card-old-price tabular-nums">{formattedBeforePrice}</span>
                                )}
                              </div>
                            </div>
                            <div className={`pm-t2-row-media ${unavailable ? 'is-unavailable' : ''}`}>
                              {it.img ? (
                                <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--pm-muted)' }}>
                                  <Utensils size={24} />
                                </div>
                              )}
                              {unavailable && (
                                <>
                                  <div className="pm-unavailable-wash" aria-hidden="true" />
                                  <span className="pm-unavailable-pill is-compact">غير متوفر</span>
                                </>
                              )}
                              {!displayOnly && !unavailable && (
                                qty > 0 ? (
                                  <div
                                    className="pm-t2-qty-pill"
                                    dir="rtl"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="pm-t2-qty-pill-btn"
                                      onClick={(e) => decrementItemFromCart(it.id, e)}
                                      aria-label={qty === 1 ? `حذف ${it.n}` : `إنقاص ${it.n}`}
                                    >
                                      {qty === 1 ? <Trash2 size={12} /> : <Minus size={13} />}
                                    </button>
                                    <span className="pm-t2-qty-pill-val tabular-nums">{qty}</span>
                                    <button
                                      type="button"
                                      className="pm-t2-qty-pill-btn"
                                      onClick={(e) => quickAddOrOpenModal(it, e)}
                                      aria-label={`زيادة ${it.n}`}
                                    >
                                      <Plus size={13} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="pm-t2-add-btn"
                                    onClick={(e) => quickAddOrOpenModal(it, e)}
                                    aria-label={`أضف للسلة: ${it.n}`}
                                  >
                                    <Plus size={16} strokeWidth={2.5} />
                                  </button>
                                )
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : isTheme3 ? (
                    <div className="pm-t3-grid">
                      {catItems.map((it) => {
                        const qty = getItemCartQty(it.id);
                        const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                        const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, cat, nowDate);
                        const displayOnly = isDisplayOnlyItem(it);
                        const unavailable = !displayOnly && !itemEval.available;
                        const formattedBeforePrice = priceInfo.rawBefore > 0 ? fmtMoney(priceInfo.rawBefore) : '';
                        return (
                          <article
                            key={it.id}
                            className={`pm-t3-card ${unavailable ? 'unavailable is-unavailable' : ''}`}
                            onClick={() => openProductModal(it)}
                          >
                            <div className="pm-t3-card-media">
                              {it.img ? (
                                <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--pm-muted)' }}>
                                  <Utensils size={26} />
                                </div>
                              )}
                              {popularItemIds.has(it.id) && (
                                <span className="pm-t3-popular-tag">الأكثر طلباً</span>
                              )}
                              {unavailable && (
                                <>
                                  <div className="pm-unavailable-wash" aria-hidden="true" />
                                  <span className="pm-unavailable-pill is-compact">غير متوفر</span>
                                </>
                              )}
                            </div>
                            <div className="pm-t3-card-body">
                              <h3 className="pm-t3-card-title">{it.n}</h3>
                              {it.d && <p className="pm-t3-card-desc">{it.d}</p>}
                              <div className="pm-t3-card-foot">
                                <div style={{ minWidth: 0 }}>
                                  <span className="tabular-nums" style={{ fontWeight: 900, fontSize: '14px', color: accentText }}>
                                    {priceInfo.main}
                                  </span>
                                  {priceInfo.rawBefore > 0 && (
                                    <span className="pm-menu-card-old-price tabular-nums" style={{ display: 'block' }}>
                                      {formattedBeforePrice}
                                    </span>
                                  )}
                                </div>
                                {!displayOnly && !unavailable && (
                                  qty > 0 ? (
                                    <div className="pm-t3-qty-pill" dir="rtl" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        className="pm-t3-qty-pill-btn"
                                        onClick={(e) => decrementItemFromCart(it.id, e)}
                                        aria-label={qty === 1 ? `حذف ${it.n}` : `إنقاص ${it.n}`}
                                      >
                                        {qty === 1 ? <Trash2 size={13} /> : <Minus size={14} />}
                                      </button>
                                      <span className="pm-t3-qty-pill-val tabular-nums">{qty}</span>
                                      <button
                                        type="button"
                                        className="pm-t3-qty-pill-btn"
                                        onClick={(e) => quickAddOrOpenModal(it, e)}
                                        aria-label={`زيادة ${it.n}`}
                                      >
                                        <Plus size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="pm-t3-add-btn"
                                      onClick={(e) => quickAddOrOpenModal(it, e)}
                                    >
                                      <Plus size={14} />
                                      <span>إضافة</span>
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : isTheme4 ? (
                    <div className="pm-t4-grid">
                      {catItems.map((it) => {
                        const qty = getItemCartQty(it.id);
                        const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                        const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, cat, nowDate);
                        const displayOnly = isDisplayOnlyItem(it);
                        const unavailable = !displayOnly && !itemEval.available;
                        const formattedBeforePrice = priceInfo.rawBefore > 0 ? fmtMoney(priceInfo.rawBefore) : '';
                        return (
                          <article
                            key={it.id}
                            className={`pm-t4-card ${unavailable ? 'unavailable is-unavailable' : ''}`}
                            onClick={() => openProductModal(it)}
                          >
                            <div className={`pm-t4-card-img ${unavailable ? 'is-unavailable' : ''}`}>
                              {it.img ? (
                                <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--pm-muted)' }}>
                                  <Utensils size={24} />
                                </div>
                              )}
                              {unavailable && (
                                <>
                                  <div className="pm-unavailable-wash" aria-hidden="true" />
                                  <span className="pm-unavailable-pill is-compact">غير متوفر</span>
                                </>
                              )}
                            </div>
                            <div className="pm-t4-card-body">
                              <h3 className="pm-t4-card-title">{it.n}</h3>
                              {it.d && <p className="pm-t4-card-desc">{it.d}</p>}
                              <div className="pm-t4-card-foot">
                                <div style={{ minWidth: 0 }}>
                                  <span className="pm-t4-card-price tabular-nums">{priceInfo.main}</span>
                                  {priceInfo.rawBefore > 0 && (
                                    <span className="pm-menu-card-old-price tabular-nums" style={{ display: 'inline-block', marginInlineStart: '6px' }}>
                                      {formattedBeforePrice}
                                    </span>
                                  )}
                                </div>
                                {!displayOnly && !unavailable && (
                                  qty > 0 ? (
                                    <div className="pm-t4-qty-pill" dir="rtl" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        className="pm-t4-qty-pill-btn"
                                        onClick={(e) => decrementItemFromCart(it.id, e)}
                                        aria-label={qty === 1 ? `حذف ${it.n}` : `إنقاص ${it.n}`}
                                      >
                                        {qty === 1 ? <Trash2 size={13} /> : <Minus size={14} />}
                                      </button>
                                      <span className="pm-t4-qty-pill-val tabular-nums">{qty}</span>
                                      <button
                                        type="button"
                                        className="pm-t4-qty-pill-btn"
                                        onClick={(e) => quickAddOrOpenModal(it, e)}
                                        aria-label={`زيادة ${it.n}`}
                                      >
                                        <Plus size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="pm-t4-add-btn"
                                      onClick={(e) => quickAddOrOpenModal(it, e)}
                                      aria-label={`أضف للسلة: ${it.n}`}
                                    >
                                      <Plus size={18} strokeWidth={2.7} />
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : isTheme6 ? (
                    (() => {
                      const firstNonEmptyCatId = allCategories.find(
                        (c) => (itemsByCatMap.get(c.id) || []).length > 0
                      )?.id;
                      const isFeaturedFirstCat = cat.id === firstNonEmptyCatId;
                      if (isFeaturedFirstCat) {
                        return (
                          <div className="pm-t6-featured-grid">
                            {catItems.map((it) => {
                              const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                              const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, cat, nowDate);
                              const displayOnly = isDisplayOnlyItem(it);
                              const unavailable = !displayOnly && !itemEval.available;
                              const formattedBeforePrice = priceInfo.rawBefore > 0 ? fmtMoney(priceInfo.rawBefore) : '';
                              return (
                                <article
                                  key={it.id}
                                  className={`pm-t6-featured-card ${unavailable ? 'unavailable is-unavailable' : ''}`}
                                  onClick={() => openProductModal(it)}
                                >
                                  <div className="pm-t6-featured-img">
                                    {it.img ? (
                                      <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                                    ) : (
                                      <div className="pm-t6-img-fallback">
                                        <Utensils size={28} />
                                      </div>
                                    )}
                                    {unavailable && (
                                      <>
                                        <div className="pm-unavailable-wash" aria-hidden="true" />
                                        <span className="pm-unavailable-pill is-compact">غير متوفر</span>
                                      </>
                                    )}
                                  </div>
                                  <h3 className="pm-t6-featured-title">{it.n}</h3>
                                  <div className="pm-t6-price-line">
                                    <span className="pm-t6-price tabular-nums">{priceInfo.main}</span>
                                    {priceInfo.rawBefore > 0 && (
                                      <span className="pm-t6-old-price tabular-nums">{formattedBeforePrice}</span>
                                    )}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        );
                      }

                      if (t6ViewMode === 'large') {
                        return (
                          <div className="pm-t6-large-stack">
                            {catItems.map((it) => {
                              const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                              const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, cat, nowDate);
                              const displayOnly = isDisplayOnlyItem(it);
                              const unavailable = !displayOnly && !itemEval.available;
                              const formattedBeforePrice = priceInfo.rawBefore > 0 ? fmtMoney(priceInfo.rawBefore) : '';
                              return (
                                <article
                                  key={it.id}
                                  className={`pm-t6-large-card ${unavailable ? 'unavailable is-unavailable' : ''}`}
                                  onClick={() => openProductModal(it)}
                                >
                                  <div className="pm-t6-large-img">
                                    {it.img ? (
                                      <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                                    ) : (
                                      <div className="pm-t6-img-fallback">
                                        <Utensils size={34} />
                                      </div>
                                    )}
                                    {unavailable && (
                                      <>
                                        <div className="pm-unavailable-wash" aria-hidden="true" />
                                        <span className="pm-unavailable-pill is-compact">غير متوفر</span>
                                      </>
                                    )}
                                  </div>
                                  <div className="pm-t6-large-head">
                                    <h3 className="pm-t6-large-title">{it.n}</h3>
                                    <div className="pm-t6-price-line">
                                      <span className="pm-t6-price tabular-nums">{priceInfo.main}</span>
                                      {priceInfo.rawBefore > 0 && (
                                        <span className="pm-t6-old-price tabular-nums">{formattedBeforePrice}</span>
                                      )}
                                    </div>
                                  </div>
                                  {it.d && <p className="pm-t6-large-desc">{it.d}</p>}
                                </article>
                              );
                            })}
                          </div>
                        );
                      }

                      return (
                        <div className="pm-t6-list-stack">
                          {catItems.map((it) => {
                            const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                            const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, cat, nowDate);
                            const displayOnly = isDisplayOnlyItem(it);
                            const unavailable = !displayOnly && !itemEval.available;
                            const formattedBeforePrice = priceInfo.rawBefore > 0 ? fmtMoney(priceInfo.rawBefore) : '';
                            return (
                              <article
                                key={it.id}
                                className={`pm-t6-list-row ${unavailable ? 'unavailable is-unavailable' : ''}`}
                                onClick={() => openProductModal(it)}
                              >
                                <div className="pm-t6-list-info">
                                  <h3 className="pm-t6-list-title">{it.n}</h3>
                                  {it.d && <p className="pm-t6-list-desc">{it.d}</p>}
                                  <div className="pm-t6-price-line">
                                    <span className="pm-t6-price tabular-nums">{priceInfo.main}</span>
                                    {priceInfo.rawBefore > 0 && (
                                      <span className="pm-t6-old-price tabular-nums">{formattedBeforePrice}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="pm-t6-list-img">
                                  {it.img ? (
                                    <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="pm-t6-img-fallback">
                                      <Utensils size={24} />
                                    </div>
                                  )}
                                  {unavailable && (
                                    <>
                                      <div className="pm-unavailable-wash" aria-hidden="true" />
                                      <span className="pm-unavailable-pill is-compact">غير متوفر</span>
                                    </>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      );
                    })()
                  ) : (
                    <>
                      {/* 1) CLASSIC HORIZONTAL LIST LAYOUT (or Toters Clean Divider List) */}
                      {layout === 'list' && (
                        <div
                          className={isToters ? 'pm-toters-list' : undefined}
                          style={isToters ? undefined : { display: 'flex', flexDirection: 'column', gap: '10px' }}
                        >
                          {catItems.map((it) => {
                            const qty = getItemCartQty(it.id);
                            const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                            const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, cat, nowDate);
                            const displayOnly = isDisplayOnlyItem(it);
                            const unavailable = !displayOnly && !itemEval.available;
                            const showUnavailableBadge =
                              unavailable || (!itemEval.available && !itemEval.outOfSchedule);
                            const formattedBeforePrice = priceInfo.rawBefore > 0 ? fmtMoney(priceInfo.rawBefore) : '';

                            if (isToters) {
                              return (
                                <MemoTotersItemRow
                                  key={it.id}
                                  it={it}
                                  qty={qty}
                                  priceMain={priceInfo.main}
                                  priceRawBefore={priceInfo.rawBefore}
                                  formattedBeforePrice={formattedBeforePrice}
                                  unavailable={unavailable}
                                  showUnavailableBadge={showUnavailableBadge}
                                  displayOnly={displayOnly}
                                  isPopular={popularItemIds.has(it.id)}
                                  accentText={accentText}
                                  brandColor={brandColor}
                                  brandInk={brandInk}
                                  onOpenProduct={openProductModal}
                                  onQuickAdd={quickAddOrOpenModal}
                                  onDecrement={decrementItemFromCart}
                                />
                              );
                            }

                            return (
                              <MemoListItemRow
                                key={it.id}
                                it={it}
                                qty={qty}
                                priceMain={priceInfo.main}
                                priceRawBefore={priceInfo.rawBefore}
                                formattedBeforePrice={formattedBeforePrice}
                                unavailable={unavailable}
                                showUnavailableBadge={showUnavailableBadge}
                                displayOnly={displayOnly}
                                isPopular={false}
                                accentText={accentText}
                                brandColor={brandColor}
                                brandInk={brandInk}
                                onOpenProduct={openProductModal}
                                onQuickAdd={quickAddOrOpenModal}
                                onDecrement={decrementItemFromCart}
                              />
                            );
                          })}
                        </div>
                      )}

                      {/* 2, 3 & 4) SYMMETRICAL HORIZONTAL-IMAGE GRID LAYOUTS: 4 COLS (grid4), 3 COLS (grid3), 2 COLS (grid) */}
                      {(layout === 'grid4' || layout === 'grid3' || layout === 'grid') && (
                        <div
                          className={`pm-menu-grid ${
                            layout === 'grid4'
                              ? 'pm-cols-4'
                              : layout === 'grid3'
                              ? 'pm-cols-3'
                              : 'pm-cols-2'
                          }`}
                        >
                          {catItems.map((it) => {
                            const qty = getItemCartQty(it.id);
                            const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                            const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, cat, nowDate);
                            const displayOnly = isDisplayOnlyItem(it);
                            const unavailable = !displayOnly && !itemEval.available;
                            const showUnavailableBadge =
                              unavailable || (!itemEval.available && !itemEval.outOfSchedule);
                            const formattedBeforePrice = priceInfo.rawBefore > 0 ? fmtMoney(priceInfo.rawBefore) : '';

                            return (
                              <MemoGridItemCard
                                key={it.id}
                                it={it}
                                qty={qty}
                                priceMain={priceInfo.main}
                                priceRawBefore={priceInfo.rawBefore}
                                formattedBeforePrice={formattedBeforePrice}
                                unavailable={unavailable}
                                showUnavailableBadge={showUnavailableBadge}
                                displayOnly={displayOnly}
                                isPopular={false}
                                accentText={accentText}
                                brandColor={brandColor}
                                brandInk={brandInk}
                                layout={layout}
                                onOpenProduct={openProductModal}
                                onQuickAdd={quickAddOrOpenModal}
                                onDecrement={decrementItemFromCart}
                              />
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </section>
              );
            })
          )}
        </div>

        {/* Customer Reviews Section (Addon-controlled) */}
        {reviewsShowOnMenu && (
          <section className="pm-addon-card pm-reviews-card" style={{ marginTop: '20px', padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--pm-ink)' }}>
                ⭐ تقييمات الزبائن ({restaurantReviews.length})
              </h3>
              {reviewsAllowSubmit && (
                <button
                  type="button"
                  className="pm-shape-btn"
                  onClick={() => setRateModalOpen(true)}
                  style={{
                    background: brandColor,
                    color: brandInk,
                    padding: '6px 11px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  أضف تقييمك
                </button>
              )}
            </div>
            {restaurantReviews.length === 0 ? (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--pm-muted)' }}>
                كن أول من يشارك تجربته ورأيه في أطباقنا!
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(restaurantReviews as RestaurantReview[]).slice(0, 5).map((rev: RestaurantReview) => (
                  <div key={rev.id} className="pm-review-item" style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <b style={{ fontSize: '13px', color: 'var(--pm-ink)' }}>{rev.name}</b>
                      <span style={{ color: '#fbbf24', fontSize: '12px' }}>
                        {'★'.repeat(rev.rate || rev.stars || 5)}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--pm-muted)' }}>{rev.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* THEME 6: Nutritional Information Card Footer */}
        {isTheme6 && (
          <section className="pm-t6-nutrition-card" aria-label="معلومات غذائية">
            <h3 className="pm-t6-nutrition-title">معلومات غذائية</h3>
            <div className="pm-t6-nutrition-rows">
              <div className="pm-t6-nutrition-row">
                <span className="pm-t6-nutrition-icon" aria-hidden="true">
                  <Info size={18} strokeWidth={1.8} />
                </span>
                <p>قد تحتوي العناصر في هذه القائمة على جميع المواد المسببة للحساسية أو أي منها.</p>
              </div>
              <div className="pm-t6-nutrition-row">
                <span className="pm-t6-nutrition-icon" aria-hidden="true">
                  <Flame size={18} strokeWidth={1.8} />
                </span>
                <p>
                  يحتاج البالغون إلى متوسط 2000 سعرة حرارية يوميًا، وتختلف احتياجات السعرات الحرارية من شخص لآخر. يحتاج الأطفال الذين تتراوح أعمارهم بين 4 و13 عامًا إلى متوسط 1200-1500 سعرة حرارية يوميًا، وتختلف احتياجات السعرات من طفل لآخر.
                </p>
              </div>
              <div className="pm-t6-nutrition-row">
                <span className="pm-t6-nutrition-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 10h9v5a4.5 4.5 0 0 1-9 0v-5Z" />
                    <path d="M14 11h1.5a2 2 0 0 1 0 4H14" />
                    <path d="M19 6l-2 4h3l-2 4" />
                  </svg>
                </span>
                <p>تشير هذه العلامة إلى كمية الكافيين بالميليغرام لكل كوب. لا يجب أن يتجاوز استهلاك الكافيين للبالغين 400 ملغ يوميًا.</p>
              </div>
              <div className="pm-t6-nutrition-row">
                <span className="pm-t6-nutrition-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 5l10 10-4 4L5 9 9 5Z" />
                    <path d="M5 9l4-4" />
                    <circle cx="4" cy="14" r="0.7" fill="currentColor" />
                    <circle cx="6.5" cy="16.5" r="0.7" fill="currentColor" />
                    <circle cx="9" cy="14" r="0.7" fill="currentColor" />
                  </svg>
                </span>
                <p>
                  تشير هذه العلامة إلى أن العنصر الغذائي يحتوي على كمية من الملح أعلى من الكمية اليومية الموصى بها. لا يجب أن يتجاوز استهلاك الفرد من الملح 5 جرام يوميًا، وهو ما يعادل 2000 ملغ من الصوديوم.
                </p>
              </div>
              <div className="pm-t6-nutrition-row">
                <span className="pm-t6-nutrition-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="14" cy="5" r="2" />
                    <path d="M10 21l2-6 3-2 2 5" />
                    <path d="M7 13l3-3 4 1 3-2" />
                  </svg>
                </span>
                <p>تشير هذه العلامة إلى الوقت التقديري اللازم لحرق سعرات هذا العنصر.</p>
              </div>
            </div>
          </section>
        )}

        {/* Bottom Tax, Social Media & Platform Footer */}
        <footer
          style={{
            marginTop: '28px',
            paddingTop: '16px',
            borderTop: '1px solid var(--pm-line)',
            textAlign: 'center',
            fontSize: '12px',
            color: 'var(--pm-muted)',
          }}
        >
          {rest.social && Object.values(rest.social).some(Boolean) && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '12px',
              }}
            >
              {rest.social.instagram && (
                <a
                  href={rest.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-order-type-pill"
                  style={{ height: '32px', padding: '0 11px', fontSize: '11.5px', textDecoration: 'none' }}
                >
                  انستغرام
                </a>
              )}
              {rest.social.facebook && (
                <a
                  href={rest.social.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-order-type-pill"
                  style={{ height: '32px', padding: '0 11px', fontSize: '11.5px', textDecoration: 'none' }}
                >
                  فيسبوك
                </a>
              )}
              {rest.social.tiktok && (
                <a
                  href={rest.social.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-order-type-pill"
                  style={{ height: '32px', padding: '0 11px', fontSize: '11.5px', textDecoration: 'none' }}
                >
                  تيك توك
                </a>
              )}
              {rest.social.x && (
                <a
                  href={rest.social.x}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-order-type-pill"
                  style={{ height: '32px', padding: '0 11px', fontSize: '11.5px', textDecoration: 'none' }}
                >
                  منصة X
                </a>
              )}
              {rest.social.whatsapp && (
                <a
                  href={waLink(rest.social.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-order-type-pill"
                  style={{
                    height: '32px',
                    padding: '0 11px',
                    fontSize: '11.5px',
                    textDecoration: 'none',
                    background: 'rgba(16, 185, 129, 0.14)',
                    borderColor: 'rgba(16, 185, 129, 0.35)',
                    color: accentText,
                  }}
                >
                  واتساب
                </a>
              )}
            </div>
          )}

          {!isToters && rest.taxNote && <p style={{ margin: '0 0 10px' }}>{rest.taxNote}</p>}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>مدعوم بواسطة</span>
            <button
              type="button"
              onClick={() => navigateToMainSite('/', onNavigate, getSite())}
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                color: accentText,
                fontWeight: 800,
                cursor: 'pointer',
                font: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="الصفحة الرئيسية — Menu Plus"
            >
              <AppLogo size={22} />
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => navigateToMainSite('/signup', onNavigate, getSite())}
              style={{
                background: 'var(--pm-soft)',
                color: 'var(--pm-ink)',
                border: '1px solid var(--pm-line)',
                borderRadius: '99px',
                padding: '4px 11px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              امتلك منيو لمشروعك
            </button>
          </div>
        </footer>
      </div>

      {/* Floating Support / Spin Wheel Actions (when enabled) */}
      {(addons.spinWheelPromo?.enabled || addons.whatsappSupportFloat?.enabled) && !cartOpen && (
        <div className="pm-floating-actions">
          {addons.spinWheelPromo?.enabled && (
            <button
              type="button"
              className="pm-float-btn"
              onClick={() => setSpinModalOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                color: '#fff',
                padding: '10px 14px',
                fontWeight: 800,
                fontSize: '12.5px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{spinWonReward ? spinWonReward.label : 'جرّب حظك'}</span>
            </button>
          )}
          {addons.whatsappSupportFloat?.enabled && (rest.social?.whatsapp || rest.ph) && (
            <a
              className="pm-float-btn"
              href={waLink(
                rest.social?.whatsapp || rest.ph || '',
                addons.whatsappSupportFloat.prefillText ||
                  `مرحباً ${rest.n}، لدي استفسار`
              )}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#16a34a',
                color: '#fff',
                padding: '10px 14px',
                fontWeight: 800,
                fontSize: '12.5px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <MessageCircle size={16} />
              <span>{addons.whatsappSupportFloat.label || 'تواصل معنا'}</span>
            </a>
          )}
        </div>
      )}

      {/* Persistent Always-Floating Bottom Cart & Free Delivery Dock */}
      {!cartOpen && !isCatalogViewOnly && (
        <div className="pm-floating-dock">
          <div className="pm-dock-inner">
            {isToters && addons.loyaltyPoints?.enabled && (
              <div className="pm-toters-loyalty-bar">
                <span className="pm-toters-loyalty-bar-info">
                  <Gift size={16} style={{ color: accentText, flexShrink: 0 }} />
                  <span>
                    {totalCount > 0
                      ? `ستكسب +${earnedLoyaltyPoints} نقطة من طلبك`
                      : addons.loyaltyPoints.rewardNote || `اكسب ${addons.loyaltyPoints.pointsPerThousand || 1} نقطة لكل 1,000 ${currency}`}
                  </span>
                </span>
                <span className="pm-toters-loyalty-bar-badge tabular-nums">
                  {loyaltyBalance > 0 ? `رصيدك: ${loyaltyBalance} نقطة` : `${addons.loyaltyPoints.pointsPerThousand || 1} نقطة / 1,000`}
                </span>
              </div>
            )}

            {totalCount > 0 && freeDeliveryEnabled && freeDeliveryMin > 0 && orderType === 'delivery' && (
              <div className={`pm-fd-card ${qualifiesFreeDelivery ? 'qualifies' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={16} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: 600 }}>
                    {qualifiesFreeDelivery ? (
                      'طلبك مؤهل للتوصيل المجاني!'
                    ) : (
                      <>
                        أضف{' '}
                        <strong className="tabular-nums">
                          {fmtMoney(freeDeliveryRemaining)}
                        </strong>{' '}
                        للحصول على توصيل مجاني
                      </>
                    )}
                  </span>
                  <span className="tabular-nums" style={{ fontSize: '11px', fontWeight: 700 }}>
                    {freeDeliveryPct}%
                  </span>
                </div>
                <div className="pm-fd-bar">
                  <div className="pm-fd-fill" style={{ width: `${freeDeliveryPct}%` }} />
                </div>
              </div>
            )}

            <button
              type="button"
              className={`pm-cart-cta ${totalCount === 0 ? 'pm-cart-cta--empty' : ''}`}
              onClick={() => {
                setCheckoutTriedSubmit(false);
                setCheckoutStep('cart');
                setCartOpen(true);
              }}
            >
              <span className="pm-cart-cta-main">
                <span className="pm-cart-cta-label">سلة الطلبات</span>
                <span className="pm-cart-cta-icon" aria-hidden="true">
                  <ShoppingBag size={19} strokeWidth={2.15} />
                </span>
                {totalCount > 0 && (
                  <span className="pm-cart-cta-count tabular-nums">{totalCount}</span>
                )}
              </span>
              {totalCount > 0 && (
                <span className="pm-cart-cta-total tabular-nums">
                  {fmtMoney(subtotal)}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* THEME 1 Mobile Bottom Navigation Tabs */}
      {isTheme1 && !cartOpen && (
        <nav className="pm-t1-mobile-tabs" aria-label="التنقل السفلي">
          <div className="pm-t1-mobile-tabs-list">
            <button
              type="button"
              className="pm-t1-mobile-tab-btn active"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <Home size={22} strokeWidth={2.2} />
              <span>الرئيسية</span>
            </button>
            <button
              type="button"
              className="pm-t1-mobile-tab-btn"
              onClick={() => setCatsModalOpen(true)}
            >
              <LayoutGrid size={22} strokeWidth={1.8} />
              <span>الأصناف</span>
            </button>
            <button
              type="button"
              className="pm-t1-mobile-tab-btn"
              onClick={() => setAboutModalOpen(true)}
            >
              <Store size={22} strokeWidth={1.8} />
              <span>عنّا</span>
            </button>
            <button
              type="button"
              className="pm-t1-mobile-tab-btn"
              onClick={() => {
                if (!isCatalogViewOnly) openCartModal();
                else setWorkModalOpen(true);
              }}
            >
              {isCatalogViewOnly ? <Clock size={22} strokeWidth={1.8} /> : <ShoppingBag size={22} strokeWidth={1.8} />}
              <span>{isCatalogViewOnly ? 'الدوام' : 'السلة'}</span>
              {!isCatalogViewOnly && totalCount > 0 && (
                <span className="pm-t1-tab-badge tabular-nums">{totalCount}</span>
              )}
            </button>
          </div>
        </nav>
      )}

      {/* THEME 2 Floating Pill Bottom Dock */}
      {isTheme2 && !cartOpen && (
        <div className="pm-t2-pill-dock-wrap">
          <div className="pm-t2-pill-dock">
            <button
              type="button"
              className="pm-t2-dock-btn active"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <Home size={16} />
              <span>الرئيسية</span>
            </button>
            <button
              type="button"
              className="pm-t2-dock-btn"
              onClick={() => setCatsModalOpen(true)}
            >
              <LayoutGrid size={16} />
              <span>الأصناف</span>
            </button>
            <button
              type="button"
              className="pm-t2-dock-btn"
              onClick={() => setAboutModalOpen(true)}
            >
              <Info size={16} />
              <span>عنّا</span>
            </button>
            {!isCatalogViewOnly && (
              <button
                type="button"
                className={`pm-t2-dock-btn ${totalCount > 0 ? 'cart-active' : ''}`}
                onClick={openCartModal}
              >
                <ShoppingBag size={16} />
                <span>السلة</span>
                {totalCount > 0 && (
                  <span className="pm-t2-dock-cart-badge tabular-nums">{totalCount}</span>
                )}
              </button>
            )}
          </div>
        </div>
      )}
        </>
      )}

      {/* ================================================================
          MODAL 1: PRODUCT DETAIL SHEET (Sizes, Choices, Extras, Allergens)
          ================================================================ */}
      {activeProduct && (
        <div className="pm-modal-backdrop" onClick={() => setActiveProduct(null)}>
          <motion.div
            className={`pm-sheet ${isToters ? 'pm-toters-product-sheet' : ''}`}
            onClick={(e) => e.stopPropagation()}
            {...dashModalMotion(prefersReducedMotion)}
          >
            <div style={{ position: 'relative' }}>
              {activeProduct.img ? (
                <img
                  src={activeProduct.img}
                  alt={activeProduct.n}
                  className="pm-product-modal-img"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  style={{
                    width: '100%',
                    aspectRatio: isToters ? '16 / 11' : '16 / 10',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '150px',
                    background: 'var(--pm-soft)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--pm-muted)',
                  }}
                >
                  {isEstore ? <ShoppingBag size={40} /> : <Utensils size={40} />}
                </div>
              )}

              <button
                type="button"
                onClick={() => setActiveProduct(null)}
                aria-label="إغلاق"
                style={{
                  position: 'absolute',
                  top: '14px',
                  insetInlineEnd: '14px',
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: 'var(--pm-card)',
                  border: '1px solid var(--pm-line)',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: 'var(--pm-ink)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className={isToters ? 'pm-toters-sheet-body' : undefined} style={isToters ? undefined : { padding: '16px 18px 22px' }}>
              {isToters && popularItemIds.has(activeProduct.id) && (
                <div style={{ marginBottom: '6px' }}>
                  <span className="pm-toters-popular-pill">
                    <Flame size={12} fill="#f97316" color="#f97316" /> الأكثر طلباً
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <h2 style={{ margin: 0, fontSize: isToters ? '21px' : '20px', fontWeight: 900, color: 'var(--pm-ink)' }}>{activeProduct.n}</h2>
                {!isToters &&
                  activeProduct.badges
                    ?.filter((b) => {
                      const txt = String(b.text || '').trim();
                      if (/^(الأكثر|الاكثر)\s*طلب/i.test(txt)) {
                        return popularItemIds.has(activeProduct.id);
                      }
                      return true;
                    })
                    .map((b, i) => renderBadge(b, i))}
              </div>

              {((!isEstore && activeProduct.prepTime) || activeProduct.calories || selectedSize?.cal) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '10px', fontSize: '12.5px', color: 'var(--pm-muted)' }}>
                  {!isEstore && activeProduct.prepTime && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={14} /> {activeProduct.prepTime}
                    </span>
                  )}
                  {(selectedSize?.cal || activeProduct.calories) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Flame size={14} style={{ color: '#fb923c' }} /> {selectedSize?.cal || activeProduct.calories}
                    </span>
                  )}
                </div>
              )}

              {activeProduct.d && (
                <p style={{ margin: '0 0 12px', fontSize: '13.5px', color: 'var(--pm-muted)', lineHeight: 1.65 }}>
                  {activeProduct.d}
                </p>
              )}

              {isToters && (
                <div
                  className="tabular-nums"
                  style={{
                    fontSize: '16px',
                    fontWeight: 900,
                    color: 'var(--pm-ink)',
                    paddingBottom: '12px',
                    marginBottom: '12px',
                    borderBottom: '1px solid var(--pm-line)',
                  }}
                >
                  {formatNumber(modalBaseDiscounted)} {currency}
                </div>
              )}

              {/* Allergens / Product Specs & Warranty Accordion */}
              {activeProduct.allergens && (
                <div
                  style={{
                    border: isEstore ? '1px solid rgba(15, 118, 110, 0.25)' : '1px solid rgba(251, 191, 36, 0.35)',
                    background: isEstore ? 'rgba(15, 118, 110, 0.08)' : 'rgba(245, 158, 11, 0.12)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    marginBottom: '14px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setAllergensOpen((p) => !p)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'none',
                      border: 0,
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: isEstore ? '#0f766e' : isLightMenu ? '#92400e' : '#FCD34D',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {isEstore ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />}
                      <span>{isEstore ? 'مواصفات وضمان المنتج' : 'قد يحتوي على مسببات حساسية'}</span>
                    </span>
                    <ChevronDown
                      size={15}
                      style={{ transform: allergensOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                    />
                  </button>
                  {allergensOpen && (
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontSize: '12px',
                        color: isEstore ? '#001c38' : isLightMenu ? '#78350f' : '#FDE68A',
                        lineHeight: 1.55,
                      }}
                    >
                      {activeProduct.allergens}
                    </p>
                  )}
                </div>
              )}

              {/* Sizes */}
              {(() => {
                const validSizes = (activeProduct.sizes || [])
                  .map((s) => ({ ...s, n: getSizeLabel(s), p: getOptionPrice(s) }))
                  .filter((s) => s.n);
                if (validSizes.length === 0) return null;
                const modalDisplayOnly = isDisplayOnlyItem(activeProduct);
                return (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                        {isEstore ? 'السعة / الخيار' : 'الحجم'}
                      </h4>
                      {!modalDisplayOnly && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            color: accentText,
                            background: isToters ? 'var(--pm-soft)' : 'transparent',
                            padding: isToters ? '3px 8px' : 0,
                            borderRadius: '8px',
                          }}
                        >
                          مطلوب
                        </span>
                      )}
                    </div>
                    {validSizes.map((sz, idx) => {
                      const isSel = !modalDisplayOnly && (selectedSize ? getSizeLabel(selectedSize) === sz.n : false);
                      const discountedSzPrice = applyMenuPriceDiscount(sz.p, activeMenuDiscount);
                      return (
                        <div
                          key={`${sz.n}_${idx}`}
                          className={`pm-option-row ${isSel ? 'selected' : ''}`}
                          style={modalDisplayOnly ? { cursor: 'default' } : undefined}
                          onClick={modalDisplayOnly ? undefined : () => setSelectedSize(sz)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            {!modalDisplayOnly && (
                              <input type="radio" name="pm_size" checked={isSel} readOnly style={{ accentColor: accentText }} />
                            )}
                            <div>
                              <b style={{ fontSize: '13.5px', color: 'var(--pm-ink)' }}>{sz.n}</b>
                              {sz.cal && (
                                <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--pm-muted)' }}>
                                  {sz.cal}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: 'end', flexShrink: 0 }}>
                            <b className="tabular-nums" style={{ color: accentText, fontSize: '14px', fontWeight: 900 }}>
                              {formatNumber(discountedSzPrice)} {currency}
                            </b>
                            {discountedSzPrice < sz.p && (
                              <span className="tabular-nums" style={{ display: 'block', fontSize: '11px', color: 'var(--pm-muted)', textDecoration: 'line-through' }}>
                                {formatNumber(sz.p)} {currency}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Choices (Free options — supports both string[] and { n }[]) */}
              {(() => {
                if (isDisplayOnlyItem(activeProduct)) return null;
                const validChoices = (activeProduct.choices || [])
                  .map((c) => getChoiceLabel(c))
                  .filter(Boolean);
                if (validChoices.length === 0) return null;
                const max = Math.max(1, Number(activeProduct.maxChoices) || 1);
                return (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                        الاختيارات <span style={{ color: accentText, fontSize: '12px', fontWeight: 700 }}>(مجاني)</span>
                      </h4>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--pm-muted)',
                          fontWeight: 700,
                          background: isToters ? 'var(--pm-soft)' : 'transparent',
                          padding: isToters ? '3px 8px' : 0,
                          borderRadius: '8px',
                        }}
                      >
                        {max === 1 ? 'خيار واحد مسموح' : `${max} خيارات مسموح لك`}
                      </span>
                    </div>
                    {validChoices.map((label, idx) => {
                      const checked = selectedChoices.includes(label);
                      return (
                        <div
                          key={`${label}_${idx}`}
                          className={`pm-option-row ${checked ? 'selected' : ''}`}
                          onClick={() => {
                            if (checked) {
                              setSelectedChoices((prev) => prev.filter((x) => x !== label));
                            } else if (max === 1) {
                              setSelectedChoices([label]);
                            } else if (selectedChoices.length < max) {
                              setSelectedChoices((prev) => [...prev, label]);
                            } else {
                              showToast(`يمكنك اختيار ${max} كحد أقصى`);
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <input
                              type={max === 1 ? 'radio' : 'checkbox'}
                              name={max === 1 ? 'pm_choice_single' : undefined}
                              checked={checked}
                              readOnly
                              style={{ accentColor: accentText }}
                            />
                            <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--pm-ink)' }}>{label}</span>
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: accentText, flexShrink: 0 }}>
                            مجاني
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Extras (Paid optional addons) */}
              {(() => {
                const validExtras = (activeProduct.extras || [])
                  .map((ex) => ({ ...ex, n: getExtraLabel(ex), p: getOptionPrice(ex) }))
                  .filter((ex) => ex.n);
                if (validExtras.length === 0) return null;
                const modalDisplayOnly = isDisplayOnlyItem(activeProduct);
                return (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                        {isEstore ? 'ملحقات وإضافات' : 'إضافات'}
                      </h4>
                      {!modalDisplayOnly && (isToters || isEstore) && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--pm-muted)',
                            fontWeight: 700,
                            background: 'var(--pm-soft)',
                            padding: '3px 8px',
                            borderRadius: '8px',
                          }}
                        >
                          اختياري
                        </span>
                      )}
                    </div>
                    {validExtras.map((ex, idx) => {
                      const checked = !modalDisplayOnly && selectedExtras.some((e) => getExtraLabel(e) === ex.n);
                      return (
                        <div
                          key={`${ex.n}_${idx}`}
                          className={`pm-option-row ${checked ? 'selected' : ''}`}
                          style={modalDisplayOnly ? { cursor: 'default' } : undefined}
                          onClick={
                            modalDisplayOnly
                              ? undefined
                              : () => {
                                  setSelectedExtras((prev) =>
                                    checked ? prev.filter((e) => getExtraLabel(e) !== ex.n) : [...prev, ex]
                                  );
                                }
                          }
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            {!modalDisplayOnly && (
                              <input type="checkbox" checked={checked} readOnly style={{ accentColor: accentText }} />
                            )}
                            <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--pm-ink)' }}>{ex.n}</span>
                          </div>
                          <span
                            className="tabular-nums"
                            style={{ fontSize: '13.5px', fontWeight: 900, color: accentText, flexShrink: 0 }}
                          >
                            {ex.p > 0 ? `+ ${formatNumber(ex.p)} ${currency}` : 'مجاني'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Special Instructions Box */}
              {!isDisplayOnlyItem(activeProduct) && (isToters || isEstore) && (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '14.5px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                    {isEstore ? 'ملاحظات الطلب أو التغليف' : 'أي تعليمات خاصة؟'}
                  </h4>
                  <textarea
                    rows={2}
                    value={modalItemNote}
                    onChange={(e) => setModalItemNote(e.target.value)}
                    placeholder={isEstore ? 'أي ملاحظات أو طلب تغليف هدية؟' : 'اكتبها هنا'}
                    style={{
                      width: '100%',
                      resize: 'none',
                      fontSize: '13.5px',
                      fontFamily: 'inherit',
                      borderRadius: '14px',
                      padding: '10px 14px',
                    }}
                  />
                </div>
              )}

              {!isToters && rest.taxNote && (
                <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--pm-muted)', textAlign: 'center' }}>
                  {rest.taxNote}
                </p>
              )}

              {/* Quantity & Add to Cart Footer */}
              {!isDisplayOnlyItem(activeProduct) && (
                <div
                  className={isToters ? 'pm-toters-sheet-footer' : undefined}
                  style={
                    isToters
                      ? undefined
                      : {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          paddingTop: '12px',
                          borderTop: '1px solid var(--pm-line)',
                        }
                  }
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '10px',
                      border: '1px solid var(--pm-line)',
                      borderRadius: '14px',
                      padding: '6px 10px',
                      background: 'var(--pm-soft)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '8px',
                        border: '1px solid var(--pm-line)',
                        background: 'var(--pm-card)',
                        cursor: 'pointer',
                        display: 'grid',
                        placeItems: 'center',
                        color: 'var(--pm-ink)',
                      }}
                    >
                      <Minus size={15} />
                    </button>
                    <b className="tabular-nums" style={{ minWidth: '20px', textAlign: 'center', color: 'var(--pm-ink)' }}>
                      {modalQty}
                    </b>
                    <button
                      type="button"
                      onClick={() => setModalQty((q) => q + 1)}
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '8px',
                        border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                        background: brandColor,
                        color: brandInk,
                        cursor: 'pointer',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <Plus size={15} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddConfiguredToCart}
                    style={{
                      flex: 1,
                      border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                      borderRadius: '14px',
                      background: brandColor,
                      color: brandInk,
                      padding: '12px 15px',
                      fontSize: '14.5px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{isToters ? 'إضافة' : `إضافة ${modalQty} للسلة`}</span>
                    <span className="tabular-nums">
                      {formatNumber(modalUnitPrice * modalQty)} {currency}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* ================================================================
          MODAL 2: MULTI-STEP CART & CHECKOUT DRAWER (Sticky "متابعة الطلب")
          ================================================================ */}
      {cartOpen && !isCatalogViewOnly && (
        <div className="pm-modal-backdrop" onClick={() => setCartOpen(false)}>
          <motion.div
            className="pm-sheet pm-cart-sheet"
            onClick={(e) => e.stopPropagation()}
            {...dashModalMotion(prefersReducedMotion)}
          >
            {/* Fixed Top Header */}
            <div className="pm-cart-header">
              <div className="pm-cart-header-title">
                {checkoutStep === 'details' && (
                  <button
                    type="button"
                    aria-label="الرجوع إلى السلة"
                    className="pm-cart-icon-circle"
                    onClick={() => {
                      setCheckoutTriedSubmit(false);
                      setCheckoutStep('cart');
                    }}
                  >
                    <ChevronLeft size={18} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                )}
                <h2 style={{ margin: 0, fontSize: '17.5px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                  {checkoutStep === 'done'
                    ? 'تم تأكيد طلبك'
                    : checkoutStep === 'details'
                    ? 'إكمال بيانات الطلب'
                    : totalCount > 0
                    ? `سلة الطلبات (${totalCount})`
                    : 'سلة الطلبات'}
                </h2>
              </div>
              <button
                type="button"
                aria-label="إغلاق السلة"
                className="pm-cart-icon-circle"
                onClick={() => setCartOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {checkoutStep === 'done' && lastOrderSummary ? (
              <div className="pm-cart-scroll" style={{ padding: '20px 18px 26px', textAlign: 'center' }}>
                <div
                  style={{
                    width: '62px',
                    height: '62px',
                    borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.16)',
                    border: '1px solid rgba(52, 211, 153, 0.35)',
                    color: '#10B981',
                    margin: '0 auto 12px',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Check size={30} />
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 800, color: 'var(--pm-ink)' }}>
                  تم إرسال طلبك #{lastOrderSummary.orderSeq || lastOrderSummary.id.slice(-5)} بنجاح!
                </h3>
                <p style={{ margin: '0 0 18px', fontSize: '13.5px', color: 'var(--pm-muted)', lineHeight: 1.55 }}>
                  {lastOrderSummary.unlistedArea
                    ? 'تم تسجيل طلبك، يرجى التواصل مع الكاشير عبر الواتساب الآن للتحقق من التوصيل لمنطقتك وتحديد سعر التوصيل.'
                    : lastOrderSummary.channel === 'telegram'
                    ? 'تم تسجيل طلبك وإرساله مباشرة إلى المتجر وتيليجرام بنجاح.'
                    : lastOrderSummary.channel === 'app' || !lastOrderSummary.waUrl
                    ? 'تم تسجيل طلبك وإرساله مباشرة إلى لوحة تحكم المتجر بنجاح.'
                    : `تم تسجيل طلبك في لوحة تحكم ${isEstore ? 'المتجر' : 'المطعم'}، ويمكنك إعادة فتح رسالة الواتساب في أي وقت.`}
                </p>

                <div
                  style={{
                    background: 'var(--pm-soft)',
                    border: '1px solid var(--pm-line)',
                    borderRadius: '14px',
                    padding: '12px',
                    textAlign: 'start',
                    marginBottom: '16px',
                    fontSize: '13px',
                    color: 'var(--pm-ink)',
                  }}
                >
                  {lastOrderSummary.items.map((x, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span>
                        {x.n} {x.size ? `(${x.size})` : ''} × {x.q}
                      </span>
                      <b className="tabular-nums" style={{ color: 'var(--pm-ink)' }}>
                        {formatNumber(x.q * x.p)} {currency}
                      </b>
                    </div>
                  ))}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingTop: '8px',
                      marginTop: '6px',
                      borderTop: '1px dashed var(--pm-line)',
                      fontWeight: 900,
                      color: accentText,
                    }}
                  >
                    <span>{lastOrderSummary.unlistedArea ? 'إجمالي الطلبات (قبل التوصيل)' : 'الإجمالي النهائي'}</span>
                    <span className="tabular-nums">
                      {formatNumber(lastOrderSummary.total)} {currency}
                    </span>
                  </div>
                </div>

                {lastOrderSummary.waUrl &&
                  ((lastOrderSummary.channel !== 'telegram' && lastOrderSummary.channel !== 'app') ||
                    lastOrderSummary.unlistedArea) && (
                  <a
                    href={lastOrderSummary.waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      minHeight: '48px',
                      background: '#16a34a',
                      color: '#fff',
                      borderRadius: '14px',
                      padding: '13px 16px',
                      fontWeight: 800,
                      fontSize: '14.5px',
                      marginBottom: '10px',
                      textDecoration: 'none',
                    }}
                  >
                    <MessageCircle size={19} />
                    <span>
                      {lastOrderSummary.unlistedArea
                        ? 'تواصل مع الكاشير عبر الواتساب لتحديد التوصيل'
                        : 'فتح محادثة الواتساب'}
                    </span>
                  </a>
                )}

                {addons.curbsidePickupCar?.enabled && orderType === 'pickup' && addons.curbsidePickupCar.allowArrivedPing !== false && (rest.ph || rest.social?.whatsapp) && (
                  <a
                    href={waLink(
                      rest.ph || rest.social?.whatsapp || '',
                      `🚗 تنبيه وصول للاستلام من السيارة\nرقم الطلب: #${lastOrderSummary.orderSeq || lastOrderSummary.id.slice(-5)}\n${curbsideCarInfo.trim() ? `بيانات السيارة: ${curbsideCarInfo.trim()}\n` : ''}أنا الآن أمام المطعم لاستلام طلبي.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      background: '#f59e0b',
                      color: '#0f172a',
                      borderRadius: '14px',
                      padding: '13px 16px',
                      fontWeight: 900,
                      fontSize: '15px',
                      marginBottom: '10px',
                      textDecoration: 'none',
                    }}
                  >
                    <Car size={19} />
                    <span>{isEstore ? 'وصلت أمام المتجر 🚗' : 'وصلت أمام المطعم 🚗'}</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  style={{
                    width: '100%',
                    background: 'var(--pm-soft)',
                    color: 'var(--pm-ink)',
                    border: '1px solid var(--pm-line)',
                    borderRadius: '12px',
                    padding: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isEstore ? 'العودة للمتجر' : 'العودة لقائمة الطعام'}
                </button>
              </div>
            ) : cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 18px', color: 'var(--pm-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <ShoppingBag size={40} style={{ opacity: 0.55 }} />
                <p style={{ margin: 0, fontWeight: 800, fontSize: '15px', color: 'var(--pm-ink)' }}>سلتك فارغة حالياً</p>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--pm-muted)' }}>
                  {isEstore
                    ? 'أضف منتجاتك المفضلة من المتجر وسنحتفظ بها هنا أثناء تصفحك.'
                    : 'أضف أطباقك المفضلة من المنيو وسنحتفظ بها هنا أثناء تصفحك.'}
                </p>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  style={{
                    marginTop: '4px',
                    padding: '10px 22px',
                    borderRadius: '12px',
                    border: 'none',
                    background: brandColor,
                    color: brandInk,
                    fontSize: '13.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {isEstore ? 'تصفح المتجر' : 'تصفح المنيو'}
                </button>
              </div>
            ) : checkoutStep === 'cart' ? (
              <>
                {/* Scrollable Cart Body */}
                <div className="pm-cart-scroll">

                  {isToters && addons.loyaltyPoints?.enabled && (
                    <div className="pm-toters-cart-loyalty-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <Gift size={17} style={{ color: accentText, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <b style={{ display: 'block', fontSize: '13px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                            ستكسب +{earnedLoyaltyPoints} نقطة من هذا الطلب
                          </b>
                          {addons.loyaltyPoints.rewardNote && (
                            <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--pm-muted)' }}>
                              {addons.loyaltyPoints.rewardNote}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: '12px',
                          fontWeight: 900,
                          color: accentText,
                          flexShrink: 0,
                        }}
                      >
                        رصيدك: {loyaltyBalance}
                      </span>
                    </div>
                  )}

                  {/* Cart Line Items with Notes */}
                  <div
                    style={{
                      marginBottom: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: isToters ? '0' : '10px',
                    }}
                  >
                    {cart.map((line) =>
                      isToters ? (
                        <div key={line.key} className="pm-toters-cart-row">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                              <div className="pm-toters-cart-thumb">
                                {line.img ? (
                                  <img src={line.img} alt={line.name} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                                ) : isEstore ? (
                                  <ShoppingBag size={18} style={{ color: 'var(--pm-muted)' }} />
                                ) : (
                                  <Utensils size={18} style={{ color: 'var(--pm-muted)' }} />
                                )}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <b style={{ fontSize: '14px', fontWeight: 800, color: 'var(--pm-ink)', display: 'block' }}>
                                  {line.name}
                                </b>
                                {(line.size || line.choices.length > 0 || line.extras.length > 0) && (
                                  <div style={{ fontSize: '11.5px', color: 'var(--pm-muted)', marginTop: '2px' }}>
                                    {[line.size, ...line.choices, ...line.extras].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                                <div className="tabular-nums" style={{ fontSize: '13.5px', fontWeight: 900, color: 'var(--pm-ink)', marginTop: '3px' }}>
                                  {formatNumber(line.unitPrice * line.qty)} {currency}
                                </div>
                              </div>
                            </div>

                            <div className="pm-toters-stepper">
                              <button
                                type="button"
                                onClick={() => updateCartLineQty(line.key, 1)}
                                aria-label="زيادة الكمية"
                              >
                                <Plus size={14} strokeWidth={2.5} />
                              </button>
                              <b className="tabular-nums">{line.qty}</b>
                              <button
                                type="button"
                                onClick={() => updateCartLineQty(line.key, -1)}
                                aria-label={line.qty <= 1 ? 'حذف الصنف' : 'إنقاص الكمية'}
                              >
                                {line.qty <= 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={line.key}
                          style={{
                            background: 'var(--pm-soft)',
                            border: '1px solid var(--pm-line)',
                            borderRadius: '14px',
                            padding: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '10px',
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <b style={{ fontSize: '14.5px', color: 'var(--pm-ink)', display: 'block' }}>{line.name}</b>
                              {(line.size || line.choices.length > 0 || line.extras.length > 0) && (
                                <div style={{ fontSize: '11.5px', color: 'var(--pm-muted)', marginTop: '2px' }}>
                                  {[line.size, ...line.choices, ...line.extras].filter(Boolean).join(' · ')}
                                </div>
                              )}
                              <div className="tabular-nums" style={{ fontSize: '14.5px', fontWeight: 900, color: accentText, marginTop: '4px' }}>
                                {formatNumber(line.unitPrice * line.qty)} {currency}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => updateCartLineQty(line.key, -1)}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '8px',
                                  border: '1px solid var(--pm-line)',
                                  background: 'var(--pm-card)',
                                  color: 'var(--pm-ink)',
                                  fontWeight: 800,
                                  fontSize: '16px',
                                  cursor: 'pointer',
                                }}
                              >
                                -
                              </button>
                              <b className="tabular-nums" style={{ minWidth: '22px', textAlign: 'center', fontSize: '14px', color: 'var(--pm-ink)' }}>
                                {line.qty}
                              </b>
                              <button
                                type="button"
                                onClick={() => updateCartLineQty(line.key, 1)}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '8px',
                                  border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                                  background: brandColor,
                                  color: brandInk,
                                  fontWeight: 800,
                                  fontSize: '16px',
                                  cursor: 'pointer',
                                }}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {/* Cart Upsell Suggestions (Inside Cart) */}
                  {addons.cartUpsell?.enabled && (() => {
                    const inCartIds = new Set(cart.map((l) => l.itemId));
                    const maxItems = Math.max(1, Number(addons.cartUpsell.maxItems) || 4);
                    const suggestions = allItems
                      .filter(
                        (it) =>
                          !inCartIds.has(it.id) &&
                          !isDisplayOnlyItem(it) &&
                          itemEvalMap.get(it.id)?.available !== false
                      )
                      .slice(0, maxItems);
                    if (suggestions.length === 0) return null;
                    return (
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--pm-ink)', marginBottom: '8px' }}>
                          {addons.cartUpsell.title || 'أكمل وجبتك بهذه الإضافات اللذيذة'}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                          {suggestions.map((sug) => {
                            const sp = getPriceDisplay(sug, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                            return (
                              <div
                                key={sug.id}
                                style={{
                                  minWidth: '135px',
                                  background: 'var(--pm-soft)',
                                  border: '1px solid var(--pm-line)',
                                  borderRadius: '12px',
                                  padding: '8px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px',
                                  flexShrink: 0,
                                }}
                              >
                                {sug.img && (
                                  <img
                                    src={sug.img}
                                    alt={sug.n}
                                    loading="lazy"
                                    decoding="async"
                                    referrerPolicy="no-referrer"
                                    style={{ width: '100%', height: '64px', objectFit: 'cover', borderRadius: '8px' }}
                                  />
                                )}
                                <b style={{ fontSize: '11.5px', color: 'var(--pm-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {sug.n}
                                </b>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                                  <span className="tabular-nums" style={{ fontSize: '11.5px', fontWeight: 900, color: accentText }}>
                                    {sp.main}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => quickAddOrOpenModal(sug, e)}
                                    style={{
                                      border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                                      borderRadius: '6px',
                                      background: brandColor,
                                      color: brandInk,
                                      width: '24px',
                                      height: '24px',
                                      display: 'grid',
                                      placeItems: 'center',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* General Order Note Bar */}
                  <div className="pm-cart-note-wrap">
                    <input
                      id="pm-order-general-note"
                      type="text"
                      className="pm-cart-note-input"
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      placeholder="اكتب ملاحظتك"
                      aria-label="اكتب ملاحظتك"
                    />
                  </div>

                  {/* Free Delivery Progress inside Cart */}
                  {addons.freeDeliveryProgress?.enabled && freeDeliveryMin > 0 && orderType === 'delivery' && (
                    <div
                      style={{
                        background: qualifiesFreeDelivery ? 'rgba(16, 185, 129, 0.14)' : 'var(--pm-soft)',
                        border: qualifiesFreeDelivery ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid var(--pm-line)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        marginBottom: '12px',
                        fontSize: '12.5px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '6px', color: qualifiesFreeDelivery ? accentText : 'var(--pm-ink)' }}>
                        <span>
                          {qualifiesFreeDelivery
                            ? 'حصلت على توصيل مجاني'
                            : `أضف ${formatNumber(freeDeliveryRemaining)} ${currency} للتوصيل المجاني`}
                        </span>
                        <span className="tabular-nums">{freeDeliveryPct}%</span>
                      </div>
                      <div style={{ height: '6px', borderRadius: '99px', background: 'rgba(148,163,184,0.2)', overflow: 'hidden' }}>
                        <div style={{ width: `${freeDeliveryPct}%`, height: '100%', background: '#10b981' }} />
                      </div>
                    </div>
                  )}

                  {/* Free Gift Threshold Progress */}
                  {freeGiftEnabled && (
                    <div
                      style={{
                        background: qualifiesFreeGift ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.12)',
                        border: qualifiesFreeGift ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(251, 191, 36, 0.35)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        marginBottom: '12px',
                        fontSize: '12.5px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700, color: qualifiesFreeGift ? accentText : (isLightMenu ? '#b45309' : '#fbbf24'), marginBottom: '6px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <Gift size={15} />
                          {qualifiesFreeGift
                            ? `تمت إضافة هديتك المجانية: ${addons.freeGiftThreshold?.giftName}`
                            : `أضف ${formatNumber(Math.max(0, freeGiftMin - subtotal))} ${currency} واحصل على: ${addons.freeGiftThreshold?.giftName}`}
                        </span>
                        <span className="tabular-nums">{freeGiftPct}%</span>
                      </div>
                      <div style={{ height: '6px', borderRadius: '99px', background: 'rgba(148,163,184,0.2)', overflow: 'hidden' }}>
                        <div style={{ width: `${freeGiftPct}%`, height: '100%', background: qualifiesFreeGift ? '#10b981' : '#f59e0b' }} />
                      </div>
                    </div>
                  )}

                  {/* Cutlery Option Addon */}
                  {addons.cutleryOption?.enabled && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--pm-soft)',
                        border: '1px solid var(--pm-line)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        marginBottom: '10px',
                        cursor: 'pointer',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: 'var(--pm-ink)',
                      }}
                    >
                      <span>
                        {addons.cutleryOption.label ||
                          (isEstore ? 'أحتاج تغليف هدية / فاتورة مطبوعة' : 'أحتاج أدوات طعام ومناديل مع الطلب')}
                      </span>
                      <input
                        type="checkbox"
                        checked={needCutlery}
                        onChange={(e) => setNeedCutlery(e.target.checked)}
                      />
                    </label>
                  )}

                  {/* Min / Max Order & Menu Discount Threshold Notices */}
                  {belowMinOrder && (
                    <div
                      style={{
                        background: 'rgba(239, 68, 68, 0.14)',
                        border: '1px solid rgba(248, 113, 113, 0.35)',
                        color: isLightMenu ? '#B91C1C' : '#FCA5A5',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        marginBottom: '12px',
                      }}
                    >
                      {addons.minOrder?.message || 'الحد الأدنى للطلب هو'} {fmtMoney(minOrderAmount)} (متبقي{' '}
                      {fmtMoney(minOrderAmount - subtotal)})
                    </div>
                  )}
                  {aboveMaxOrder && (
                    <div
                      style={{
                        background: 'rgba(239, 68, 68, 0.14)',
                        border: '1px solid rgba(248, 113, 113, 0.35)',
                        color: isLightMenu ? '#B91C1C' : '#FCA5A5',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        marginBottom: '12px',
                      }}
                    >
                      الحد الأعلى المسموح لقيمة الطلب هو {fmtMoney(minOrderMaxAmount)}
                    </div>
                  )}
                  {menuDiscountMinRemaining > 0 && (
                    <div
                      style={{
                        background: 'rgba(245, 158, 11, 0.14)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        color: isLightMenu ? '#b45309' : '#fcd34d',
                        borderRadius: '12px',
                        padding: '9px 12px',
                        fontSize: '12px',
                        fontWeight: 700,
                        marginBottom: '12px',
                      }}
                    >
                      أضف {fmtMoney(menuDiscountMinRemaining)} لتفعيل {activeMenuDiscount.sourceLabel || 'الخصم'}
                    </div>
                  )}

                  {/* Totals Card */}
                  <div
                    style={{
                      background: 'var(--pm-soft)',
                      border: '1px solid var(--pm-line)',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      fontSize: '13.5px',
                      marginBottom: '12px',
                      color: 'var(--pm-ink)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--pm-muted)' }}>الطلبات</span>
                      <b className="tabular-nums" style={{ color: 'var(--pm-ink)' }}>
                        {fmtMoney(subtotal)}
                      </b>
                    </div>
                    {menuOrderDiscountAmt > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: accentText }}>
                        <span>
                          {activeMenuDiscount.sourceLabel || 'خصم العرض'} (
                          {activeMenuDiscount.type === 'fixed'
                            ? fmtMoney(activeMenuDiscount.value)
                            : `${activeMenuDiscount.value}%`}
                          )
                        </span>
                        <b className="tabular-nums">-{fmtMoney(menuOrderDiscountAmt)}</b>
                      </div>
                    )}
                    {firstOrderDiscountAmt > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: accentText }}>
                        <span>{addons.firstOrderDiscount?.title || 'خصم الطلب الأول'} ({firstOrderPct}%)</span>
                        <b className="tabular-nums">-{fmtMoney(firstOrderDiscountAmt)}</b>
                      </div>
                    )}
                    {spinDiscountAmt > 0 && spinWonReward && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: accentText }}>
                        <span>مكافأة عجلة الحظ ({spinWonReward.label})</span>
                        <b className="tabular-nums">-{fmtMoney(spinDiscountAmt)}</b>
                      </div>
                    )}
                    {pickupDiscountAmt > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: accentText }}>
                        <span>{addons.pickupInstantDiscount?.title || 'خصم الاستلام الفوري'} ({pickupPct}%)</span>
                        <b className="tabular-nums">-{fmtMoney(pickupDiscountAmt)}</b>
                      </div>
                    )}
                    {dineInDiscountAmt > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: accentText }}>
                        <span>{(!addons.dineInDiscount?.title || addons.dineInDiscount.title === 'خصم طلبات الصالة' || addons.dineInDiscount.title === 'خصم خاص لطلبات الصالة') ? 'خصم على طلبات الصالة' : addons.dineInDiscount.title} ({dineInPct}%)</span>
                        <b className="tabular-nums">-{fmtMoney(dineInDiscountAmt)}</b>
                      </div>
                    )}
                    {orderType === 'delivery' &&
                      (unlistedAreaSelected || Boolean(activeZone) || deliveryZones.length === 0) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: 'var(--pm-muted)' }}>رسوم التوصيل</span>
                        {unlistedAreaSelected ? (
                          <span style={{ fontSize: '12px', fontWeight: 700, color: accentText }}>
                            تُحدد عبر الكاشير
                          </span>
                        ) : qualifiesFreeDelivery ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {rawDeliveryFee > 0 && (
                              <span style={{ textDecoration: 'line-through', color: 'var(--pm-muted)' }}>
                                {fmtMoney(rawDeliveryFee)}
                              </span>
                            )}
                            <span className="pm-badge green">مجاني</span>
                          </span>
                        ) : (
                          <b className="tabular-nums" style={{ color: 'var(--pm-ink)' }}>
                            {fmtMoney(effectiveDeliveryFee)}
                          </b>
                        )}
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        paddingTop: '10px',
                        marginTop: '4px',
                        borderTop: '1px solid var(--pm-line)',
                        fontSize: '16px',
                        fontWeight: 900,
                        color: accentText,
                      }}
                    >
                      <span style={{ color: 'var(--pm-ink)' }}>المجموع النهائي</span>
                      <span className="tabular-nums" style={{ color: accentText }}>
                        {fmtMoney(finalTotal)}
                      </span>
                    </div>
                  </div>

                  {/* Loyalty Points Info inside Cart */}
                  {addons.loyaltyPoints?.enabled && (
                    <div
                      style={{
                        background: 'rgba(59, 130, 246, 0.14)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '12px',
                        padding: '9px 12px',
                        marginBottom: '12px',
                        fontSize: '12px',
                        color: isLightMenu ? '#1d4ed8' : '#93C5FD',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>ستكسب {earnedLoyaltyPoints} نقطة من هذا الطلب</span>
                      <span>رصيدك الحالي: {loyaltyBalance}</span>
                    </div>
                  )}

                  {/* Group Order Bill Split Calculator */}
                  {addons.groupOrderBillSplit?.enabled && (
                    <div
                      style={{
                        background: 'var(--pm-soft)',
                        border: '1px solid var(--pm-line)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        fontSize: '12.5px',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--pm-ink)' }}>
                        <Users size={15} style={{ color: accentText }} />
                        تقسيم الفاتورة على:
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setSplitPeople((p) => Math.max(1, p - 1))}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            border: '1px solid var(--pm-line)',
                            background: 'var(--pm-card)',
                            color: 'var(--pm-ink)',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          -
                        </button>
                        <b className="tabular-nums" style={{ color: 'var(--pm-ink)' }}>{splitPeople} أشخاص</b>
                        <button
                          type="button"
                          onClick={() => setSplitPeople((p) => Math.min(Number(addons.groupOrderBillSplit?.maxPeople) || 10, p + 1))}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            border: '1px solid var(--pm-line)',
                            background: 'var(--pm-card)',
                            color: 'var(--pm-ink)',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          +
                        </button>
                        {splitPeople > 1 && (
                          <b className="tabular-nums" style={{ color: accentText }}>
                            ({formatNumber(Math.ceil(finalTotal / splitPeople))} {currency} / شخص)
                          </b>
                        )}
                      </div>
                    </div>
                  )}

                </div>

                {/* Sticky Pinned Bottom Footer */}
                <div className="pm-cart-footer">
                  <button
                    type="button"
                    onClick={() => {
                      if (!canOrderNow) {
                        showToast('مغلق حالياً ولا يستقبل الطلبات');
                        return;
                      }
                      if (belowMinOrder) {
                        showToast(
                          `${addons.minOrder?.message || 'الحد الأدنى للطلب هو'} ${formatNumber(minOrderAmount)} ${currency}`
                        );
                        return;
                      }
                      if (aboveMaxOrder) {
                        showToast(`الحد الأعلى للطلب هو ${formatNumber(minOrderMaxAmount)} ${currency}`);
                        return;
                      }
                      setCheckoutTriedSubmit(false);
                      setZoneDropdownOpen(false);
                      setZoneSearchQuery('');
                      setGpsErrorMsg('');
                      setCheckoutStep('details');
                    }}
                    className={`pm-cart-complete-btn ${orderLimitBlocked ? 'blocked' : ''}`}
                  >
                    <span className="pm-cta-label">اكمل الطلب</span>
                    <span className="pm-cta-price tabular-nums">{fmtMoney(finalTotal)}</span>
                  </button>
                </div>
              </>
            ) : (
              /* STEP 2: CLEAN SYMMETRICAL CHECKOUT FORM WITH PINNED TOP DELIVERY ZONE & PINNED FOOTER */
              <form onSubmit={handleSubmitOrder} noValidate className="pm-co-form">
                {/* 1. Pinned Top Delivery Zone Selector (stays pinned above form scroll until picked) */}
                {orderType === 'delivery' && deliveryZones.length > 0 && (() => {
                  const activeZoneName = activeZone ? String(activeZone.area || activeZone.name || '').trim() : '';
                  const hasZoneError = checkoutTriedSubmit && !activeZone && !unlistedAreaSelected;
                  const normalizeZoneSearch = (val: string) =>
                    String(val || '')
                      .toLowerCase()
                      .replace(/[\u064B-\u065F\u0670]/g, '')
                      .replace(/[أإآ]/g, 'ا')
                      .replace(/ة/g, 'ه')
                      .replace(/ى/g, 'ي')
                      .replace(/\s+/g, ' ')
                      .trim();
                  const normQuery = normalizeZoneSearch(zoneSearchQuery);
                  const filteredZones = deliveryZones
                    .map((z, idx) => ({
                      z,
                      idx,
                      label: String(z.area || z.name || '').trim() || `منطقة #${idx + 1}`,
                    }))
                    .filter(({ z, label }) => {
                      if (!normQuery) return true;
                      if (normalizeZoneSearch(label).includes(normQuery)) return true;
                      return (
                        Array.isArray(z.cities) &&
                        z.cities.some((c) => normalizeZoneSearch(c?.name || '').includes(normQuery))
                      );
                    });

                  return (
                    <div
                      className={`pm-co-zone-pinned ${zoneDropdownOpen ? 'is-open' : ''} ${
                        activeZone || unlistedAreaSelected ? 'is-chosen' : ''
                      }`}
                    >
                      <div className="pm-co-sec-head">
                        <span className="pm-co-sec-title">
                          منطقة التوصيل <span className="pm-co-req">*</span>
                        </span>
                        <span
                          className={`pm-co-sec-meta tabular-nums ${
                            unlistedAreaSelected ? 'is-warn' : activeZone ? 'is-accent' : ''
                          }`}
                        >
                          {unlistedAreaSelected
                            ? 'تُحدد مع الكاشير'
                            : activeZone
                            ? effectiveDeliveryFee > 0
                              ? fmtMoney(effectiveDeliveryFee)
                              : 'توصيل مجاني'
                            : `${deliveryZones.length} ${deliveryZones.length <= 10 ? 'مناطق' : 'منطقة'}`}
                        </span>
                      </div>

                      <div className={`pm-zone-card ${hasZoneError ? 'has-error' : ''}`}>
                        <button
                          type="button"
                          className={`pm-zone-trigger ${activeZone || unlistedAreaSelected ? 'is-selected' : ''}`}
                          onClick={() =>
                            setZoneDropdownOpen((prev) => {
                              const next = !prev;
                              if (!next) setZoneSearchQuery('');
                              return next;
                            })
                          }
                          aria-expanded={zoneDropdownOpen}
                        >
                          <span className="pm-zone-trigger-ico">
                            {activeZone || unlistedAreaSelected ? (
                              <Check size={15} strokeWidth={2.8} />
                            ) : (
                              <MapPin size={16} />
                            )}
                          </span>

                          <span className="pm-zone-trigger-copy">
                            <span className="pm-zone-trigger-main">
                              {unlistedAreaSelected
                                ? 'منطقتي غير موجودة بالقائمة'
                                : activeZone
                                ? `${activeZoneName}${
                                    hasMultipleSubCities && activeCity?.name ? ` — ${activeCity.name}` : ''
                                  }`
                                : 'اختر منطقة التوصيل'}
                            </span>
                            {!(activeZone || unlistedAreaSelected) ? (
                              <span className="pm-zone-trigger-sub">اضغط للبحث واختيار منطقتك</span>
                            ) : qualifiesFreeDelivery && rawDeliveryFee > 0 ? (
                              <span className="pm-zone-trigger-sub">
                                توصيل مجاني بدلاً من {fmtMoney(rawDeliveryFee)}
                              </span>
                            ) : null}
                          </span>

                          {(activeZone || unlistedAreaSelected) && !zoneDropdownOpen && (
                            <span className="pm-zone-trigger-change">تغيير</span>
                          )}

                          <ChevronDown
                            size={18}
                            className={`pm-zone-chevron ${zoneDropdownOpen ? 'is-open' : ''}`}
                          />
                        </button>

                        {zoneDropdownOpen && (
                          <div className="pm-zone-rows-wrap">
                            <div className="pm-zone-search-wrap">
                              <Search size={15} className="pm-zone-search-ico" aria-hidden="true" />
                              <input
                                type="text"
                                className="pm-zone-search-input"
                                value={zoneSearchQuery}
                                onChange={(e) => setZoneSearchQuery(e.target.value)}
                                placeholder="ابحث عن منطقتك..."
                                aria-label="ابحث عن منطقة التوصيل"
                                autoComplete="off"
                              />
                              {zoneSearchQuery && (
                                <button
                                  type="button"
                                  className="pm-zone-search-clear"
                                  onClick={() => setZoneSearchQuery('')}
                                  aria-label="مسح البحث"
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </div>

                            <div className="pm-zone-rows" role="listbox" aria-label="قائمة مناطق التوصيل">
                              {filteredZones.length === 0 ? (
                                <div className="pm-zone-search-empty">
                                  لا توجد منطقة مطابقة لـ &quot;{zoneSearchQuery.trim()}&quot;
                                </div>
                              ) : (
                                filteredZones.map(({ z, idx, label }) => {
                                  const selected = !unlistedAreaSelected && selectedAreaIdx === idx;
                                  const flatFee = Number(z.fee ?? z.cities?.[0]?.fee ?? 0) || 0;
                                  const hasSub = Boolean(z.cities && z.cities.length > 1);
                                  return (
                                    <button
                                      key={`${label}-${idx}`}
                                      type="button"
                                      role="option"
                                      aria-selected={selected}
                                      className={`pm-zone-row ${selected ? 'selected' : ''}`}
                                      onClick={() => {
                                        setSelectedAreaIdx(idx);
                                        setSelectedCityIdx(0);
                                        setUnlistedAreaSelected(false);
                                        setZoneSearchQuery('');
                                        if (!hasSub) {
                                          setZoneDropdownOpen(false);
                                        }
                                      }}
                                    >
                                      <span className="pm-zone-row-name">{label}</span>
                                      <span className="pm-zone-row-end">
                                        <span
                                          className={`pm-zone-row-fee tabular-nums ${
                                            hasSub ? 'is-multi' : flatFee > 0 ? 'is-paid' : 'is-free'
                                          }`}
                                        >
                                          {hasSub
                                            ? 'أحياء متعددة'
                                            : flatFee > 0
                                            ? fmtMoney(flatFee)
                                            : 'مجاني'}
                                        </span>
                                        <span className={`pm-zone-row-check ${selected ? 'is-on' : ''}`}>
                                          {selected && <Check size={14} strokeWidth={2.8} />}
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })
                              )}
                            </div>

                            <button
                              type="button"
                              className={`pm-zone-row pm-zone-row-unlisted ${
                                unlistedAreaSelected ? 'selected' : ''
                              }`}
                              onClick={() => {
                                setUnlistedAreaSelected(true);
                                setSelectedAreaIdx(-1);
                                setSelectedCityIdx(0);
                                setZoneSearchQuery('');
                                setZoneDropdownOpen(false);
                              }}
                            >
                              <span className="pm-zone-row-unlisted-start">
                                <MessageCircle size={15} />
                                <span>منطقتي غير موجودة بالقائمة</span>
                              </span>
                              <span className="pm-zone-row-end">
                                <span className="pm-zone-row-fee is-multi">تُحدد مع الكاشير</span>
                                <span className={`pm-zone-row-check ${unlistedAreaSelected ? 'is-on' : ''}`}>
                                  {unlistedAreaSelected && <Check size={14} strokeWidth={2.8} />}
                                </span>
                              </span>
                            </button>
                          </div>
                        )}

                        {activeZone && !unlistedAreaSelected && hasMultipleSubCities && (
                          <div className="pm-zone-subcities-wrap">
                            <div className="pm-zone-subcities-lbl">اختر الحي ضمن {activeZoneName}</div>
                            {zoneCities.length <= 6 ? (
                              <div className="pm-zone-subcities-grid">
                                {zoneCities.map((ct, idx) => {
                                  const isCitySelected = safeCityIdx === idx;
                                  return (
                                    <button
                                      key={`${ct.name}-${idx}`}
                                      type="button"
                                      onClick={() => {
                                        setSelectedCityIdx(idx);
                                        setZoneSearchQuery('');
                                        setZoneDropdownOpen(false);
                                      }}
                                      className={`pm-zone-subcity-chip${isCitySelected ? ' selected' : ''}`}
                                    >
                                      <span className="pm-zone-subcity-name">{ct.name}</span>
                                      <span className="tabular-nums pm-zone-subcity-fee">
                                        {ct.fee > 0 ? fmtMoney(ct.fee) : 'مجاني'}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <AppSelect
                                title="اختر الحي / المدينة"
                                variant="compact"
                                value={String(safeCityIdx)}
                                onChange={(val) => {
                                  setSelectedCityIdx(Number(val));
                                  setZoneSearchQuery('');
                                  setZoneDropdownOpen(false);
                                }}
                                options={zoneCities.map((ct, idx) => ({
                                  value: String(idx),
                                  label: ct.name,
                                  hint: ct.fee > 0 ? fmtMoney(ct.fee) : 'مجاني',
                                }))}
                                style={{
                                  background: 'var(--pm-card)',
                                  color: 'var(--pm-ink)',
                                  border: '1px solid var(--pm-line)',
                                  borderRadius: '11px',
                                }}
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {activeZone && !unlistedAreaSelected && activeCity?.eta && (
                        <div className="pm-co-note">مدة التوصيل المتوقعة: {activeCity.eta}</div>
                      )}

                      {hasZoneError && (
                        <div className="pm-co-err">يرجى اختيار منطقة التوصيل من القائمة.</div>
                      )}
                    </div>
                  );
                })()}

                <div className="pm-cart-scroll pm-co-scroll">
                  {/* 2. Customer Name & WhatsApp Phone */}
                  <div className="pm-co-fields">
                    <div className="pm-co-field">
                      <label htmlFor="pm-checkout-name" className="pm-co-label">
                        الاسم الثنائي <span className="pm-co-req">*</span>
                      </label>
                      <input
                        id="pm-checkout-name"
                        type="text"
                        className={`pm-checkout-input ${
                          checkoutTriedSubmit && !isTwoPartNameValid(customerName) ? 'has-error' : ''
                        }`}
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="اكتب اسمك الثنائي"
                        required
                      />
                      {checkoutTriedSubmit && !isTwoPartNameValid(customerName) && (
                        <div className="pm-co-err">يرجى كتابة الاسم الثنائي (مثال: أحمد علي).</div>
                      )}
                    </div>

                    <div className="pm-co-field">
                      <label htmlFor="pm-checkout-phone" className="pm-co-label">
                        رقم هاتف الواتساب <span className="pm-co-req">*</span>
                      </label>
                      <input
                        id="pm-checkout-phone"
                        type="tel"
                        inputMode="tel"
                        dir="ltr"
                        className={`pm-checkout-input ${
                          checkoutTriedSubmit && !isValidWhatsAppPhone(customerPhone) ? 'has-error' : ''
                        }`}
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="07XXXXXXXXX"
                        required
                        style={{ textAlign: 'left' }}
                      />
                      {checkoutTriedSubmit && !isValidWhatsAppPhone(customerPhone) && (
                        <div className="pm-co-err">
                          يرجى إدخال رقم هاتف واتساب صحيح (مثال: 07XXXXXXXXX).
                        </div>
                      )}
                    </div>
                  </div>

                  {orderType === 'table' && (
                    <div className="pm-co-field">
                      <label className="pm-co-label">رقم الطاولة (مطلوب لطلبات الصالة)</label>
                      <AppSelect
                        title="رقم الطاولة"
                        value={selectedTable || '1'}
                        onChange={(val) => setSelectedTable(val)}
                        options={Array.from({ length: 15 }, (_, i) => {
                          const num = String(i + 1);
                          return { value: num, label: `طاولة #${num}` };
                        })}
                        style={{
                          width: '100%',
                          borderRadius: '12px',
                          border: '1px solid var(--pm-line)',
                          background: 'var(--pm-soft)',
                          color: 'var(--pm-ink)',
                        }}
                      />
                    </div>
                  )}

                  {/* 3. Clean Single-Surface Location & Detailed Address */}
                  {orderType === 'delivery' && (() => {
                    const hasLocError =
                      checkoutTriedSubmit &&
                      ((!gpsCoords && !gpsAttempted) ||
                        (!gpsCoords && gpsAttempted && customerAddress.trim().length < 5));

                    return (
                      <div ref={gpsSectionRef} className="pm-co-block">
                        <div className="pm-co-sec-head">
                          <span className="pm-co-sec-title">موقع التوصيل والعنوان</span>
                          {gpsCoords && (
                            <span className="pm-co-sec-meta is-ok">تم تحديد الموقع ✓</span>
                          )}
                        </div>

                        <div className={`pm-co-loc-card ${hasLocError ? 'has-error' : ''}`}>
                          {!gpsCoords ? (
                            <button
                              type="button"
                              dir="rtl"
                              onClick={handleGetGps}
                              disabled={gpsLoading}
                              className={`pm-gps-cta-btn ${
                                checkoutTriedSubmit && !gpsAttempted ? 'is-attention' : ''
                              }`}
                              style={{
                                background: brandColor,
                                color: brandInk,
                              }}
                            >
                              <MapPin size={17} style={{ flexShrink: 0 }} />
                              <span>
                                {gpsLoading ? 'جاري تحديد موقعك الحالي...' : 'تحديد موقعي الحالي'}
                              </span>
                            </button>
                          ) : (
                            <div className="pm-gps-done-bar">
                              <span className="pm-gps-done-status">
                                <span className="pm-gps-done-badge">
                                  <Check size={13} strokeWidth={3} />
                                </span>
                                <span>تم حفظ إحداثيات موقعك</span>
                              </span>
                              <div className="pm-gps-done-actions">
                                <a
                                  href={`https://www.google.com/maps?q=${gpsCoords.lat},${gpsCoords.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="pm-gps-map-link"
                                >
                                  Google Maps
                                </a>
                                <span aria-hidden="true" className="pm-gps-link-sep">·</span>
                                <a
                                  href={`https://waze.com/ul?ll=${gpsCoords.lat},${gpsCoords.lng}&navigate=yes`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="pm-gps-map-link"
                                >
                                  Waze
                                </a>
                                <button
                                  type="button"
                                  onClick={handleGetGps}
                                  disabled={gpsLoading}
                                  aria-label="تحديث موقعي الحالي"
                                  title="تحديث الموقع"
                                  className="pm-gps-refresh-btn"
                                >
                                  <RotateCw size={13} className={gpsLoading ? 'animate-spin' : ''} />
                                </button>
                              </div>
                            </div>
                          )}

                          {gpsErrorMsg && !gpsCoords && (
                            <div className="pm-co-warn">{gpsErrorMsg}</div>
                          )}

                          <input
                            id="pm-checkout-address"
                            type="text"
                            className="pm-checkout-input pm-co-address-input"
                            value={customerAddress}
                            onChange={(e) => setCustomerAddress(e.target.value)}
                            placeholder="اكتب عنوانك بشكل دقيق"
                            aria-label="اكتب عنوانك بشكل دقيق"
                          />
                        </div>

                        {checkoutTriedSubmit && !gpsCoords && !gpsAttempted && (
                          <div className="pm-co-err">
                            يرجى الضغط على زر &quot;تحديد موقعي الحالي&quot; أعلاه أولاً.
                          </div>
                        )}

                        {checkoutTriedSubmit && !gpsCoords && gpsAttempted && customerAddress.trim().length < 5 && (
                          <div className="pm-co-err">
                            تعذر التحديد التلقائي للموقع، يرجى كتابة عنوانك التفصيلي أعلاه.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {orderType === 'pickup' && (
                    <div
                      style={{
                        background: 'var(--pm-soft)',
                        border: '1px solid var(--pm-line)',
                        borderRadius: '14px',
                        padding: '12px 14px',
                        fontSize: '12.5px',
                        color: 'var(--pm-ink)',
                      }}
                    >
                      <b>معلومات فرع الاستلام: {rest.n}</b>
                      {(rest.mapUrl || addons.locationLinks?.googleMapsUrl || rest.wazeUrl || addons.locationLinks?.wazeUrl) && (
                        <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                          {(rest.mapUrl || addons.locationLinks?.googleMapsUrl) && (
                            <a
                              href={rest.mapUrl || addons.locationLinks?.googleMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: accentText, fontWeight: 700, textDecoration: 'underline' }}
                            >
                              خرائط كوكل ←
                            </a>
                          )}
                          {(rest.wazeUrl || addons.locationLinks?.wazeUrl) && (
                            <a
                              href={rest.wazeUrl || addons.locationLinks?.wazeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: accentText, fontWeight: 700, textDecoration: 'underline' }}
                            >
                              موقع ويز (Waze) ←
                            </a>
                          )}
                        </div>
                      )}

                      {addons.curbsidePickupCar?.enabled && (
                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--pm-line)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: accentText, marginBottom: '4px' }}>
                            <Car size={15} />
                            <span>الاستلام السريع من السيارة</span>
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--pm-muted)', marginBottom: '6px' }}>
                            {addons.curbsidePickupCar.instructions || 'اكتب لون وموديل سيارتك أو رقم اللوحة وسنوصلها لباب السيارة'}
                          </div>
                          <input
                            type="text"
                            value={curbsideCarInfo}
                            onChange={(e) => setCurbsideCarInfo(e.target.value)}
                            placeholder="مثال: تويوتا كامري بيضاء — رقم 12345"
                            className="pm-checkout-input"
                            style={{ background: 'var(--pm-card)', height: '42px' }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Pinned Symmetrical Submit Footer */}
                <div className="pm-cart-footer">
                  <button
                    type="submit"
                    disabled={isSubmittingOrder}
                    className="pm-cart-complete-btn pm-co-submit-btn"
                    style={{
                      background: orderChannel === 'telegram' && !unlistedAreaSelected ? '#0088cc' : brandColor,
                      color: orderChannel === 'telegram' && !unlistedAreaSelected ? '#ffffff' : brandInk,
                      cursor: isSubmittingOrder ? 'wait' : 'pointer',
                      opacity: isSubmittingOrder ? 0.78 : 1,
                    }}
                  >
                    <span className="pm-cta-label">
                      <span>{isSubmittingOrder ? 'جاري إرسال الطلب...' : 'إرسال الطلب'}</span>
                      <Send size={16} style={{ flexShrink: 0 }} />
                    </span>
                    <span className="pm-cta-price tabular-nums">{fmtMoney(finalTotal)}</span>
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}

      {/* ================================================================
          MODAL 3: HAMBURGER MENU DRAWER (Social, Hours, About, Health, Rate)
          ================================================================ */}
      {menuDrawerOpen && (
        <div className="pm-modal-backdrop" onClick={() => setMenuDrawerOpen(false)}>
          <div className="pm-sheet" style={{ padding: '18px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <b style={{ fontSize: '17px', color: 'var(--pm-ink)' }}>{rest.n}</b>
              <button
                type="button"
                onClick={() => setMenuDrawerOpen(false)}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="pm-option-row"
                onClick={() => {
                  setMenuDrawerOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <span style={{ fontWeight: 800, fontSize: '14.5px' }}>القائمة الرئيسية</span>
                <ChevronLeft size={16} />
              </button>

              <button
                type="button"
                className="pm-option-row"
                onClick={() => {
                  setMenuDrawerOpen(false);
                  setWorkModalOpen(true);
                }}
              >
                <span style={{ fontWeight: 800, fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={16} /> أوقات العمل
                </span>
                <ChevronLeft size={16} />
              </button>

              {rest.aboutText && (
                <button
                  type="button"
                  className="pm-option-row"
                  onClick={() => {
                    setMenuDrawerOpen(false);
                    setAboutModalOpen(true);
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={16} /> نبذة عنا
                  </span>
                  <ChevronLeft size={16} />
                </button>
              )}

              {reviewsAllowSubmit && (
                <button
                  type="button"
                  className="pm-option-row"
                  onClick={() => {
                    setMenuDrawerOpen(false);
                    setRateModalOpen(true);
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Star size={16} /> تقييم الخدمة
                  </span>
                  <ChevronLeft size={16} />
                </button>
              )}

              {(rest.mapUrl || addons.locationLinks?.googleMapsUrl) && (
                <a
                  href={rest.mapUrl || addons.locationLinks?.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-option-row"
                  style={{ textDecoration: 'none' }}
                >
                  <span style={{ fontWeight: 800, fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={16} /> الموقع على خرائط كوكل
                  </span>
                  <ChevronLeft size={16} />
                </a>
              )}
              {(rest.wazeUrl || addons.locationLinks?.wazeUrl) && (
                <a
                  href={rest.wazeUrl || addons.locationLinks?.wazeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-option-row"
                  style={{ textDecoration: 'none' }}
                >
                  <span style={{ fontWeight: 800, fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={16} /> الموقع على ويز (Waze)
                  </span>
                  <ChevronLeft size={16} />
                </a>
              )}

              <button
                type="button"
                className="pm-option-row"
                onClick={handleShareMenu}
              >
                <span style={{ fontWeight: 800, fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Share2 size={16} /> {isEstore ? 'مشاركة المتجر' : 'مشاركة المنيو'}
                </span>
                <ChevronLeft size={16} />
              </button>
            </div>

            {/* Social Media Links */}
            {rest.social && Object.values(rest.social).some(Boolean) && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                {rest.social.instagram && (
                  <a
                    href={rest.social.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-order-type-pill"
                    style={{ background: 'var(--pm-soft)', borderColor: 'var(--pm-line)', color: 'var(--pm-ink)', fontWeight: 800, textDecoration: 'none' }}
                  >
                    انستغرام
                  </a>
                )}
                {rest.social.facebook && (
                  <a
                    href={rest.social.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-order-type-pill"
                    style={{ background: 'var(--pm-soft)', borderColor: 'var(--pm-line)', color: 'var(--pm-ink)', fontWeight: 800, textDecoration: 'none' }}
                  >
                    فيسبوك
                  </a>
                )}
                {rest.social.tiktok && (
                  <a
                    href={rest.social.tiktok}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-order-type-pill"
                    style={{ background: 'var(--pm-soft)', borderColor: 'var(--pm-line)', color: 'var(--pm-ink)', fontWeight: 800, textDecoration: 'none' }}
                  >
                    تيك توك
                  </a>
                )}
                {rest.social.x && (
                  <a
                    href={rest.social.x}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-order-type-pill"
                    style={{ background: 'var(--pm-soft)', borderColor: 'var(--pm-line)', color: 'var(--pm-ink)', fontWeight: 800, textDecoration: 'none' }}
                  >
                    منصة X
                  </a>
                )}
                {rest.social.whatsapp && (
                  <a
                    href={waLink(rest.social.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-order-type-pill"
                    style={{ background: 'rgba(16, 185, 129, 0.16)', borderColor: 'rgba(52, 211, 153, 0.45)', color: accentText, fontWeight: 800, textDecoration: 'none' }}
                  >
                    واتساب
                  </a>
                )}
              </div>
            )}

            {/* Google Reviews CTA */}
            {rest.googleReviewUrl && (
              <a
                href={rest.googleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="pm-option-row"
                style={{ marginTop: '14px', textDecoration: 'none' }}
              >
                <span style={{ fontWeight: 800, fontSize: '14px' }}>⭐ قيّمنا على Google Maps</span>
                <ChevronLeft size={16} />
              </a>
            )}
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 4: WORKING HOURS POPUP
          ================================================================ */}
      {workModalOpen && (
        <div className="pm-modal-backdrop" onClick={() => setWorkModalOpen(false)}>
          <div className="pm-sheet" style={{ padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--pm-ink)' }}>⏰ أوقات العمل</h3>
              <button
                type="button"
                onClick={() => setWorkModalOpen(false)}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                ✕
              </button>
            </div>

            {rest.weeklyHours && Object.keys(rest.weeklyHours).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {DAY_LABELS.map((d) => {
                  const cfg = rest.weeklyHours?.[d.key];
                  return (
                    <div
                      key={d.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        background: 'var(--pm-soft)',
                        border: '1px solid var(--pm-line)',
                        fontSize: '13.5px',
                        color: 'var(--pm-ink)',
                      }}
                    >
                      <b>{d.label}</b>
                      {!cfg || !cfg.open ? (
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>مغلق</span>
                      ) : (
                        <span className="tabular-nums" style={{ color: accentText, fontWeight: 700 }}>
                          {formatTime12(cfg.from)} - {formatTime12(cfg.to)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ background: 'var(--pm-soft)', border: '1px solid var(--pm-line)', padding: '14px', borderRadius: '12px', textAlign: 'center', fontWeight: 700, color: 'var(--pm-ink)' }}>
                {rest.h?.m === '24'
                  ? 'نعمل على مدار 24 ساعة يومياً'
                  : `يومياً من ${formatTime12(rest.h?.f || '09:00')} إلى ${formatTime12(rest.h?.t || '23:00')}`}
              </div>
            )}

            {rest.acceptOrdersWhenClosed && (
              <p style={{ margin: '12px 0 0', fontSize: '12.5px', color: accentText, textAlign: 'center', fontWeight: 700 }}>
                ✓ نستقبل الطلبات حتى خارج أوقات الدوام الرسمي
              </p>
            )}
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 5: ALL CATEGORIES JUMP POPUP
          ================================================================ */}
      {catsModalOpen && (
        isTheme6 ? (
          <div className="pm-modal-backdrop" onClick={() => setCatsModalOpen(false)}>
            <div className="pm-sheet pm-t6-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="pm-t6-sheet-handle" aria-hidden="true" />
              <h3 className="pm-t6-sheet-heading">القائمة</h3>
              <div className="pm-t6-cats-sheet-list">
                {allCategories.map((c) => {
                  const count = (itemsByCatMap.get(c.id) || []).length;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="pm-t6-cats-sheet-row"
                      onClick={() => {
                        setActiveCatId(c.id);
                        setCatsModalOpen(false);
                        window.setTimeout(() => {
                          document.getElementById(`mc-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 40);
                      }}
                    >
                      <span className="pm-t6-cats-sheet-name">{c.n}</span>
                      <span className="pm-t6-cats-sheet-count tabular-nums">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
        <div className="pm-modal-backdrop" onClick={() => setCatsModalOpen(false)}>
          <div className="pm-sheet" style={{ padding: '18px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--pm-ink)' }}>قائمة التصنيفات</h3>
              <button
                type="button"
                onClick={() => setCatsModalOpen(false)}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                ✕
              </button>
            </div>
            {allCategories.map((c) => {
              const count = (itemsByCatMap.get(c.id) || []).length;
              const catEval = categoryEvalMap.get(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="pm-option-row"
                  onClick={() => {
                    setActiveCatId(c.id);
                    if (isEstore) {
                      setEstoreCatFilter(c.id);
                    }
                    setCatsModalOpen(false);
                    window.setTimeout(() => {
                      document.getElementById(`mc-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 40);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {c.img && (
                      <img
                        src={c.img}
                        alt={c.n}
                        loading="lazy"
                        decoding="async"
                        style={{ width: '36px', height: '36px', borderRadius: '10px', objectFit: 'cover' }}
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div>
                      <b style={{ fontSize: '14.5px', color: 'var(--pm-ink)', display: 'block' }}>{c.n}</b>
                      {catEval && !catEval.available && !catEval.outOfSchedule ? (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#f59e0b',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <Ban size={10} />
                          <span>غير متوفر حالياً</span>
                        </span>
                      ) : catEval?.hasSchedule ? (
                        <span
                          style={{
                            fontSize: '11px',
                            color: catEval.available ? 'var(--pm-muted)' : '#f59e0b',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <Clock size={10} />
                          <span>{catEval.badgeText}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="tabular-nums" style={{ color: accentText, fontWeight: 900 }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        )
      )}

      {/* ================================================================
          THEME 6 MODAL: BRANCH / STORE LOCATION BOTTOM SHEET ("موقع المتجر")
          ================================================================ */}
      {isTheme6 && t6BranchSheetOpen && (
        <div className="pm-modal-backdrop" onClick={() => setT6BranchSheetOpen(false)}>
          <div className="pm-sheet pm-t6-sheet pm-t6-branch-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pm-t6-sheet-handle" aria-hidden="true" />
            <h3 className="pm-t6-branch-sheet-title">موقع المتجر</h3>
            <div className="pm-t6-branch-list">
              {(familyBranches && familyBranches.length > 0 ? familyBranches : [rest]).map((br) => {
                const isSelected = t6PendingBranchId === br.id;
                const branchLabel =
                  String((br as Record<string, unknown>).address || br.branchName || br.region || br.n || '').trim();
                const distLabel = String((br as Record<string, unknown>).distanceLabel || (br.region ? br.region : 'متاح للطلب'));
                const mapHref = br.mapUrl || br.wazeUrl || '';
                return (
                  <div
                    key={br.id}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    className="pm-t6-branch-row"
                    onClick={() => setT6PendingBranchId(br.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setT6PendingBranchId(br.id);
                      }
                    }}
                  >
                    <Store size={21} strokeWidth={1.9} className="pm-t6-branch-row-icon" />
                    <div className="pm-t6-branch-row-info">
                      <div className="pm-t6-branch-row-name">{branchLabel}</div>
                      <div className="pm-t6-branch-row-meta">
                        <span>{distLabel}</span>
                        {mapHref && (
                          <>
                            <span aria-hidden="true">|</span>
                            <a
                              href={mapHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="pm-t6-map-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span>عرض الموقع</span>
                              <ArrowUpRight size={13} />
                            </a>
                          </>
                        )}
                      </div>
                      <div className="pm-t6-branch-chip">
                        {terms.pickupLabel}
                      </div>
                    </div>
                    <span className={`pm-t6-radio ${isSelected ? 'selected' : ''}`} aria-hidden="true">
                      <span className="pm-t6-radio-dot" />
                    </span>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="pm-t6-use-branch-btn"
              onClick={() => {
                if (t6PendingBranchId && onSelectBranch && t6PendingBranchId !== selectedBranchId) {
                  onSelectBranch(t6PendingBranchId);
                }
                setT6BranchSheetOpen(false);
              }}
            >
              استخدم
            </button>
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 6: SEARCH MODAL
          ================================================================ */}
      {searchOpen && (
        isTheme6 ? (
          <div className="pm-t6-search-screen" role="dialog" aria-modal="true" aria-label="قائمة البحث">
            <div className="pm-t6-search-top">
              <button
                type="button"
                className="pm-t6-search-back"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery('');
                }}
                aria-label="رجوع"
              >
                <ChevronRight size={24} strokeWidth={2.2} />
              </button>
              <div className="pm-t6-search-pill">
                <Search size={19} strokeWidth={2.1} className="pm-t6-search-icon" />
                <input
                  type="search"
                  className="pm-t6-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="قائمة البحث"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="pm-t6-search-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="مسح"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="pm-t6-search-results">
              {searchQuery.trim() && (
                searchResults.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--pm-muted)', marginTop: '48px', fontSize: '14px' }}>
                    لا توجد أصناف مطابقة لـ "{searchQuery}"
                  </p>
                ) : (
                  <div className="pm-t6-list-stack">
                    {searchResults.map((it) => {
                      const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                      const searchItemEval = itemEvalMap.get(it.id);
                      const searchDisplayOnly = isDisplayOnlyItem(it);
                      const searchUnavailable = !searchDisplayOnly && (searchItemEval ? !searchItemEval.available : false);
                      const formattedBeforePrice = priceInfo.rawBefore > 0 ? fmtMoney(priceInfo.rawBefore) : '';
                      return (
                        <article
                          key={`t6_srch_${it.id}`}
                          className={`pm-t6-list-row ${searchUnavailable ? 'unavailable is-unavailable' : ''}`}
                          onClick={() => {
                            setSearchOpen(false);
                            openProductModal(it);
                          }}
                        >
                          <div className="pm-t6-list-info">
                            <h3 className="pm-t6-list-title">{it.n}</h3>
                            {it.d && <p className="pm-t6-list-desc">{it.d}</p>}
                            <div className="pm-t6-price-line">
                              <span className="pm-t6-price tabular-nums">{priceInfo.main}</span>
                              {priceInfo.rawBefore > 0 && (
                                <span className="pm-t6-old-price tabular-nums">{formattedBeforePrice}</span>
                              )}
                            </div>
                          </div>
                          <div className="pm-t6-list-img">
                            {it.img ? (
                              <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="pm-t6-img-fallback">
                                <Utensils size={24} />
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        ) : (
        <div className="pm-modal-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="pm-sheet" style={{ padding: '18px', minHeight: '60vh' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isEstore ? 'ابحث عن منتج...' : 'ابحث عن وجبة أو مشروب...'}
                autoFocus
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery('');
                }}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '10px', padding: '9px 14px', fontWeight: 700, cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                إغلاق
              </button>
            </div>

            {!searchQuery.trim() ? (
              <p style={{ textAlign: 'center', color: 'var(--pm-muted)', marginTop: '40px' }}>
                {isEstore ? 'اكتب اسم المنتج لعرض النتائج فوراً...' : 'اكتب اسم الطبق لعرض النتائج فوراً...'}
              </p>
            ) : searchResults.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--pm-muted)', marginTop: '40px' }}>
                {isEstore ? `لا توجد منتجات مطابقة لـ "${searchQuery}"` : `لا توجد أصناف مطابقة لـ "${searchQuery}"`}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {searchResults.map((it) => {
                  const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                  const searchItemEval = itemEvalMap.get(it.id);
                  const searchDisplayOnly = isDisplayOnlyItem(it);
                  const searchUnavailable = !searchDisplayOnly && (searchItemEval ? !searchItemEval.available : false);
                  const searchShowUnavailable =
                    searchUnavailable || Boolean(searchItemEval && !searchItemEval.available && !searchItemEval.outOfSchedule);
                  return (
                    <div
                      key={it.id}
                      className="pm-option-row"
                      style={searchShowUnavailable ? { opacity: 0.62 } : undefined}
                      onClick={() => {
                        setSearchOpen(false);
                        openProductModal(it);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        {it.img && (
                          <img
                            src={it.img}
                            alt={it.n}
                            loading="lazy"
                            decoding="async"
                            style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover' }}
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <b style={{ display: 'block', fontSize: '14px', color: 'var(--pm-ink)' }}>{it.n}</b>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="tabular-nums" style={{ fontSize: '13px', color: accentText, fontWeight: 900 }}>
                              {priceInfo.main}
                            </span>
                            {priceInfo.rawBefore > 0 && (
                              <span
                                className="tabular-nums"
                                style={{ fontSize: '11px', color: 'var(--pm-muted)', textDecoration: 'line-through' }}
                              >
                                {formatNumber(priceInfo.rawBefore)} {currency}
                              </span>
                            )}
                          </div>
                          {searchShowUnavailable && (
                            <span className="pm-item-unavailable-label">غير متوفر حالياً</span>
                          )}
                        </div>
                      </div>
                      <span style={{ color: accentText, fontWeight: 800, fontSize: '12.5px' }}>عرض</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        )
      )}

      {/* ================================================================
          MODAL 7: ORDER TYPE SELECTOR POPUP
          ================================================================ */}
      {orderTypeModalOpen && !isCatalogViewOnly && enabledTypes.length > 1 && (
        <div className="pm-modal-backdrop" onClick={() => setOrderTypeModalOpen(false)}>
          <div className="pm-sheet" style={{ padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 800, textAlign: 'center', color: 'var(--pm-ink)' }}>
              حدد طريقة الطلب
            </h3>
            {enabledTypes.map((t) => (
              <button
                key={t}
                type="button"
                className={`pm-option-row ${orderType === t ? 'selected' : ''}`}
                onClick={() => {
                  setOrderType(t);
                  setOrderTypeModalOpen(false);
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700 }}>
                  <span style={{ color: accentText, display: 'inline-flex' }}>{ORDER_TYPE_META[t].icon}</span>
                  <span>{ORDER_TYPE_META[t].label}</span>
                </span>
                {orderType === t && <Check size={17} style={{ color: accentText }} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 8: ABOUT US POPUP
          ================================================================ */}
      {aboutModalOpen && (
        <div className="pm-modal-backdrop" onClick={() => setAboutModalOpen(false)}>
          <div className="pm-sheet" style={{ padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--pm-ink)' }}>نبذة عن {rest.n}</h3>
              <button
                type="button"
                onClick={() => setAboutModalOpen(false)}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                ✕
              </button>
            </div>
            {rest.aboutImage && (
              <img
                src={rest.aboutImage}
                alt={rest.n}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: '14px', marginBottom: '12px' }}
              />
            )}
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.75, color: 'var(--pm-muted)' }}>{rest.aboutText}</p>
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 10: SERVICE RATING POPUP
          ================================================================ */}
      {rateModalOpen && reviewsAllowSubmit && (
        <div className="pm-modal-backdrop" onClick={() => setRateModalOpen(false)}>
          <div className="pm-sheet" style={{ padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--pm-ink)' }}>⭐ تقييم الخدمة</h3>
              <button
                type="button"
                onClick={() => setRateModalOpen(false)}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmitReview}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setRevRate(num)}
                    style={{
                      border: 0,
                      background: 'none',
                      cursor: 'pointer',
                      color: num <= revRate ? '#f59e0b' : 'var(--pm-muted)',
                    }}
                  >
                    <Star size={30} fill={num <= revRate ? '#f59e0b' : 'none'} />
                  </button>
                ))}
              </div>
              <label className="f" style={{ color: 'var(--pm-ink)' }}>
                الاسم
                <input value={revName} onChange={(e) => setRevName(e.target.value)} required />
              </label>
              <label className="f" style={{ color: 'var(--pm-ink)' }}>
                رقم الهاتف (اختياري)
                <input type="tel" dir="ltr" placeholder="07701234567" value={revPhone} onChange={(e) => setRevPhone(e.target.value)} />
              </label>
              <label className="f" style={{ color: 'var(--pm-ink)' }}>
                تعليقك
                <textarea value={revComment} onChange={(e) => setRevComment(e.target.value)} rows={3} required />
              </label>
              <button
                type="submit"
                style={{
                  width: '100%',
                  border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                  borderRadius: '12px',
                  background: brandColor,
                  color: brandInk,
                  padding: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                إرسال التقييم
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 11: PROMOTIONAL OFFER POPUP (Ad close-only OR Dish add-to-cart)
          ================================================================ */}
      {offerModalOpen && offerPopupEnabled && offerPopupTitle && (
        <div
          className="pm-modal-backdrop"
          style={{ alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => setOfferModalOpen(false)}
        >
          <div
            className="pm-sheet"
            style={{
              width: 'min(410px, 100%)',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '24px',
              overflow: 'hidden',
              position: 'relative',
              padding: 0,
              boxShadow: '0 26px 64px rgba(0, 0, 0, 0.45)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOfferModalOpen(false)}
              aria-label="إغلاق"
              style={{
                position: 'absolute',
                top: '12px',
                insetInlineEnd: '12px',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: 'rgba(15, 23, 42, 0.56)',
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                color: '#ffffff',
                zIndex: 10,
              }}
            >
              <X size={16} />
            </button>

            {offerPopupImage && (
              <div style={{ position: 'relative', width: '100%', height: '205px', flexShrink: 0, overflow: 'hidden', background: 'var(--pm-soft)' }}>
                <img
                  src={offerPopupImage}
                  alt={offerPopupTitle}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    insetInline: 0,
                    bottom: 0,
                    height: '44px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.28), transparent)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            )}

            <div
              style={{
                padding: offerPopupImage ? '18px 22px 22px' : '46px 22px 22px',
                overflowY: 'auto',
                textAlign: 'center',
              }}
            >
              {offerPopupBadge && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 12px',
                    borderRadius: '999px',
                    background: 'var(--pm-soft)',
                    border: '1px solid color-mix(in srgb, var(--pm-brand) 30%, transparent)',
                    color: accentText,
                    fontSize: '12px',
                    fontWeight: 800,
                    marginBottom: '10px',
                  }}
                >
                  {offerPopupBadge}
                </div>
              )}

              <h3 style={{ margin: '0 0 8px', fontSize: '19px', fontWeight: 900, color: 'var(--pm-ink)', lineHeight: 1.35 }}>
                {offerPopupTitle}
              </h3>

              {offerPopupSubtitle && (
                <p style={{ margin: '0 0 16px', fontSize: '13.5px', color: 'var(--pm-muted)', lineHeight: 1.6 }}>
                  {offerPopupSubtitle}
                </p>
              )}

              {offerPopupMode === 'dish' && (offerPopupSpecialPrice !== undefined || offerPopupLinkedItem) && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    padding: '6px 16px',
                    borderRadius: '14px',
                    background: 'var(--pm-soft)',
                    marginBottom: '16px',
                  }}
                >
                  {offerPopupSpecialPrice !== undefined ? (
                    <>
                      {offerPopupLinkedItem && offerPopupLinkedItem.pr > offerPopupSpecialPrice && (
                        <s className="tabular-nums" style={{ fontSize: '12.5px', color: 'var(--pm-muted)', fontWeight: 700 }}>
                          {fmtMoney(offerPopupLinkedItem.pr)}
                        </s>
                      )}
                      <b className="tabular-nums" style={{ fontSize: '15.5px', fontWeight: 900, color: accentText }}>
                        {fmtMoney(offerPopupSpecialPrice)}
                      </b>
                    </>
                  ) : offerPopupLinkedItem ? (
                    <b className="tabular-nums" style={{ fontSize: '15.5px', fontWeight: 900, color: accentText }}>
                      {fmtMoney(offerPopupLinkedItem.pr)}
                    </b>
                  ) : null}
                </div>
              )}

              <div
                dir="rtl"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                }}
              >
                {offerPopupMode === 'dish' && !isCatalogViewOnly && !(offerPopupLinkedItem && isDisplayOnlyItem(offerPopupLinkedItem)) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setOfferModalOpen(false);
                        if (offerPopupLinkedItem) {
                          if (isDisplayOnlyItem(offerPopupLinkedItem)) return;
                          if (offerPopupSpecialPrice !== undefined) {
                            addSpecialCustomLine(
                              `offer_${offerPopupLinkedItem.id}`,
                              offerPopupTitle || offerPopupLinkedItem.n,
                              offerPopupSpecialPrice,
                              offerPopupBadge || 'عرض خاص',
                              offerPopupImage || offerPopupLinkedItem.img
                            );
                          } else {
                            quickAddOrOpenModal(offerPopupLinkedItem);
                          }
                        } else if (offerPopupSpecialPrice !== undefined) {
                          addSpecialCustomLine(
                            `offer_popup_${restaurantId}`,
                            offerPopupTitle,
                            offerPopupSpecialPrice,
                            offerPopupBadge || 'عرض خاص',
                            offerPopupImage || undefined
                          );
                        } else {
                          const firstSection = document.querySelector<HTMLElement>('section[id^="mc-"]');
                          if (firstSection) {
                            firstSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }
                      }}
                      style={{
                        flex: '1 1 160px',
                        height: '42px',
                        padding: '0 18px',
                        borderRadius: '14px',
                        border: 'none',
                        background: brandColor,
                        color: brandInk,
                        fontWeight: 800,
                        fontSize: '13.5px',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '7px',
                        boxShadow: '0 6px 18px color-mix(in srgb, var(--pm-brand) 28%, transparent)',
                        cursor: 'pointer',
                      }}
                    >
                      <ShoppingBag size={15} />
                      <span>{offerPopupBtnText}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOfferModalOpen(false)}
                      style={{
                        height: '42px',
                        padding: '0 18px',
                        borderRadius: '14px',
                        border: '1px solid var(--pm-line)',
                        background: 'var(--pm-soft)',
                        color: 'var(--pm-ink)',
                        fontWeight: 700,
                        fontSize: '13px',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      إغلاق
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOfferModalOpen(false)}
                    style={{
                      minWidth: '160px',
                      height: '42px',
                      padding: '0 24px',
                      borderRadius: '14px',
                      border: '1px solid var(--pm-line)',
                      background: 'var(--pm-soft)',
                      color: 'var(--pm-ink)',
                      fontWeight: 800,
                      fontSize: '13.5px',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    {offerPopupBtnText}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 12: INTERACTIVE SPIN-THE-WHEEL PROMO MODAL
          ================================================================ */}
      {spinModalOpen && addons.spinWheelPromo?.enabled && (
        <div className="pm-modal-backdrop" onClick={() => setSpinModalOpen(false)}>
          <div
            className="pm-sheet"
            style={{ borderRadius: '24px', maxWidth: '400px', padding: '24px', textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--pm-ink)' }}>{addons.spinWheelPromo.title || 'عجلة الحظ'}</h3>
              <button
                type="button"
                onClick={() => setSpinModalOpen(false)}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                width: '190px',
                height: '190px',
                margin: '12px auto 18px',
                borderRadius: '50%',
                border: `6px solid ${accentText}`,
                background: 'conic-gradient(#f59e0b 0deg 90deg, #10b981 90deg 180deg, #3b82f6 180deg 270deg, #ef4444 270deg 360deg)',
                display: 'grid',
                placeItems: 'center',
                transform: `rotate(${wheelDeg}deg)`,
                transition: 'transform 3.3s cubic-bezier(0.17, 0.67, 0.25, 1)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
              }}
            >
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--pm-card)', border: '2px solid var(--pm-line)', display: 'grid', placeItems: 'center', color: accentText, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
                <Gift size={24} />
              </div>
            </div>

            {spinWonReward ? (
              <div style={{ background: 'rgba(16, 185, 129, 0.16)', border: '1px solid rgba(52, 211, 153, 0.4)', color: accentText, borderRadius: '14px', padding: '12px', marginBottom: '12px', fontWeight: 800 }}>
                مبروك! ربحت: {spinWonReward.label} (سيُطبق في السلة تلقائياً)
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--pm-muted)', marginBottom: '14px' }}>
                اضغط لتدوير العجلة واربح خصماً فورياً أو توصيلاً مجانياً لطلبك اليوم!
              </p>
            )}

            <button
              type="button"
              disabled={isSpinning || Boolean(spinWonReward)}
              onClick={handleSpinWheel}
              style={{
                width: '100%',
                border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                borderRadius: '12px',
                background: spinWonReward ? '#059669' : brandColor,
                color: spinWonReward ? '#ffffff' : brandInk,
                padding: '13px',
                fontWeight: 800,
                fontSize: '14.5px',
                cursor: isSpinning || spinWonReward ? 'default' : 'pointer',
              }}
            >
              {isSpinning
                ? 'جاري تدوير العجلة...'
                : spinWonReward
                ? '✓ تم تفعيل المكافأة بالسلة'
                : 'أدر العجلة الآن'}
            </button>
          </div>
        </div>
      )}

      {/* Mood Meal / Smart Store Finder Modal */}
      {moodModalOpen && addons.moodMealFinder?.enabled && (() => {
        const moods: Array<{ id: 'fast' | 'light' | 'spicy' | 'sweet'; emoji: string; label: string; desc: string }> = isEstore
          ? [
              { id: 'fast', emoji: '📱', label: 'هواتف وأجهزة رائدة', desc: 'أحدث الهواتف واللابتوبات الذكية' },
              { id: 'light', emoji: '🎧', label: 'سماعات وصوتيات', desc: 'سماعات لاسلكية وصوت محيطي' },
              { id: 'spicy', emoji: '⌚', label: 'ساعات وإكسسوارات', desc: 'ساعات ذكية وشواحن وكفرات' },
              { id: 'sweet', emoji: '🎮', label: 'ألعاب وعروض قوية', desc: 'أجهزة ترفيه وتخفيضات مميزة' },
            ]
          : [
              { id: 'fast', emoji: '⚡', label: 'جوعان ومستعجل', desc: 'أطباق رئيسية سريعة التحضير' },
              { id: 'light', emoji: '🥗', label: 'خفيف وصحي', desc: 'سعرات أخف واختيارات منعشة' },
              { id: 'spicy', emoji: '🔥', label: 'نكهة قوية ومميزة', desc: 'مشويات ونكهات حارة ومميزة' },
              { id: 'sweet', emoji: '🍰', label: 'شيء حلو ومزاج عالي', desc: 'حلويات ومشروبات ترفع المزاج' },
            ];
        const availablePool = allItems.filter(
          (it) => (isCatalogViewOnly || !isDisplayOnlyItem(it)) && itemEvalMap.get(it.id)?.available !== false
        );
        const picks = (() => {
          if (isEstore) {
            if (selectedMood === 'light') {
              const matched = availablePool.filter((i) => /سماع|صوت|airpods|buds|headphone|speaker|audio/i.test(`${i.n} ${i.d || ''}`));
              return (matched.length ? matched : availablePool).slice(0, 3);
            }
            if (selectedMood === 'spicy') {
              const matched = availablePool.filter((i) => /ساع|شاحن|كفر|watch|cable|charger|case|mag/i.test(`${i.n} ${i.d || ''}`));
              return (matched.length ? matched : availablePool).slice(0, 3);
            }
            if (selectedMood === 'sweet') {
              const matched = availablePool.filter((i) => /لعب|بلاي|شاش|gaming|ps5|console|keyboard|خصم/i.test(`${i.n} ${i.d || ''}`));
              return (matched.length ? matched : availablePool.slice(-3)).slice(0, 3);
            }
            const matched = availablePool.filter((i) => /هاتف|ايفون|سامسونج|لابتوب|ماك|ايباد|iphone|macbook|galaxy|ipad/i.test(`${i.n} ${i.d || ''}`));
            return (matched.length ? matched : availablePool).slice(0, 3);
          }
          if (selectedMood === 'light') {
            const matched = availablePool.filter((i) => /سلط|خفيف|مشوي|صحي|دايت|تونة|salad|grill|light|healthy/i.test(`${i.n} ${i.d || ''}`));
            return (matched.length ? matched : [...availablePool].sort((a, b) => (parseCaloriesNum(a.calories) || 9999) - (parseCaloriesNum(b.calories) || 9999))).slice(0, 3);
          }
          if (selectedMood === 'spicy') {
            const matched = availablePool.filter((i) => /حار|سبايسي|فلفل|مشوي|كباب|زنجر|spicy|hot|chili|zinger/i.test(`${i.n} ${i.d || ''}`));
            return (matched.length ? matched : availablePool).slice(0, 3);
          }
          if (selectedMood === 'sweet') {
            const matched = availablePool.filter((i) => /حلو|كيك|عصير|قهوة|شاي|كنافة|وافل|موهيتو|مشروب|cake|sweet|juice|coffee|tea|waffle/i.test(`${i.n} ${i.d || ''}`));
            return (matched.length ? matched : availablePool.slice(-3)).slice(0, 3);
          }
          return availablePool.slice(0, 3);
        })();
        return (
          <div className="pm-modal-backdrop" onClick={() => setMoodModalOpen(false)}>
            <div className="pm-sheet" style={{ padding: '20px' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <b style={{ fontSize: '17px', color: 'var(--pm-ink)' }}>
                  {addons.moodMealFinder.title ||
                    (isEstore ? 'مستشار التسوق الذكي — اختر ما يناسب احتياجك' : 'اختر وجبتك حسب مزاجك الآن')}
                </b>
                <button
                  type="button"
                  onClick={() => setMoodModalOpen(false)}
                  style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', width: '32px', height: '32px', borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--pm-ink)' }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '14px' }}>
                {moods.map((m) => {
                  const active = selectedMood === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMood(m.id)}
                      style={{
                        textAlign: 'start',
                        padding: '10px',
                        borderRadius: '12px',
                        border: active ? '1.5px solid var(--pm-brand)' : '1px solid var(--pm-line)',
                        background: active ? 'color-mix(in srgb, var(--pm-brand) 14%, transparent)' : 'var(--pm-soft)',
                        color: 'var(--pm-ink)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: '15px', fontWeight: 900 }}>{m.emoji} {m.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--pm-muted)', marginTop: '2px' }}>{m.desc}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: accentText, marginBottom: '8px' }}>
                {isEstore ? 'أفضل الترشيحات لطلبك الآن:' : 'ترشيحاتنا الذكية لمزاجك الآن:'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {picks.map((it) => {
                  const sp = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                  return (
                    <div
                      key={it.id}
                      className="pm-option-row"
                      onClick={() => {
                        setMoodModalOpen(false);
                        openProductModal(it);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        {it.img && (
                          <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" style={{ width: '44px', height: '44px', borderRadius: '9px', objectFit: 'cover' }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <b style={{ display: 'block', fontSize: '13.5px', color: 'var(--pm-ink)' }}>{it.n}</b>
                          <span className="tabular-nums" style={{ fontSize: '12px', fontWeight: 900, color: accentText }}>{sp.main}</span>
                        </div>
                      </div>
                      {!isCatalogViewOnly && (
                        <button
                          type="button"
                          onClick={(e) => {
                            quickAddOrOpenModal(it, e);
                            setMoodModalOpen(false);
                          }}
                          style={{
                            border: 'none',
                            borderRadius: '9px',
                            background: brandColor,
                            color: brandInk,
                            padding: '6px 11px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          + أضف
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {shareModalOpen && (
        <Suspense fallback={null}>
          <ShareMenuModal
            isOpen={true}
            onClose={() => setShareModalOpen(false)}
            menuName={rest.n}
            menuUrl={typeof window !== 'undefined' ? window.location.href : ''}
            description={rest.tagline}
            onCopied={showToast}
            isStore={isEstore}
            palette={{
              bg: customBgColor,
              card: effectiveSurface,
              ink: effectiveInk,
              muted: effectiveMuted,
              line: effectiveLine,
              soft: effectiveSurfaceSoft,
              brand: brandColor,
              onBrand: brandInk,
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export const PublicMenuView: React.FC<PublicMenuViewProps> = ({
  restaurantId,
  session,
  onNavigate,
  showToast,
}) => {
  const [syncTick, setSyncTick] = useState(0);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [hasChosenBranch, setHasChosenBranch] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(restaurantId);

  useEffect(() => {
    let active = true;
    const handleDbUpdated = () => {
      if (active) setSyncTick((prev) => prev + 1);
    };
    window.addEventListener('menuplus_db_updated', handleDbUpdated);
    void fetchPublicMenuFast(restaurantId, { onlyIfChanged: true }).then((res) => {
      if (res.ok && active) setSyncTick((prev) => prev + 1);
    });
    return () => {
      active = false;
      window.removeEventListener('menuplus_db_updated', handleDbUpdated);
    };
  }, [restaurantId]);

  const dbRev = getDbRevision();

  const {
    entryRest,
    resolvedEntryId,
    rootRid,
    rawMainBranch,
    familyIds,
    allFamilyBranches,
  } = useMemo(() => {
    const entry =
      getItem<Restaurant>(`restaurants/${restaurantId}`) ||
      resolveRestaurantByIdOrSlug(restaurantId);
    const resolvedId = entry?.id || restaurantId;

    // Walk up parentRid chain safely so entering from any branch or slug resolves the true root family
    let rootId = resolvedId;
    const visitedUp = new Set<string>([resolvedId]);
    let curNode: Restaurant | undefined = entry;
    for (let hop = 0; hop < 5 && curNode?.parentRid; hop++) {
      const pId = String(curNode.parentRid).trim();
      if (!pId || visitedUp.has(pId)) break;
      visitedUp.add(pId);
      rootId = pId;
      curNode = getItem<Restaurant>(`restaurants/${pId}`);
    }

    const mainBranch = getItem<Restaurant>(`restaurants/${rootId}`) || entry;
    const owner = Boolean(
      session &&
        ((session.admin && !session.menuLoggedOut) ||
          session.rid === rootId ||
          session.personalRid === rootId ||
          visitedUp.has(String(session.rid || '')) ||
          visitedUp.has(String(session.personalRid || '')))
    );

    const mainIsActive = mainBranch ? mainBranch.a !== 0 : true;
    const allRests = getCollection<Restaurant>('restaurants');
    const famIds = new Set<string>([rootId]);
    const collectedChildren: Restaurant[] = [];
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const r of allRests) {
        const pId = String(r.parentRid || '').trim();
        if (pId && famIds.has(pId) && r.id && !famIds.has(r.id)) {
          famIds.add(r.id);
          const childEffectivelyActive = r.a !== 0 || mainIsActive;
          if (owner || childEffectivelyActive) {
            collectedChildren.push(r);
          }
          expanded = true;
        }
      }
    }

    const familyBranches = [mainBranch, ...collectedChildren, entry]
      .filter((b): b is Restaurant => Boolean(b && b.id))
      .filter((b, idx, arr) => arr.findIndex((x) => x.id === b.id) === idx)
      .filter((b) => owner || b.a !== 0 || (Boolean(b.parentRid) && mainIsActive) || b.id === resolvedId)
      .map((b) => ensureRestaurantDefaults(b));

    return {
      entryRest: entry,
      resolvedEntryId: resolvedId,
      rootRid: rootId,
      rawMainBranch: mainBranch,
      familyIds: famIds,
      allFamilyBranches: familyBranches,
    };
  }, [restaurantId, session, dbRev, syncTick]);

  const hasMultipleBranches = allFamilyBranches.length >= 2;
  const prevRootRidRef = useRef<string>(rootRid);

  useEffect(() => {
    if (prevRootRidRef.current !== rootRid) {
      const prevRoot = prevRootRidRef.current;
      prevRootRidRef.current = rootRid;
      // Preserve selection when rootRid merely finishes resolving for the same family
      const resolvedSameFamily =
        Boolean(entryRest?.id) &&
        (prevRoot === restaurantId || prevRoot === entryRest?.id) &&
        familyIds.has(selectedBranchId);
      if (!resolvedSameFamily) {
        setSelectedBranchId(resolvedEntryId);
        setHasChosenBranch(false);
        setBranchPickerOpen(false);
      }
    } else if (!hasChosenBranch && selectedBranchId !== resolvedEntryId && familyIds.has(resolvedEntryId)) {
      setSelectedBranchId(resolvedEntryId);
    }
  }, [rootRid, resolvedEntryId, restaurantId, entryRest?.id, familyIds, hasChosenBranch, selectedBranchId]);

  const isBranchPickerVisible = hasMultipleBranches && (!hasChosenBranch || branchPickerOpen);
  const isLockedAwaitingBranch = hasMultipleBranches && !hasChosenBranch;

  const effectiveRestaurantId =
    hasMultipleBranches && allFamilyBranches.some((b) => b.id === selectedBranchId)
      ? selectedBranchId
      : resolvedEntryId;

  const activeBranchObj =
    allFamilyBranches.find((b) => b.id === effectiveRestaurantId) || allFamilyBranches[0];
  const branchShapeRaw = activeBranchObj?.themeShape as string | undefined;
  const isT6BranchStyle = branchShapeRaw === 'theme5' || branchShapeRaw === 'theme6';
  const isBranchPickerVisibleT6Aware = isBranchPickerVisible && !isT6BranchStyle;
  const isLockedAwaitingBranchT6Aware = isLockedAwaitingBranch && !isT6BranchStyle;

  useEffect(() => {
    if (!isBranchPickerVisibleT6Aware) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isBranchPickerVisibleT6Aware]);
  const branchShortLabel = !activeBranchObj
    ? 'اختر فرع'
    : (activeBranchObj.branchName || '').trim() || activeBranchObj.n;

  const activeTheme = getMenuThemeById(activeBranchObj?.themePreset, activeBranchObj?.themeMode);
  const activeMode = activeTheme.mode;
  const modalBg = activeBranchObj?.bgColor || activeTheme.bg || (activeMode === 'light' ? '#f8fafc' : '#0f172a');
  const modalCard = activeTheme.surface || (activeMode === 'light' ? '#ffffff' : '#111827');
  const modalInk = getContrastInk(modalCard);
  const modalMuted = activeMode === 'light' ? '#64748b' : '#94a3b8';
  const modalLine = activeMode === 'light' ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.14)';
  const modalBrand = activeBranchObj?.color || activeTheme.brand || '#10b981';

  const handleChooseBranch = (branchId: string) => {
    const chosenBranch = allFamilyBranches.find((b) => b.id === branchId);
    setSelectedBranchId(branchId);
    setHasChosenBranch(true);
    setBranchPickerOpen(false);
    if (typeof window !== 'undefined') {
      if (chosenBranch) {
        const chosenTitle = (chosenBranch.branchName || '').trim() || chosenBranch.n;
        if (chosenTitle) {
          document.title = chosenTitle;
        }
        const isSubdomainHost = Boolean(
          (window as { __MENUPLUS_SUBDOMAIN__?: unknown }).__MENUPLUS_SUBDOMAIN__
        );
        if (!isSubdomainHost) {
          const chosenSlug = getSlugForRestaurantId(branchId) || chosenBranch.slug || branchId;
          const nextPath = `/${chosenSlug}${window.location.search || ''}`;
          if (`${window.location.pathname}${window.location.search}` !== nextPath) {
            try {
              window.history.replaceState(null, '', nextPath);
            } catch {
              // ignore restricted WebView history errors
            }
          }
        }
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    void fetchPublicMenuFast(branchId, { onlyIfChanged: true }).then((res) => {
      if (res.ok) setSyncTick((prev) => prev + 1);
    });
  };

  const handleDismissBranchPicker = () => {
    if (!hasChosenBranch) return;
    setBranchPickerOpen(false);
  };

  const branchPortalTarget =
    typeof document !== 'undefined' ? document.body || document.documentElement : null;

  return (
    <>
      <div
        aria-hidden={isLockedAwaitingBranchT6Aware ? true : undefined}
        style={
          isLockedAwaitingBranchT6Aware
            ? {
                pointerEvents: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                filter: 'blur(4px)',
                opacity: 0.35,
              }
            : undefined
        }
      >
        <PublicMenuContent
          key={`${effectiveRestaurantId}_${hasChosenBranch ? 'chosen' : 'pending'}`}
          restaurantId={effectiveRestaurantId}
          session={session}
          onNavigate={onNavigate}
          showToast={showToast}
          hasMultipleBranches={hasMultipleBranches}
          branchShortLabel={branchShortLabel}
          onOpenBranchPicker={() => setBranchPickerOpen(true)}
          familyBranches={allFamilyBranches}
          selectedBranchId={effectiveRestaurantId}
          onSelectBranch={handleChooseBranch}
        />
      </div>

      {isBranchPickerVisibleT6Aware &&
        branchPortalTarget &&
        createPortal(
          <div
            onClick={handleDismissBranchPicker}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 2147483647,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              backgroundColor: 'rgba(2, 6, 23, 0.84)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              opacity: 1,
            }}
          >
            <div
              dir="rtl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mandatory-branch-picker-title"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '420px',
                maxHeight: '90dvh',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '26px',
                padding: '22px',
                backgroundColor: modalCard,
                color: modalInk,
                border: `1px solid ${modalLine}`,
                boxShadow: '0 28px 70px rgba(0, 0, 0, 0.55)',
                opacity: 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  {rawMainBranch?.logo ? (
                    <img
                      src={rawMainBranch.logo}
                      alt={rawMainBranch.n || 'شعار المتجر'}
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '14px',
                        objectFit: 'cover',
                        border: `1px solid ${modalLine}`,
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '14px',
                        backgroundColor: 'rgba(16, 185, 129, 0.16)',
                        color: modalBrand,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <GitBranch size={20} />
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    {rawMainBranch?.n && (
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: modalMuted,
                          marginBottom: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {rawMainBranch.n}
                      </div>
                    )}
                    <h3
                      id="mandatory-branch-picker-title"
                      style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: modalInk }}
                    >
                      اختر الفرع
                    </h3>
                  </div>
                </div>

                {hasChosenBranch && (
                  <button
                    type="button"
                    onClick={handleDismissBranchPicker}
                    aria-label="إغلاق"
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      border: `1px solid ${modalLine}`,
                      backgroundColor: modalBg,
                      color: modalMuted,
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <p
                style={{
                  margin: '0 0 14px',
                  fontSize: '13.5px',
                  lineHeight: 1.5,
                  color: modalMuted,
                  fontWeight: 600,
                }}
              >
                يرجى اختيار الفرع للمتابعة وعرض قائمته والطلب منه مباشرة.
              </p>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  paddingBottom: '2px',
                }}
              >
                {allFamilyBranches.map((branch) => {
                  const isSelected = hasChosenBranch && branch.id === effectiveRestaurantId;
                  const branchTitle = (branch.branchName || '').trim() || branch.n;
                  const branchAddr = (branch.addr || '').trim();
                  const branchOpen = isRestaurantOpenNow(branch);
                  return (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => handleChooseBranch(branch.id)}
                      style={{
                        width: '100%',
                        textAlign: 'start',
                        padding: '15px 16px',
                        borderRadius: '18px',
                        border: isSelected ? `2px solid ${modalBrand}` : `1px solid ${modalLine}`,
                        backgroundColor: modalBg,
                        color: modalInk,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: '17px',
                            fontWeight: 900,
                            lineHeight: 1.35,
                            color: modalInk,
                            wordBreak: 'break-word',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span>{branchTitle}</span>
                          {isSelected && <Check size={16} style={{ color: modalBrand, flexShrink: 0 }} />}
                        </div>
                        {branchAddr && (
                          <div
                            style={{
                              marginTop: '4px',
                              fontSize: '12.5px',
                              fontWeight: 600,
                              color: modalMuted,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <MapPin size={12} style={{ flexShrink: 0 }} />
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {branchAddr}
                            </span>
                          </div>
                        )}
                      </div>

                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 800,
                          padding: '5px 11px',
                          borderRadius: '10px',
                          flexShrink: 0,
                          backgroundColor: branchOpen ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                          color: branchOpen ? '#10b981' : '#ef4444',
                        }}
                      >
                        {branchOpen ? 'مفتوح' : 'مغلق'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          branchPortalTarget
        )}
    </>
  );
};
