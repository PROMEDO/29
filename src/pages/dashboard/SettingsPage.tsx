/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  GitBranch,
  Globe,
  Image as ImageIcon,
  Link2,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Monitor,
  Moon,
  Phone,
  Plus,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Store,
  Sun,
  Trash2,
  Truck,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { MediaLibraryModal } from '../../components/MediaLibraryModal';
import { TimePickerField } from '../../components/TimePickerField';
import { fetchDashboardTelegramStatusApi } from '../../utils/adminApi';
import { isReservedSlug } from '../../utils/businessDefaults';
import {
  SettingsSectionTab,
  WEEK_DAYS_ORDER,
  useDashboard,
} from './DashboardContext';
import {
  DASH_EASE,
  DASH_SPRING_PILL,
  dashSectionMotion,
  dashSubTabMotion,
} from '../../utils/dashboardMotion';
import { TelegramPage } from './TelegramPage';

export const SettingsPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [mediaPickerTarget, setMediaPickerTarget] = useState<'logo' | 'cover' | null>(null);
  const waInputRef = useRef<HTMLInputElement | null>(null);
  const slugDebounceRef = useRef<number | null>(null);

  const {
    settingsSectionTab: sectionTab,
    setSettingsSectionTab: setSectionTab,
    resolvedPlan,
    openUpgradeModal,
    dashboardThemeMode,
    handleSelectDashboardThemeMode,
    baseDomain,
    fullSubdomainUrl,
    subdomainEnabled,
    publicPath,
    liveMenuUrl,
    onNavigate,
    copyLink,
    openShareModal,
    restSlug,
    setRestSlug,
    slugCheckState,
    setSlugCheckState,
    checkSubdomainAvailability,
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
    flushAllPendingSaves,
    mediaLibraryItems,
    uploadImagesToLibrary,
    removeMediaLibraryItem,
    restProjectType,
    setRestProjectType,
    restName,
    setRestName,
    restTagline,
    setRestTagline,
    restCurrency,
    viewOnlyMode,
    toggleViewOnlyMode,
    toggleOrderType,
    allowDelivery,
    allowPickup,
    allowTable,
    rest,
    activeRid,
    mainRid,
    mainRest,
    branchesList,
    acceptClosedOrders,
    setAcceptClosedOrders,
    whatsappEnabled,
    telegramEnabled,
    appNotificationsEnabled,
    toggleOrderDeliveryChannel,
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
    terms,
    handleSeedStoreCatalog,
  } = useDashboard();

  const [slugDraft, setSlugDraft] = useState(restSlug);
  const [hasTypedSlug, setHasTypedSlug] = useState(false);
  const [slugFormatError, setSlugFormatError] = useState('');
  const [slugDebouncing, setSlugDebouncing] = useState(false);

  const firstZoneNameInputRef = useRef<HTMLInputElement | null>(null);
  const zoneKeySeqRef = useRef(0);
  const zoneRowKeysRef = useRef<string[]>([]);
  const lastZonesRidRef = useRef<string>(activeRid);
  const [feeDrafts, setFeeDrafts] = useState<Record<string, string>>({});

  if (lastZonesRidRef.current !== activeRid) {
    lastZonesRidRef.current = activeRid;
    zoneRowKeysRef.current = deliveryZonesState.map(() => `zone-${++zoneKeySeqRef.current}`);
  } else if (zoneRowKeysRef.current.length !== deliveryZonesState.length) {
    const nextKeys = zoneRowKeysRef.current.slice(0, deliveryZonesState.length);
    while (nextKeys.length < deliveryZonesState.length) {
      nextKeys.push(`zone-${++zoneKeySeqRef.current}`);
    }
    zoneRowKeysRef.current = nextKeys;
  }

  useEffect(() => {
    setFeeDrafts({});
  }, [activeRid]);

  const handleAddDeliveryZone = () => {
    const newKey = `zone-${++zoneKeySeqRef.current}`;
    zoneRowKeysRef.current = [newKey, ...zoneRowKeysRef.current];
    flushSync(() => {
      setDeliveryZonesState((prev) => [{ area: '', fee: 2000, cities: [] }, ...prev]);
    });
    const input = firstZoneNameInputRef.current;
    if (input) {
      input.focus({ preventScroll: true });
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleDeleteDeliveryZone = (idx: number) => {
    const removedKey = zoneRowKeysRef.current[idx];
    zoneRowKeysRef.current = zoneRowKeysRef.current.filter((_, i) => i !== idx);
    if (removedKey) {
      setFeeDrafts((prev) => {
        if (!(removedKey in prev)) return prev;
        const next = { ...prev };
        delete next[removedKey];
        return next;
      });
    }
    setDeliveryZonesState((prev) => prev.filter((_, i) => i !== idx));
  };

  // Reset slug draft cleanly when switching branches
  useEffect(() => {
    if (slugDebounceRef.current !== null) {
      window.clearTimeout(slugDebounceRef.current);
      slugDebounceRef.current = null;
    }
    setSlugDraft(restSlug);
    setHasTypedSlug(false);
    setSlugFormatError('');
    setSlugDebouncing(false);
  }, [activeRid]);

  // Keep draft synced with external updates when user hasn't typed manually
  useEffect(() => {
    if (!hasTypedSlug) {
      setSlugDraft(restSlug);
    }
  }, [restSlug, hasTypedSlug]);

  useEffect(() => {
    return () => {
      if (slugDebounceRef.current !== null) {
        window.clearTimeout(slugDebounceRef.current);
      }
    };
  }, []);

  const handleSlugTyping = (rawInput: string) => {
    const rawVal = rawInput.toLowerCase();
    setSlugDraft(rawVal);
    setHasTypedSlug(true);

    if (slugDebounceRef.current !== null) {
      window.clearTimeout(slugDebounceRef.current);
      slugDebounceRef.current = null;
    }

    if (!rawVal) {
      setSlugDebouncing(false);
      setSlugFormatError('أدخل 3 أحرف إنجليزية أو أرقام على الأقل.');
      setSlugCheckState({ checking: false, available: false, message: '' });
      return;
    }

    const hasInvalidChars = /[^a-z0-9-]/.test(rawVal);
    const hasBadHyphen = rawVal.startsWith('-') || rawVal.endsWith('-') || rawVal.includes('--');
    if (hasInvalidChars || hasBadHyphen) {
      setSlugDebouncing(false);
      setSlugFormatError(
        hasInvalidChars
          ? 'يُسمح فقط بالأحرف الإنجليزية (a-z) والأرقام والشرطة (-) بدون مسافات.'
          : 'لا يمكن أن يبدأ الرابط أو ينتهي بشرطة (-) أو يحتوي على شرطتين متتاليتين.'
      );
      setSlugCheckState({ checking: false, available: false, message: '' });
      return;
    }

    if (rawVal.length < 3) {
      setSlugDebouncing(false);
      setSlugFormatError('يجب أن يتكون الرابط من 3 أحرف إنجليزية أو أرقام على الأقل.');
      setSlugCheckState({ checking: false, available: false, message: '' });
      return;
    }

    if (isReservedSlug(rawVal)) {
      setSlugDebouncing(false);
      setSlugFormatError('هذا الاسم محجوز للنظام، يرجى اختيار اسم آخر.');
      setSlugCheckState({ checking: false, available: false, message: '' });
      return;
    }

    setSlugFormatError('');
    setRestSlug(rawVal);
    setSlugDebouncing(true);
    setSlugCheckState({ checking: true, available: null, message: '' });
    slugDebounceRef.current = window.setTimeout(() => {
      slugDebounceRef.current = null;
      setSlugDebouncing(false);
      void checkSubdomainAvailability(rawVal);
    }, 320);
  };

  const targetTelegramRid = activeRid || mainRid || rest.id;
  const isCurrentSubBranch = Boolean(rest.isBranch || (rest.parentRid && targetTelegramRid !== mainRid));
  const currentBranchLabel = isCurrentSubBranch
    ? rest.branchName?.trim() || rest.n
    : `${mainRest.branchName?.trim() || mainRest.n} (الرئيسي)`;
  const hasLocalTelegram = Boolean(
    rest.telegramLinked ||
      (rest.telegramChatId && String(rest.telegramChatId).trim()) ||
      (rest.telegramPhone && String(rest.telegramPhone).trim() && rest.telegramUnlinkedManually !== true)
  );
  const [serverTelegramLinked, setServerTelegramLinked] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    if (!targetTelegramRid) {
      setServerTelegramLinked(false);
      return;
    }
    setServerTelegramLinked(null);
    void fetchDashboardTelegramStatusApi(targetTelegramRid)
      .then((res) => {
        if (!active) return;
        setServerTelegramLinked(Boolean(res?.linked));
      })
      .catch(() => {
        if (active) setServerTelegramLinked(hasLocalTelegram);
      });
    return () => {
      active = false;
    };
  }, [targetTelegramRid, rest.telegramPhone, rest.telegramLinked, rest.telegramUnlinkedManually, hasLocalTelegram, telegramEnabled]);

  const previewSubdomainHost = subdomainEnabled
    ? `${restSlug || 'your-store'}.${baseDomain}`
    : `${baseDomain}/${restSlug || 'your-store'}`;

  const isTelegramConnected =
    serverTelegramLinked === true ||
    (serverTelegramLinked !== false && hasLocalTelegram);
  const missingTelegram =
    telegramEnabled &&
    !isTelegramConnected &&
    (hasLocalTelegram || serverTelegramLinked !== null);
  const missingWhatsapp = whatsappEnabled && !restWa.trim() && !restPhone.trim();
  const hasOpsAlert = missingTelegram || missingWhatsapp;

  const goToWhatsAppInput = () => {
    setSectionTab('links');
    window.setTimeout(() => {
      waInputRef.current?.focus();
      waInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 220);
  };

  const isSlugLoading = hasTypedSlug && (slugDebouncing || slugCheckState.checking);
  const isSlugInvalid = hasTypedSlug && !isSlugLoading && (Boolean(slugFormatError) || slugCheckState.available === false);
  const isSlugValid = hasTypedSlug && !isSlugLoading && !slugFormatError && slugCheckState.available === true;
  const slugFeedbackMessage = hasTypedSlug && !isSlugLoading ? slugFormatError || slugCheckState.message : '';

  const tabs: Array<{ id: SettingsSectionTab; label: string; Icon: React.ElementType; alert?: boolean }> = [
    { id: 'ops', label: 'التشغيل', Icon: SlidersHorizontal, alert: hasOpsAlert },
    { id: 'identity', label: 'الهوية', Icon: Store },
    { id: 'links', label: 'الروابط', Icon: Link2, alert: missingWhatsapp },
    { id: 'telegram', label: 'تيليجرام', Icon: Send, alert: missingTelegram },
  ];

  const renderLinkActionButtons = (targetUrl: string) => (
    <div className="mp-set2-link-actions">
      <button type="button" className="btn s mp-set2-link-action-btn" onClick={openShareModal}>
        <Share2 size={14} />
        <span>مشاركة</span>
      </button>
      <button type="button" className="btn s mp-set2-link-action-btn" onClick={() => copyLink(targetUrl)}>
        <Copy size={14} />
        <span>نسخ</span>
      </button>
      {fullSubdomainUrl ? (
        <a
          href={fullSubdomainUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn s mp-set2-link-action-btn"
        >
          <ExternalLink size={14} />
          <span>معاينة</span>
        </a>
      ) : (
        <button type="button" className="btn s mp-set2-link-action-btn" onClick={() => onNavigate(publicPath)}>
          <ExternalLink size={14} />
          <span>معاينة</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="mp-set2-page">
      {/* Segmented Category Navigation */}
      <motion.div
        className="mp-set2-tabs-bar"
        role="tablist"
        aria-label="أقسام الإعدادات"
        {...dashSectionMotion(prefersReducedMotion, 0)}
      >
        {tabs.map((tab) => {
          const isActive = sectionTab === tab.id;
          const TabIcon = tab.Icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSectionTab(tab.id)}
              className={`mp-set2-tab-btn ${isActive ? 'active' : ''}`}
            >
              {isActive && (
                <motion.span
                  layoutId={prefersReducedMotion ? undefined : 'mp-set2-active-pill'}
                  className="mp-set2-tab-pill"
                  transition={DASH_SPRING_PILL}
                />
              )}
              <TabIcon size={14} />
              <span>{tab.label}</span>
              {tab.alert && <span className="mp-set2-tab-alert" aria-hidden="true" />}
            </button>
          );
        })}
      </motion.div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void flushAllPendingSaves();
        }}
      >
        <>
          {/* 1. التبويب الأول: التشغيل (الحالة، العملة وطرق الطلبات، قناة الوصول، أوقات الدوام، مناطق وأسعار التوصيل) */}
          {sectionTab === 'ops' && (
            <motion.div
              key="tab-ops"
              {...dashSubTabMotion(prefersReducedMotion)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Order Types & Notification Channels Panel */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">طرق استلام الطلبات</h2>
                  {branchesList.length > 0 && (
                    <span className="badge mute" style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <GitBranch size={12} />
                      <span>{currentBranchLabel}</span>
                    </span>
                  )}
                </div>

                <div className="mp-set2-list">
                  {/* View-Only Catalog Mode */}
                  <div className="mp-set2-row">
                    <div className="mp-set2-row-meta">
                      <div className="mp-set2-mini-ico">
                        <Eye size={19} />
                      </div>
                      <div className="mp-set2-row-label">
                        {terms.isStore ? 'وضع العرض فقط (بدون طلبات)' : 'وضع العرض فقط (بدون سلة وطلبات)'}
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={viewOnlyMode}
                      aria-label="تفعيل وضع العرض فقط"
                      onClick={toggleViewOnlyMode}
                      className={`ios-switch sm ${viewOnlyMode ? 'on' : 'off'}`}
                    >
                      <span className="ios-switch-thumb" />
                    </button>
                  </div>

                  {/* Delivery */}
                  <div className="mp-set2-row">
                    <div className="mp-set2-row-meta">
                      <div className="mp-set2-mini-ico">
                        <Truck size={16} />
                      </div>
                      <div>
                        <div className="mp-set2-row-label">طلبات التوصيل</div>
                        {!resolvedPlan.perms.deliveryOrders && (
                          <div className="mp-set2-row-desc" style={{ color: '#f59e0b', fontWeight: 700 }}>
                            مقفل في باقتك الحالية
                          </div>
                        )}
                      </div>
                    </div>
                    {!resolvedPlan.perms.deliveryOrders ? (
                      <button
                        type="button"
                        className="btn s"
                        onClick={() => openUpgradeModal('starter')}
                        style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 800 }}
                      >
                        <Lock size={13} />
                        <span>ترقية</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={allowDelivery}
                        aria-label="تفعيل طلبات التوصيل"
                        onClick={() => toggleOrderType('delivery')}
                        className={`ios-switch sm ${allowDelivery ? 'on' : 'off'}`}
                      >
                        <span className="ios-switch-thumb" />
                      </button>
                    )}
                  </div>

                  {/* Pickup */}
                  <div className="mp-set2-row">
                    <div className="mp-set2-row-meta">
                      <div className="mp-set2-mini-ico">
                        <Store size={16} />
                      </div>
                      <div>
                        <div className="mp-set2-row-label">{terms.isStore ? 'الاستلام من المعرض' : 'الحجز / الاستلام'}</div>
                        {!resolvedPlan.perms.pickupOrders && (
                          <div className="mp-set2-row-desc" style={{ color: '#f59e0b', fontWeight: 700 }}>
                            مقفل في باقتك الحالية
                          </div>
                        )}
                      </div>
                    </div>
                    {!resolvedPlan.perms.pickupOrders ? (
                      <button
                        type="button"
                        className="btn s"
                        onClick={() => openUpgradeModal('starter')}
                        style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 800 }}
                      >
                        <Lock size={13} />
                        <span>ترقية</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={allowPickup}
                        aria-label={terms.isStore ? 'تفعيل الاستلام من المعرض' : 'تفعيل الحجز والاستلام'}
                        onClick={() => toggleOrderType('pickup')}
                        className={`ios-switch sm ${allowPickup ? 'on' : 'off'}`}
                      >
                        <span className="ios-switch-thumb" />
                      </button>
                    )}
                  </div>

                  {/* Table (Restaurants only) */}
                  {restProjectType !== 'store' && (
                    <div className="mp-set2-row">
                      <div className="mp-set2-row-meta">
                        <div className="mp-set2-mini-ico">
                          <UtensilsCrossed size={16} />
                        </div>
                        <div>
                          <div className="mp-set2-row-label">طلبات الطاولات</div>
                          {!resolvedPlan.perms.tableOrders && (
                            <div className="mp-set2-row-desc" style={{ color: '#f59e0b', fontWeight: 700 }}>
                              متاح في الباقة الاحترافية فأعلى
                            </div>
                          )}
                        </div>
                      </div>
                      {!resolvedPlan.perms.tableOrders ? (
                        <button
                          type="button"
                          className="btn s"
                          onClick={() => openUpgradeModal('pro')}
                          style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 800 }}
                        >
                          <Lock size={13} />
                          <span>ترقية</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={allowTable}
                          aria-label="تفعيل طلبات الطاولات"
                          onClick={() => toggleOrderType('table')}
                          className={`ios-switch sm ${allowTable ? 'on' : 'off'}`}
                        >
                          <span className="ios-switch-thumb" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Pre-orders when closed */}
                  <div className="mp-set2-row" style={viewOnlyMode ? { opacity: 0.55 } : undefined}>
                    <div className="mp-set2-row-meta">
                      <div className="mp-set2-mini-ico">
                        <Moon size={19} />
                      </div>
                      <div>
                        <div className="mp-set2-row-label">استقبال الطلبات خارج الدوام</div>
                        {viewOnlyMode ? (
                          <div className="mp-set2-row-desc">
                            متوقف تلقائياً أثناء وضع العرض فقط
                          </div>
                        ) : !acceptClosedOrders ? (
                          <div className="mp-set2-row-desc">
                            عند الإيقاف، يتحول المنيو تلقائياً لوضع العرض فقط عند انتهاء الدوام
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={acceptClosedOrders}
                      aria-label="استقبال الطلبات خارج الدوام"
                      onClick={() => setAcceptClosedOrders((v) => !v)}
                      className={`ios-switch sm ${acceptClosedOrders ? 'on' : 'off'}`}
                    >
                      <span className="ios-switch-thumb" />
                    </button>
                  </div>

                  {/* Order Receiving Channels as Unified Toggle Switch Rows (at least 1 active required) */}
                  {[
                    {
                      id: 'whatsapp' as const,
                      title: 'استلام رسائل وتساب',
                      active: whatsappEnabled,
                      Icon: MessageCircle,
                    },
                    {
                      id: 'telegram' as const,
                      title: 'استلام رسائل تليجرام',
                      active: telegramEnabled,
                      Icon: Send,
                    },
                    {
                      id: 'app' as const,
                      title: 'استلام اشعارات التطبيق',
                      active: appNotificationsEnabled,
                      Icon: Bell,
                    },
                  ].map((opt) => {
                    const OptIcon = opt.Icon;
                    return (
                      <div key={opt.id} className="mp-set2-row">
                        <div className="mp-set2-row-meta">
                          <div className="mp-set2-mini-ico">
                            <OptIcon size={19} />
                          </div>
                          <div className="mp-set2-row-label">{opt.title}</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={opt.active}
                          aria-label={opt.title}
                          onClick={() => toggleOrderDeliveryChannel(opt.id)}
                          className={`ios-switch sm ${opt.active ? 'on' : 'off'}`}
                        >
                          <span className="ios-switch-thumb" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {missingTelegram && (
                  <div className="mp-set2-alert warn" style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 200px' }}>
                      <AlertCircle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
                      <span>لم يتم ربط التليجرام بعد — شارك رقمك مع البوت لاستقبال الطلبات.</span>
                    </div>
                    <button
                      type="button"
                      className="btn s"
                      onClick={() => setSectionTab('telegram')}
                      style={{ fontWeight: 800, fontSize: '12px' }}
                    >
                      <Send size={13} />
                      <span>إعداد التليجرام</span>
                    </button>
                  </div>
                )}

                {missingWhatsapp && (
                  <div className="mp-set2-alert danger" style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 200px' }}>
                      <AlertCircle size={16} style={{ flexShrink: 0 }} />
                      <span>يرجى إدخال رقم الواتساب في تبويب «الروابط» لاستقبال الطلبات.</span>
                    </div>
                    <button
                      type="button"
                      className="btn s"
                      onClick={goToWhatsAppInput}
                      style={{ fontSize: '12px', fontWeight: 800 }}
                    >
                      إدخال الرقم الآن
                    </button>
                  </div>
                )}
              </div>

              {/* Working Hours Panel */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <div>
                    <h2 className="mp-set2-panel-title">
                      <Clock size={15} style={{ color: 'var(--brand-ink, #34D399)' }} />
                      <span>أوقات وساعات العمل</span>
                    </h2>
                  </div>
                </div>

                <div className="mp-set2-seg-2" role="group" aria-label="نظام أوقات العمل">
                  <button
                    type="button"
                    className={`mp-set2-seg-2-btn ${workMode === '24' ? 'active' : ''}`}
                    onClick={() => setWorkMode('24')}
                  >
                    مفتوح 24 ساعة
                  </button>
                  <button
                    type="button"
                    className={`mp-set2-seg-2-btn ${workMode === 'c' ? 'active' : ''}`}
                    onClick={() => setWorkMode('c')}
                  >
                    جدول أسبوعي مخصص
                  </button>
                </div>

                {workMode === 'c' && (
                  <motion.div
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: DASH_EASE }}
                    style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                  >
                      {/* Quick Unified Time Bar */}
                      <div className="mp-set2-hours-quick">
                        <div className="mp-set2-hours-quick-label">توقيت موحد للأيام المفتوحة:</div>
                        <div className="mp-set2-hours-quick-controls">
                          <div className="mp-set2-time-pair">
                            <div className="mp-set2-time-box">
                              <span>من</span>
                              <TimePickerField
                                value={workFrom}
                                title="وقت الفتح الموحد"
                                onChange={(val) => setWorkFrom(val)}
                                className="mp-themed-input"
                              />
                            </div>
                            <div className="mp-set2-time-box">
                              <span>إلى</span>
                              <TimePickerField
                                value={workTo}
                                title="وقت الإغلاق الموحد"
                                onChange={(val) => setWorkTo(val)}
                                className="mp-themed-input"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn s mp-set2-hours-apply-btn"
                            onClick={() => applyTimeToOpenDays(workFrom, workTo)}
                          >
                            تطبيق على الكل
                          </button>
                        </div>
                      </div>

                      {/* 7 Days List */}
                      <div className="mp-set2-days-list">
                        {WEEK_DAYS_ORDER.map(({ key, label }) => {
                          const dayCfg = weeklyHours[key] || { open: true, from: workFrom, to: workTo };
                          return (
                            <div
                              key={key}
                              className={`mp-set2-day-row ${dayCfg.open ? 'is-open' : 'is-closed'}`}
                            >
                              <div className="mp-set2-day-head">
                                <div className="mp-set2-day-switch-wrap">
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={dayCfg.open}
                                    aria-label={`${label} ${dayCfg.open ? 'مفتوح' : 'مغلق'}`}
                                    onClick={() =>
                                      setWeeklyHours((prev) => ({
                                        ...prev,
                                        [key]: { ...dayCfg, open: !dayCfg.open },
                                      }))
                                    }
                                    className={`ios-switch sm ${dayCfg.open ? 'on' : 'off'}`}
                                  >
                                    <span className="ios-switch-thumb" />
                                  </button>
                                  <span className="mp-set2-day-name">{label}</span>
                                </div>
                                <span className={`mp-set2-day-status ${dayCfg.open ? 'is-open' : 'is-closed'}`}>
                                  {dayCfg.open ? 'مفتوح' : 'مغلق'}
                                </span>
                              </div>

                              {dayCfg.open && (
                                <div className="mp-set2-time-pair">
                                  <div className="mp-set2-time-box">
                                    <span>من</span>
                                    <TimePickerField
                                      value={dayCfg.from || workFrom}
                                      title={`وقت فتح ${label}`}
                                      onChange={(val) =>
                                        setWeeklyHours((prev) => ({
                                          ...prev,
                                          [key]: { ...dayCfg, from: val },
                                        }))
                                      }
                                      className="mp-themed-input"
                                    />
                                  </div>
                                  <div className="mp-set2-time-box">
                                    <span>إلى</span>
                                    <TimePickerField
                                      value={dayCfg.to || workTo}
                                      title={`وقت إغلاق ${label}`}
                                      onChange={(val) =>
                                        setWeeklyHours((prev) => ({
                                          ...prev,
                                          [key]: { ...dayCfg, to: val },
                                        }))
                                      }
                                      className="mp-themed-input"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                )}
              </div>

              {/* Delivery Zones & Fees */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">
                    <MapPin size={18} style={{ color: 'var(--brand-ink, #34D399)' }} />
                    <span>مناطق التوصيل</span>
                  </h2>

                  <button
                    type="button"
                    className="btn p s mp-set2-add-zone-btn"
                    onClick={handleAddDeliveryZone}
                  >
                    <Plus size={16} />
                    <span>إضافة منطقة</span>
                  </button>
                </div>

                {deliveryZonesState.length === 0 ? (
                  <div className="mp-set2-zones-empty">لا توجد مناطق توصيل بعد.</div>
                ) : (
                  <div className="mp-set2-zones-list is-flat">
                    {deliveryZonesState.map((zone, idx) => {
                      const rowKey = zoneRowKeysRef.current[idx] || `zone-fallback-${idx}`;
                      const feeInputValue =
                        feeDrafts[rowKey] !== undefined ? feeDrafts[rowKey] : String(zone.fee);
                      return (
                        <div key={rowKey} className="mp-set2-subzone-row mp-set2-flat-zone-row">
                          <input
                            ref={idx === 0 ? firstZoneNameInputRef : undefined}
                            type="text"
                            value={zone.area}
                            onChange={(e) =>
                              setDeliveryZonesState((prev) =>
                                prev.map((z, i) => (i === idx ? { ...z, area: e.target.value } : z))
                              )
                            }
                            placeholder="اسم المنطقة"
                            aria-label="اسم المنطقة"
                            autoComplete="off"
                            className="mp-themed-input"
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            dir="ltr"
                            value={feeInputValue}
                            onChange={(e) => {
                              const rawVal = e.target.value;
                              setFeeDrafts((prev) => ({ ...prev, [rowKey]: rawVal }));
                              const parsedFee = rawVal === '' ? 0 : Math.max(0, Number(rawVal) || 0);
                              setDeliveryZonesState((prev) =>
                                prev.map((z, i) => (i === idx ? { ...z, fee: parsedFee } : z))
                              );
                            }}
                            onBlur={() => {
                              setFeeDrafts((prev) => {
                                if (!(rowKey in prev)) return prev;
                                const next = { ...prev };
                                delete next[rowKey];
                                return next;
                              });
                            }}
                            placeholder={restCurrency}
                            aria-label={`سعر التوصيل (${restCurrency})`}
                            className="mp-themed-input"
                          />
                          <button
                            type="button"
                            className="mp-set2-subzone-del"
                            onClick={() => handleDeleteDeliveryZone(idx)}
                            title="حذف المنطقة"
                            aria-label="حذف المنطقة"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* 2. التبويب الثاني: الهوية (بيانات المشروع، الشعار والغلاف، المظهر) */}
          {sectionTab === 'identity' && (
            <motion.div
              key="tab-identity"
              {...dashSubTabMotion(prefersReducedMotion)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Business Type & Core Info */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">نوع النشاط وبيانات المشروع</h2>
                </div>

                <div className="mp-set2-type-grid">
                  <button
                    type="button"
                    onClick={() => setRestProjectType('restaurant')}
                    className={`mp-set2-type-card ${restProjectType === 'restaurant' ? 'is-selected' : ''}`}
                  >
                    <UtensilsCrossed
                      size={22}
                      style={{
                        color: restProjectType === 'restaurant' ? '#10b981' : 'var(--muted)',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: '15.5px', color: 'var(--ink)' }}>
                      مطعم أو مقهى
                    </span>
                    {restProjectType === 'restaurant' && <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0 }} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRestProjectType('store')}
                    className={`mp-set2-type-card ${restProjectType === 'store' ? 'is-selected' : ''}`}
                  >
                    <Store
                      size={22}
                      style={{
                        color: restProjectType === 'store' ? '#0ea5e9' : 'var(--muted)',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: '15.5px', color: 'var(--ink)' }}>
                      متجر أو محل
                    </span>
                    {restProjectType === 'store' && <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0 }} />}
                  </button>
                </div>

                {restProjectType === 'store' && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '12px 14px',
                      borderRadius: '16px',
                      background: 'color-mix(in srgb, #f15a29 10%, transparent)',
                      border: '1px solid color-mix(in srgb, #f15a29 30%, var(--set-glass-border, var(--line)))',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'var(--ink)',
                      lineHeight: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>مظهر المتجر الإلكتروني مفعّل</span>
                    <button
                      type="button"
                      className="btn p s"
                      onClick={() => handleSeedStoreCatalog('append_missing')}
                      style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Sparkles size={14} />
                      <span>إضافة منتجات افتراضية</span>
                    </button>
                  </div>
                )}

                <div className="mp-set2-grid-2">
                  <label className="f" style={{ marginBottom: 0 }}>
                    {terms.isStore ? 'اسم المتجر *' : 'اسم المنيو *'}
                    <input
                      type="text"
                      value={restName}
                      onChange={(e) => setRestName(e.target.value)}
                      placeholder={terms.isStore ? 'اسم المتجر' : 'اسم المطعم أو المنيو'}
                      className="mp-themed-input"
                      required
                    />
                  </label>

                  <label className="f" style={{ marginBottom: 0 }}>
                    الوصف المختصر
                    <input
                      type="text"
                      value={restTagline}
                      onChange={(e) => setRestTagline(e.target.value)}
                      placeholder={terms.isStore ? 'أجهزة وإكسسوارات' : 'برجر سماش • بطاطا مقرمشة'}
                      className="mp-themed-input"
                    />
                  </label>
                </div>

                <label className="f" style={{ marginBottom: 0 }}>
                  نبذة عن المشروع
                  <textarea
                    rows={2}
                    value={aboutTextInput}
                    onChange={(e) => setAboutTextInput(e.target.value)}
                    placeholder="اكتب نبذة مختصرة..."
                    className="mp-themed-input"
                  />
                </label>

                <label className="f" style={{ marginBottom: 0 }}>
                  {terms.isStore ? 'ملاحظة الضريبة أو الضمان' : 'ملاحظة الضريبة أو الفاتورة'}
                  <input
                    type="text"
                    value={taxNoteInput}
                    onChange={(e) => setTaxNoteInput(e.target.value)}
                    placeholder={terms.isStore ? 'الأسعار شاملة الضمان' : 'الأسعار شاملة الضريبة'}
                    className="mp-themed-input"
                  />
                </label>
              </div>

              {/* Logo (and Cover Media for Storefront) */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">
                    <ImageIcon size={18} style={{ color: 'var(--brand-ink, #34D399)' }} />
                    <span>{terms.isStore ? 'الشعار والغلاف' : 'الشعار'}</span>
                  </h2>
                </div>

                <div className={terms.isStore ? 'mp-set2-grid-2' : ''} style={{ gap: '18px' }}>
                  {/* Logo */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>الشعار</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '74px',
                          height: '74px',
                          borderRadius: '50%',
                          border: '1px solid var(--set-glass-border, var(--line))',
                          background: 'var(--set-glass-control, rgba(255, 255, 255, 0.05))',
                          overflow: 'hidden',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {logoUrlInput ? (
                          <img
                            src={logoUrlInput}
                            alt={terms.isStore ? 'شعار المتجر' : 'شعار المنيو'}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <ImageIcon size={22} style={{ color: 'var(--muted)' }} />
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', flex: 1, minWidth: 0 }}>
                        <button
                          type="button"
                          onClick={() => setMediaPickerTarget('logo')}
                          className="btn p s"
                          style={{ width: 'fit-content', fontWeight: 800 }}
                        >
                          <ImageIcon size={14} />
                          <span>مكتبة الصور</span>
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn s"
                            onClick={() => setShowLogoUrlField((v) => !v)}
                            style={{ minHeight: '30px', padding: '4px 9px', fontSize: '11.5px' }}
                          >
                            <Link2 size={12} />
                            <span>{showLogoUrlField ? 'إخفاء الرابط' : 'رابط مباشر'}</span>
                          </button>
                          {logoUrlInput && (
                            <button
                              type="button"
                              onClick={() => setLogoUrlInput('')}
                              style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                color: '#ef4444',
                                borderRadius: '999px',
                                padding: '5px 9px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              إزالة
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {showLogoUrlField && (
                      <input
                        type="text"
                        dir="ltr"
                        value={logoUrlInput}
                        onChange={(e) => setLogoUrlInput(e.target.value)}
                        placeholder="https://example.com/logo.png"
                        className="mp-themed-input"
                        style={{ textAlign: 'left', fontSize: '12.5px' }}
                      />
                    )}
                  </div>

                  {/* Cover Banner (Stores only) */}
                  {terms.isStore && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>الغلاف</span>
                      </div>

                      <div
                        style={{
                          width: '100%',
                          height: '92px',
                          borderRadius: '16px',
                          border: '1px solid var(--set-glass-border, var(--line))',
                          background: 'var(--set-glass-control, rgba(255, 255, 255, 0.05))',
                          overflow: 'hidden',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        {coverUrlInput ? (
                          <img
                            src={coverUrlInput}
                            alt="بانر المتجر"
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: 'var(--muted)' }}>
                            <ImageIcon size={20} />
                            <span style={{ fontSize: '11.5px' }}>لم يتم اختيار صورة غلاف</span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setMediaPickerTarget('cover')}
                          className="btn p s"
                          style={{ fontWeight: 800 }}
                        >
                          <ImageIcon size={14} />
                          <span>مكتبة الصور</span>
                        </button>
                        <button
                          type="button"
                          className="btn s"
                          onClick={() => setShowBannerUrlField((v) => !v)}
                          style={{ minHeight: '34px', padding: '5px 10px', fontSize: '11.5px' }}
                        >
                          <Link2 size={12} />
                          <span>{showBannerUrlField ? 'إخفاء الرابط' : 'رابط مباشر'}</span>
                        </button>
                        {coverUrlInput && (
                          <button
                            type="button"
                            onClick={() => setCoverUrlInput('')}
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              color: '#ef4444',
                              borderRadius: '999px',
                              padding: '6px 10px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            إزالة
                          </button>
                        )}
                      </div>

                      {showBannerUrlField && (
                        <input
                          type="text"
                          dir="ltr"
                          value={coverUrlInput}
                          onChange={(e) => setCoverUrlInput(e.target.value)}
                          placeholder="https://example.com/banner.jpg"
                          className="mp-themed-input"
                          style={{ textAlign: 'left', fontSize: '12.5px' }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Dashboard Theme Appearance Mode */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">مظهر لوحة التحكم</h2>
                </div>

                <div className="mp-set2-list">

                  {/* Dashboard Theme Mode */}
                  <div className="mp-set2-row">
                    <div className="mp-set2-row-meta">
                      <div className="mp-set2-mini-ico">
                        {dashboardThemeMode === 'light' ? (
                          <Sun size={19} />
                        ) : dashboardThemeMode === 'auto' ? (
                          <Monitor size={19} />
                        ) : (
                          <Moon size={19} />
                        )}
                      </div>
                      <div className="mp-set2-row-label">مظهر اللوحة</div>
                    </div>

                    <div className="mp-theme-icon-switch" role="group" aria-label="مظهر لوحة التحكم">
                      <button
                        type="button"
                        onClick={() => void handleSelectDashboardThemeMode('light')}
                        className={`mp-theme-icon-btn${dashboardThemeMode === 'light' ? ' is-active' : ''}`}
                        aria-label="الوضع الفاتح"
                        title="فاتح"
                      >
                        <Sun size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSelectDashboardThemeMode('dark')}
                        className={`mp-theme-icon-btn${dashboardThemeMode === 'dark' ? ' is-active' : ''}`}
                        aria-label="الوضع الداكن"
                        title="داكن"
                      >
                        <Moon size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSelectDashboardThemeMode('auto')}
                        className={`mp-theme-icon-btn${dashboardThemeMode === 'auto' ? ' is-active' : ''}`}
                        aria-label="تلقائي حسب جهازك"
                        title="تلقائي"
                      >
                        <Monitor size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 3. التبويب الثالث: الروابط (رابط المنيو المخصص، التواصل والموقع والخرائط، حسابات التواصل الاجتماعي) */}
          {sectionTab === 'links' && (
            <motion.div
              key="tab-links"
              {...dashSubTabMotion(prefersReducedMotion)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Custom Link / Subdomain */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">
                    <Globe size={18} style={{ color: 'var(--brand-ink, #34D399)' }} />
                    <span>
                      {subdomainEnabled
                        ? 'الدومين والرابط المخصص'
                        : terms.isStore
                        ? 'رابط المتجر'
                        : 'رابط المنيو'}
                    </span>
                  </h2>
                </div>

                {!resolvedPlan.perms.customSlug ? (
                  <>
                    {renderLinkActionButtons(liveMenuUrl)}

                    <div className="mp-set2-alert warn">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 220px' }}>
                        <Lock size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--ink)' }}>
                            تخصيص الرابط باسم مشروعك متاح في الباقات المدفوعة
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>
                            قم بالترقية إلى الباقة الاقتصادية أو أعلى لتفعيل رابط مخصص.
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openUpgradeModal('starter')}
                        className="btn p s"
                        style={{ fontWeight: 800 }}
                      >
                        ترقية الباقة
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      dir="ltr"
                      className={`mp-set2-slug-box ${
                        isSlugValid ? 'is-valid' : isSlugInvalid ? 'is-invalid' : ''
                      }`}
                    >
                      {!subdomainEnabled && (
                        <span
                          style={{
                            padding: '0 10px',
                            fontSize: '12px',
                            fontWeight: 800,
                            color: 'var(--brand-ink, #34D399)',
                            borderInlineEnd: '1px solid var(--set-glass-divider, var(--line))',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          https://{baseDomain}/
                        </span>
                      )}
                      <input
                        type="text"
                        dir="ltr"
                        className="mp-set2-slug-input"
                        aria-label={terms.isStore ? 'رابط المتجر المخصص' : 'رابط المنيو المخصص'}
                        value={slugDraft}
                        onChange={(e) => handleSlugTyping(e.target.value)}
                        placeholder={terms.isStore ? 'your-store' : 'your-restaurant'}
                        style={{
                          border: 0,
                          background: 'transparent',
                          outline: 'none',
                          padding: '10px 12px',
                          fontSize: '14.5px',
                          fontWeight: 700,
                          color: 'var(--ink)',
                          flex: 1,
                          minHeight: '46px',
                          minWidth: 0,
                        }}
                      />
                      {subdomainEnabled && (
                        <span
                          style={{
                            padding: '0 10px',
                            fontSize: '12px',
                            fontWeight: 800,
                            color: 'var(--brand-ink, #34D399)',
                            borderInlineStart: '1px solid var(--set-glass-divider, var(--line))',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          .{baseDomain}
                        </span>
                      )}
                      {hasTypedSlug && (
                        <span className="mp-set2-slug-status" aria-live="polite">
                          {isSlugLoading ? (
                            <Loader2
                              size={16}
                              className="animate-spin"
                              style={{ color: 'var(--brand-ink, #34D399)' }}
                              aria-label="جاري التحقق"
                            />
                          ) : isSlugValid ? (
                            <Check size={17} strokeWidth={2.8} style={{ color: '#10b981' }} aria-label="الرابط متاح وصحيح" />
                          ) : isSlugInvalid ? (
                            <X size={17} strokeWidth={2.8} style={{ color: '#ef4444' }} aria-label="الرابط غير صحيح أو غير متاح" />
                          ) : null}
                        </span>
                      )}
                    </div>

                    {slugFeedbackMessage && (
                      <div
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 800,
                          color: isSlugValid ? '#10b981' : '#ef4444',
                        }}
                      >
                        {slugFeedbackMessage}
                      </div>
                    )}

                    {renderLinkActionButtons(restSlug ? `https://${previewSubdomainHost}` : liveMenuUrl)}
                  </>
                )}
              </div>

              {/* Contact & Location */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">
                    <Phone size={15} style={{ color: 'var(--brand-ink, #34D399)' }} />
                    <span>التواصل والموقع والخرائط</span>
                  </h2>
                </div>

                <div className="mp-set2-grid-2">
                  <label className="f" style={{ marginBottom: 0 }}>
                    رقم الهاتف
                    <input
                      type="tel"
                      dir="ltr"
                      value={restPhone}
                      onChange={(e) => setRestPhone(e.target.value)}
                      placeholder="07701234567"
                      className="mp-themed-input"
                      style={{ textAlign: 'left' }}
                    />
                  </label>

                  <label className="f" style={{ marginBottom: 0 }}>
                    رقم الواتساب{' '}
                    {!whatsappEnabled ? '(اختياري)' : '*'}
                    <input
                      ref={waInputRef}
                      type="tel"
                      dir="ltr"
                      value={restWa}
                      onChange={(e) => setRestWa(e.target.value)}
                      placeholder="07711448594"
                      className="mp-themed-input"
                      style={{ textAlign: 'left' }}
                      required={whatsappEnabled}
                    />
                  </label>
                </div>

                <label className="f" style={{ marginBottom: 0 }}>
                  العنوان
                  <input
                    type="text"
                    value={restAddress}
                    onChange={(e) => setRestAddress(e.target.value)}
                    placeholder="بغداد، الكرادة..."
                    className="mp-themed-input"
                  />
                </label>

                <div className="mp-set2-grid-3">
                  <label className="f" style={{ marginBottom: 0 }}>
                    رابط خرائط كوكل (Google Maps)
                    <input
                      type="url"
                      dir="ltr"
                      value={restMapUrl}
                      onChange={(e) => setRestMapUrl(e.target.value)}
                      placeholder="https://maps.google.com/?q=..."
                      className="mp-themed-input"
                      style={{ textAlign: 'left' }}
                    />
                  </label>

                  <label className="f" style={{ marginBottom: 0 }}>
                    رابط ويز (Waze)
                    <input
                      type="url"
                      dir="ltr"
                      value={restWazeUrl}
                      onChange={(e) => setRestWazeUrl(e.target.value)}
                      placeholder="https://waze.com/ul?ll=..."
                      className="mp-themed-input"
                      style={{ textAlign: 'left' }}
                    />
                  </label>

                  <label className="f" style={{ marginBottom: 0 }}>
                    رابط التقييمات (اختياري)
                    <input
                      type="url"
                      dir="ltr"
                      value={restGoogleReviewUrl}
                      onChange={(e) => setRestGoogleReviewUrl(e.target.value)}
                      placeholder="https://g.page/r/..."
                      className="mp-themed-input"
                      style={{ textAlign: 'left' }}
                    />
                  </label>
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--muted)', fontWeight: 600 }}>
                  تظهر روابط خرائط كوكل وويز داخل المنيو وكذلك كزرين مباشرين داخل بطاقة «خصم على طلبات الصالة».
                </div>
              </div>

              {/* Social Media */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">حسابات التواصل الاجتماعي</h2>
                </div>

                <div className="mp-set2-grid-3">
                  <label className="f" style={{ marginBottom: 0 }}>
                    انستقرام (Instagram)
                    <input
                      type="text"
                      dir="ltr"
                      value={restInstagram}
                      onChange={(e) => setRestInstagram(e.target.value)}
                      placeholder="https://instagram.com/..."
                      className="mp-themed-input"
                      style={{ textAlign: 'left' }}
                    />
                  </label>

                  <label className="f" style={{ marginBottom: 0 }}>
                    فيسبوك (Facebook)
                    <input
                      type="text"
                      dir="ltr"
                      value={restFacebook}
                      onChange={(e) => setRestFacebook(e.target.value)}
                      placeholder="https://facebook.com/..."
                      className="mp-themed-input"
                      style={{ textAlign: 'left' }}
                    />
                  </label>

                  <label className="f" style={{ marginBottom: 0 }}>
                    تيك توك (TikTok)
                    <input
                      type="text"
                      dir="ltr"
                      value={restTiktok}
                      onChange={(e) => setRestTiktok(e.target.value)}
                      placeholder="https://tiktok.com/@..."
                      className="mp-themed-input"
                      style={{ textAlign: 'left' }}
                    />
                  </label>
                </div>
              </div>
            </motion.div>
          )}

          {/* 4. التبويب الرابع: تيليجرام (قسم تيليجرام الكامل مدمج داخل الإعدادات) */}
          {sectionTab === 'telegram' && (
            <motion.div
              key="tab-telegram"
              {...dashSubTabMotion(prefersReducedMotion)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <TelegramPage
                embedded
                onOpenOrderChannelSettings={() => setSectionTab('ops')}
              />
            </motion.div>
          )}
        </>
      </form>

      <MediaLibraryModal
        isOpen={mediaPickerTarget !== null}
        items={mediaLibraryItems}
        currentUrl={mediaPickerTarget === 'logo' ? logoUrlInput : coverUrlInput}
        onSelect={(url) => {
          if (mediaPickerTarget === 'logo') {
            setLogoUrlInput(url);
          } else if (mediaPickerTarget === 'cover') {
            setCoverUrlInput(url);
          }
        }}
        onUploadFiles={uploadImagesToLibrary}
        onDeleteItem={(mediaId) => {
          const target = mediaLibraryItems.find((m) => m.id === mediaId);
          if (target) {
            if (target.url === logoUrlInput) setLogoUrlInput('');
            if (target.url === coverUrlInput) setCoverUrlInput('');
          }
          removeMediaLibraryItem(mediaId);
        }}
        onClose={() => setMediaPickerTarget(null)}
      />
    </div>
  );
};
