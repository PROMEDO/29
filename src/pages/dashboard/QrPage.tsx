/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Frame,
  Image as ImageIcon,
  Lock,
  Palette,
  RotateCcw,
  Shapes,
  Share2,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import {
  QR_BG_THEMES,
  QRCodeView,
  QrBgPattern,
  QrBgPreset,
  QrCenterMode,
  QrDotStyle,
  QrEyeInnerStyle,
  QrEyeOuterStyle,
  QrFramePreset,
  QrGradientDir,
  QrLogoShape,
  QrLogoSize,
  QrTileBgMode,
  getLocalizedQrBgLabel,
  getQrContrastRatio,
} from '../../components/QRCodeView';
import { Restaurant } from '../../types';
import { useDashboard } from './DashboardContext';
import { dashCardMotion, dashSectionMotion } from '../../utils/dashboardMotion';

type QrDesignConfig = NonNullable<Restaurant['qrDesign']>;
type QrStudioTab = 'bg' | 'shape' | 'colors' | 'frame';

const QR_COLOR_SWATCHES = [
  '#0f172a',
  '#065f46',
  '#0f766e',
  '#1e3a8a',
  '#4338ca',
  '#7c2d12',
  '#9f1239',
  '#581c87',
  '#b45309',
  '#be123c',
];

const GRADIENT_END_SWATCHES = [
  '#10b981',
  '#0ea5e9',
  '#6366f1',
  '#ec4899',
  '#f59e0b',
  '#ef4444',
  '#14b8a6',
  '#8b5cf6',
];

interface QuickTemplateItem {
  id: string;
  label: string;
  swatch: string;
  patch: Partial<QrDesignConfig>;
}

const QUICK_TEMPLATES: QuickTemplateItem[] = [
  {
    id: 'classic-clean',
    label: 'كلاسيكي أبيض',
    swatch: 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%)',
    patch: {
      bgPreset: 'white',
      bgPattern: 'dots',
      dotStyle: 'rounded',
      eyeOuterStyle: 'rounded',
      eyeInnerStyle: 'rounded',
      framePreset: 'table',
      qrColor: '#0f172a',
      qrUseGradient: false,
      eyeColor: '#0f766e',
      tileBgMode: 'light',
      tileBorder: true,
    },
  },
  {
    id: 'emerald-luxe',
    label: 'زمردي متوهج',
    swatch: 'linear-gradient(135deg, #064e3b 0%, #10b981 100%)',
    patch: {
      bgPreset: 'emerald',
      bgPattern: 'aura',
      dotStyle: 'classy',
      eyeOuterStyle: 'leaf',
      eyeInnerStyle: 'circle',
      framePreset: 'modern',
      qrColor: '#064e3b',
      qrColor2: '#10b981',
      qrUseGradient: true,
      qrGradientDir: 'diagonal',
      eyeColor: '#047857',
      tileBgMode: 'light',
      tileBorder: true,
    },
  },
  {
    id: 'gold-vip',
    label: 'ذهبي ملكي',
    swatch: 'linear-gradient(135deg, #181410 0%, #d97706 100%)',
    patch: {
      bgPreset: 'gold',
      bgPattern: 'sparkle',
      dotStyle: 'diamond',
      eyeOuterStyle: 'shield',
      eyeInnerStyle: 'diamond',
      framePreset: 'classic',
      qrColor: '#78350f',
      qrColor2: '#d97706',
      qrUseGradient: true,
      qrGradientDir: 'diagonal',
      eyeColor: '#92400e',
      tileBgMode: 'cream',
      tileBorder: true,
    },
  },
  {
    id: 'sunset-pop',
    label: 'غروب عصري',
    swatch: 'linear-gradient(135deg, #f97316 0%, #db2777 100%)',
    patch: {
      bgPreset: 'sunset',
      bgPattern: 'waves',
      dotStyle: 'dots',
      eyeOuterStyle: 'circle',
      eyeInnerStyle: 'circle',
      framePreset: 'badge',
      qrColor: '#9a3412',
      qrColor2: '#db2777',
      qrUseGradient: true,
      qrGradientDir: 'diagonal',
      eyeColor: '#be185d',
      tileBgMode: 'light',
      tileBorder: false,
    },
  },
  {
    id: 'midnight-tech',
    label: 'ليلي أنيق',
    swatch: 'linear-gradient(135deg, #0a0f2c 0%, #4f46e5 100%)',
    patch: {
      bgPreset: 'midnight',
      bgPattern: 'grid',
      dotStyle: 'bars',
      eyeOuterStyle: 'rounded',
      eyeInnerStyle: 'square',
      framePreset: 'poster',
      qrColor: '#1e1b4b',
      qrColor2: '#4f46e5',
      qrUseGradient: true,
      qrGradientDir: 'vertical',
      eyeColor: '#4338ca',
      tileBgMode: 'light',
      tileBorder: true,
    },
  },
  {
    id: 'obsidian-neon',
    label: 'أوبسيديان',
    swatch: 'linear-gradient(135deg, #09090b 0%, #059669 100%)',
    patch: {
      bgPreset: 'obsidian',
      bgPattern: 'diagonal',
      dotStyle: 'star',
      eyeOuterStyle: 'leaf',
      eyeInnerStyle: 'diamond',
      framePreset: 'ribbon',
      qrColor: '#09090b',
      qrColor2: '#059669',
      qrUseGradient: true,
      qrGradientDir: 'radial',
      eyeColor: '#059669',
      tileBgMode: 'light',
      tileBorder: true,
    },
  },
];

