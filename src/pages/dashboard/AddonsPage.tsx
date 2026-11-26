/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  Edit,
  Eye,
  Image as ImageIcon,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { LoyaltyCustomer } from '../../types';
import { getContextualAddonCatalog } from '../../data/addonsCatalog';
import {
  deleteItemAndSync,
  formatNumber,
  getCollection,
  putItemAndSync,
} from '../../utils/storage';
import { MediaLibraryModal } from '../../components/MediaLibraryModal';
import { AppSelect } from '../../components/AppSelect';
import {
  getAddonRequiredPlanLabel,
  getAddonRequiredPlanTier,
  isAddonAllowedForPlan,
} from '../../utils/plans';
import { playBellTone, useDashboard } from './DashboardContext';
import {
  dashCardMotion,
  dashModalMotion,
  dashSectionMotion,
} from '../../utils/dashboardMotion';

const ARABIC_WEEKDAYS = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

function formatArabicEndDayAndDate(timestamp: number): { weekday: string; dateTime: string } {
  const d = new Date(timestamp);
  const weekday = ARABIC_WEEKDAYS[d.getDay()] ?? '';
  const datePart = d.toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const timePart = d.toLocaleTimeString('ar-IQ', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return {
    weekday,
    dateTime: `${datePart} · ${timePart}`,
  };
}

function formatHourArabic(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const hh24 = `${String(h).padStart(2, '0')}:00`;
  if (h === 0) return `12:00 منتصف الليل (${hh24})`;
  if (h < 12) return `${h}:00 صباحاً (${hh24})`;
  if (h === 12) return `12:00 ظهراً (${hh24})`;
  return `${h - 12}:00 مساءً (${hh24})`;
}

function normalizeLoyaltyPhoneInput(raw: string): string {
  const digits = String(raw || '').replace(/[\s\-()+]/g, '').replace(/[^\d]/g, '');
  if (digits.startsWith('964') && digits.length >= 12) {
    return `0${digits.slice(3)}`;
  }
  return digits;
}

export const AddonsPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [showOfferMediaLibrary, setShowOfferMediaLibrary] = useState(false);
  const [loyaltyNameInput, setLoyaltyNameInput] = useState('');
  const [loyaltyPhoneInput, setLoyaltyPhoneInput] = useState('');
  const [loyaltyAmountInput, setLoyaltyAmountInput] = useState('');
  const [loyaltyDirectPtsInput, setLoyaltyDirectPtsInput] = useState('');
  const [loyaltySearchQuery, setLoyaltySearchQuery] = useState('');
  const [loyaltyBusyId, setLoyaltyBusyId] = useState<string | null>(null);
  const [loyaltyRev, setLoyaltyRev] = useState(0);
  const addonModalOverlayRef = useRef<HTMLDivElement | null>(null);
  const previewModalOverlayRef = useRef<HTMLDivElement | null>(null);
  const {
    rid,
    rest,
    resolvedPlan,
    currency,
    allItems,
    addonsState,
    editingAddonKey,
    addonDraft,
    setAddonDraft,
    addonEditIntent,
    addonEditError,
    setAddonEditError,
    addonSaving,
    showPopupPreview,
    setShowPopupPreview,
    handleToggleAddon,
    handleOpenAddonEdit,
    handleSaveAddonEdit,
    closeAddonEditModal,
    mediaLibraryItems,
    uploadImagesToLibrary,
    removeMediaLibraryItem,
    openUpgradeModal,
    onRefresh,
    showToast,
    terms,
  } = useDashboard();

  const loyaltyCustomers = useMemo(() => {
    void loyaltyRev;
    return getCollection<LoyaltyCustomer>('loyalty')
      .filter((c) => c.rid === rid)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [rid, loyaltyRev, editingAddonKey]);

  const filteredLoyaltyCustomers = useMemo(() => {
    const q = loyaltySearchQuery.trim().toLowerCase();
    if (!q) return loyaltyCustomers;
    return loyaltyCustomers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
    );
  }, [loyaltyCustomers, loyaltySearchQuery]);

  const handleSaveLoyaltyCustomer = async () => {
    const cleanName = loyaltyNameInput.trim();
    const normPhone = normalizeLoyaltyPhoneInput(loyaltyPhoneInput);
    if (!cleanName || normPhone.length < 7) {
      showToast('يرجى إدخال اسم الزبون ورقم الهاتف الصحيح');
      return;
    }
    const ptsRate = Math.max(1, Number(addonDraft.pointsPerThousand ?? addonsState.loyaltyPoints?.pointsPerThousand ?? 1) || 1);
    const billAmt = Math.max(0, Number(loyaltyAmountInput) || 0);
    const billEarned = billAmt > 0 ? Math.floor(billAmt / 1000) * ptsRate : 0;
    const directEarned = Math.max(0, Math.round(Number(loyaltyDirectPtsInput) || 0));
    const addedPts = billEarned + directEarned;
    const customerId = `${rid}__${normPhone}`;
    const existing = loyaltyCustomers.find((c) => c.id === customerId || c.phone === normPhone);
    const now = Date.now();
    const nextRecord: LoyaltyCustomer = {
      id: customerId,
      rid,
      phone: normPhone,
      name: cleanName,
      points: Math.max(0, Number(existing?.points || 0)) + addedPts,
      totalOrders: Math.max(0, Number(existing?.totalOrders || 0)) + (billAmt > 0 ? 1 : 0),
      totalSpent: Math.max(0, Number(existing?.totalSpent || 0)) + billAmt,
      createdAt: Number(existing?.createdAt || now),
      updatedAt: now,
    };
    setLoyaltyBusyId('__add__');
    try {
      await putItemAndSync<LoyaltyCustomer>(`loyalty/${customerId}`, nextRecord);
      setLoyaltyRev((v) => v + 1);
      setLoyaltyNameInput('');
      setLoyaltyPhoneInput('');
      setLoyaltyAmountInput('');
      setLoyaltyDirectPtsInput('');
      onRefresh();
      showToast(
        addedPts > 0
          ? `تم تسجيل ${cleanName} وإضافة +${formatNumber(addedPts)} نقطة ✓`
          : `تم تسجيل ${cleanName} في نظام النقاط ✓`
      );
    } finally {
      setLoyaltyBusyId(null);
    }
  };

  const handleAdjustLoyaltyPoints = async (customer: LoyaltyCustomer, delta: number) => {
    const nextPts = Math.max(0, Number(customer.points || 0) + delta);
    setLoyaltyBusyId(customer.id);
    try {
      await putItemAndSync<LoyaltyCustomer>(`loyalty/${customer.id}`, {
        ...customer,
        points: nextPts,
        updatedAt: Date.now(),
      });
      setLoyaltyRev((v) => v + 1);
      onRefresh();
    } finally {
      setLoyaltyBusyId(null);
    }
  };

  const handleDeleteLoyaltyCustomer = async (customer: LoyaltyCustomer) => {
    setLoyaltyBusyId(customer.id);
    try {
      await deleteItemAndSync(`loyalty/${customer.id}`);
      setLoyaltyRev((v) => v + 1);
      onRefresh();
      showToast('تم حذف سجل النقاط للزبون');
    } finally {
      setLoyaltyBusyId(null);
    }
  };

  const localizedCatalog = getContextualAddonCatalog(terms.isStore);
  const sortAddonKeysByEnabled = (
    catalog: ReturnType<typeof getContextualAddonCatalog>,
    stateObj: typeof addonsState
  ): string[] => {
    const enabledKeys: string[] = [];
    const inactiveKeys: string[] = [];
    catalog.forEach((a) => {
      const keyStr = String(a.key);
      const allowed = isAddonAllowedForPlan(a.key, resolvedPlan);
      const isOn = allowed && Boolean((stateObj[a.key] as Record<string, any> | undefined)?.enabled);
      if (isOn) enabledKeys.push(keyStr);
      else inactiveKeys.push(keyStr);
    });
    return [...enabledKeys, ...inactiveKeys];
  };

  const [pinnedOrderKeys, setPinnedOrderKeys] = useState<string[]>(() =>
    sortAddonKeysByEnabled(localizedCatalog, addonsState)
  );
  const orderScopeRef = useRef<string>(`${rid}::${terms.isStore ? '1' : '0'}`);

  useEffect(() => {
    const nextScope = `${rid}::${terms.isStore ? '1' : '0'}`;
    if (orderScopeRef.current !== nextScope) {
      orderScopeRef.current = nextScope;
      setPinnedOrderKeys(sortAddonKeysByEnabled(localizedCatalog, addonsState));
    }
  }, [rid, terms.isStore]);

  const visibleAddons = useMemo(() => {
    const byKey = new Map<string, (typeof localizedCatalog)[number]>(
      localizedCatalog.map((a) => [String(a.key), a])
    );
    const ordered: typeof localizedCatalog = [];
    const seen = new Set<string>();
    pinnedOrderKeys.forEach((k) => {
      const item = byKey.get(k);
      if (item && !seen.has(String(item.key))) {
        seen.add(String(item.key));
        ordered.push(item);
      }
    });
    localizedCatalog.forEach((a) => {
      const keyStr = String(a.key);
      if (!seen.has(keyStr)) {
        seen.add(keyStr);
        ordered.push(a);
      }
    });
    return ordered;
  }, [localizedCatalog, pinnedOrderKeys]);

  const allowedAddonsCount = localizedCatalog.filter((a) => isAddonAllowedForPlan(a.key, resolvedPlan)).length;
  const enabledCount = localizedCatalog.filter(
    (a) =>
      isAddonAllowedForPlan(a.key, resolvedPlan) &&
      Boolean((addonsState[a.key] as Record<string, any> | undefined)?.enabled)
  ).length;
  const addonsLimitText = `${enabledCount}/${allowedAddonsCount}`;

  const updateDraft = (updater: (prev: Record<string, any>) => Record<string, any>) => {
    if (addonEditError) setAddonEditError('');
    setAddonDraft(updater);
  };

  const closeEditModal = closeAddonEditModal;

  const activeMeta = editingAddonKey ? localizedCatalog.find((a) => a.key === editingAddonKey) : null;
  const activeSavedCfg = editingAddonKey
    ? ((addonsState[editingAddonKey] || {}) as Record<string, any>)
    : {};
  const requiresInitialSetup = addonEditIntent === 'enable' || !activeSavedCfg.configured;
  const currentLocalHour = new Date().getHours();

  const waTargetPhone = String(rest.social?.whatsapp || rest.ph || '').trim();

  const isAnyAddonModalOpen = Boolean((editingAddonKey && activeMeta) || showPopupPreview);

  useEffect(() => {
    if (!isAnyAddonModalOpen || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showPopupPreview) {
        setShowPopupPreview(false);
        return;
      }
      if (!showOfferMediaLibrary && editingAddonKey) {
        closeEditModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const syncVisualViewport = () => {
      const vv = window.visualViewport;
      const h = Math.max(260, Math.round(vv?.height || window.innerHeight || 0));
      const top = Math.max(0, Math.round(vv?.offsetTop || 0));
      [addonModalOverlayRef.current, previewModalOverlayRef.current].forEach((el) => {
        if (!el) return;
        el.style.setProperty('--mp-vv-height', `${h}px`);
        el.style.setProperty('--mp-vv-offset-top', `${top}px`);
      });
    };

    syncVisualViewport();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncVisualViewport, { passive: true });
    vv?.addEventListener('scroll', syncVisualViewport, { passive: true });
    window.addEventListener('resize', syncVisualViewport, { passive: true });

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
      vv?.removeEventListener('resize', syncVisualViewport);
      vv?.removeEventListener('scroll', syncVisualViewport);
      window.removeEventListener('resize', syncVisualViewport);
    };
  }, [isAnyAddonModalOpen, showPopupPreview, showOfferMediaLibrary, editingAddonKey]);

  return (
    <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
      <motion.div
        className="mp-items-toolbar"
        {...dashSectionMotion(prefersReducedMotion, 0)}
        style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: '10px' }}
      >
        <div
          className={`mp-items-count-box ${allowedAddonsCount === 0 ? 'is-limit' : ''}`}
          aria-label={`صلاحيتك بالإضافات ${addonsLimitText}`}
        >
          <span className="mp-items-count-label">صلاحيتك بالإضافات</span>
          <span className="mp-items-count-divider" aria-hidden="true" />
          <span dir="ltr" className="mp-items-count-num tabular-nums">
            {addonsLimitText}
          </span>
        </div>
      </motion.div>

      <div className="mp-addons-grid">
        {visibleAddons.map((addon, idx) => {
          const allowed = isAddonAllowedForPlan(addon.key, resolvedPlan);
          const reqLabel = getAddonRequiredPlanLabel(addon.key);
          const cfg = (addonsState[addon.key] || {}) as Record<string, any>;
          const isEnabled = allowed && Boolean(cfg.enabled);
          const targetUpgradeTier = getAddonRequiredPlanTier(addon.key);

          return (
            <motion.div
              key={addon.key}
              className={`mp-addon-square-card ${isEnabled ? 'is-enabled' : !allowed ? 'is-locked' : 'is-disabled'}`}
              {...dashCardMotion(prefersReducedMotion, idx % 8, allowed ? 1 : 0.72, false, 0.06)}
            >
              {/* Top Row: Icon + Title (+ Lock badge only if plan-locked) */}
              <div className="mp-addon-card-head">
                <div className={`mp-addon-card-icon ${isEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
                  <span>{addon.icon}</span>
                </div>
                <b className="mp-addon-card-title">{addon.title}</b>
                {!allowed && (
                  <span className="mp-addon-lock-badge" aria-label="مقفل في الباقة الحالية">
                    🔒
                  </span>
                )}
              </div>

              {/* Center: Clear Explanation + Optional Live Config Meta */}
              <div className="mp-addon-card-body">
                <p className="mp-addon-card-desc">{addon.desc}</p>
                {addon.key === 'freeDeliveryProgress' && (
                  <div className="mp-addon-card-meta tabular-nums" style={{ color: isEnabled ? 'var(--brand)' : 'var(--muted)' }}>
                    {Number(cfg.minAmount ?? 0) > 0
                      ? `الحد الأدنى: ${formatNumber(Number(cfg.minAmount ?? 0))} ${currency}`
                      : 'الحد الأدنى: لا يوجد حد أدنى'}
                    {Number(cfg.maxDiscountAmount ?? 0) > 0
                      ? ` · الحد الأعلى: ${formatNumber(Number(cfg.maxDiscountAmount))} ${currency}`
                      : ''}
                  </div>
                )}
                {(addon.key === 'countdownTimer' ||
                  addon.key === 'happyHour' ||
                  addon.key === 'limitedTimeDiscount' ||
                  addon.key === 'firstOrderDiscount' ||
                  addon.key === 'pickupInstantDiscount' ||
                  addon.key === 'dineInDiscount') &&
                  (addon.key === 'dineInDiscount' ||
                    Number(cfg.minOrderAmount ?? 0) > 0 ||
                    Number(cfg.maxDiscountAmount ?? 0) > 0) && (
                    <div className="mp-addon-card-meta tabular-nums" style={{ color: isEnabled ? 'var(--brand)' : 'var(--muted)' }}>
                      {addon.key === 'dineInDiscount' ? `خصم ${formatNumber(Number(cfg.discountPercent ?? 10))}%` : ''}
                      {addon.key === 'dineInDiscount' && (Number(cfg.minOrderAmount ?? 0) > 0 || Number(cfg.maxDiscountAmount ?? 0) > 0) ? ' · ' : ''}
                      {Number(cfg.minOrderAmount ?? 0) > 0
                        ? `أدنى طلب: ${formatNumber(Number(cfg.minOrderAmount))} ${currency}`
                        : addon.key === 'dineInDiscount'
                        ? ''
                        : 'بدون حد أدنى'}
                      {Number(cfg.maxDiscountAmount ?? 0) > 0
                        ? ` · أعلى خصم: ${formatNumber(Number(cfg.maxDiscountAmount))} ${currency}`
                        : ''}
                    </div>
                  )}
                {addon.key === 'minOrder' && (
                  <div className="mp-addon-card-meta tabular-nums" style={{ color: isEnabled ? 'var(--brand)' : 'var(--muted)' }}>
                    الحد الأدنى: {formatNumber(Number(cfg.amount ?? 10000))} {currency}
                    {Number(cfg.maxAmount ?? 0) > 0
                      ? ` · الحد الأعلى: ${formatNumber(Number(cfg.maxAmount))} ${currency}`
                      : ''}
                  </div>
                )}
                {addon.key === 'loyaltyPoints' && (
                  <div className="mp-addon-card-meta tabular-nums" style={{ color: isEnabled ? 'var(--brand)' : 'var(--muted)' }}>
                    {formatNumber(Math.max(1, Number(cfg.pointsPerThousand ?? 1)))} نقطة / 1,000 {currency} · {formatNumber(loyaltyCustomers.length)} زبون مسجل
                  </div>
                )}
              </div>

              {/* Bottom Action Row */}
              <div className="mp-addon-card-actions">
                {allowed ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleToggleAddon(addon)}
                      aria-pressed={isEnabled}
                      className={`mp-addon-btn-toggle ${isEnabled ? 'is-start' : 'is-stop'}`}
                    >
                      <span className={`mp-addon-dot ${isEnabled ? 'is-on' : 'is-off'}`} />
                      <span>{isEnabled ? 'مفعله' : 'متوقفه'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenAddonEdit(addon.key)}
                      className="mp-addon-btn-edit"
                    >
                      <Edit size={12} />
                      <span>تعديل</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => openUpgradeModal(targetUpgradeTier)}
                    className="mp-addon-btn-upgrade"
                  >
                    <span>🔒 {reqLabel}</span>
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* FIXED CENTERED EDIT / SETUP ADDON POPUP MODAL (PORTALED) */}
      {editingAddonKey && activeMeta && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={addonModalOverlayRef}
            className="mp-addon-modal-overlay"
            dir="rtl"
            onClick={closeEditModal}
          >
            <motion.div
              className="mp-addon-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mp-addon-modal-title"
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
            >
              <form onSubmit={handleSaveAddonEdit} className="mp-addon-modal-form" noValidate>
              {/* Sticky Header */}
              <div className="mp-addon-modal-header">
                <div className="mp-addon-modal-title-group">
                  <div className="mp-addon-modal-icon">{activeMeta.icon}</div>
                  <div className="mp-addon-modal-title-text">
                    <h3 id="mp-addon-modal-title">
                      {addonEditIntent === 'enable' ? 'تفعيل:' : 'تعديل:'} {activeMeta.title}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeEditModal}
                  aria-label="إغلاق"
                  className="mp-addon-modal-close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Body */}
              <div
                className="mp-addon-modal-body"
                onFocusCapture={(e) => {
                  const target = e.target as HTMLElement | null;
                  if (!target || typeof target.scrollIntoView !== 'function') return;
                  window.setTimeout(() => {
                    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }, 120);
                }}
              >
                {requiresInitialSetup ? (
                  <div className="mp-addon-setup-banner">
                    <Sparkles size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>
                      راجع الحقول أدناه ثم اضغط <b>"تفعيل الإضافة الآن"</b>
                    </span>
                  </div>
                ) : (
                  <label className="mp-addon-enable-switch">
                    <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--ink)' }}>
                      {addonDraft.enabled ? 'مفعّلة الآن' : 'متوقفة مؤقتاً'}
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(addonDraft.enabled)}
                      onChange={(e) => updateDraft((p) => ({ ...p, enabled: e.target.checked }))}
                    />
                  </label>
                )}

                {addonEditError && (
                  <div className="mp-addon-error-banner" role="alert">
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{addonEditError}</span>
                  </div>
                )}

                {editingAddonKey === 'offerPopup' && (() => {
                  const popupMode = addonDraft.mode === 'dish' ? 'dish' : 'ad';
                  const selectedDish = addonDraft.itemId
                    ? allItems.find((it) => it.id === addonDraft.itemId)
                    : undefined;
                  const currentBtn = String(addonDraft.buttonText || '').trim();
                  const displayedBtnValue =
                    popupMode === 'ad'
                      ? !currentBtn ||
                        currentBtn === 'إضافة إلى السلة' ||
                        currentBtn === 'تصفح المنيو واطلب الآن' ||
                        currentBtn === 'تصفح المنيو'
                        ? 'إغلاق'
                        : currentBtn
                      : !currentBtn ||
                        currentBtn === 'إغلاق' ||
                        currentBtn === 'تصفح المنيو واطلب الآن' ||
                        currentBtn === 'تصفح المنيو'
                      ? 'إضافة إلى السلة'
                      : currentBtn;

                  return (
                    <>
                      <div className="f">
                        <span>نوع النافذة المنبثقة *</span>
                        <div className="mp-addon-seg-grid">
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft((p) => {
                                const prevBtn = String(p.buttonText || '').trim();
                                return {
                                  ...p,
                                  mode: 'ad',
                                  itemId: '',
                                  specialPrice: undefined,
                                  buttonText:
                                    !prevBtn ||
                                    prevBtn === 'إضافة إلى السلة' ||
                                    prevBtn === 'تصفح المنيو' ||
                                    prevBtn === 'تصفح المنيو واطلب الآن'
                                      ? 'إغلاق'
                                      : prevBtn,
                                };
                              })
                            }
                            className={`btn s ${popupMode === 'ad' ? 'p' : ''}`}
                            style={{ fontWeight: 800, fontSize: '12.5px', justifyContent: 'center' }}
                          >
                            إعلان فقط
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft((p) => {
                                const prevBtn = String(p.buttonText || '').trim();
                                return {
                                  ...p,
                                  mode: 'dish',
                                  buttonText:
                                    !prevBtn || prevBtn === 'إغلاق' ? 'إضافة إلى السلة' : prevBtn,
                                };
                              })
                            }
                            className={`btn s ${popupMode === 'dish' ? 'p' : ''}`}
                            style={{ fontWeight: 800, fontSize: '12.5px', justifyContent: 'center' }}
                          >
                            {terms.isStore ? 'منتج من المتجر' : 'طبق من المنيو'}
                          </button>
                        </div>
                      </div>

                      {popupMode === 'dish' ? (
                        <>
                          <div className="f">
                            <span>{terms.isStore ? 'اختر المنتج للعرض الخاص *' : 'اختر الطبق للعرض الخاص *'}</span>
                            <AppSelect
                              title={terms.isStore ? 'اختر المنتج للعرض الخاص' : 'اختر الطبق للعرض الخاص'}
                              value={addonDraft.itemId || ''}
                              onChange={(nextItemId) => {
                                const chosen = allItems.find((it) => it.id === nextItemId);
                                updateDraft((p) => ({
                                  ...p,
                                  itemId: nextItemId,
                                  title:
                                    chosen &&
                                    (!p.title ||
                                      p.title === selectedDish?.n ||
                                      p.title === 'عرض خاص لفترة محدودة!' ||
                                      p.title === 'عرض خاص ومميز لا يفوتك!')
                                      ? chosen.n
                                      : p.title,
                                  subtitle:
                                    chosen && (!p.subtitle || p.subtitle === selectedDish?.d)
                                      ? chosen.d || `اطلب ${chosen.n} الآن بسعر العرض`
                                      : p.subtitle,
                                  image:
                                    chosen && (!p.image || p.image === selectedDish?.img)
                                      ? chosen.img || ''
                                      : p.image,
                                }));
                              }}
                              options={[
                                {
                                  value: '',
                                  label: terms.isStore ? '— اختر منتجاً من المتجر —' : '— اختر طبقاً من المنيو —',
                                },
                                ...allItems.map((it) => ({
                                  value: it.id,
                                  label: it.n,
                                  hint: `${formatNumber(Number(it.pr) || 0)} ${currency}`,
                                })),
                              ]}
                            />
                          </div>

                          <div className="mp-addon-two-col">
                            <label className="f">
                              سعر العرض الخاص ({currency})
                              <input
                                type="number"
                                min={0}
                                value={addonDraft.specialPrice ?? ''}
                                onChange={(e) =>
                                  updateDraft((p) => ({
                                    ...p,
                                    specialPrice: e.target.value === '' ? '' : Number(e.target.value),
                                  }))
                                }
                                placeholder={selectedDish ? String(selectedDish.pr) : 'اختياري'}
                                className="mp-addon-modal-input"
                              />
                            </label>
                            <label className="f">
                              شارة العرض (اختياري)
                              <input
                                type="text"
                                value={addonDraft.badgeText || ''}
                                onChange={(e) => updateDraft((p) => ({ ...p, badgeText: e.target.value }))}
                                placeholder="مثال: عرض خاص 🔥"
                                className="mp-addon-modal-input"
                              />
                            </label>
                          </div>
                        </>
                      ) : (
                        <label className="f">
                          شارة الإعلان (اختياري)
                          <input
                            type="text"
                            value={addonDraft.badgeText || ''}
                            onChange={(e) => updateDraft((p) => ({ ...p, badgeText: e.target.value }))}
                            placeholder="مثال: إعلان هام ✨"
                            className="mp-addon-modal-input"
                          />
                        </label>
                      )}

                      <label className="f">
                        عنوان النافذة المنبثقة *
                        <input
                          type="text"
                          value={addonDraft.title || ''}
                          onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                          className="mp-addon-modal-input"
                          required
                        />
                      </label>
                      <label className="f">
                        تفاصيل الإعلان أو العرض
                        <textarea
                          rows={2}
                          value={addonDraft.subtitle || ''}
                          onChange={(e) => updateDraft((p) => ({ ...p, subtitle: e.target.value }))}
                          className="mp-addon-modal-input"
                        />
                      </label>
                      <div className="f">
                        <span>صورة العرض (من مكتبة الصور أو رابط)</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn p"
                            onClick={() => setShowOfferMediaLibrary(true)}
                            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}
                          >
                            <ImageIcon size={14} />
                            <span>اختيار من مكتبة الصور</span>
                          </button>
                          <input
                            type="text"
                            dir="ltr"
                            value={addonDraft.image || ''}
                            onChange={(e) => updateDraft((p) => ({ ...p, image: e.target.value }))}
                            placeholder="https://..."
                            className="mp-addon-modal-input"
                            style={{ flex: 1, minWidth: '160px' }}
                          />
                        </div>
                        {addonDraft.image && (
                          <div style={{ marginTop: '8px', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--mp-glass-border, var(--line))', height: '110px', position: 'relative' }}>
                            <img
                              src={addonDraft.image}
                              alt="معاينة صورة البوب اب"
                              loading="lazy"
                              decoding="async"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                            <button
                              type="button"
                              onClick={() => updateDraft((p) => ({ ...p, image: '' }))}
                              aria-label="إزالة الصورة"
                              style={{
                                position: 'absolute',
                                top: '6px',
                                insetInlineStart: '6px',
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                background: 'rgba(239,68,68,0.9)',
                                color: '#fff',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'grid',
                                placeItems: 'center',
                              }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                      <label className="f">
                        {popupMode === 'dish' ? 'نص زر الإضافة للسلة' : 'نص زر الإغلاق'}
                        <input
                          type="text"
                          value={displayedBtnValue}
                          onChange={(e) => updateDraft((p) => ({ ...p, buttonText: e.target.value }))}
                          placeholder={popupMode === 'dish' ? 'إضافة إلى السلة' : 'إغلاق'}
                          className="mp-addon-modal-input"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn s mp-addon-utility-btn"
                        onClick={() => setShowPopupPreview(true)}
                      >
                        <Eye size={14} />
                        <span>معاينة شكل البوب اب للزبون</span>
                      </button>
                    </>
                  );
                })()}

                {editingAddonKey === 'announcementBar' && (
                  <>
                    <div
                      style={{
                        borderRadius: '14px',
                        padding: '9px 12px',
                        marginBottom: '12px',
                        background: addonDraft.bgColor || '#C2410C',
                        color: addonDraft.textColor || '#ffffff',
                        fontSize: '12.5px',
                        fontWeight: 800,
                        textAlign: 'center',
                      }}
                    >
                      {addonDraft.text || (terms.isStore ? 'معاينة شريط الإعلانات أعلى المتجر' : 'معاينة شريط الإعلانات أعلى المنيو')}
                    </div>
                    <label className="f">
                      نص الشريط الإعلاني *
                      <input
                        type="text"
                        value={addonDraft.text || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, text: e.target.value }))}
                        className="mp-addon-modal-input"
                        required
                      />
                    </label>
                    <div className="mp-addon-two-col">
                      <label className="f">
                        لون خلفية الشريط
                        <input
                          type="color"
                          value={addonDraft.bgColor || '#C2410C'}
                          onChange={(e) => updateDraft((p) => ({ ...p, bgColor: e.target.value }))}
                          style={{ width: '100%', height: '42px', borderRadius: '14px', cursor: 'pointer' }}
                        />
                      </label>
                      <label className="f">
                        لون النص
                        <input
                          type="color"
                          value={addonDraft.textColor || '#ffffff'}
                          onChange={(e) => updateDraft((p) => ({ ...p, textColor: e.target.value }))}
                          style={{ width: '100%', height: '42px', borderRadius: '14px', cursor: 'pointer' }}
                        />
                      </label>
                    </div>
                  </>
                )}

                {editingAddonKey === 'countdownTimer' && (
                  <>
                    <label className="f">
                      عنوان العرض التنازلي
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <div className="mp-addon-two-col">
                      <div className="f">
                        <span>{terms.isStore ? 'نوع الخصم الفعلي على المتجر' : 'نوع الخصم الفعلي على المنيو'}</span>
                        <AppSelect
                          title="نوع الخصم الفعلي"
                          value={addonDraft.discountType || 'percent'}
                          onChange={(val) => updateDraft((p) => ({ ...p, discountType: val }))}
                          options={[
                            { value: 'percent', label: 'نسبة مئوية (%)' },
                            { value: 'fixed', label: `مبلغ ثابت (${currency})` },
                          ]}
                        />
                      </div>
                      <label className="f">
                        قيمة الخصم (تخصم تلقائياً من الأسعار)
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.discountValue ?? 15}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              discountValue: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          className="mp-addon-modal-input"
                        />
                      </label>
                    </div>
                    <label className="f">
                      نص التنبيه الظاهر في الشريط
                      <input
                        type="text"
                        value={addonDraft.discountText || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, discountText: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <div className="f">
                      <span>ساعة انتهاء العرض اليومية</span>
                      <AppSelect
                        title="ساعة انتهاء العرض اليومية"
                        value={String(Number(addonDraft.endHour ?? 23))}
                        onChange={(val) => updateDraft((p) => ({ ...p, endHour: Number(val) }))}
                        options={Array.from({ length: 24 }).map((_, hr) => ({
                          value: String(hr),
                          label: formatHourArabic(hr),
                        }))}
                      />
                    </div>
                    <div className="mp-addon-two-col">
                      <label className="f">
                        {`الحد الأدنى للطلب (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.minOrderAmount ?? 0}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              minOrderAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = لا يوجد حد أدنى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                      <label className="f">
                        {`الحد الأعلى للخصم (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.maxDiscountAmount ?? 0}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              maxDiscountAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = لا يوجد حد أعلى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                    </div>
                  </>
                )}



                {editingAddonKey === 'customerReviews' && (
                  <>
                    <label className="mp-addon-check-row">
                      <input
                        type="checkbox"
                        checked={addonDraft.showOnMenu !== false}
                        onChange={(e) => updateDraft((p) => ({ ...p, showOnMenu: e.target.checked }))}
                      />
                      <span>{terms.isStore ? 'عرض تقييمات الزبائن في صفحة المتجر' : 'عرض تقييمات الزبائن في صفحة المنيو'}</span>
                    </label>
                    <label className="mp-addon-check-row">
                      <input
                        type="checkbox"
                        checked={addonDraft.allowSubmit !== false}
                        onChange={(e) => updateDraft((p) => ({ ...p, allowSubmit: e.target.checked }))}
                      />
                      <span>السماح للزبائن بإرسال تقييم جديد</span>
                    </label>
                  </>
                )}

                {editingAddonKey === 'minOrder' && (
                  <>
                    <div className="mp-addon-two-col">
                      <label className="f">
                        {`الحد الأدنى لمبلغ الطلب (${currency}) *`}
                        <input
                          type="number"
                          min={1}
                          value={addonDraft.amount ?? 10000}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              amount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          className="mp-addon-modal-input"
                          required
                        />
                      </label>
                      <label className="f">
                        {`الحد الأعلى لمبلغ الطلب (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.maxAmount ?? 0}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              maxAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = بدون حد أعلى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                    </div>
                    <label className="f">
                      رسالة التنبيه للزبون
                      <input
                        type="text"
                        value={addonDraft.message || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, message: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                  </>
                )}



                {editingAddonKey === 'audioBell' && (
                  <>
                    <div className="f">
                      <span>نغمة التنبيه الصوتي للطلبات</span>
                      <AppSelect
                        title="نغمة التنبيه الصوتي للطلبات"
                        value={addonDraft.tone || 'bell'}
                        onChange={(val) => updateDraft((p) => ({ ...p, tone: val }))}
                        options={[
                          { value: 'bell', label: 'جرس الكاشير الكلاسيكي' },
                          { value: 'chime', label: 'رنين ناعم ثلاثي (Chime)' },
                          { value: 'alert', label: 'تنبيه سريع' },
                        ]}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn s mp-addon-utility-btn"
                      onClick={() => playBellTone(addonDraft.tone || 'bell')}
                    >
                      <Volume2 size={15} />
                      <span>اختبار صوت التنبيه الآن</span>
                    </button>
                  </>
                )}



                {editingAddonKey === 'happyHour' && (
                  <>
                    <label className="f">
                      عنوان عرض ساعة السعادة
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <div className="mp-addon-two-col">
                      <div className="f">
                        <span>من الساعة</span>
                        <AppSelect
                          title="من الساعة"
                          value={String(Number(addonDraft.startHour ?? 14))}
                          onChange={(val) => updateDraft((p) => ({ ...p, startHour: Number(val) }))}
                          options={Array.from({ length: 24 }).map((_, hr) => ({
                            value: String(hr),
                            label: formatHourArabic(hr),
                          }))}
                        />
                      </div>
                      <div className="f">
                        <span>إلى الساعة</span>
                        <AppSelect
                          title="إلى الساعة"
                          value={String(Number(addonDraft.endHour ?? 17))}
                          onChange={(val) => updateDraft((p) => ({ ...p, endHour: Number(val) }))}
                          options={Array.from({ length: 24 }).map((_, hr) => ({
                            value: String(hr),
                            label: formatHourArabic(hr),
                          }))}
                        />
                      </div>
                    </div>
                    <label className="f">
                      نسبة الخصم التلقائي (%)
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={addonDraft.discountPercent ?? 15}
                        onChange={(e) => updateDraft((p) => ({ ...p, discountPercent: Number(e.target.value) }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <div className="mp-addon-two-col">
                      <label className="f">
                        {`الحد الأدنى للطلب (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.minOrderAmount ?? 0}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              minOrderAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = لا يوجد حد أدنى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                      <label className="f">
                        {`الحد الأعلى للخصم (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.maxDiscountAmount ?? 0}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              maxDiscountAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = لا يوجد حد أعلى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                    </div>
                    {(() => {
                      const s = Number(addonDraft.startHour ?? 14);
                      const en = Number(addonDraft.endHour ?? 17);
                      const activeNow = s <= en ? currentLocalHour >= s && currentLocalHour < en : currentLocalHour >= s || currentLocalHour < en;
                      return (
                        <div style={{ fontSize: '12px', fontWeight: 700, color: activeNow ? '#10b981' : 'var(--muted)' }}>
                          {activeNow
                            ? '✓ الوقت الحالي يقع ضمن ساعة السعادة وسيطبق الخصم فوراً عند التفعيل.'
                            : `الخصم سيتفعل تلقائياً يومياً من ${formatHourArabic(s)} إلى ${formatHourArabic(en)}.`}
                        </div>
                      );
                    })()}
                  </>
                )}

                {editingAddonKey === 'freeGiftThreshold' && (
                  <>
                    <label className="f">
                      {`الحد الأدنى للطلب للحصول على الهدية (${currency})`}
                      <input
                        type="number"
                        min={0}
                        value={addonDraft.minAmount ?? 25000}
                        onChange={(e) => updateDraft((p) => ({ ...p, minAmount: Number(e.target.value) }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <label className="f">
                      اسم الهدية المجانية *
                      <input
                        type="text"
                        value={addonDraft.giftName || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, giftName: e.target.value }))}
                        className="mp-addon-modal-input"
                        required
                      />
                    </label>
                  </>
                )}

                {editingAddonKey === 'cartUpsell' && (
                  <>
                    <label className="f">
                      عنوان قسم المقترحات في السلة
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <label className="f">
                      {terms.isStore ? 'عدد المنتجات المقترحة داخل السلة (1 - 8)' : 'عدد الأصناف المقترحة داخل السلة (1 - 8)'}
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={addonDraft.maxItems ?? 4}
                        onChange={(e) => updateDraft((p) => ({ ...p, maxItems: Number(e.target.value) }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                  </>
                )}



                {editingAddonKey === 'spinWheelPromo' && (
                  <>
                    <label className="f">
                      عنوان نافذة عجلة الحظ
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <label className="f">
                      الجوائز المتاحة (سطر لكل جائزة — أمثلة: خصم 5%، خصم 10%، توصيل مجاني)
                      <textarea
                        rows={4}
                        value={addonDraft.prizesText || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, prizesText: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                  </>
                )}

                {editingAddonKey === 'loyaltyPoints' && (() => {
                  const ptsRate = Math.max(1, Number(addonDraft.pointsPerThousand ?? 1) || 1);
                  const previewBillPts = Math.floor((Math.max(0, Number(loyaltyAmountInput) || 0)) / 1000) * ptsRate;
                  return (
                    <>
                      <div className="mp-addon-two-col">
                        <label className="f">
                          {`عدد النقاط لكل 1,000 ${currency}`}
                          <input
                            type="number"
                            min={1}
                            value={addonDraft.pointsPerThousand ?? 1}
                            onChange={(e) =>
                              updateDraft((p) => ({
                                ...p,
                                pointsPerThousand: e.target.value === '' ? 1 : Math.max(1, Number(e.target.value)),
                              }))
                            }
                            className="mp-addon-modal-input"
                          />
                        </label>
                        <label className="f">
                          رسالة المكافأة على البطاقة
                          <input
                            type="text"
                            value={addonDraft.rewardNote || ''}
                            onChange={(e) => updateDraft((p) => ({ ...p, rewardNote: e.target.value }))}
                            placeholder="اجمع النقاط واستبدلها بوجبات مجانية"
                            className="mp-addon-modal-input"
                          />
                        </label>
                      </div>

                      {/* Register customer + add points box */}
                      <div
                        style={{
                          padding: '12px',
                          borderRadius: '18px',
                          background: 'var(--mp-glass-control)',
                          border: '1px solid var(--mp-glass-border, var(--line))',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 900, color: 'var(--ink)' }}>
                          <UserPlus size={15} style={{ color: 'var(--brand)' }} />
                          <span>تسجيل زبون جديد أو إضافة نقاط لزبون</span>
                        </div>
                        <div className="mp-addon-two-col">
                          <label className="f" style={{ margin: 0 }}>
                            اسم الزبون *
                            <input
                              type="text"
                              value={loyaltyNameInput}
                              onChange={(e) => setLoyaltyNameInput(e.target.value)}
                              placeholder="مثال: علي حسين"
                              className="mp-addon-modal-input"
                            />
                          </label>
                          <label className="f" style={{ margin: 0 }}>
                            رقم الهاتف *
                            <input
                              type="tel"
                              dir="ltr"
                              value={loyaltyPhoneInput}
                              onChange={(e) => setLoyaltyPhoneInput(e.target.value)}
                              placeholder="07701234567"
                              className="mp-addon-modal-input"
                              style={{ textAlign: 'left' }}
                            />
                          </label>
                        </div>
                        <div className="mp-addon-two-col">
                          <label className="f" style={{ margin: 0 }}>
                            {`مبلغ الفاتورة (${currency})`}
                            <input
                              type="number"
                              min={0}
                              value={loyaltyAmountInput}
                              onChange={(e) => setLoyaltyAmountInput(e.target.value)}
                              placeholder={previewBillPts > 0 ? `+${previewBillPts} نقطة` : 'مثال: 25000'}
                              className="mp-addon-modal-input"
                            />
                          </label>
                          <label className="f" style={{ margin: 0 }}>
                            أو نقاط إضافية مباشرة
                            <input
                              type="number"
                              min={0}
                              value={loyaltyDirectPtsInput}
                              onChange={(e) => setLoyaltyDirectPtsInput(e.target.value)}
                              placeholder="مثال: 5"
                              className="mp-addon-modal-input"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="btn p s"
                          disabled={loyaltyBusyId === '__add__'}
                          onClick={() => void handleSaveLoyaltyCustomer()}
                          style={{ width: '100%', justifyContent: 'center', fontWeight: 800, padding: '10px 14px' }}
                        >
                          <UserPlus size={14} />
                          <span>
                            {loyaltyBusyId === '__add__'
                              ? 'جاري التسجيل...'
                              : previewBillPts > 0
                              ? `تسجيل وإضافة +${formatNumber(previewBillPts + (Number(loyaltyDirectPtsInput) || 0))} نقطة`
                              : 'تسجيل / إضافة النقاط'}
                          </span>
                        </button>
                      </div>

                      {/* Registered customers ledger */}
                      <div
                        style={{
                          paddingTop: '14px',
                          borderTop: '1px solid var(--mp-glass-divider, var(--line))',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14.5px', fontWeight: 900, color: 'var(--ink)' }}>
                            <Users size={16} style={{ color: 'var(--brand)' }} />
                            <span>الزبائن ({formatNumber(loyaltyCustomers.length)})</span>
                          </div>
                          {loyaltyCustomers.length > 0 && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '999px',
                                border: '1px solid var(--mp-glass-border, var(--line))',
                                background: 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                                minWidth: '170px',
                                flex: '1 1 170px',
                                maxWidth: '240px',
                              }}
                            >
                              <Search size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                              <input
                                type="text"
                                value={loyaltySearchQuery}
                                onChange={(e) => setLoyaltySearchQuery(e.target.value)}
                                placeholder="بحث بالاسم أو الرقم..."
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: 'var(--ink)',
                                  fontSize: '13.5px',
                                  width: '100%',
                                  outline: 'none',
                                  padding: 0,
                                }}
                              />
                            </div>
                          )}
                        </div>

                        {filteredLoyaltyCustomers.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '14px 8px', fontSize: '13.5px', color: 'var(--muted)' }}>
                            {loyaltyCustomers.length === 0
                              ? 'لا يوجد زبائن مسجلون بعد'
                              : 'لا توجد نتائج'}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '220px', overflowY: 'auto' }}>
                            {filteredLoyaltyCustomers.map((cust, custIdx) => {
                              const busy = loyaltyBusyId === cust.id;
                              return (
                                <div
                                  key={cust.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '8px',
                                    padding: '10px 4px',
                                    borderTop: custIdx > 0 ? '1px solid var(--mp-glass-divider, var(--line))' : 'none',
                                  }}
                                >
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {cust.name}
                                    </div>
                                    <div className="tabular-nums" style={{ fontSize: '11.5px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                      <span dir="ltr">{cust.phone}</span>
                                      {Number(cust.totalOrders || 0) > 0 && (
                                        <span>· {formatNumber(cust.totalOrders || 0)} طلب</span>
                                      )}
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                                    <button
                                      type="button"
                                      className="btn s"
                                      disabled={busy || cust.points <= 0}
                                      onClick={() => void handleAdjustLoyaltyPoints(cust, -1)}
                                      title="إنقاص نقطة"
                                      style={{ padding: '4px 7px', minHeight: '28px' }}
                                    >
                                      <Minus size={12} />
                                    </button>
                                    <span
                                      className="tabular-nums"
                                      style={{
                                        minWidth: '48px',
                                        textAlign: 'center',
                                        fontSize: '12.5px',
                                        fontWeight: 900,
                                        color: 'var(--brand)',
                                      }}
                                    >
                                      {formatNumber(cust.points || 0)}
                                    </span>
                                    <button
                                      type="button"
                                      className="btn s"
                                      disabled={busy}
                                      onClick={() => void handleAdjustLoyaltyPoints(cust, 1)}
                                      title="إضافة نقطة"
                                      style={{ padding: '4px 7px', minHeight: '28px' }}
                                    >
                                      <Plus size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      className="btn s d"
                                      disabled={busy}
                                      onClick={() => void handleDeleteLoyaltyCustomer(cust)}
                                      title="حذف السجل"
                                      style={{ padding: '4px 7px', minHeight: '28px' }}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}



                {editingAddonKey === 'cutleryOption' && (
                  <label className="f">
                    {terms.isStore ? 'نص سؤال التغليف الفاخر والفاتورة داخل السلة' : 'نص سؤال أدوات الطعام داخل السلة'}
                    <input
                      type="text"
                      value={addonDraft.label || ''}
                      onChange={(e) => updateDraft((p) => ({ ...p, label: e.target.value }))}
                      className="mp-addon-modal-input"
                    />
                  </label>
                )}



                {editingAddonKey === 'firstOrderDiscount' && (
                  <>
                    <label className="f">
                      نسبة خصم الطلب الأول (%)
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={addonDraft.discountPercent ?? 10}
                        onChange={(e) => updateDraft((p) => ({ ...p, discountPercent: Number(e.target.value) }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <label className="f">
                      عنوان الخصم الترحيبي
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <div className="mp-addon-two-col">
                      <label className="f">
                        {`الحد الأدنى للطلب (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.minOrderAmount ?? 0}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              minOrderAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = لا يوجد حد أدنى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                      <label className="f">
                        {`الحد الأعلى للخصم (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.maxDiscountAmount ?? 0}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              maxDiscountAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = لا يوجد حد أعلى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                    </div>
                  </>
                )}

                {editingAddonKey === 'freeDeliveryProgress' && (
                  <>
                    <div className="mp-addon-two-col">
                      <label className="f">
                        {`الحد الأدنى للتوصيل المجاني (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.minAmount ?? 25000}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              minAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = لا يوجد حد أدنى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                      <label className="f">
                        {`الحد الأعلى لخصم التوصيل (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.maxDiscountAmount ?? 0}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              maxDiscountAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = لا يوجد حد أعلى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                    </div>
                    <label className="f">
                      عنوان شريط التوصيل المجاني التحفيزي
                      <input
                        type="text"
                        value={addonDraft.label || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, label: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                  </>
                )}

                {editingAddonKey === 'whatsappSupportFloat' && (
                  <>
                    <label className="f">
                      نص زر الدعم العائم
                      <input
                        type="text"
                        value={addonDraft.label || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, label: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <label className="f">
                      الرسالة التلقائية عند فتح الواتساب
                      <input
                        type="text"
                        value={addonDraft.prefillText || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, prefillText: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: '14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: waTargetPhone ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.12)',
                        color: waTargetPhone ? '#10b981' : '#f59e0b',
                        border: waTargetPhone ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(245,158,11,0.3)',
                      }}
                    >
                      {waTargetPhone
                        ? `سيتم توجيه الزبون إلى رقم الواتساب: ${waTargetPhone}`
                        : terms.isStore
                        ? 'تنبيه: يرجى التأكد من إضافة رقم واتساب المتجر في قسم "الإعدادات" ليظهر الزر للزبائن.'
                        : 'تنبيه: يرجى التأكد من إضافة رقم واتساب المطعم في قسم "الإعدادات" ليظهر الزر للزبائن.'}
                    </div>
                  </>
                )}

                {editingAddonKey === 'groupOrderBillSplit' && (
                  <label className="f">
                    أقصى عدد للأشخاص في حاسبة تقسيم الفاتورة
                    <input
                      type="number"
                      min={2}
                      max={30}
                      value={addonDraft.maxPeople ?? 10}
                      onChange={(e) => updateDraft((p) => ({ ...p, maxPeople: Number(e.target.value) }))}
                      className="mp-addon-modal-input"
                    />
                  </label>
                )}



                {editingAddonKey === 'pickupInstantDiscount' && (
                  <>
                    <label className="f">
                      عنوان خصم الاستلام من المتجر
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <label className="f">
                      نسبة الخصم الفوري عند اختيار الاستلام (%)
                      <input
                        type="number"
                        min={2}
                        max={60}
                        value={addonDraft.discountPercent ?? 10}
                        onChange={(e) => updateDraft((p) => ({ ...p, discountPercent: Number(e.target.value) }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <div className="mp-addon-two-col">
                      <label className="f">
                        {`الحد الأدنى للطلب (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.minOrderAmount ?? 0}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              minOrderAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = لا يوجد حد أدنى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                      <label className="f">
                        {`الحد الأعلى للخصم (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.maxDiscountAmount ?? 0}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              maxDiscountAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = لا يوجد حد أعلى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                    </div>
                  </>
                )}

                {editingAddonKey === 'limitedTimeDiscount' && (() => {
                  const selectedDays = Math.max(1, Number(addonDraft.durationDays ?? 1) || 1);
                  const expiresAt = Number(addonDraft.expiresAt || 0);
                  const activeDurationDays = Math.max(1, Number(activeSavedCfg.durationDays || 1) || 1);
                  const isActiveWindow = Boolean(addonDraft.enabled && expiresAt > Date.now());
                  const isUsingExistingWindow = isActiveWindow && selectedDays === activeDurationDays;
                  const targetEndTs = isUsingExistingWindow
                    ? expiresAt
                    : Date.now() + selectedDays * 86400000;
                  const endInfo = formatArabicEndDayAndDate(targetEndTs);

                  return (
                    <>
                      <label className="f">
                        نسبة الخصم (%)
                        <input
                          type="number"
                          min={1}
                          max={95}
                          value={addonDraft.discountPercent ?? 15}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              discountPercent: e.target.value === '' ? '' : Number(e.target.value),
                            }))
                          }
                          placeholder="15"
                          className="mp-addon-modal-input"
                          required
                        />
                      </label>

                      <div className="mp-addon-two-col">
                        <label className="f">
                          {`الحد الأدنى للطلب (${currency})`}
                          <input
                            type="number"
                            min={0}
                            value={addonDraft.minOrderAmount ?? 0}
                            onChange={(e) =>
                              updateDraft((p) => ({
                                ...p,
                                minOrderAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                              }))
                            }
                            placeholder="0 = لا يوجد حد أدنى"
                            className="mp-addon-modal-input"
                          />
                        </label>
                        <label className="f">
                          {`الحد الأعلى للخصم (${currency})`}
                          <input
                            type="number"
                            min={0}
                            value={addonDraft.maxDiscountAmount ?? 0}
                            onChange={(e) =>
                              updateDraft((p) => ({
                                ...p,
                                maxDiscountAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                              }))
                            }
                            placeholder="0 = لا يوجد حد أعلى"
                            className="mp-addon-modal-input"
                          />
                        </label>
                      </div>

                      <div className="f">
                        <span>المدة (تختارها للإدارة فقط ولا تظهر للزبائن)</span>
                        <div className="mp-addon-seg-grid" style={{ marginBottom: '4px' }}>
                          {[
                            { days: 1, label: 'يوم واحد (24 ساعة)' },
                            { days: 2, label: 'يومين (48 ساعة)' },
                          ].map((preset) => {
                            const active = selectedDays === preset.days;
                            return (
                              <button
                                key={preset.days}
                                type="button"
                                className={active ? 'btn p s' : 'btn s'}
                                onClick={() => updateDraft((p) => ({ ...p, durationDays: preset.days }))}
                                style={{
                                  fontWeight: 800,
                                  padding: '10px 8px',
                                  justifyContent: 'center',
                                }}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={addonDraft.durationDays ?? 1}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              durationDays: e.target.value === '' ? 1 : Math.max(1, Math.round(Number(e.target.value) || 1)),
                            }))
                          }
                          placeholder="أدخل عدد الأيام (مثال: 1 أو 2)"
                          className="mp-addon-modal-input"
                        />
                      </div>

                      <div className="mp-addon-info-note">
                        <div>
                          يُطبق الخصم تلقائياً على أسعار القائمة وينتهي بعد انتهاء المدة المختارة دون عرض أي عدّاد أو تاريخ انتهاء للزبائن.
                        </div>
                        <div className="mp-addon-endday-badge">
                          {isUsingExistingWindow
                            ? `الحالة: نشط حالياً وينتهي يوم ${endInfo.weekday} (${endInfo.dateTime})`
                            : `سينتهي الخصم يوم ${endInfo.weekday} (${endInfo.dateTime})`}
                        </div>
                      </div>
                    </>
                  );
                })()}



                {editingAddonKey === 'moodMealFinder' && (
                  <div className="mp-addon-two-col">
                    <label className="f">
                      {terms.isStore ? 'عنوان نافذة مستشار التسوق الذكي' : 'عنوان نافذة اختيار المزاج'}
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <label className="f">
                      {terms.isStore ? 'نص زر مستشار التسوق في المتجر' : 'نص زر مكتشف المزاج في المنيو'}
                      <input
                        type="text"
                        value={addonDraft.buttonText || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, buttonText: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                  </div>
                )}



                {editingAddonKey === 'curbsidePickupCar' && (
                  <>
                    <label className="f">
                      تعليمات الاستلام من السيارة للزبون
                      <input
                        type="text"
                        value={addonDraft.instructions || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, instructions: e.target.value }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <label className="mp-addon-check-row" style={{ marginBottom: 0 }}>
                      <input
                        type="checkbox"
                        checked={addonDraft.allowArrivedPing !== false}
                        onChange={(e) => updateDraft((p) => ({ ...p, allowArrivedPing: e.target.checked }))}
                      />
                      <span>
                        {terms.isStore
                          ? 'تفعيل زر "وصلت أمام المعرض" لإرسال إشعار فوري عبر واتساب'
                          : 'تفعيل زر "وصلت أمام المطعم" لإرسال إشعار فوري عبر واتساب'}
                      </span>
                    </label>
                  </>
                )}

                {editingAddonKey === 'dineInDiscount' && (
                  <>
                    <label className="f">
                      {terms.isStore ? 'عنوان خصم الطلب داخل المعرض' : 'عنوان البطاقة للزبون'}
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        placeholder={terms.isStore ? 'خصم خاص للطلبات داخل المعرض' : 'خصم على طلبات الصالة'}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <label className="f">
                      {terms.isStore ? 'نسبة الخصم الفوري داخل المعرض (%)' : 'نسبة الخصم الفوري لطلبات الصالة (%)'}
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={addonDraft.discountPercent ?? 10}
                        onChange={(e) => updateDraft((p) => ({ ...p, discountPercent: Number(e.target.value) }))}
                        className="mp-addon-modal-input"
                      />
                    </label>
                    <div className="mp-addon-two-col">
                      <label className="f">
                        {`الحد الأدنى للطلب (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.minOrderAmount ?? 0}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              minOrderAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = لا يوجد حد أدنى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                      <label className="f">
                        {`الحد الأعلى للخصم (${currency})`}
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.maxDiscountAmount ?? 0}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              maxDiscountAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          placeholder="0 = لا يوجد حد أعلى"
                          className="mp-addon-modal-input"
                        />
                      </label>
                    </div>
                    <div className="mp-addon-info-note">
                      <div>
                        تظهر هذه الميزة كبطاقة تفاعلية أعلى المنيو مثل بطاقة النقاط والخصومات، وعند الضغط عليها تظهر تفاصيل الخصم مع زرّي موقع المطعم على خرائط كوكل وويز (من قسم الإعدادات ← الروابط).
                      </div>
                    </div>
                  </>
                )}

              </div>

              {/* Sticky Footer */}
              <div className="mp-addon-modal-footer">
                {addonEditIntent === 'enable' ? (
                  <>
                    <button type="button" className="btn mp-addon-footer-btn" onClick={closeEditModal} disabled={addonSaving}>
                      إلغاء
                    </button>
                    <button type="submit" className="btn p mp-addon-footer-btn" disabled={addonSaving}>
                      <CheckCircle2 size={15} />
                      <span>{addonSaving ? 'جاري التفعيل...' : 'تفعيل الإضافة الآن'}</span>
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn p mp-addon-footer-btn" onClick={closeEditModal}>
                    <CheckCircle2 size={15} />
                    <span>تم — إغلاق</span>
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </div>,
        document.body
      )}

      {/* CENTERED OFFER POPUP PREVIEW (PORTALED) */}
      {showPopupPreview && typeof document !== 'undefined' && (() => {
        const previewMode = (addonDraft.mode || addonsState.offerPopup?.mode) === 'dish' ? 'dish' : 'ad';
        const previewImg = addonDraft.image || addonsState.offerPopup?.image;
        const previewBadge = addonDraft.badgeText || addonsState.offerPopup?.badgeText;
        const previewDishId = addonDraft.itemId || addonsState.offerPopup?.itemId;
        const previewDish = previewDishId ? allItems.find((it) => it.id === previewDishId) : undefined;
        const previewTitle = addonDraft.title || addonsState.offerPopup?.title || previewDish?.n;
        const previewSubtitle = addonDraft.subtitle || addonsState.offerPopup?.subtitle;
        const rawSpecial = addonDraft.specialPrice ?? addonsState.offerPopup?.specialPrice;
        const hasSpecial = rawSpecial !== '' && rawSpecial !== undefined && rawSpecial !== null && Number.isFinite(Number(rawSpecial));
        const previewPrice = previewMode === 'dish' ? (hasSpecial ? Number(rawSpecial) : Number(previewDish?.pr || 0)) : 0;
        const previewOrigPrice = previewMode === 'dish' && previewDish ? Number(previewDish.pr || 0) : 0;
        const rawBtn = String(addonDraft.buttonText || addonsState.offerPopup?.buttonText || '').trim();
        const previewBtnText =
          previewMode === 'dish'
            ? !rawBtn || rawBtn === 'إغلاق' || rawBtn === 'تصفح المنيو' || rawBtn === 'تصفح المنيو واطلب الآن'
              ? 'إضافة إلى السلة'
              : rawBtn
            : !rawBtn || rawBtn === 'إضافة إلى السلة' || rawBtn === 'تصفح المنيو' || rawBtn === 'تصفح المنيو واطلب الآن'
            ? 'إغلاق'
            : rawBtn;

        return createPortal(
          <div
            ref={previewModalOverlayRef}
            className="mp-addon-modal-overlay"
            dir="rtl"
            style={{ zIndex: 100120 }}
            onClick={() => setShowPopupPreview(false)}
          >
            <motion.div
              className="mp-addon-preview-card"
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
              style={{
                position: 'relative',
                width: 'min(410px, 92vw)',
                maxHeight: '88dvh',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '28px',
                overflow: 'hidden',
                boxShadow: '0 26px 64px rgba(0,0,0,0.42)',
                textAlign: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => setShowPopupPreview(false)}
                aria-label="إغلاق"
                style={{
                  position: 'absolute',
                  top: '12px',
                  insetInlineEnd: '12px',
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: 'rgba(15, 23, 42, 0.72)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  zIndex: 10,
                }}
              >
                <X size={16} />
              </button>

              {previewImg && (
                <div style={{ position: 'relative', width: '100%', height: '205px', flexShrink: 0, overflow: 'hidden', background: 'var(--soft)' }}>
                  <img
                    src={previewImg}
                    alt="صورة الإعلان"
                    decoding="async"
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

              <div style={{ padding: previewImg ? '18px 22px 22px' : '46px 22px 22px', overflowY: 'auto', textAlign: 'center' }}>
                {previewBadge && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      background: 'var(--soft)',
                      color: 'var(--brand)',
                      fontSize: '12px',
                      fontWeight: 800,
                      marginBottom: '10px',
                    }}
                  >
                    {previewBadge}
                  </div>
                )}
                <h3 style={{ fontSize: '19px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 8px', lineHeight: 1.35 }}>
                  {previewTitle}
                </h3>
                {previewSubtitle && (
                  <p style={{ fontSize: '13.5px', color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
                    {previewSubtitle}
                  </p>
                )}

                {previewMode === 'dish' && previewPrice > 0 && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      padding: '6px 16px',
                      borderRadius: '999px',
                      background: 'var(--soft)',
                      marginBottom: '16px',
                    }}
                  >
                    {hasSpecial && previewOrigPrice > previewPrice && (
                      <span style={{ fontSize: '12.5px', color: 'var(--muted)', textDecoration: 'line-through', fontWeight: 700 }}>
                        {formatNumber(previewOrigPrice)} {currency}
                      </span>
                    )}
                    <span style={{ fontSize: '15.5px', fontWeight: 900, color: 'var(--brand)' }}>
                      {formatNumber(previewPrice)} {currency}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }} dir="rtl">
                  {previewMode === 'dish' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowPopupPreview(false)}
                        style={{
                          flex: '1 1 160px',
                          height: '42px',
                          padding: '0 18px',
                          borderRadius: '999px',
                          border: 'none',
                          background: 'var(--brand)',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: '13.5px',
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '7px',
                          boxShadow: '0 6px 18px color-mix(in srgb, var(--brand) 28%, transparent)',
                          cursor: 'pointer',
                        }}
                      >
                        <ShoppingBag size={15} />
                        <span>{previewBtnText}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPopupPreview(false)}
                        style={{
                          height: '42px',
                          padding: '0 18px',
                          borderRadius: '999px',
                          border: '1px solid var(--line)',
                          background: 'var(--soft)',
                          color: 'var(--ink)',
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
                      onClick={() => setShowPopupPreview(false)}
                      style={{
                        minWidth: '160px',
                        height: '42px',
                        padding: '0 24px',
                        borderRadius: '999px',
                        border: '1px solid var(--line)',
                        background: 'var(--soft)',
                        color: 'var(--ink)',
                        fontWeight: 800,
                        fontSize: '13.5px',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      {previewBtnText}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        );
      })()}

      <MediaLibraryModal
        isOpen={showOfferMediaLibrary}
        items={mediaLibraryItems}
        currentUrl={addonDraft.image || ''}
        onSelect={(url) => updateDraft((p) => ({ ...p, image: url }))}
        onUploadFiles={uploadImagesToLibrary}
        onDeleteItem={(mediaId) => {
          const target = mediaLibraryItems.find((m) => m.id === mediaId);
          if (target && target.url === addonDraft.image) {
            updateDraft((p) => ({ ...p, image: '' }));
          }
          removeMediaLibraryItem(mediaId);
        }}
        onClose={() => setShowOfferMediaLibrary(false)}
      />
    </div>
  );
};
