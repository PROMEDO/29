/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Edit,
  Eye,
  LayoutGrid,
  Layers,
  Palette,
  RotateCcw,
  Shapes,
  ShoppingBag,
  Store,
} from 'lucide-react';
import {
  MENU_SHAPES,
  MENU_THEMES,
  getAllowedThemesForPlan,
  getContrastInk,
  resolveMenuThemeEffectiveMode,
} from '../../utils/plans';
import { dashCardMotion, dashSectionMotion } from '../../utils/dashboardMotion';
import { useDashboard } from './DashboardContext';

type ReadyAppearanceId = 'toters' | 'theme1' | 'theme2' | 'theme3' | 'theme4' | 'theme5';
type AppearanceEditMode = ReadyAppearanceId | 'custom' | null;

const READY_APPEARANCES: Array<{
  id: ReadyAppearanceId;
  title: string;
  icon: string;
  desc: string;
  pairedPresetId: string;
}> = [
  {
    id: 'toters',
    title: 'مظهر توترز',
    icon: '✨',
    desc: 'مظهر جاهز بتصميم توترز الكامل: بطاقة المتجر العائمة، التصنيفات المسطحة، الرفوف الأفقية، والسلة المميزة.',
    pairedPresetId: 'toters',
  },
  {
    id: 'theme1',
    title: 'مظهر 1',
    icon: '🛍️',
    desc: 'تصميم ستور نظيف (ستايل عنب): شريط علوي متكامل مع بحث سريع، تصنيفات واضحة، وشبكة بطاقات مربعة أنيقة.',
    pairedPresetId: 'theme1-enab',
  },
  {
    id: 'theme2',
    title: 'مظهر 2',
    icon: '🌙',
    desc: 'تصميم ليلي احترافي (ستايل أوربن بايت): شعار دائري أنيق، مربعات أقسام، وشريط عائم سفلي.',
    pairedPresetId: 'theme2-urbanbite',
  },
  {
    id: 'theme3',
    title: 'مظهر 3',
    icon: '🔥',
    desc: 'تصميم مطاعم الوجبات السريعة (ستايل سوبر تشكن): واجهة عالية التباين مع بحث فوري وبطاقات شهية واضحة.',
    pairedPresetId: 'theme3-menux',
  },
  {
    id: 'theme4',
    title: 'مظهر 4',
    icon: '⚡',
    desc: 'تصميم البوستر الجريء (ستايل كودو): ترويسة مموجة، بطاقات بحدود حادة وظل صلب، وأزرار إضافة بارزة.',
    pairedPresetId: 'theme4-kudo',
  },
  {
    id: 'theme5',
    title: 'مظهر 5',
    icon: '🌯',
    desc: 'تصميم تطبيقات التوصيل العصرية: ترويسة منقوشة دافئة، اختيار الفروع، تبديل بين القائمة والبطاقات الكبيرة، وبحث فوري.',
    pairedPresetId: 'theme5-shawarmer',
  },
];

const READY_APPEARANCE_ID_SET = new Set<string>(READY_APPEARANCES.map((a) => a.id));

interface PhonePreviewProps {
  variant: ReadyAppearanceId | 'custom';
  brand: string;
  accent: string;
  bg: string;
  surface: string;
  soft: string;
  text: string;
  muted: string;
  line: string;
  layoutMode?: string;
}