const DEFAULT_QR_DESIGN: Required<
  Pick<
    QrDesignConfig,
    | 'dotStyle'
    | 'eyeOuterStyle'
    | 'eyeInnerStyle'
    | 'bgPreset'
    | 'customBg1'
    | 'customBg2'
    | 'bgGradientAngle'
    | 'bgPattern'
    | 'framePreset'
    | 'qrColor'
    | 'qrUseGradient'
    | 'qrColor2'
    | 'qrGradientDir'
    | 'eyeColor'
    | 'tileBgMode'
    | 'tileCustomBg'
    | 'tileBorder'
    | 'showLogo'
    | 'centerMode'
    | 'logoShape'
    | 'logoSize'
    | 'customTitle'
    | 'customSubtitle'
    | 'customCta'
    | 'tableNumber'
    | 'showUrlFooter'
  >
> = {
  dotStyle: 'rounded',
  eyeOuterStyle: 'rounded',
  eyeInnerStyle: 'rounded',
  bgPreset: 'white',
  customBg1: '#0f766e',
  customBg2: '#0f172a',
  bgGradientAngle: 145,
  bgPattern: 'aura',
  framePreset: 'table',
  qrColor: '',
  qrUseGradient: false,
  qrColor2: '#10b981',
  qrGradientDir: 'diagonal',
  eyeColor: '',
  tileBgMode: 'light',
  tileCustomBg: '#ffffff',
  tileBorder: true,
  showLogo: false,
  centerMode: 'none',
  logoShape: 'rounded',
  logoSize: 'md',
  customTitle: '',
  customSubtitle: '',
  customCta: '',
  tableNumber: '',
  showUrlFooter: false,
};

function mergeQrConfig(raw?: Restaurant['qrDesign']): typeof DEFAULT_QR_DESIGN {
  const centerMode: QrCenterMode =
    raw?.centerMode || (raw?.showLogo ? 'logo' : 'none');
  return {
    ...DEFAULT_QR_DESIGN,
    ...(raw || {}),
    centerMode,
    showLogo: centerMode !== 'none',
  };
}

