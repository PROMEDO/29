/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  Ban,
  Clock,
  Compass,
  Edit,
  EyeOff,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AvailabilitySchedule, Category } from '../../types';
import { AvailabilityScheduleEditor } from '../../components/AvailabilityScheduleEditor';
import { MediaLibraryModal } from '../../components/MediaLibraryModal';
import {
  DEFAULT_AVAILABILITY_SCHEDULE,
  formatManualPauseStatusLabel,
  getActiveManualPause,
  normalizeAvailabilitySchedule,
} from '../../utils/availability';
import {
  SixDotDragHandle,
  useDashboard,
} from './DashboardContext';
import { dashModalMotion, dashSectionMotion } from '../../utils/dashboardMotion';

export const CategoriesPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const {
    resolvedPlan,
    terms,
    allCategories,
    filteredCategories,
    searchCatQuery,
    setSearchCatQuery,
    showCatModal,
    setShowCatModal,
    editingCatId,
    catNameInput,
    setCatNameInput,
    catImageInput,
    setCatImageInput,
    openNewCategoryModal,
    handleToggleCategoryVisibility,
    handleSaveCategory,
    handleOpenEditCategory,
    handleDeleteCategory,
    handleReorderCategories,
    handleSaveCategorySchedule,
    handleSeedStoreCatalog,
    mediaLibraryItems,
    uploadImagesToLibrary,
    removeMediaLibraryItem,
  } = useDashboard();

  const [showCompassSearch, setShowCompassSearch] = useState(false);
  const compassInputRef = useRef<HTMLInputElement>(null);

  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [scheduleModalCat, setScheduleModalCat] = useState<Category | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<AvailabilitySchedule>(() =>
    normalizeAvailabilitySchedule(DEFAULT_AVAILABILITY_SCHEDULE)
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  const hasTimedPausedCats = useMemo(
    () =>
      allCategories.some(
        (c) => c.manualPause?.paused && typeof c.manualPause.until === 'number'
      ),
    [allCategories]
  );
  useEffect(() => {
    if (!hasTimedPausedCats) return;
    const timer = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setNowMs(Date.now());
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [hasTimedPausedCats]);

  // Smooth touch + mouse pointer-drag reordering via the 6-dot handle
  const [draggingCatId, setDraggingCatId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragSessionRef = useRef<{
    catId: string;
    startClientY: number;
    initialCenterY: number;
    slotCenters: number[];
    draftOrder: string[];
    originalOrder: string[];
  } | null>(null);

  const activeSearchTrimmed = searchCatQuery.trim();
  const baseCategories = activeSearchTrimmed ? filteredCategories : allCategories;
  const canReorder = allCategories.length > 1 && !activeSearchTrimmed;

  const baseCatByIdMap = useMemo(
    () => new Map(baseCategories.map((c) => [c.id, c])),
    [baseCategories]
  );

  const displayCategories = useMemo(
    () =>
      dragOrder && !activeSearchTrimmed
        ? dragOrder
            .map((id) => baseCatByIdMap.get(id))
            .filter((c): c is Category => Boolean(c))
        : baseCategories,
    [dragOrder, activeSearchTrimmed, baseCatByIdMap, baseCategories]
  );

  useEffect(() => {
    if (!draggingCatId) return;
    let rafId = 0;
    let latestClientY = 0;

    const processMove = () => {
      rafId = 0;
      const st = dragSessionRef.current;
      if (!st) return;

      const currentCenterY = st.initialCenterY + (latestClientY - st.startClientY);
      let bestIdx = 0;
      let bestDist = Infinity;
      st.slotCenters.forEach((sc, idx) => {
        const dist = Math.abs(currentCenterY - sc);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });

      const currentIdx = st.draftOrder.indexOf(st.catId);
      if (currentIdx !== -1 && bestIdx !== currentIdx) {
        const nextOrder = [...st.draftOrder];
        const [moved] = nextOrder.splice(currentIdx, 1);
        nextOrder.splice(bestIdx, 0, moved);
        st.draftOrder = nextOrder;
        setDragOrder([...nextOrder]);
      }

      setDragOffsetY(currentCenterY - st.slotCenters[bestIdx]);
    };

    const handlePointerMove = (ev: PointerEvent) => {
      const st = dragSessionRef.current;
      if (!st) return;
      ev.preventDefault();
      latestClientY = ev.clientY;
      if (!rafId) {
        rafId = window.requestAnimationFrame(processMove);
      }
    };

    const finishDrag = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      const st = dragSessionRef.current;
      if (!st) return;
      const changed = st.draftOrder.some((id, idx) => id !== st.originalOrder[idx]);
      const finalOrder = [...st.draftOrder];
      dragSessionRef.current = null;
      setDraggingCatId(null);
      setDragOffsetY(0);
      setDragOrder(null);
      if (changed) {
        handleReorderCategories(finalOrder);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [draggingCatId, handleReorderCategories]);

  const startHandleDrag = (e: React.PointerEvent<HTMLButtonElement>, catId: string) => {
    if (!canReorder) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if browser declines pointer capture
    }

    const originalOrder = allCategories.map((c) => c.id);
    const slotCenters = originalOrder.map((id) => {
      const el = rowRefs.current.get(id);
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    const initialIdx = originalOrder.indexOf(catId);
    if (initialIdx === -1 || slotCenters.some((v) => v === 0)) return;

    dragSessionRef.current = {
      catId,
      startClientY: e.clientY,
      initialCenterY: slotCenters[initialIdx],
      slotCenters,
      draftOrder: [...originalOrder],
      originalOrder,
    };
    setDraggingCatId(catId);
    setDragOffsetY(0);
    setDragOrder([...originalOrder]);
  };

  const openScheduleModal = (cat: Category) => {
    setScheduleModalCat(cat);
    setScheduleDraft(normalizeAvailabilitySchedule(cat.availabilitySchedule));
  };

  const handleSaveScheduleModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleModalCat) return;
    handleSaveCategorySchedule(scheduleModalCat, scheduleDraft);
    setScheduleModalCat(null);
  };

  const atCatLimit = resolvedPlan.maxCats !== -1 && allCategories.length >= resolvedPlan.maxCats;
  const catLimitText =
    resolvedPlan.maxCats === -1
      ? `${allCategories.length}/∞`
      : `${allCategories.length}/${resolvedPlan.maxCats}`;

  return (
    <div className="mp-page-container">
      <motion.div
        className="mp-items-toolbar"
        {...dashSectionMotion(prefersReducedMotion, 0)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={openNewCategoryModal}
            className={`${atCatLimit ? 'btn s' : 'btn p'} mp-items-add-btn`}
          >
            <span>{atCatLimit ? 'الحد مكتمل 🔒' : terms.isStore ? 'إضافة قسم منتجات' : 'إضافة قسم'}</span>
            <Plus size={17} />
          </button>

          {terms.isStore && (
            <button
              type="button"
              onClick={() => handleSeedStoreCatalog('append_missing')}
              className="btn s"
              style={{
                minHeight: '40px',
                borderRadius: '999px',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Sparkles size={15} style={{ color: 'var(--brand-ink, #34D399)' }} />
              <span>استيراد أقسام ومنتجات جاهزة</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => {
              setShowCompassSearch((prev) => {
                const next = !prev;
                if (next) {
                  window.setTimeout(() => compassInputRef.current?.focus(), 60);
                } else {
                  setSearchCatQuery('');
                }
                return next;
              });
            }}
            className={`mp-compass-btn ${showCompassSearch || activeSearchTrimmed ? 'is-active' : ''}`}
            aria-label="بحث سريع في الأقسام"
            title="بحث عن قسم"
          >
            <Compass size={18} />
          </button>

          <div
            className={`mp-items-count-box ${atCatLimit ? 'is-limit' : ''}`}
            aria-label={`عدد الأقسام ${catLimitText}`}
          >
            <span className="mp-items-count-label">عدد الأقسام</span>
            <span className="mp-items-count-divider" aria-hidden="true" />
            <span dir="ltr" className="mp-items-count-num tabular-nums">
              {catLimitText}
            </span>
          </div>
        </div>
      </motion.div>

      {(showCompassSearch || Boolean(activeSearchTrimmed)) && (
        <div className="mp-compass-search-bar" dir="rtl">
          <Compass size={17} className="mp-compass-search-ico" />
          <input
            ref={compassInputRef}
            type="search"
            value={searchCatQuery}
            onChange={(e) => setSearchCatQuery(e.target.value)}
            placeholder="ابحث عن اسم القسم..."
            aria-label="ابحث عن قسم"
            className="mp-compass-search-input"
          />
          {searchCatQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchCatQuery('');
                compassInputRef.current?.focus();
              }}
              aria-label="مسح البحث"
              className="mp-compass-clear-btn"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}

      <motion.div
        className="mp-items-list"
        {...dashSectionMotion(prefersReducedMotion, 0.12)}
      >
        {displayCategories.length === 0 && activeSearchTrimmed && (
          <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--muted)', fontSize: '15.5px', fontWeight: 700 }}>
            لا يوجد قسم يطابق «{searchCatQuery}»
          </div>
        )}
        {displayCategories.map((c) => {
          const nowDate = new Date(nowMs);
          const activePause = getActiveManualPause(c, nowDate);
          const isCatVisible = !activePause;
          const pauseStatusText = activePause ? formatManualPauseStatusLabel(activePause, nowDate) : '';
          const isBadgePause = activePause?.behavior === 'badge';
          const isDragging = draggingCatId === c.id;
          const hasSchedule = Boolean(c.availabilitySchedule?.enabled);
          return (
            <div
              key={c.id}
              ref={(el) => {
                if (el) {
                  rowRefs.current.set(c.id, el);
                } else {
                  rowRefs.current.delete(c.id);
                }
              }}
              className={`mp-item-card mp-cat-row-card ${!isCatVisible ? 'is-hidden-item' : ''}`}
              style={
                draggingCatId
                  ? {
                      zIndex: isDragging ? 40 : 1,
                      transform: isDragging ? `translateY(${dragOffsetY}px) scale(1.015)` : undefined,
                      border: isDragging ? '1.5px solid var(--brand)' : undefined,
                      boxShadow: isDragging ? '0 14px 32px rgba(0, 0, 0, 0.35)' : undefined,
                      transition: isDragging
                        ? 'box-shadow 0.14s ease, border-color 0.14s ease'
                        : 'transform 0.16s cubic-bezier(0.22, 1, 0.36, 1)',
                      userSelect: 'none',
                    }
                  : undefined
              }
            >
              <div className="mp-item-main">
                {canReorder && (
                  <button
                    type="button"
                    className="mp-item-drag-btn"
                    onPointerDown={(e) => startHandleDrag(e, c.id)}
                    title="اسحب لتحريك القسم للأعلى أو للأسفل"
                    aria-label={`تحريك قسم ${c.n}`}
                    style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                  >
                    <SixDotDragHandle />
                  </button>
                )}
                {c.img && (
                  <img
                    src={c.img}
                    alt={c.n}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="mp-item-thumb"
                  />
                )}
                <div className="mp-item-info">
                  <div className="mp-item-title">{c.n}</div>
                  {pauseStatusText && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: isBadgePause
                          ? 'rgba(245, 158, 11, 0.14)'
                          : 'rgba(239, 68, 68, 0.12)',
                        color: isBadgePause ? '#f59e0b' : '#ef4444',
                        border: isBadgePause
                          ? '1px solid rgba(245, 158, 11, 0.28)'
                          : '1px solid rgba(239, 68, 68, 0.25)',
                      }}
                    >
                      {isBadgePause ? <Ban size={11} /> : <EyeOff size={11} />}
                      <span>{pauseStatusText}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="mp-item-actions">
                <div className="mp-item-visibility-wrap">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isCatVisible}
                    aria-label={
                      isCatVisible
                        ? terms.isStore
                          ? 'إطفاء القسم في المتجر'
                          : 'إطفاء القسم في المنيو'
                        : terms.isStore
                        ? 'تشغيل القسم في المتجر'
                        : 'تشغيل القسم في المنيو'
                    }
                    title={
                      isCatVisible
                        ? terms.isStore
                          ? 'ظاهر في المتجر — اضغط للإطفاء'
                          : 'ظاهر في المنيو — اضغط للإطفاء'
                        : `${pauseStatusText || 'مطفأ'} — اضغط للتشغيل`
                    }
                    onClick={() => handleToggleCategoryVisibility(c)}
                    className={`ios-switch sm ${isCatVisible ? 'on' : 'off'}`}
                  >
                    <span className="ios-switch-thumb" />
                  </button>
                </div>

                <div className="mp-item-action-btns">
                  <button
                    type="button"
                    className={`mp-item-icon-btn ${hasSchedule ? 'is-scheduled' : ''}`}
                    onClick={() => openScheduleModal(c)}
                    title="تعيين وقت توفر القسم"
                    aria-label="تعيين وقت توفر القسم"
                  >
                    <Clock size={15} />
                  </button>

                  <button
                    type="button"
                    className="mp-item-icon-btn"
                    onClick={() => handleOpenEditCategory(c)}
                    title="تعديل القسم"
                    aria-label={`تعديل ${c.n}`}
                  >
                    <Edit size={15} />
                  </button>

                  <button
                    type="button"
                    className="mp-item-icon-btn"
                    onClick={() => handleDeleteCategory(c)}
                    title="حذف القسم"
                    aria-label={`حذف ${c.n}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Add / Edit Category Modal (clean name + image picker only) */}
      {showCatModal && (() => {
        const catModalNode = (
          <div
            onClick={() => setShowCatModal(false)}
            dir="rtl"
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              background: 'rgba(0, 0, 0, 0.64)',
              zIndex: 99999,
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={editingCatId ? 'تعديل القسم' : 'إضافة قسم'}
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
              className="mp-modal-card"
              style={{
                width: 'min(500px, 100%)',
                maxHeight: 'calc(100dvh - 32px)',
                overflowY: 'auto',
                padding: '20px 22px 22px',
              }}
            >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: 'var(--ink)' }}>
                {editingCatId ? 'تعديل القسم' : 'إضافة قسم'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCatModal(false)}
                aria-label="إغلاق"
                style={{
                  background: 'var(--mp-glass-control)',
                  border: '1px solid var(--mp-glass-border)',
                  borderRadius: '999px',
                  width: '34px',
                  height: '34px',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleSaveCategory}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <label className="f" style={{ marginBottom: 0 }}>
                اسم القسم
                <input
                  type="text"
                  value={catNameInput}
                  onChange={(e) => setCatNameInput(e.target.value)}
                  placeholder={terms.isStore ? 'مثال: الهواتف الذكية / السماعات / الإكسسوارات' : 'ادخل اسم القسم'}
                  className="mp-themed-input"
                  style={{ marginTop: '6px' }}
                  required
                />
              </label>

              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowMediaLibrary(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowMediaLibrary(true);
                  }
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: catImageInput ? '16px' : '24px 16px',
                  borderRadius: '18px',
                  border: '1.5px dashed var(--mp-glass-border)',
                  background: 'var(--mp-glass-control)',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                {catImageInput ? (
                  <>
                    <img
                      src={catImageInput}
                      alt={catNameInput || 'صورة القسم'}
                      decoding="async"
                      referrerPolicy="no-referrer"
                      style={{
                        width: '86px',
                        height: '86px',
                        borderRadius: '16px',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--brand-ink, #34D399)' }}>
                      تغيير الصورة
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCatImageInput('');
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: '4px 10px',
                        fontSize: '13.5px',
                        fontWeight: 700,
                        color: 'var(--muted)',
                        cursor: 'pointer',
                      }}
                    >
                      إزالة الصورة
                    </button>
                  </>
                ) : (
                  <>
                    <ImageIcon size={30} strokeWidth={1.7} style={{ color: 'var(--muted)' }} />
                    <div style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--ink)' }}>
                      إضافة صورة (اختياري)
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                {editingCatId ? (
                  <button
                    type="button"
                    onClick={() => setShowCatModal(false)}
                    className="btn p"
                    style={{
                      minWidth: '180px',
                      height: '44px',
                      borderRadius: '999px',
                      padding: '0 26px',
                      fontSize: '14.5px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    تم — إغلاق
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="btn p"
                    style={{
                      minWidth: '180px',
                      height: '44px',
                      borderRadius: '999px',
                      padding: '0 26px',
                      fontSize: '14.5px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {terms.isStore ? 'إضافة قسم للمتجر' : 'إضافة قسم'}
                  </button>
                )}
              </div>
            </form>
            </motion.div>
          </div>
        );
        return typeof document !== 'undefined' ? createPortal(catModalNode, document.body) : catModalNode;
      })()}

      {/* Dedicated Schedule / Timer Modal opened from the row Clock button */}
      {scheduleModalCat && (() => {
        const schedModalNode = (
          <div
            onClick={() => setScheduleModalCat(null)}
            dir="rtl"
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              background: 'rgba(0, 0, 0, 0.64)',
              zIndex: 99999,
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`توقيت توفر: ${scheduleModalCat.n}`}
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
              className="mp-modal-card"
              style={{
                width: 'min(480px, 100%)',
                maxHeight: 'calc(100dvh - 32px)',
                overflowY: 'auto',
                padding: '18px 16px 20px',
              }}
            >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: 'var(--ink)' }}>
                {`توقيت توفر: ${scheduleModalCat.n}`}
              </h3>
              <button
                type="button"
                onClick={() => setScheduleModalCat(null)}
                aria-label="إغلاق"
                style={{
                  background: 'var(--mp-glass-control)',
                  border: '1px solid var(--mp-glass-border)',
                  borderRadius: '999px',
                  width: '34px',
                  height: '34px',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleSaveScheduleModal}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <AvailabilityScheduleEditor
                value={scheduleDraft}
                onChange={(next) => {
                  setScheduleDraft(next);
                  if (scheduleModalCat) {
                    handleSaveCategorySchedule(scheduleModalCat, next);
                  }
                }}
                targetLabel="القسم"
                flat
              />

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setScheduleModalCat(null)}
                  className="btn p"
                  style={{
                    minWidth: '180px',
                    height: '44px',
                    borderRadius: '999px',
                    padding: '0 26px',
                    fontSize: '14.5px',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  تم — إغلاق
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        );
        return typeof document !== 'undefined' ? createPortal(schedModalNode, document.body) : schedModalNode;
      })()}

      <MediaLibraryModal
        isOpen={showMediaLibrary}
        items={mediaLibraryItems}
        currentUrl={catImageInput}
        onSelect={(url) => setCatImageInput(url)}
        onUploadFiles={uploadImagesToLibrary}
        onDeleteItem={(mediaId) => {
          const target = mediaLibraryItems.find((m) => m.id === mediaId);
          if (target && target.url === catImageInput) {
            setCatImageInput('');
          }
          removeMediaLibraryItem(mediaId);
        }}
        onClose={() => setShowMediaLibrary(false)}
      />
    </div>
  );
};