const ThemePhonePreview: React.FC<PhonePreviewProps> = ({
  variant,
  brand,
  accent,
  bg,
  surface,
  soft,
  text,
  muted,
  line,
  layoutMode = 'grid',
}) => {
  const screenStyle: React.CSSProperties = {
    background: bg,
    color: text,
    borderColor: variant === 'theme4' ? text : line,
  };

  const renderContent = () => {
    if (variant === 'toters') {
      return (
        <div className="mp-pm-body" style={{ gap: '5px', padding: '5px' }}>
          <div className="mp-pm-toprow">
            <span className="mp-pm-dot-btn" style={{ background: soft }} />
            <span className="mp-pm-pill-sm" style={{ background: soft, width: '34px' }} />
            <span className="mp-pm-dot-btn" style={{ background: soft, marginInlineStart: 'auto' }} />
          </div>
          <div className="mp-pm-card-block" style={{ background: surface, borderColor: line }}>
            <span className="mp-pm-avatar-circle" style={{ background: brand }} />
            <div className="mp-pm-lines">
              <i style={{ background: text, width: '70%' }} />
              <i style={{ background: muted, width: '48%', opacity: 0.5 }} />
            </div>
          </div>
          <div className="mp-pm-shelf-row">
            {[0, 1, 2].map((i) => (
              <div key={i} className="mp-pm-shelf-item" style={{ background: soft, borderColor: line }}>
                <span className="mp-pm-plus-dot" style={{ background: surface, color: brand }}>+</span>
              </div>
            ))}
          </div>
          <div className="mp-pm-list-stack">
            {[0, 1].map((i) => (
              <div key={i} className="mp-pm-list-row" style={{ borderColor: line }}>
                <div className="mp-pm-lines">
                  <i style={{ background: text, width: '74%' }} />
                  <i style={{ background: brand, width: '42%' }} />
                </div>
                <span className="mp-pm-thumb-sq" style={{ background: soft }} />
              </div>
            ))}
          </div>
          <div className="mp-pm-cta-bar" style={{ background: brand }} />
        </div>
      );
    }

    if (variant === 'theme1') {
      return (
        <div className="mp-pm-body" style={{ gap: '5px', padding: '5px' }}>
          <div className="mp-pm-toprow" style={{ borderBottom: `1px solid ${line}`, paddingBottom: '4px' }}>
            <span className="mp-pm-thumb-xs" style={{ background: brand }} />
            <div className="mp-pm-lines">
              <i style={{ background: text, width: '58%' }} />
            </div>
            <span className="mp-pm-dot-btn" style={{ background: soft }} />
          </div>
          <div className="mp-pm-chip-row">
            <span className="mp-pm-chip-pill" style={{ background: text }} />
            <span className="mp-pm-chip-pill" style={{ background: soft }} />
            <span className="mp-pm-chip-pill" style={{ background: soft }} />
          </div>
          <div className="mp-pm-grid-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="mp-pm-grid-card-bare">
                <div className="mp-pm-grid-img-43" style={{ background: soft, borderColor: line }} />
                <i style={{ background: text, width: '76%', height: '3px', borderRadius: '99px', display: 'block', marginTop: '3px' }} />
                <div className="mp-pm-foot-mini">
                  <i style={{ background: muted, width: '40%', opacity: 0.7 }} />
                  <span className="mp-pm-tiny-add" style={{ borderColor: line }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mp-pm-tabs-bottom" style={{ background: surface, borderTop: `1px solid ${line}` }}>
            <span style={{ background: brand }} />
            <span style={{ background: muted, opacity: 0.45 }} />
            <span style={{ background: muted, opacity: 0.45 }} />
            <span style={{ background: muted, opacity: 0.45 }} />
          </div>
        </div>
      );
    }

    if (variant === 'theme2') {
      return (
        <div className="mp-pm-body" style={{ gap: '5px', padding: '5px' }}>
          <div className="mp-pm-toprow">
            <span className="mp-pm-dot-btn" style={{ background: surface, border: `1px solid ${line}` }} />
            <span className="mp-pm-dot-btn" style={{ background: surface, border: `1px solid ${line}`, marginInlineStart: 'auto' }} />
          </div>
          <div className="mp-pm-center-hero">
            <span className="mp-pm-avatar-lg" style={{ background: surface, borderColor: brand }} />
            <i style={{ background: text, width: '56%', height: '4px', borderRadius: '99px', display: 'block' }} />
          </div>
          <div className="mp-pm-cat-tiles">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="mp-pm-cat-tile"
                style={{
                  background: surface,
                  borderColor: i === 0 ? brand : line,
                }}
              />
            ))}
          </div>
          <div className="mp-pm-list-stack">
            {[0, 1].map((i) => (
              <div key={i} className="mp-pm-list-row" style={{ borderColor: line }}>
                <div className="mp-pm-lines">
                  <i style={{ background: text, width: '72%' }} />
                  <i style={{ background: brand, width: '40%' }} />
                </div>
                <span className="mp-pm-thumb-sq" style={{ background: surface, border: `1px solid ${line}` }} />
              </div>
            ))}
          </div>
          <div className="mp-pm-pill-dock" style={{ background: surface, borderColor: line }}>
            <span style={{ background: brand }} />
            <span style={{ background: muted, opacity: 0.45 }} />
            <span style={{ background: muted, opacity: 0.45 }} />
          </div>
        </div>
      );
    }

    if (variant === 'theme3') {
      return (
        <div className="mp-pm-body" style={{ gap: '5px', padding: '5px' }}>
          <div className="mp-pm-card-block" style={{ background: surface, borderColor: line }}>
            <span className="mp-pm-thumb-xs" style={{ background: brand, width: '20px', height: '20px', borderRadius: '6px' }} />
            <div className="mp-pm-lines">
              <i style={{ background: text, width: '64%' }} />
              <i style={{ background: muted, width: '44%', opacity: 0.55 }} />
            </div>
          </div>
          <div className="mp-pm-search-bar" style={{ background: surface, borderColor: line }}>
            <i style={{ background: muted, width: '45%', opacity: 0.5 }} />
          </div>
          <div className="mp-pm-chip-row">
            <span className="mp-pm-chip-pill" style={{ background: brand }} />
            <span className="mp-pm-chip-pill" style={{ background: surface, border: `1px solid ${line}` }} />
            <span className="mp-pm-chip-pill" style={{ background: surface, border: `1px solid ${line}` }} />
          </div>
          <div className="mp-pm-grid-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="mp-pm-grid-card" style={{ background: surface, borderColor: line }}>
                <div className="mp-pm-grid-img-43" style={{ background: soft }} />
                <div className="mp-pm-foot-mini" style={{ padding: '2px 3px' }}>
                  <i style={{ background: text, width: '50%' }} />
                  <span className="mp-pm-tiny-add" style={{ background: brand, borderColor: brand }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (variant === 'theme4') {
      return (
        <div className="mp-pm-body" style={{ gap: '5px', padding: 0 }}>
          <div className="mp-pm-comic-hero" style={{ background: brand }}>
            <div className="mp-pm-lines" style={{ alignItems: 'center' }}>
              <span style={{ background: accent, width: '34px', height: '5px', borderRadius: '99px', border: '1px solid #1a0a08' }} />
              <i style={{ background: '#ffffff', width: '58%', height: '5px' }} />
            </div>
            <div className="mp-pm-comic-thumb" style={{ background: surface }} />
          </div>
          <div style={{ padding: '4px 5px 5px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="mp-pm-comic-card"
                style={{ background: surface, borderColor: '#1a0a08', boxShadow: '0 2px 0 #1a0a08' }}
              >
                <span className="mp-pm-thumb-sq" style={{ width: '20px', height: '20px', border: '1.5px solid #1a0a08', background: soft }} />
                <div className="mp-pm-lines">
                  <i style={{ background: text, width: '74%' }} />
                  <i style={{ background: brand, width: '40%' }} />
                </div>
                <span className="mp-pm-dot-btn" style={{ width: '13px', height: '13px', background: accent, border: '1.5px solid #1a0a08' }} />
              </div>
            ))}
            <div className="mp-pm-cta-bar" style={{ background: accent, border: '1.5px solid #1a0a08', marginTop: 'auto' }} />
          </div>
        </div>
      );
    }

    if (variant === 'theme5') {
      return (
        <div className="mp-pm-body" style={{ gap: '4px', padding: 0 }}>
          <div
            className="mp-pm-doodle-top"
            style={{
              background: bg === '#0E0F12'
                ? 'linear-gradient(180deg, #3D2421 0%, #0E0F12 100%)'
                : 'linear-gradient(180deg, #F6C1B8 0%, #FEF4E2 75%, #FFFFFF 100%)',
            }}
          >
            <span className="mp-pm-dot-btn" style={{ width: '10px', height: '10px', background: surface }} />
            <span className="mp-pm-dot-btn" style={{ width: '10px', height: '10px', background: surface }} />
          </div>
          <div style={{ padding: '0 6px 5px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, marginTop: '-11px' }}>
            <div className="mp-pm-center-hero" style={{ gap: '2px' }}>
              <span className="mp-pm-thumb-xs" style={{ width: '22px', height: '22px', borderRadius: '6px', background: surface, border: `1px solid ${line}` }} />
              <i style={{ background: text, width: '54%', height: '3.5px', borderRadius: '99px', display: 'block' }} />
            </div>
            <div className="mp-pm-metrics-4">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} style={{ background: soft, borderColor: line }} />
              ))}
            </div>
            <div className="mp-pm-branch-mini" style={{ background: surface, borderColor: line }}>
              <i style={{ background: text, width: '56%' }} />
              <i style={{ background: brand, width: '18%' }} />
            </div>
            <div className="mp-pm-list-stack">
              {[0, 1].map((i) => (
                <div key={i} className="mp-pm-list-row" style={{ borderColor: line, paddingBlock: '3px' }}>
                  <div className="mp-pm-lines">
                    <i style={{ background: text, width: '74%' }} />
                    <i style={{ background: muted, width: '44%', opacity: 0.6 }} />
                  </div>
                  <span className="mp-pm-thumb-sq" style={{ width: '18px', height: '18px', background: soft }} />
                </div>
              ))}
            </div>
            <div className="mp-pm-cta-bar" style={{ background: brand, marginTop: 'auto' }} />
          </div>
        </div>
      );
    }

    // Custom live layout preview
    const colClass =
      layoutMode === 'grid4' || layoutMode === 'grid3' || layoutMode === 'grid'
        ? 'mp-pm-grid-2'
        : 'mp-pm-list-stack';
    return (
      <div className="mp-pm-body" style={{ gap: '5px', padding: '5px' }}>
        <div className="mp-pm-card-block" style={{ background: surface, borderColor: line }}>
          <span className="mp-pm-thumb-xs" style={{ background: brand }} />
          <div className="mp-pm-lines">
            <i style={{ background: text, width: '64%' }} />
            <i style={{ background: muted, width: '42%', opacity: 0.55 }} />
          </div>
        </div>
        <div className="mp-pm-chip-row">
          <span className="mp-pm-chip-pill" style={{ background: brand }} />
          <span className="mp-pm-chip-pill" style={{ background: soft }} />
          <span className="mp-pm-chip-pill" style={{ background: soft }} />
        </div>
        <div className={colClass} style={{ flex: 1 }}>
          {layoutMode === 'list'
            ? [0, 1, 2].map((i) => (
                <div key={i} className="mp-pm-list-row" style={{ borderColor: line }}>
                  <div className="mp-pm-lines">
                    <i style={{ background: text, width: '72%' }} />
                    <i style={{ background: brand, width: '40%' }} />
                  </div>
                  <span className="mp-pm-thumb-sq" style={{ background: soft }} />
                </div>
              ))
            : [0, 1, 2, 3].map((i) => (
                <div key={i} className="mp-pm-grid-card" style={{ background: surface, borderColor: line }}>
                  <div className="mp-pm-grid-img-43" style={{ background: soft }} />
                  <div className="mp-pm-foot-mini" style={{ padding: '2px 3px' }}>
                    <i style={{ background: text, width: '50%' }} />
                    <span className="mp-pm-tiny-add" style={{ background: brand, borderColor: brand }} />
                  </div>
                </div>
              ))}
        </div>
        <div className="mp-pm-cta-bar" style={{ background: brand }} />
      </div>
    );
  };

  return (
    <div className="mp-phone-mock-stage" aria-hidden="true">
      <div className="mp-phone-mock-bezel">
        <span className="mp-phone-mock-notch" />
        <div className="mp-phone-mock-screen" style={screenStyle}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export const AppearancePage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [editingMode, setEditingMode] = useState<AppearanceEditMode>(null);

  const {
    layoutDefinitions,
    resolvedPlan,
    isLayoutAllowed,
    selectedLayout,
    menuThemeMode,
    handleSelectThemeMode,
    menuThemePreset,
    handleSelectMenuTheme,
    handleUpdateCustomColors,
    menuThemeShape,
    handleSelectThemeShape,
    handleActivateCustomAppearance,
    flushPendingAppearanceSave,
    restColor,
    restBgColor,
    handleInstantLayoutSelect,
    openUpgradeModal,
    restProjectType,
    terms,
    setActiveTab,
    openSettingsSection,
    onNavigate,
    publicPath,
    restName,
    allCategories,
    allItems,
  } = useDashboard();

  const isStore = terms.isStore || restProjectType === 'store';

  const openEditPage = (mode: Exclude<AppearanceEditMode, null>) => {
    setEditingMode(mode);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const closeEditPage = () => {
    setEditingMode(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (!editingMode || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeEditPage();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingMode]);

  if (isStore) {
    return (
      <div className="mp-appearance-page">
        <motion.section
          className="mp-appearance-section mp-estore-appearance-card"
          {...dashSectionMotion(prefersReducedMotion, 0)}
        >
          <div className="mp-estore-appearance-head">
            <div className="mp-estore-appearance-badge">
              <CheckCircle2 size={15} />
              <span>المظهر الأساسي المفعّل لمتجرك</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(publicPath)}
              className="btn p s"
              style={{ fontWeight: 800, gap: '6px' }}
            >
              <Eye size={15} />
              <span>معاينة المتجر مباشرة</span>
            </button>
          </div>

          <div className="mp-estore-appearance-hero">
            <div className="mp-estore-appearance-copy">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Store size={20} style={{ color: 'var(--brand-ink, #34D399)' }} />
                <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--brand-ink, #e2e8f0)' }}>
                  مظهر المتجر الموحد
                </span>
              </div>
              <h2 className="mp-appearance-section-title" style={{ marginBottom: '6px', fontSize: '21px' }}>
                واجهة متجر موحّدة لـ {restName || 'متجرك'}
              </h2>
              <p style={{ margin: '0 0 14px', fontSize: '14.5px', color: 'var(--muted)', lineHeight: 1.55 }}>
                تصميم متكامل باللونين الأبيض والفحمي مع السلة والمفضلات.
              </p>
            </div>

            {/* Live Visual Mini-Mockup matching estore layout */}
            <div className="mp-estore-preview-frame" aria-hidden="true">
              <div className="mp-estore-preview-nav">
                <span className="mp-estore-preview-logo" />
                <span className="mp-estore-preview-search">
                  <i />
                </span>
                <span className="mp-estore-preview-cart" />
              </div>
              <div className="mp-estore-preview-cats">
                <span className="is-active" />
                <span />
                <span />
                <span />
              </div>
              <div className="mp-estore-preview-banner">
                <div>
                  <span className="line-lg" />
                  <span className="line-sm" />
                </div>
                <span className="cta-dot" />
              </div>
              <div className="mp-estore-preview-grid">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className="mp-estore-preview-card">
                    <div className="thumb">
                      {idx === 0 && <span className="disc">-20%</span>}
                    </div>
                    <div className="meta">
                      <span className="t1" />
                      <div className="bottom">
                        <span className="price" />
                        <span className="btn-sq" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mp-estore-quick-actions">
            <button
              type="button"
              onClick={() => setActiveTab('cats')}
              className="mp-estore-quick-btn"
            >
              <Layers size={20} />
              <b style={{ fontSize: '15.5px' }}>الأقسام ({allCategories.length})</b>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('menu')}
              className="mp-estore-quick-btn"
            >
              <ShoppingBag size={20} />
              <b style={{ fontSize: '15.5px' }}>المنتجات ({allItems.length})</b>
            </button>
            <button
              type="button"
              onClick={() => openSettingsSection('identity')}
              className="mp-estore-quick-btn"
            >
              <Store size={20} />
              <b style={{ fontSize: '15.5px' }}>الهوية والشعار</b>
            </button>
          </div>
        </motion.section>
      </div>
    );
  }

  const allowedThemes = getAllowedThemesForPlan(resolvedPlan);
  const previewMode = resolveMenuThemeEffectiveMode(menuThemeMode);
  const isReadyShapeActive = READY_APPEARANCE_ID_SET.has(menuThemeShape);
  const isCustomActive = !isReadyShapeActive;
  const isCustomSelected = menuThemePreset === 'custom' && resolvedPlan.perms.customColors;
  const customBrandHex = restColor || '#10B981';
  const defaultPreviewBg = previewMode === 'dark' ? '#08100d' : '#f4f7f6';
  const customBgPreview = restBgColor || defaultPreviewBg;
  const customBgIsLight = getContrastInk(customBgPreview) === '#0f172a';
  const customSurfacePreview = customBgIsLight ? '#ffffff' : '#131d19';
  const customInkPreview = customBgIsLight ? '#0f172a' : '#f8fafc';
  const customLinePreview = customBgIsLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.16)';

  const activeThemeObj = MENU_THEMES.find((t) => t.id === menuThemePreset);
  const activeColorLabel = isCustomSelected
    ? 'ألوان مخصصة'
    : activeThemeObj?.name || 'افتراضي';
  const activeLayoutObj = layoutDefinitions.find((l) => l.id === selectedLayout) || layoutDefinitions[0];
  const customShapes = MENU_SHAPES.filter((s) => !READY_APPEARANCE_ID_SET.has(s.id));
  const activeCustomShapeObj = customShapes.find((s) => s.id === menuThemeShape) || customShapes[0];

  const editingReadyMeta =
    editingMode && editingMode !== 'custom'
      ? READY_APPEARANCES.find((a) => a.id === editingMode) || null
      : null;

  const modalThemesList = MENU_THEMES.filter((t) => {
    if (t.seasonal || t.storeOnly) return false;
    if (editingMode === 'custom' && READY_APPEARANCES.some((a) => a.pairedPresetId === t.id)) {
      return false;
    }
    return true;
  }).sort((a, b) => {
    if (editingReadyMeta) {
      if (a.id === editingReadyMeta.pairedPresetId) return -1;
      if (b.id === editingReadyMeta.pairedPresetId) return 1;
    }
    return 0;
  });

  const renderModeSwitcherBar = () => {
    if (!resolvedPlan.perms.lightDarkMode) return null;
    return (
      <motion.div
        className="mp-appearance-top-bar"
        {...dashSectionMotion(prefersReducedMotion, 0)}
      >
        <div className="mp-appearance-mode-wrap">
          <h2 className="mp-appearance-section-title">
            مظهر المنيو
          </h2>
          <div className="mp-appearance-mode-tabs" role="group" aria-label="وضع المظهر">
            <button
              type="button"
              onClick={() => handleSelectThemeMode('light')}
              className={`mp-appearance-mode-btn ${menuThemeMode === 'light' ? 'active' : ''}`}
            >
              <span>فاتح</span>
              <span className="mp-mode-icon">☀️</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectThemeMode('dark')}
              className={`mp-appearance-mode-btn ${menuThemeMode === 'dark' ? 'active' : ''}`}
            >
              <span>غامق</span>
              <span className="mp-mode-icon">🌙</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectThemeMode('auto')}
              className={`mp-appearance-mode-btn ${menuThemeMode === 'auto' ? 'active' : ''}`}
            >
              <span>حسب الجهاز</span>
              <span className="mp-mode-icon">📱</span>
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  // Full-Page Edit View (when user clicks "تعديل" on a ready-made theme or Custom)
  if (editingMode) {
    const targetShape =
      editingMode !== 'custom'
        ? editingMode
        : isReadyShapeActive
        ? 'modern'
        : menuThemeShape;
    const isEditingModeAssigned =
      editingMode !== 'custom' ? menuThemeShape === editingMode : isCustomActive;

    return (
      <div className="mp-appearance-page">
        {/* Full-Page Top Navigation & Title Header */}
        <motion.div
          className="mp-appearance-section"
          {...dashSectionMotion(prefersReducedMotion, 0)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            padding: '14px 18px',
            borderRadius: '18px',
            border: '1px solid var(--mp-glass-border)',
            background: 'var(--mp-glass-bg)',
            backdropFilter: 'var(--mp-glass-blur)',
            WebkitBackdropFilter: 'var(--mp-glass-blur)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <button
              type="button"
              onClick={closeEditPage}
              className="btn s"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 800,
                padding: '8px 14px',
                borderRadius: '999px',
              }}
            >
              <ArrowRight size={16} />
              <span>رجوع</span>
            </button>
            <div style={{ minWidth: 0 }}>
              <h2 className="mp-appearance-section-title" style={{ margin: 0, fontSize: '18px' }}>
                {editingReadyMeta
                  ? `${editingReadyMeta.icon} تعديل: ${editingReadyMeta.title}`
                  : '🎨 تعديل: مخصص'}
              </h2>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '12.5px' }}>
                {editingReadyMeta
                  ? `اختر لون المنيو المناسب مع الحفاظ على تصميم ${editingReadyMeta.title} الكامل`
                  : 'اختر لون المنيو وشكل العرض وتصميم البطاقات'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn s"
              style={{ fontWeight: 800, borderRadius: '999px', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              onClick={async () => {
                await flushPendingAppearanceSave();
                onNavigate(publicPath);
              }}
            >
              <Eye size={14} />
              <span>معاينة المنيو</span>
            </button>
            {!isEditingModeAssigned ? (
              <button
                type="button"
                className="btn p s"
                style={{ fontWeight: 800, borderRadius: '999px', padding: '8px 16px' }}
                onClick={() => {
                  if (editingMode !== 'custom') {
                    handleSelectThemeShape(editingMode);
                  } else {
                    handleActivateCustomAppearance();
                  }
                }}
              >
                {editingReadyMeta ? `تعيين ${editingReadyMeta.title}` : 'تعيين المظهر المخصص'}
              </button>
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12.5px',
                  fontWeight: 900,
                  color: '#10b981',
                  padding: '6px 12px',
                  borderRadius: '999px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.38)',
                }}
              >
                <CheckCircle2 size={14} />
                <span>معيّن حالياً</span>
              </span>
            )}
          </div>
        </motion.div>

        {renderModeSwitcherBar()}

        {/* Custom Mode: Product Display Layouts */}
        {editingMode === 'custom' && (
          <motion.section
            className="mp-appearance-section"
            {...dashSectionMotion(prefersReducedMotion, 0.06)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <LayoutGrid size={20} style={{ color: 'var(--brand-ink, #34D399)', flexShrink: 0 }} />
              <h2 className="mp-appearance-section-title" style={{ margin: 0 }}>
                شكل العرض (طريقة عرض المنتجات)
              </h2>
            </div>

            <div className="mp-appearance-layouts-grid">
              {layoutDefinitions.map((lay, idx) => {
                const isSelected = selectedLayout === lay.id;
                const layoutAllowed = isLayoutAllowed(lay.id);
                const previewCount =
                  lay.id === 'grid4' ? 4 : lay.id === 'grid3' ? 3 : lay.id === 'grid' ? 2 : 2;
                return (
                  <motion.button
                    key={lay.id}
                    type="button"
                    onClick={() =>
                      handleInstantLayoutSelect(lay.id, {
                        forceShape: isReadyShapeActive ? 'modern' : undefined,
                      })
                    }
                    className={`mp-appearance-layout-card ${isSelected ? 'selected' : ''}`}
                    style={{ opacity: layoutAllowed ? 1 : 0.65 }}
                    {...dashCardMotion(prefersReducedMotion, idx, layoutAllowed ? 1 : 0.65, false, 0.08)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
                      <span style={{ fontSize: '20px', lineHeight: 1 }}>{lay.icon}</span>
                      {!layoutAllowed ? (
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 800,
                            color: '#f59e0b',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          🔒 باقة أعلى
                        </span>
                      ) : isSelected ? (
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 900,
                            color: 'var(--brand-ink, #34D399)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          مفعّل ✓
                        </span>
                      ) : null}
                    </div>

                    <div className={`mp-layout-mini-preview is-${lay.id}`} aria-hidden="true">
                      {Array.from({ length: previewCount }).map((_, cellIdx) => (
                        <div key={cellIdx} className="mp-layout-mini-cell">
                          <span className="mp-layout-mini-img" />
                          <span className="mp-layout-mini-lines">
                            <i />
                            <i className="short" />
                          </span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '100%' }}>
                      <b style={{ fontSize: '14.5px', color: isSelected ? 'var(--brand-ink, #34D399)' : 'var(--ink)', lineHeight: 1.3 }}>
                        {lay.title}
                      </b>
                      <span style={{ fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.4 }}>
                        {lay.desc}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* Menu Colors (Both Toters & Custom) */}
        <section className="mp-appearance-section">
          <motion.div
            style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}
            {...dashSectionMotion(prefersReducedMotion, 0.12)}
          >
            <Palette size={20} style={{ color: 'var(--brand-ink, #34D399)', flexShrink: 0 }} />
            <h2 className="mp-appearance-section-title" style={{ margin: 0 }}>
              لون المنيو
            </h2>
          </motion.div>

          <div className="mp-appearance-themes-grid">
            {modalThemesList.map((theme, idx) => {
              const isUnlocked = allowedThemes.some((t) => t.id === theme.id);
              const isSelected = menuThemePreset === theme.id;
              const pal = previewMode === 'dark' ? theme.darkPalette : theme.lightPalette;
              const targetOpacity = isUnlocked ? 1 : 0.62;
              const showWithInitialSection = idx < 2;

              return (
                <motion.button
                  key={theme.id}
                  type="button"
                  onClick={() =>
                    handleSelectMenuTheme(theme.id, {
                      keepCurrentShape: true,
                      forceShape: targetShape,
                    })
                  }
                  className={`mp-appearance-theme-card ${isSelected ? 'selected' : ''}`}
                  style={{
                    borderColor: isSelected ? pal.brand : undefined,
                    opacity: targetOpacity,
                  }}
                  {...dashCardMotion(
                    prefersReducedMotion,
                    showWithInitialSection ? idx : idx - 2,
                    targetOpacity,
                    !showWithInitialSection,
                    showWithInitialSection ? 0.16 : 0.05
                  )}
                >
                  <div
                    className="mp-theme-mini-preview"
                    style={{
                      background: pal.bg,
                      borderColor: pal.line,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div className="mp-theme-mini-card" style={{ background: pal.surface, borderColor: pal.line }}>
                      <span className="mp-theme-mini-line" style={{ background: pal.text, width: '62%' }} />
                      <span className="mp-theme-mini-line" style={{ background: pal.muted, width: '40%', opacity: 0.6 }} />
                    </div>
                    <span className="mp-theme-mini-pill" style={{ background: pal.brand }} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: pal.brand, border: '1px solid rgba(255,255,255,0.25)' }} />
                      <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: pal.accent, border: '1px solid rgba(255,255,255,0.2)' }} />
                      <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: pal.bg, border: '1px solid rgba(148,163,184,0.4)' }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: isUnlocked ? (isSelected ? 'var(--brand-ink, #34D399)' : 'var(--muted)') : '#f59e0b' }}>
                      {!isUnlocked
                        ? '🔒 مقفل'
                        : isSelected
                        ? 'نشط ✓'
                        : previewMode === 'dark'
                        ? 'غامق'
                        : 'فاتح'}
                    </span>
                  </div>
                  <b style={{ fontSize: '15px', color: 'var(--ink)' }}>{theme.name}</b>
                </motion.button>
              );
            })}

            {/* Wide Custom Menu Colors Card */}
            <motion.div
              role="button"
              tabIndex={0}
              onClick={() =>
                handleSelectMenuTheme('custom', {
                  keepCurrentShape: true,
                  forceShape: targetShape,
                })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectMenuTheme('custom', {
                    keepCurrentShape: true,
                    forceShape: targetShape,
                  });
                }
              }}
              className={`mp-appearance-theme-card mp-appearance-custom-theme-card ${isCustomSelected ? 'selected' : ''}`}
              style={{
                borderColor: isCustomSelected ? customBrandHex : undefined,
                opacity: resolvedPlan.perms.customColors ? 1 : 0.72,
              }}
              {...dashCardMotion(prefersReducedMotion, 2, resolvedPlan.perms.customColors ? 1 : 0.72, true, 0.1)}
            >
              <div
                className="mp-theme-mini-preview"
                style={{
                  background: customBgPreview,
                  borderColor: customLinePreview,
                }}
              >
                <div className="mp-theme-mini-card" style={{ background: customSurfacePreview, borderColor: customLinePreview }}>
                  <span className="mp-theme-mini-line" style={{ background: customInkPreview, width: '58%' }} />
                  <span className="mp-theme-mini-line" style={{ background: customBrandHex, width: '36%', opacity: 0.75 }} />
                </div>
                <span className="mp-theme-mini-pill" style={{ background: customBrandHex }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px', flexWrap: 'wrap' }}>
                <b style={{ fontSize: '15.5px', color: 'var(--ink)' }}>
                  ألوان مخصصة 🎨
                </b>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: resolvedPlan.perms.customColors ? (isCustomSelected ? 'var(--brand-ink, #34D399)' : 'var(--muted)') : '#f59e0b' }}>
                  {!resolvedPlan.perms.customColors
                    ? '🔒 باقة أعلى'
                    : isCustomSelected
                    ? 'نشط ✓'
                    : 'تخصيص حر'}
                </span>
              </div>

              <div
                className="mp-custom-color-controls"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!resolvedPlan.perms.customColors) {
                    openUpgradeModal('vip');
                  }
                }}
              >
                <label className="mp-custom-color-chip">
                  <input
                    type="color"
                    disabled={!resolvedPlan.perms.customColors}
                    value={customBrandHex}
                    onChange={(e) => handleUpdateCustomColors(e.target.value, undefined, targetShape)}
                    aria-label="اللون الأساسي"
                  />
                  <div style={{ minWidth: 0 }}>
                    <span className="mp-custom-color-label">اللون الأساسي</span>
                    <span className="mp-custom-color-hex tabular-nums" dir="ltr">{customBrandHex.toUpperCase()}</span>
                  </div>
                </label>

                <label className="mp-custom-color-chip">
                  <input
                    type="color"
                    disabled={!resolvedPlan.perms.customColors}
                    value={customBgPreview}
                    onChange={(e) => handleUpdateCustomColors(undefined, e.target.value, targetShape)}
                    aria-label="لون الخلفية"
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span className="mp-custom-color-label">لون الخلفية</span>
                    <span className="mp-custom-color-hex tabular-nums" dir="ltr">
                      {restBgColor ? restBgColor.toUpperCase() : 'تلقائي'}
                    </span>
                  </div>
                  {restBgColor && resolvedPlan.perms.customColors && (
                    <button
                      type="button"
                      title="إرجاع الخلفية تلقائياً"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleUpdateCustomColors(undefined, '', targetShape);
                      }}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '999px',
                        border: '1px solid var(--mp-glass-border, var(--line))',
                        background: 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                        color: 'var(--muted)',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                </label>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Custom Mode: Page & Card Shapes */}
        {editingMode === 'custom' && (
          <motion.section
            className="mp-appearance-section"
            {...dashSectionMotion(prefersReducedMotion, 0, true)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <Shapes size={20} style={{ color: 'var(--brand-ink, #34D399)', flexShrink: 0 }} />
              <h2 className="mp-appearance-section-title" style={{ margin: 0 }}>
                شكل الصفحة والبطاقات
              </h2>
            </div>

            <div className="mp-appearance-shapes-grid">
              {customShapes.map((shape, idx) => {
                const isSelected = menuThemeShape === shape.id;
                const seasonalDecor =
                  shape.id === 'ramadan'
                    ? { left: '🏮', right: '🌙', badge: '✦' }
                    : shape.id === 'eid'
                    ? { left: '🎈', right: '🎉', badge: '🎊' }
                    : shape.id === 'newyear'
                    ? { left: '❄️', right: '🎆', badge: '✨' }
                    : null;

                return (
                  <motion.button
                    key={shape.id}
                    type="button"
                    onClick={() => handleSelectThemeShape(shape.id)}
                    className={`mp-appearance-shape-card ${isSelected ? 'selected' : ''}`}
                    {...dashCardMotion(prefersReducedMotion, idx, 1, true, 0.05)}
                  >
                    <div className={`mp-shape-preview mp-shape-preview-${shape.id}`}>
                      {seasonalDecor && (
                        <div className="mp-shape-seasonal-icons" aria-hidden="true">
                          <span>{seasonalDecor.right}</span>
                          <span>{seasonalDecor.badge}</span>
                          <span>{seasonalDecor.left}</span>
                        </div>
                      )}
                      <div className="mp-shape-mini-row">
                        <div className="mp-shape-mini-avatar" />
                        <div className="mp-shape-preview-box">
                          <div className="mp-shape-preview-thumb" />
                          <div className="mp-shape-preview-meta">
                            <span className="mp-shape-preview-bar" />
                            <span className="mp-shape-preview-btn" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
                      <b style={{ fontSize: '15px', color: isSelected ? 'var(--brand-ink, #34D399)' : 'var(--ink)' }}>
                        {shape.name}
                      </b>
                      {isSelected ? (
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 900,
                            color: 'var(--brand-ink, #34D399)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          مفعّل ✓
                        </span>
                      ) : shape.badge ? (
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 800,
                            color: 'var(--brand-ink, #34D399)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {shape.badge}
                        </span>
                      ) : null}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.section>
        )}
      </div>
    );
  }

  // Main Choose Appearance Landing View
  return (
    <div className="mp-appearance-page">
      {/* 1. Menu Display Mode (Light / Dark / Auto) */}
      {renderModeSwitcherBar()}

      {/* 2. Choose Appearance Mode (Ready-made Themes & Custom — Addons Card Style) */}
      <motion.section
        className="mp-appearance-section"
        {...dashSectionMotion(prefersReducedMotion, 0.08)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div>
            <h2 className="mp-appearance-section-title" style={{ margin: 0 }}>
              اختر مظهر
            </h2>
            <p className="muted" style={{ margin: '3px 0 0', fontSize: '12.5px' }}>
              جميع المظاهر تعرض على الكمبيوتر والهاتف بتنسيق عمودي مرتب ومتناسق
            </p>
          </div>
          <button
            type="button"
            className="btn s"
            style={{ fontWeight: 800, borderRadius: '999px', padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            onClick={async () => {
              await flushPendingAppearanceSave();
              onNavigate(publicPath);
            }}
          >
            <Eye size={14} />
            <span>معاينة المنيو الحالي</span>
          </button>
        </div>

        <div className="mp-appearance-picker-grid">
          {READY_APPEARANCES.map((preset, idx) => {
            const isActive = menuThemeShape === preset.id;
            const pairedObj = MENU_THEMES.find((t) => t.id === preset.pairedPresetId) || MENU_THEMES[0];
            const cardPaletteMode = isActive
              ? previewMode
              : preset.id === 'theme2'
              ? 'dark'
              : pairedObj.mode;
            const pal = cardPaletteMode === 'dark' ? pairedObj.darkPalette : pairedObj.lightPalette;
            const brandHex = isActive && isCustomSelected ? customBrandHex : isActive && activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.brand : activeThemeObj.lightPalette.brand) : pal.brand;
            const bgHex = isActive && isCustomSelected ? customBgPreview : isActive && activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.bg : activeThemeObj.lightPalette.bg) : pal.bg;
            const surfaceHex = isActive && isCustomSelected ? customSurfacePreview : isActive && activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.surface : activeThemeObj.lightPalette.surface) : pal.surface;
            const softHex = isActive && activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.surfaceSoft : activeThemeObj.lightPalette.surfaceSoft) : pal.surfaceSoft;
            const textHex = isActive && isCustomSelected ? customInkPreview : isActive && activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.text : activeThemeObj.lightPalette.text) : pal.text;
            const mutedHex = isActive && activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.muted : activeThemeObj.lightPalette.muted) : pal.muted;
            const lineHex = isActive && isCustomSelected ? customLinePreview : isActive && activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.line : activeThemeObj.lightPalette.line) : pal.line;

            return (
              <motion.div
                key={preset.id}
                className={`mp-appearance-picker-card ${isActive ? 'is-enabled' : ''}`}
                {...dashCardMotion(prefersReducedMotion, idx, 1, false, 0.05)}
              >
                <div className="mp-appearance-picker-head">
                  <div className={`mp-addon-card-icon ${isActive ? 'is-enabled' : ''}`} aria-hidden="true">
                    <span>{preset.icon}</span>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b className="mp-addon-card-title">{preset.title}</b>
                    <span
                      className="mp-appearance-picker-meta"
                      style={{ color: isActive ? '#10b981' : 'var(--muted)' }}
                    >
                      {isActive ? `معيّن · ${activeColorLabel}` : 'مظهر جاهز'}
                    </span>
                  </div>
                </div>

                <ThemePhonePreview
                  variant={preset.id}
                  brand={brandHex}
                  accent={pal.accent || brandHex}
                  bg={bgHex}
                  surface={surfaceHex}
                  soft={softHex}
                  text={textHex}
                  muted={mutedHex}
                  line={lineHex}
                />

                <p className="mp-appearance-picker-desc">{preset.desc}</p>

                <div className="mp-appearance-picker-actions">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isActive) {
                        handleSelectThemeShape(preset.id);
                      }
                    }}
                    aria-pressed={isActive}
                    className={`mp-addon-btn-toggle ${isActive ? 'is-start' : ''}`}
                    style={
                      !isActive
                        ? {
                            border: '1px solid var(--mp-glass-border)',
                            background: 'var(--mp-glass-control)',
                            color: 'var(--ink)',
                          }
                        : undefined
                    }
                  >
                    <span
                      className={`mp-addon-dot ${isActive ? 'is-on' : ''}`}
                      style={!isActive ? { background: 'var(--muted)' } : undefined}
                    />
                    <span>{isActive ? 'معيّن' : 'تعيين'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditPage(preset.id)}
                    className="mp-addon-btn-edit"
                  >
                    <Edit size={12} />
                    <span>تعديل</span>
                  </button>
                  <button
                    type="button"
                    title={`تعيين ومعاينة ${preset.title}`}
                    aria-label={`معاينة ${preset.title}`}
                    onClick={async () => {
                      if (!isActive) {
                        handleSelectThemeShape(preset.id);
                      }
                      await flushPendingAppearanceSave();
                      onNavigate(publicPath);
                    }}
                    className="mp-appearance-preview-icon-btn"
                  >
                    <Eye size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}

          {/* Custom Appearance */}
          <motion.div
            className={`mp-appearance-picker-card ${isCustomActive ? 'is-enabled' : ''}`}
            {...dashCardMotion(prefersReducedMotion, READY_APPEARANCES.length, 1, false, 0.05)}
          >
            <div className="mp-appearance-picker-head">
              <div className={`mp-addon-card-icon ${isCustomActive ? 'is-enabled' : ''}`} aria-hidden="true">
                <span>🎨</span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b className="mp-addon-card-title">مخصص</b>
                <span
                  className="mp-appearance-picker-meta"
                  style={{ color: isCustomActive ? '#10b981' : 'var(--muted)' }}
                >
                  {activeLayoutObj?.title || 'شبكة'} · {activeCustomShapeObj?.name || 'عصري ناعم'}
                </span>
              </div>
            </div>

            <ThemePhonePreview
              variant="custom"
              brand={customBrandHex}
              accent={customBrandHex}
              bg={isCustomSelected ? customBgPreview : (activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.bg : activeThemeObj.lightPalette.bg) : customBgPreview)}
              surface={isCustomSelected ? customSurfacePreview : (activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.surface : activeThemeObj.lightPalette.surface) : customSurfacePreview)}
              soft={activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.surfaceSoft : activeThemeObj.lightPalette.surfaceSoft) : 'rgba(148,163,184,0.14)'}
              text={isCustomSelected ? customInkPreview : (activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.text : activeThemeObj.lightPalette.text) : customInkPreview)}
              muted={activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.muted : activeThemeObj.lightPalette.muted) : 'rgba(148,163,184,0.75)'}
              line={isCustomSelected ? customLinePreview : (activeThemeObj ? (previewMode === 'dark' ? activeThemeObj.darkPalette.line : activeThemeObj.lightPalette.line) : customLinePreview)}
              layoutMode={selectedLayout}
            />

            <p className="mp-appearance-picker-desc">
              تحكم كامل بلون المنيو، شكل عرض المنتجات (4 أو 3 أو مربعين أو قائمة)، وشكل البطاقات.
            </p>

            <div className="mp-appearance-picker-actions">
              <button
                type="button"
                onClick={() => {
                  if (!isCustomActive) {
                    handleActivateCustomAppearance();
                  }
                }}
                aria-pressed={isCustomActive}
                className={`mp-addon-btn-toggle ${isCustomActive ? 'is-start' : ''}`}
                style={
                  !isCustomActive
                    ? {
                        border: '1px solid var(--mp-glass-border)',
                        background: 'var(--mp-glass-control)',
                        color: 'var(--ink)',
                      }
                    : undefined
                }
              >
                <span
                  className={`mp-addon-dot ${isCustomActive ? 'is-on' : ''}`}
                  style={!isCustomActive ? { background: 'var(--muted)' } : undefined}
                />
                <span>{isCustomActive ? 'معيّن' : 'تعيين'}</span>
              </button>
              <button
                type="button"
                onClick={() => openEditPage('custom')}
                className="mp-addon-btn-edit"
              >
                <Edit size={12} />
                <span>تعديل</span>
              </button>
              <button
                type="button"
                title="تعيين ومعاينة المظهر المخصص"
                aria-label="معاينة المظهر المخصص"
                onClick={async () => {
                  if (!isCustomActive) {
                    handleActivateCustomAppearance();
                  }
                  await flushPendingAppearanceSave();
                  onNavigate(publicPath);
                }}
                className="mp-appearance-preview-icon-btn"
              >
                <Eye size={14} />
              </button>
            </div>
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
};