export const QrPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const {
    rest,
    resolvedPlan,
    terms,
    liveMenuUrl,
    copyLink,
    openShareModal,
    openUpgradeModal,
    handleUpdateQrDesign,
    showToast,
    customTabLabel,
  } = useDashboard();

  const [activeTab, setActiveTab] = useState<QrStudioTab>('bg');
  const [design, setDesign] = useState(() => mergeQrConfig(rest.qrDesign));

  useEffect(() => {
    setDesign(mergeQrConfig(rest.qrDesign));
  }, [rest.id]);

  const updateSetting = (patch: Partial<QrDesignConfig>) => {
    setDesign((prev) => {
      const next = { ...prev, ...patch };
      if (patch.centerMode !== undefined) {
        next.showLogo = patch.centerMode !== 'none';
      }
      return next;
    });
    const outPatch: Partial<QrDesignConfig> = { ...patch };
    if (patch.centerMode !== undefined) {
      outPatch.showLogo = patch.centerMode !== 'none';
    }
    void handleUpdateQrDesign(outPatch);
  };

  const handleResetDesign = () => {
    updateSetting({ ...DEFAULT_QR_DESIGN });
    showToast('تمت استعادة التصميم الافتراضي');
  };

  const handleRandomize = () => {
    const pick = QUICK_TEMPLATES[Math.floor(Math.random() * QUICK_TEMPLATES.length)];
    updateSetting(pick.patch);
    showToast(`تم تطبيق قالب: ${pick.label}`);
  };

  const dotStyles: Array<{ id: QrDotStyle; label: string; symbol: string }> = [
    { id: 'square', label: 'مربعات', symbol: '■' },
    { id: 'rounded', label: 'ناعم', symbol: '▢' },
    { id: 'dots', label: 'نقاط', symbol: '●' },
    { id: 'diamond', label: 'ماسي', symbol: '◆' },
    { id: 'classy', label: 'ورقي', symbol: '◗' },
    { id: 'bars', label: 'أعمدة', symbol: '▮' },
    { id: 'star', label: 'نجوم', symbol: '✦' },
  ];

  const eyeOuterStyles: Array<{ id: QrEyeOuterStyle; label: string; symbol: string }> = [
    { id: 'square', label: 'مربع', symbol: '□' },
    { id: 'rounded', label: 'ناعم', symbol: '▢' },
    { id: 'circle', label: 'دائري', symbol: '○' },
    { id: 'leaf', label: 'ورقة', symbol: '◰' },
    { id: 'shield', label: 'درع', symbol: '⬒' },
  ];

  const eyeInnerStyles: Array<{ id: QrEyeInnerStyle; label: string; symbol: string }> = [
    { id: 'square', label: 'مربع', symbol: '■' },
    { id: 'rounded', label: 'ناعم', symbol: '▣' },
    { id: 'circle', label: 'دائرة', symbol: '●' },
    { id: 'diamond', label: 'معين', symbol: '◆' },
  ];

  const bgPatterns: Array<{ id: QrBgPattern; label: string }> = [
    { id: 'none', label: 'سادة' },
    { id: 'aura', label: 'توهج ناعم' },
    { id: 'dots', label: 'نقاط' },
    { id: 'grid', label: 'شبكة' },
    { id: 'diagonal', label: 'خطوط مائلة' },
    { id: 'waves', label: 'موجات' },
    { id: 'sparkle', label: 'بريق' },
  ];

  const frameStyles: Array<{ id: QrFramePreset; label: string; desc: string }> = [
    { id: 'minimal', label: 'بسيط أنيق', desc: 'تركيز مباشر على الكود والاسم' },
    { id: 'table', label: terms.isStore ? 'كارت كاشير' : 'كارت طاولة', desc: 'تصميم متوازن للطباعة والعرض' },
    { id: 'classic', label: 'إطار كلاسيكي', desc: 'برواز مزدوج فاخر' },
    { id: 'badge', label: 'ستاند عصري', desc: 'زر دعوة للمسح أسفل الكود' },
    { id: 'modern', label: 'عصري بشريط', desc: 'خط علوي مميز + زر ملون' },
    { id: 'ribbon', label: 'شريط علوي', desc: 'ترويسة ملونة لاسم المشروع' },
    { id: 'poster', label: 'بوستر بارز', desc: 'عنوان كبير مناسب للجدران' },
    { id: 'sticker', label: 'ملصق لاصق', desc: 'حواف منقطة للطباعة والقص' },
  ];

  const centerModes: Array<{ id: QrCenterMode; label: string }> = [
    { id: 'none', label: 'بدون' },
    { id: 'logo', label: 'الشعار' },
    { id: 'initials', label: 'الأحرف' },
    { id: 'scan', label: 'مسح' },
    { id: 'utensils', label: 'ضيافة' },
  ];

  const effectiveQrColor =
    design.qrColor || QR_BG_THEMES[design.bgPreset]?.defaultQrColor || '#0f172a';
  const effectiveTileBg =
    design.tileBgMode === 'custom'
      ? design.tileCustomBg || '#ffffff'
      : design.tileBgMode === 'cream'
      ? '#fffdf7'
      : design.tileBgMode === 'soft'
      ? '#f1f5f9'
      : design.tileBgMode === 'dark'
      ? '#0f172a'
      : design.bgPreset === 'cream'
      ? '#fffdf9'
      : design.bgPreset === 'gold'
      ? '#fffbeb'
      : '#ffffff';

  const contrastRatio = useMemo(
    () => getQrContrastRatio(effectiveQrColor, effectiveTileBg),
    [effectiveQrColor, effectiveTileBg]
  );
  const lowContrast = contrastRatio < 3.5;

  return (
    <div className="mp-qr-page-root">
      <motion.div
        className="mp-qr-header-row"
        {...dashSectionMotion(prefersReducedMotion, 0)}
      >
        <div>
          <h1 className="mp-qr-page-title">
            {customTabLabel('qr', 'كود QR')}
          </h1>
          <p className="mp-qr-page-sub">
            {terms.isStore
              ? 'صمّم ستاند المتجر واختر الخلفية والشكل والألوان بجودة طباعة عالية'
              : 'صمّم كود الطاولات والمنيو بخلفيات وأشكال مخصصة جاهزة للطباعة والمشاركة'}
          </p>
        </div>

        {resolvedPlan.perms.qrCode && (
          <div className="mp-qr-header-actions">
            <button
              type="button"
              onClick={handleRandomize}
              className="btn mp-qr-mini-btn"
              title="تنسيق سريع"
            >
              <Shuffle size={15} />
              <span>تنسيق سريع</span>
            </button>
            <button
              type="button"
              onClick={handleResetDesign}
              className="btn mp-qr-mini-btn"
              title="استعادة الافتراضي"
            >
              <RotateCcw size={15} />
              <span>افتراضي</span>
            </button>
          </div>
        )}
      </motion.div>

      {!resolvedPlan.perms.qrCode ? (
        <motion.div
          {...dashCardMotion(prefersReducedMotion, 0, 1, false, 0.08)}
          className="mp-surface-card"
          style={{ padding: '36px 24px', textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}
        >
          <Lock size={34} style={{ color: '#f59e0b', margin: '0 auto 14px' }} />
          <h3 style={{ fontSize: '19px', fontWeight: 900, marginBottom: '10px', color: 'var(--ink)' }}>
            كود الـ QR غير متاح في باقتك الحالية
          </h3>
          <p style={{ fontSize: '14.5px', color: 'var(--muted)', marginBottom: '20px', lineHeight: 1.55 }}>
            {`قم بالترقية أو استخدم رابط ${terms.isStore ? 'المتجر' : 'المنيو'} مباشرة`}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={openShareModal} className="btn p" style={{ fontWeight: 800 }}>
              <Share2 size={16} />
              <span>{terms.isStore ? 'مشاركة المتجر' : 'مشاركة المنيو'}</span>
            </button>
            <button type="button" onClick={() => copyLink(liveMenuUrl)} className="btn" style={{ fontWeight: 800 }}>
              <Copy size={16} />
              <span>نسخ الرابط</span>
            </button>
            <button type="button" onClick={() => openUpgradeModal('starter')} className="btn" style={{ fontWeight: 800 }}>
              <ExternalLink size={16} />
              <span>ترقية الباقة</span>
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="mp-qr-studio-shell">
          {/* Quick 1-Tap Ready Templates Strip */}
          <motion.div
            {...dashSectionMotion(prefersReducedMotion, 0.04)}
            className="mp-qr-templates-strip"
          >
            {QUICK_TEMPLATES.map((tpl) => {
              const isSelected =
                design.bgPreset === tpl.patch.bgPreset &&
                design.dotStyle === tpl.patch.dotStyle &&
                design.framePreset === tpl.patch.framePreset;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => updateSetting(tpl.patch)}
                  className={`mp-qr-template-chip${isSelected ? ' is-active' : ''}`}
                >
                  <span
                    className="mp-qr-template-dot"
                    style={{ background: tpl.swatch }}
                  />
                  <span>{tpl.label}</span>
                </button>
              );
            })}
          </motion.div>

          {/* Main 2-Column Studio (Responsive Mobile-First Stack) */}
          <motion.div
            {...dashSectionMotion(prefersReducedMotion, 0.08)}
            className="mp-qr-studio-grid"
          >
            {/* Preview Column (Sticky on Desktop, Top on Mobile) */}
            <div className="mp-surface-card mp-qr-preview-panel">
              <QRCodeView
                url={liveMenuUrl}
                restaurantName={rest.n}
                logoUrl={rest.logo}
                size={208}
                dotStyle={design.dotStyle}
                eyeOuterStyle={design.eyeOuterStyle}
                eyeInnerStyle={design.eyeInnerStyle}
                bgPreset={design.bgPreset}
                customBg1={design.customBg1}
                customBg2={design.customBg2}
                bgGradientAngle={design.bgGradientAngle}
                bgPattern={design.bgPattern}
                framePreset={design.framePreset}
                qrColor={design.qrColor || undefined}
                qrUseGradient={design.qrUseGradient}
                qrColor2={design.qrColor2}
                qrGradientDir={design.qrGradientDir}
                eyeColor={design.eyeColor}
                tileBgMode={design.tileBgMode}
                tileCustomBg={design.tileCustomBg}
                tileBorder={design.tileBorder}
                showLogo={design.showLogo}
                centerMode={design.centerMode}
                logoShape={design.logoShape}
                logoSize={design.logoSize}
                customTitle={design.customTitle}
                customSubtitle={design.customSubtitle}
                customCta={design.customCta}
                tableNumber={design.tableNumber}
                showUrlFooter={design.showUrlFooter}
                isStore={terms.isStore}
                onCopied={() => showToast(terms.isStore ? 'تم نسخ رابط المتجر ✓' : 'تم نسخ رابط المنيو ✓')}
              />

              {lowContrast && (
                <div className="mp-qr-contrast-warn">
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>
                    التباين بين لون الكود وخلفية المربع منخفض — يفضل اختيار لون أغمق أو خلفية أفتح لضمان سرعة المسح.
                  </span>
                </div>
              )}
            </div>

            {/* Studio Controls Column */}
            <div className="mp-surface-card mp-qr-controls-panel">
              {/* Studio Tabs */}
              <div className="mp-qr-tabs-bar" role="tablist" aria-label="أقسام تخصيص الكود">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'bg'}
                  onClick={() => setActiveTab('bg')}
                  className={`mp-qr-tab-btn${activeTab === 'bg' ? ' is-active' : ''}`}
                >
                  <ImageIcon size={15} />
                  <span>الخلفيات</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'shape'}
                  onClick={() => setActiveTab('shape')}
                  className={`mp-qr-tab-btn${activeTab === 'shape' ? ' is-active' : ''}`}
                >
                  <Shapes size={15} />
                  <span>الشكل والعيون</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'colors'}
                  onClick={() => setActiveTab('colors')}
                  className={`mp-qr-tab-btn${activeTab === 'colors' ? ' is-active' : ''}`}
                >
                  <Palette size={15} />
                  <span>الألوان</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'frame'}
                  onClick={() => setActiveTab('frame')}
                  className={`mp-qr-tab-btn${activeTab === 'frame' ? ' is-active' : ''}`}
                >
                  <Frame size={15} />
                  <span>الإطار والنصوص</span>
                </button>
              </div>

              {/* Tab 1: Backgrounds & Patterns */}
              {activeTab === 'bg' && (
                <div className="mp-qr-tab-body">
                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>خلفيات الكارت</span>
                      <span className="mp-qr-sec-val">{getLocalizedQrBgLabel(design.bgPreset)}</span>
                    </div>
                    <div className="mp-qr-bg-grid">
                      {(Object.keys(QR_BG_THEMES) as QrBgPreset[]).map((key) => {
                        const item = QR_BG_THEMES[key];
                        const active = design.bgPreset === key;
                        const swatchStyle =
                          key === 'custom'
                            ? `linear-gradient(${design.bgGradientAngle}deg, ${design.customBg1}, ${design.customBg2})`
                            : item.swatch;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => updateSetting({ bgPreset: key })}
                            className={`mp-qr-bg-card${active ? ' is-active' : ''}`}
                          >
                            <span
                              className="mp-qr-bg-swatch"
                              style={{ background: swatchStyle }}
                            />
                            <span className="mp-qr-bg-name">{getLocalizedQrBgLabel(key)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {design.bgPreset === 'custom' && (
                    <div className="mp-qr-subbox">
                      <div className="mp-qr-subbox-title">تخصيص تدرج الخلفية</div>
                      <div className="mp-qr-color-pickers-row">
                        <label className="mp-qr-color-picker-field">
                          <span>اللون الأول</span>
                          <div className="mp-qr-picker-input-wrap">
                            <input
                              type="color"
                              value={design.customBg1}
                              onChange={(e) => updateSetting({ customBg1: e.target.value })}
                            />
                            <span dir="ltr">{design.customBg1}</span>
                          </div>
                        </label>
                        <label className="mp-qr-color-picker-field">
                          <span>اللون الثاني</span>
                          <div className="mp-qr-picker-input-wrap">
                            <input
                              type="color"
                              value={design.customBg2}
                              onChange={(e) => updateSetting({ customBg2: e.target.value })}
                            />
                            <span dir="ltr">{design.customBg2}</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>نقشة وزخرفة الخلفية</span>
                      <span className="mp-qr-sec-val">
                        {bgPatterns.find((p) => p.id === design.bgPattern)?.label || 'سادة'}
                      </span>
                    </div>
                    <div className="mp-qr-choice-grid">
                      {bgPatterns.map((pat) => {
                        const active = design.bgPattern === pat.id;
                        return (
                          <button
                            key={pat.id}
                            type="button"
                            onClick={() => updateSetting({ bgPattern: pat.id })}
                            className={`mp-qr-option-btn${active ? ' is-active' : ''}`}
                          >
                            {pat.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>زاوية إضاءة الخلفية</span>
                      <span className="mp-qr-sec-val" dir="ltr">{design.bgGradientAngle}°</span>
                    </div>
                    <div className="mp-qr-seg-row">
                      {[
                        { angle: 145, label: 'قطري ↘' },
                        { angle: 180, label: 'عمودي ↓' },
                        { angle: 90, label: 'أفقي →' },
                        { angle: 45, label: 'مائل ↗' },
                      ].map((ang) => (
                        <button
                          key={ang.angle}
                          type="button"
                          onClick={() => updateSetting({ bgGradientAngle: ang.angle })}
                          className={`mp-qr-seg-btn${design.bgGradientAngle === ang.angle ? ' is-active' : ''}`}
                        >
                          {ang.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: QR Code Dot & Eye Shapes */}
              {activeTab === 'shape' && (
                <div className="mp-qr-tab-body">
                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>نمط نقاط الكود</span>
                      <span className="mp-qr-sec-val">
                        {dotStyles.find((d) => d.id === design.dotStyle)?.label}
                      </span>
                    </div>
                    <div className="mp-qr-shape-grid">
                      {dotStyles.map((item) => {
                        const active = design.dotStyle === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => updateSetting({ dotStyle: item.id })}
                            className={`mp-qr-shape-card${active ? ' is-active' : ''}`}
                          >
                            <span className="mp-qr-shape-sym">{item.symbol}</span>
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>شكل زوايا الكود (الإطار الخارجي)</span>
                      <span className="mp-qr-sec-val">
                        {eyeOuterStyles.find((e) => e.id === design.eyeOuterStyle)?.label}
                      </span>
                    </div>
                    <div className="mp-qr-shape-grid is-5">
                      {eyeOuterStyles.map((item) => {
                        const active = design.eyeOuterStyle === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => updateSetting({ eyeOuterStyle: item.id })}
                            className={`mp-qr-shape-card${active ? ' is-active' : ''}`}
                          >
                            <span className="mp-qr-shape-sym">{item.symbol}</span>
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>شكل قلب الزوايا (الداخل)</span>
                      <span className="mp-qr-sec-val">
                        {eyeInnerStyles.find((e) => e.id === design.eyeInnerStyle)?.label}
                      </span>
                    </div>
                    <div className="mp-qr-shape-grid is-4">
                      {eyeInnerStyles.map((item) => {
                        const active = design.eyeInnerStyle === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => updateSetting({ eyeInnerStyle: item.id })}
                            className={`mp-qr-shape-card${active ? ' is-active' : ''}`}
                          >
                            <span className="mp-qr-shape-sym">{item.symbol}</span>
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Colors, Gradients & Inner Tile */}
              {activeTab === 'colors' && (
                <div className="mp-qr-tab-body">
                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>نمط تلوين الكود</span>
                    </div>
                    <div className="mp-qr-seg-row is-2">
                      <button
                        type="button"
                        onClick={() => updateSetting({ qrUseGradient: false })}
                        className={`mp-qr-seg-btn${!design.qrUseGradient ? ' is-active' : ''}`}
                      >
                        لون موحد
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSetting({ qrUseGradient: true })}
                        className={`mp-qr-seg-btn${design.qrUseGradient ? ' is-active' : ''}`}
                      >
                        <Sparkles size={14} />
                        <span>تدرج لوني ثنائي</span>
                      </button>
                    </div>
                  </div>

                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>{design.qrUseGradient ? 'لون بداية التدرج' : 'لون الكود الرئيسي'}</span>
                      <button
                        type="button"
                        className="mp-qr-clear-link"
                        onClick={() => updateSetting({ qrColor: '' })}
                      >
                        تلقائي حسب الخلفية
                      </button>
                    </div>
                    <div className="mp-qr-swatches-wrap">
                      {QR_COLOR_SWATCHES.map((hex) => {
                        const active = effectiveQrColor.toLowerCase() === hex.toLowerCase();
                        return (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`لون ${hex}`}
                            onClick={() => updateSetting({ qrColor: hex })}
                            className={`mp-qr-swatch-dot${active ? ' is-active' : ''}`}
                            style={{ background: hex }}
                          />
                        );
                      })}
                      <label className="mp-qr-custom-color-chip" title="اختيار لون مخصص">
                        <input
                          type="color"
                          value={effectiveQrColor}
                          onChange={(e) => updateSetting({ qrColor: e.target.value })}
                        />
                        <span>مخصص</span>
                      </label>
                    </div>
                  </div>

                  {design.qrUseGradient && (
                    <div className="mp-qr-subbox">
                      <div className="mp-qr-sec-head" style={{ marginBottom: '10px' }}>
                        <span>لون نهاية التدرج</span>
                      </div>
                      <div className="mp-qr-swatches-wrap" style={{ marginBottom: '12px' }}>
                        {GRADIENT_END_SWATCHES.map((hex) => {
                          const active = design.qrColor2.toLowerCase() === hex.toLowerCase();
                          return (
                            <button
                              key={hex}
                              type="button"
                              aria-label={`لون التدرج ${hex}`}
                              onClick={() => updateSetting({ qrColor2: hex })}
                              className={`mp-qr-swatch-dot${active ? ' is-active' : ''}`}
                              style={{ background: hex }}
                            />
                          );
                        })}
                        <label className="mp-qr-custom-color-chip">
                          <input
                            type="color"
                            value={design.qrColor2}
                            onChange={(e) => updateSetting({ qrColor2: e.target.value })}
                          />
                          <span>مخصص</span>
                        </label>
                      </div>

                      <div className="mp-qr-sec-head" style={{ marginBottom: '8px' }}>
                        <span>اتجاه التدرج</span>
                      </div>
                      <div className="mp-qr-seg-row">
                        {(
                          [
                            { id: 'diagonal', label: 'قطري' },
                            { id: 'vertical', label: 'عمودي' },
                            { id: 'horizontal', label: 'أفقي' },
                            { id: 'radial', label: 'دائري' },
                          ] as Array<{ id: QrGradientDir; label: string }>
                        ).map((dir) => (
                          <button
                            key={dir.id}
                            type="button"
                            onClick={() => updateSetting({ qrGradientDir: dir.id })}
                            className={`mp-qr-seg-btn${design.qrGradientDir === dir.id ? ' is-active' : ''}`}
                          >
                            {dir.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>لون زوايا الكود (العيون)</span>
                      {design.eyeColor && (
                        <button
                          type="button"
                          className="mp-qr-clear-link"
                          onClick={() => updateSetting({ eyeColor: '' })}
                        >
                          نفس لون الكود
                        </button>
                      )}
                    </div>
                    <div className="mp-qr-swatches-wrap">
                      {QR_COLOR_SWATCHES.slice(0, 7).map((hex) => {
                        const active = design.eyeColor.toLowerCase() === hex.toLowerCase();
                        return (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`لون العيون ${hex}`}
                            onClick={() => updateSetting({ eyeColor: active ? '' : hex })}
                            className={`mp-qr-swatch-dot${active ? ' is-active' : ''}`}
                            style={{ background: hex }}
                          />
                        );
                      })}
                      <label className="mp-qr-custom-color-chip">
                        <input
                          type="color"
                          value={design.eyeColor || effectiveQrColor}
                          onChange={(e) => updateSetting({ eyeColor: e.target.value })}
                        />
                        <span>مخصص</span>
                      </label>
                    </div>
                  </div>

                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>خلفية مربع الكود الداخلي</span>
                    </div>
                    <div className="mp-qr-seg-row">
                      {(
                        [
                          { id: 'light', label: 'أبيض' },
                          { id: 'cream', label: 'كريمي' },
                          { id: 'soft', label: 'رمادي' },
                          { id: 'dark', label: 'داكن' },
                          { id: 'custom', label: 'مخصص' },
                        ] as Array<{ id: QrTileBgMode; label: string }>
                      ).map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => updateSetting({ tileBgMode: mode.id })}
                          className={`mp-qr-seg-btn${design.tileBgMode === mode.id ? ' is-active' : ''}`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    {design.tileBgMode === 'custom' && (
                      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <label className="mp-qr-custom-color-chip">
                          <input
                            type="color"
                            value={design.tileCustomBg}
                            onChange={(e) => updateSetting({ tileCustomBg: e.target.value })}
                          />
                          <span>اختر لون المربع ({design.tileCustomBg})</span>
                        </label>
                      </div>
                    )}

                    <label className="mp-qr-toggle-row" style={{ marginTop: '12px' }}>
                      <span>إظهار حدود أنيقة حول مربع الكود</span>
                      <input
                        type="checkbox"
                        checked={design.tileBorder}
                        onChange={(e) => updateSetting({ tileBorder: e.target.checked })}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Tab 4: Frames, Center Logo/Badge & Custom Text */}
              {activeTab === 'frame' && (
                <div className="mp-qr-tab-body">
                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>تصميم الستاند والإطار</span>
                    </div>
                    <div className="mp-qr-frame-grid">
                      {frameStyles.map((item) => {
                        const active = design.framePreset === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => updateSetting({ framePreset: item.id })}
                            className={`mp-qr-frame-card${active ? ' is-active' : ''}`}
                          >
                            <b>{item.label}</b>
                            <span>{item.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>الشعار أو الأيقونة بالمنتصف</span>
                    </div>
                    <div className="mp-qr-seg-row">
                      {centerModes.map((cm) => (
                        <button
                          key={cm.id}
                          type="button"
                          onClick={() => updateSetting({ centerMode: cm.id })}
                          className={`mp-qr-seg-btn${design.centerMode === cm.id ? ' is-active' : ''}`}
                        >
                          {cm.label}
                        </button>
                      ))}
                    </div>

                    {design.centerMode !== 'none' && (
                      <div className="mp-qr-subbox" style={{ marginTop: '10px' }}>
                        <div className="mp-qr-inline-2col">
                          <div>
                            <div className="mp-qr-mini-lbl">شكل الإطار</div>
                            <div className="mp-qr-seg-row is-2">
                              {(
                                [
                                  { id: 'rounded', label: 'ناعم' },
                                  { id: 'circle', label: 'دائري' },
                                ] as Array<{ id: QrLogoShape; label: string }>
                              ).map((sh) => (
                                <button
                                  key={sh.id}
                                  type="button"
                                  onClick={() => updateSetting({ logoShape: sh.id })}
                                  className={`mp-qr-seg-btn${design.logoShape === sh.id ? ' is-active' : ''}`}
                                >
                                  {sh.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="mp-qr-mini-lbl">الحجم</div>
                            <div className="mp-qr-seg-row is-3">
                              {(
                                [
                                  { id: 'sm', label: 'صغير' },
                                  { id: 'md', label: 'وسط' },
                                  { id: 'lg', label: 'كبير' },
                                ] as Array<{ id: QrLogoSize; label: string }>
                              ).map((sz) => (
                                <button
                                  key={sz.id}
                                  type="button"
                                  onClick={() => updateSetting({ logoSize: sz.id })}
                                  className={`mp-qr-seg-btn${design.logoSize === sz.id ? ' is-active' : ''}`}
                                >
                                  {sz.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mp-qr-section-block">
                    <div className="mp-qr-sec-head">
                      <span>نصوص الكارت ورقم الطاولة</span>
                    </div>
                    <div className="mp-qr-inputs-grid">
                      <label className="mp-qr-field">
                        <span>العنوان الرئيسي</span>
                        <input
                          type="text"
                          className="inp"
                          value={design.customTitle}
                          placeholder={rest.n || 'اسم المشروع'}
                          onChange={(e) => updateSetting({ customTitle: e.target.value })}
                        />
                      </label>

                      <label className="mp-qr-field">
                        <span>رقم الطاولة (اختياري)</span>
                        <input
                          type="text"
                          className="inp"
                          value={design.tableNumber}
                          placeholder="مثال: 5 أو VIP"
                          onChange={(e) => updateSetting({ tableNumber: e.target.value })}
                        />
                      </label>

                      <label className="mp-qr-field is-full">
                        <span>الوصف أسفل العنوان</span>
                        <input
                          type="text"
                          className="inp"
                          value={design.customSubtitle}
                          placeholder={
                            terms.isStore
                              ? 'امسح الكود بالكاميرا لفتح المتجر والطلب'
                              : 'امسح الكود بالكاميرا لفتح المنيو والطلب'
                          }
                          onChange={(e) => updateSetting({ customSubtitle: e.target.value })}
                        />
                      </label>

                      <label className="mp-qr-field is-full">
                        <span>عبارة الدعوة أسفل الكود</span>
                        <input
                          type="text"
                          className="inp"
                          value={design.customCta}
                          placeholder="امسح الكود للطلب المباشر"
                          onChange={(e) => updateSetting({ customCta: e.target.value })}
                        />
                      </label>
                    </div>

                    <label className="mp-qr-toggle-row" style={{ marginTop: '10px' }}>
                      <span>إظهار رابط المنيو أسفل الكارت المطبوع</span>
                      <input
                        type="checkbox"
                        checked={design.showUrlFooter}
                        onChange={(e) => updateSetting({ showUrlFooter: e.target.checked })}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
