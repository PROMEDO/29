/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Edit,
  EyeOff,
  Image as ImageIcon,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AvailabilitySchedule, MenuItem } from '../../types';
import { formatNumber } from '../../utils/storage';
import { AvailabilityScheduleEditor } from '../../components/AvailabilityScheduleEditor';
import { MediaLibraryModal } from '../../components/MediaLibraryModal';
import { AppSelect } from '../../components/AppSelect';
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
import {
  dashModalMotion,
  dashSectionMotion,
  dashSubTabMotion,
  dashTabMotion,
} from '../../utils/dashboardMotion';

export const ItemsPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const {
    resolvedPlan,
    terms,
    currency,
    allCategories,
    allItems,
    filteredItems,
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
    formNoDelivery,
    setFormNoDelivery,
    formNoPickup,
    setFormNoPickup,
    formDineInOnly,
    setFormDineInOnly,
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
    handleSeedStoreCatalog,
    mediaLibraryItems,
    uploadImagesToLibrary,
    removeMediaLibraryItem,
  } = useDashboard();

  const [showCompassSearch, setShowCompassSearch] = useState(false);
  const compassInputRef = useRef<HTMLInputElement>(null);
  const [quickPriceItemId, setQuickPriceItemId] = useState<string | null>(null);
  const [quickPriceDraft, setQuickPriceDraft] = useState<string>('');
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [scheduleModalItem, setScheduleModalItem] = useState<MenuItem | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<AvailabilitySchedule>(() =>
    normalizeAvailabilitySchedule(DEFAULT_AVAILABILITY_SCHEDULE)
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  const hasTimedPausedItems = useMemo(
    () =>
      allItems.some(
        (it) => it.manualPause?.paused && typeof it.manualPause.until === 'number'
      ),
    [allItems]
  );
  useEffect(() => {
    if (!hasTimedPausedItems) return;
    const timer = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setNowMs(Date.now());
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [hasTimedPausedItems]);

  // Smooth touch + mouse pointer-drag reordering via the 6-dot handle
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragSessionRef = useRef<{
    itemId: string;
    startClientY: number;
    initialCenterY: number;
    slotCenters: number[];
    draftOrder: string[];
    originalOrder: string[];
  } | null>(null);

  const canReorder = !searchItemQuery.trim() && filteredItems.length > 1;

  const { catByIdMap, itemCountByCatMap } = useMemo(() => {
    const cMap = new Map(allCategories.map((c) => [c.id, c]));
    const countMap = new Map<string, number>();
    for (let i = 0; i < allItems.length; i++) {
      const cid = allItems[i].cat;
      countMap.set(cid, (countMap.get(cid) || 0) + 1);
    }
    return { catByIdMap: cMap, itemCountByCatMap: countMap };
  }, [allCategories, allItems]);

  const filteredItemByIdMap = useMemo(
    () => new Map(filteredItems.map((it) => [it.id, it])),
    [filteredItems]
  );

  const displayItems = useMemo(
    () =>
      dragOrder
        ? dragOrder
            .map((id) => filteredItemByIdMap.get(id))
            .filter((it): it is MenuItem => Boolean(it))
        : filteredItems,
    [dragOrder, filteredItemByIdMap, filteredItems]
  );

  useEffect(() => {
    if (!draggingItemId) return;
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

      const currentIdx = st.draftOrder.indexOf(st.itemId);
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
      setDraggingItemId(null);
      setDragOffsetY(0);
      setDragOrder(null);
      if (changed) {
        handleReorderItems(finalOrder);
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
  }, [draggingItemId, handleReorderItems]);

  const startHandleDrag = (e: React.PointerEvent<HTMLButtonElement>, itemId: string) => {
    if (!canReorder) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if browser declines pointer capture
    }

    const originalOrder = filteredItems.map((it) => it.id);
    const slotCenters = originalOrder.map((id) => {
      const el = rowRefs.current.get(id);
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    const initialIdx = originalOrder.indexOf(itemId);
    if (initialIdx === -1 || slotCenters.some((v) => v === 0)) return;

    dragSessionRef.current = {
      itemId,
      startClientY: e.clientY,
      initialCenterY: slotCenters[initialIdx],
      slotCenters,
      draftOrder: [...originalOrder],
      originalOrder,
    };
    setDraggingItemId(itemId);
    setDragOffsetY(0);
    setDragOrder([...originalOrder]);
  };

  const openScheduleModal = (item: MenuItem) => {
    setScheduleModalItem(item);
    setScheduleDraft(normalizeAvailabilitySchedule(item.availabilitySchedule));
  };

  const handleSaveScheduleModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleModalItem) return;
    handleSaveItemSchedule(scheduleModalItem, scheduleDraft);
    setScheduleModalItem(null);
  };

  const atItemLimit = resolvedPlan.maxItems !== -1 && allItems.length >= resolvedPlan.maxItems;
  const itemLimitText =
    resolvedPlan.maxItems === -1
      ? `${allItems.length}/∞`
      : `${allItems.length}/${resolvedPlan.maxItems}`;
  const canDiscount = resolvedPlan.perms.itemDiscounts;

  if (isItemEditorOpen) {
    return (
      <motion.div
        style={{ maxWidth: '880px', margin: '0 auto' }}
        {...dashTabMotion(prefersReducedMotion)}
      >
        {/* Top Editor Action Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          {!editingItemId ? (
            <button
              type="button"
              onClick={() => {
                setIsItemEditorOpen(false);
                openBatchModal();
              }}
              className="mp-surface-card"
              style={{
                borderRadius: '999px',
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <Sparkles size={15} style={{ color: 'var(--brand-ink, #34D399)' }} />
              <span>إضافة سريعة بالجملة</span>
            </button>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={() => setIsItemEditorOpen(false)}
            className="mp-surface-card"
            style={{
              borderRadius: '999px',
              padding: '7px 14px',
              fontSize: '13px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <ChevronRight size={15} />
            <span>{terms.isStore ? 'العودة للمنتجات' : 'العودة للعناصر'}</span>
          </button>
        </div>

        {/* Horizontal Top Underline Tabs */}
        <div className="item-editor-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={itemEditorTab === 'info'}
            className={`item-editor-tab ${itemEditorTab === 'info' ? 'active' : ''}`}
            onClick={() => setItemEditorTab('info')}
          >
            <span>المعلومات</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={itemEditorTab === 'extras'}
            className={`item-editor-tab ${itemEditorTab === 'extras' ? 'active' : ''}`}
            onClick={() => setItemEditorTab('extras')}
          >
            <span>الإضافات</span>
            {hasExtras && (
              <span className="item-editor-tab-badge tabular-nums">
                {formExtras.filter((x) => x.n.trim()).length || 'مفعّل'}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={itemEditorTab === 'choices'}
            className={`item-editor-tab ${itemEditorTab === 'choices' ? 'active' : ''}`}
            onClick={() => setItemEditorTab('choices')}
          >
            <span>الخيارات</span>
            {hasChoices && (
              <span className="item-editor-tab-badge tabular-nums">
                {formChoices.filter((c) => c.trim()).length || 'مفعّل'}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={itemEditorTab === 'extraInfo'}
            className={`item-editor-tab ${itemEditorTab === 'extraInfo' ? 'active' : ''}`}
            onClick={() => setItemEditorTab('extraInfo')}
          >
            <span>معلومات إضافية</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={itemEditorTab === 'badges'}
            className={`item-editor-tab ${itemEditorTab === 'badges' ? 'active' : ''}`}
            onClick={() => setItemEditorTab('badges')}
          >
            <span>البادجات</span>
            {formBadgeText.trim() && (
              <span className="item-editor-tab-badge">1</span>
            )}
          </button>
        </div>

        {/* Dedicated Editor Card Container */}
        <form onSubmit={handleSaveItem}>
          <motion.div
            key={itemEditorTab}
            {...dashSubTabMotion(prefersReducedMotion)}
            className="mp-surface-card"
            style={{
              borderRadius: '22px',
              padding: '22px',
              boxShadow: 'var(--sh)',
            }}
          >
            {/* TAB 1 */}
            {itemEditorTab === 'info' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    padding: formImage ? '16px' : '24px 16px',
                    borderRadius: '18px',
                    border: '1.5px dashed color-mix(in srgb, var(--line) 85%, transparent)',
                    background: 'color-mix(in srgb, var(--ink) 3%, transparent)',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {formImage ? (
                    <>
                      <img
                        src={formImage}
                        alt={formName || terms.itemSingular}
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
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--brand-ink, #34D399)' }}>
                        اضغط لتغيير الصورة من مكتبة الصور
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormImage('');
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '4px 10px',
                          fontSize: '12px',
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
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ink)' }}>
                        {terms.isStore ? 'اضف صورة للمنتج (اختياري)' : 'اضف صورة للعنصر (اختياري)'}
                      </div>
                      <div dir="auto" style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
                        مقاس الصورة المفضل 180 × 180، نقبل jpg, png, jpeg
                      </div>
                    </>
                  )}
                </div>

                <label className="f" style={{ marginBottom: 0 }}>
                  {terms.isStore ? 'اسم المنتج *' : 'اسم العنصر *'}
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={
                      terms.isStore
                        ? 'مثال: سماعة رأس لاسلكية، هاتف ذكي...'
                        : 'مثال: ريزو، كاب سماش برجر، بيبسي...'
                    }
                    className="mp-themed-input"
                    required
                  />
                </label>

                <label className="f" style={{ marginBottom: 0 }}>
                  {terms.isStore ? 'قسم المنتج *' : 'قسم العنصر *'}
                  <AppSelect
                    title={terms.isStore ? 'اختر قسم المنتج' : 'اختر قسم العنصر'}
                    value={formCat}
                    onChange={(val) => setFormCat(val)}
                    options={allCategories.map((c) => ({ value: c.id, label: c.n }))}
                  />
                </label>

                <label className="f" style={{ marginBottom: 0 }}>
                  {terms.isStore ? 'وصف المنتج (المواصفات والمميزات)' : 'وصف العنصر ( الوصف والمكونات )'}
                  <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder={
                      terms.isStore
                        ? 'اكتب مواصفات المنتج ومميزاته بشكل واضح للمشتري...'
                        : 'اكتب مكونات الوجبة أو وصف المنتج بشكل واضح للزبون...'
                    }
                    rows={4}
                    className="mp-themed-input"
                  />
                </label>

                {!terms.isStore && (
                  <label className="f" style={{ marginBottom: 0 }}>
                    المدة لتجهيز العنصر بالدقائق ( اختياري )
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        value={formPrepTime}
                        onChange={(e) => setFormPrepTime(e.target.value)}
                        placeholder="مثال: 15"
                        className="mp-themed-input"
                      />
                    </div>
                  </label>
                )}

                {/* Pricing Section */}
                <div
                  style={{
                    background: 'transparent',
                    border: 0,
                    borderTop: '1px solid var(--line)',
                    borderRadius: 0,
                    padding: '16px 0 0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      marginBottom: '14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ink)' }}>
                        {terms.isStore ? 'خيارات وأسعار متعددة (سعات / أحجام)' : 'أسعار متغيرة (أكثر من حجم)'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {terms.isStore
                          ? 'فعّل هذا الخيار لتحديد عدة سعات أو إصدارات وبجوار كل خيار سعره الخاص'
                          : 'فعّل هذا الخيار لتحديد عدة أحجام وبجوار كل حجم سعره الخاص'}
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={hasVariableSizes}
                      aria-label={terms.isStore ? 'تفعيل خيارات وأسعار متعددة' : 'تفعيل أسعار متغيرة بأكثر من حجم'}
                      onClick={() => {
                        setHasVariableSizes((prev) => {
                          const next = !prev;
                          if (next && formSizes.length === 0) {
                            setFormSizes(
                              terms.isStore
                                ? [
                                    { n: '128GB', p: formPrice !== '' ? Number(formPrice) : '' },
                                    { n: '256GB', p: '' },
                                  ]
                                : [
                                    { n: 'سنجل', p: formPrice !== '' ? Number(formPrice) : '' },
                                    { n: 'دبل', p: '' },
                                  ]
                            );
                          }
                          return next;
                        });
                      }}
                      className={`ios-switch ${hasVariableSizes ? 'on' : 'off'}`}
                    >
                      <span className="ios-switch-thumb" />
                    </button>
                  </div>

                  {!hasVariableSizes ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                      <label className="f" style={{ marginBottom: 0 }}>
                        {`السعر (${currency}) *`}
                        <input
                          type="number"
                          value={formPrice}
                          onChange={(e) => setFormPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="6000"
                          className="mp-themed-input"
                        />
                      </label>
                      <label className="f" style={{ marginBottom: 0 }}>
                        <span>
                          السعر قبل الخصم (اختياري)
                          {!canDiscount && (
                            <span style={{ color: '#f59e0b', fontSize: '12px', marginInlineStart: '6px' }}>
                              🔒 باقة أعلى
                            </span>
                          )}
                        </span>
                        <input
                          type="number"
                          value={canDiscount ? formBeforePrice : ''}
                          disabled={!canDiscount}
                          onChange={(e) => setFormBeforePrice(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder={canDiscount ? '7500' : 'مقفل'}
                          className="mp-themed-input"
                          style={{
                            opacity: canDiscount ? 1 : 0.6,
                            cursor: canDiscount ? 'text' : 'not-allowed',
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                        {formSizes.map((sz, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'minmax(0, 1.5fr) minmax(110px, 1fr) auto',
                              gap: '8px',
                              alignItems: 'center',
                            }}
                          >
                            <input
                              type="text"
                              value={sz.n}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormSizes((prev) => prev.map((row, i) => (i === idx ? { ...row, n: val } : row)));
                              }}
                              placeholder={
                                terms.isStore
                                  ? `الخيار #${idx + 1}`
                                  : `الحجم #${idx + 1}`
                              }
                              className="mp-themed-input"
                            />
                            <input
                              type="number"
                              value={sz.p}
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' : Number(e.target.value);
                                setFormSizes((prev) => prev.map((row, i) => (i === idx ? { ...row, p: val } : row)));
                              }}
                              placeholder={`السعر (${currency})`}
                              className="mp-themed-input"
                            />
                            <button
                              type="button"
                              aria-label={terms.isStore ? 'حذف الخيار' : 'حذف الحجم'}
                              onClick={() => {
                                if (formSizes.length === 1) {
                                  setFormSizes([{ n: '', p: '' }]);
                                } else {
                                  setFormSizes((prev) => prev.filter((_, i) => i !== idx));
                                }
                              }}
                              style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '999px',
                                border: '1px solid rgba(239, 68, 68, 0.35)',
                                background: 'rgba(239, 68, 68, 0.12)',
                                color: '#ef4444',
                                display: 'grid',
                                placeItems: 'center',
                                cursor: 'pointer',
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn s"
                          onClick={() => setFormSizes((prev) => [...prev, { n: '', p: '' }])}
                          style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Plus size={15} />
                          <span>{terms.isStore ? 'إضافة خيار جديد' : 'إضافة حجم جديد'}</span>
                        </button>

                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {terms.isStore ? (
                            <>
                              <button
                                type="button"
                                className="btn s"
                                onClick={() =>
                                  setFormSizes([
                                    { n: '128GB', p: formSizes[0]?.p || 500000 },
                                    { n: '256GB', p: 650000 },
                                    { n: '512GB', p: 800000 },
                                  ])
                                }
                                style={{ fontSize: '11.5px', color: 'var(--muted)' }}
                              >
                                قالب: 128GB / 256GB / 512GB
                              </button>
                              <button
                                type="button"
                                className="btn s"
                                onClick={() =>
                                  setFormSizes([
                                    { n: 'قياسي', p: formSizes[0]?.p || 100000 },
                                    { n: 'بلس', p: 150000 },
                                    { n: 'برو', p: 200000 },
                                  ])
                                }
                                style={{ fontSize: '11.5px', color: 'var(--muted)' }}
                              >
                                قالب: قياسي / بلس / برو
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn s"
                                onClick={() =>
                                  setFormSizes([
                                    { n: 'سنجل', p: formSizes[0]?.p || 6000 },
                                    { n: 'دبل', p: 8500 },
                                    { n: 'تربل', p: 11000 },
                                  ])
                                }
                                style={{ fontSize: '11.5px', color: 'var(--muted)' }}
                              >
                                قالب: سنجل / دبل / تربل
                              </button>
                              <button
                                type="button"
                                className="btn s"
                                onClick={() =>
                                  setFormSizes([
                                    { n: 'صغير', p: formSizes[0]?.p || 5000 },
                                    { n: 'وسط', p: 7000 },
                                    { n: 'كبير', p: 9000 },
                                  ])
                                }
                                style={{ fontSize: '11.5px', color: 'var(--muted)' }}
                              >
                                قالب: صغير / وسط / كبير
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2 */}
            {itemEditorTab === 'extras' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px',
                    paddingBottom: '16px',
                    marginBottom: '18px',
                    borderBottom: '1px solid var(--line)',
                    flexWrap: 'wrap',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--ink)' }}>
                    {terms.isStore ? 'إضافات المنتج (مدفوعة)' : 'إضافات العنصر (مدفوعة)'}
                  </h3>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: hasExtras ? '#10b981' : 'var(--muted)' }}>
                      {hasExtras ? 'مفعّل' : 'مطفأ'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={hasExtras}
                      aria-label="تشغيل أو إطفاء الإضافات"
                      onClick={() => {
                        setHasExtras((prev) => {
                          const next = !prev;
                          if (next && formExtras.length === 0) {
                            setFormExtras([{ n: '', p: '' }]);
                          }
                          return next;
                        });
                      }}
                      className={`ios-switch ${hasExtras ? 'on' : 'off'}`}
                    >
                      <span className="ios-switch-thumb" />
                    </button>
                  </div>
                </div>

                {!hasExtras ? (
                  <div
                    style={{
                      padding: '24px 12px',
                      textAlign: 'center',
                    }}
                  >
                    <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: '15px', fontWeight: 600 }}>
                      الإضافات غير مفعلة
                    </p>
                    <button
                      type="button"
                      className="btn p s"
                      onClick={() => {
                        setHasExtras(true);
                        if (formExtras.length === 0) setFormExtras([{ n: '', p: '' }]);
                      }}
                    >
                      تشغيل وإضافة خيارات
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                      {formExtras.map((ex, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1.6fr) minmax(120px, 1fr) auto',
                            gap: '10px',
                            alignItems: 'center',
                            background: 'transparent',
                            border: 0,
                            borderBottom: '1px solid var(--mp-glass-divider, var(--line))',
                            borderRadius: 0,
                            padding: '8px 0',
                          }}
                        >
                          <input
                            type="text"
                            value={ex.n}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormExtras((prev) => prev.map((row, i) => (i === idx ? { ...row, n: val } : row)));
                            }}
                            placeholder={terms.isStore ? 'اسم الملحق' : 'اسم الإضافة'}
                            className="mp-themed-input"
                          />
                          <input
                            type="number"
                            value={ex.p}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : Number(e.target.value);
                              setFormExtras((prev) => prev.map((row, i) => (i === idx ? { ...row, p: val } : row)));
                            }}
                            placeholder={`السعر (${currency})`}
                            className="mp-themed-input"
                          />
                          <button
                            type="button"
                            aria-label="حذف الإضافة"
                            onClick={() => {
                              if (formExtras.length === 1) {
                                setFormExtras([{ n: '', p: '' }]);
                              } else {
                                setFormExtras((prev) => prev.filter((_, i) => i !== idx));
                              }
                            }}
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '999px',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              background: 'rgba(239, 68, 68, 0.12)',
                              color: '#ef4444',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn s"
                        onClick={() => setFormExtras((prev) => [...prev, { n: '', p: '' }])}
                        style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Plus size={15} />
                        <span>إضافة جديدة</span>
                      </button>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {(terms.isStore
                          ? [
                              { n: 'كفر حماية', p: 10000 },
                              { n: 'لاصق زجاجي للشاشة', p: 8000 },
                              { n: 'تغليف هدية فاخر', p: 5000 },
                              { n: 'كفالة استبدال إضافية', p: 15000 },
                            ]
                          : [
                              { n: 'صوص جبن', p: 500 },
                              { n: 'شريحة جبن شيدر', p: 1000 },
                              { n: 'فلفل هلابينو', p: 500 },
                              { n: 'بيكون مدخن', p: 2000 },
                            ]
                        ).map((preset) => (
                          <button
                            key={preset.n}
                            type="button"
                            className="btn s"
                            style={{ fontSize: '11.5px', color: 'var(--muted)' }}
                            onClick={() =>
                              setFormExtras((prev) => {
                                const filtered = prev.filter((x) => x.n.trim() !== '');
                                if (filtered.some((x) => x.n === preset.n)) return prev;
                                return [...filtered, preset];
                              })
                            }
                          >
                            + {preset.n} ({preset.p})
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3 */}
            {itemEditorTab === 'choices' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px',
                    paddingBottom: '16px',
                    marginBottom: '18px',
                    borderBottom: '1px solid var(--line)',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 900, color: 'var(--ink)' }}>
                      {terms.isStore
                        ? 'اختيارات المنتج المجانية (ألوان / تغليف)'
                        : 'اختيارات العنصر (مجانية بدون سعر)'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                      {terms.isStore
                        ? 'خيارات مجانية يحددها المشتري مع المنتج مثل اللون أو نوع التغليف بدون سعر إضافي.'
                        : 'خيارات مجانية يحددها الزبون مع الطبق مثل نوع الخبز أو مستوى الحرارة بدون سعر إضافي.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: hasChoices ? '#10b981' : 'var(--muted)' }}>
                      {hasChoices ? 'مفعّل' : 'مطفأ'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={hasChoices}
                      aria-label="تشغيل أو إطفاء الاختيارات المجانية"
                      onClick={() => {
                        setHasChoices((prev) => {
                          const next = !prev;
                          if (next && formChoices.length === 0) {
                            setFormChoices(['']);
                          }
                          return next;
                        });
                      }}
                      className={`ios-switch ${hasChoices ? 'on' : 'off'}`}
                    >
                      <span className="ios-switch-thumb" />
                    </button>
                  </div>
                </div>

                {!hasChoices ? (
                  <div
                    style={{
                      padding: '24px 12px',
                      textAlign: 'center',
                    }}
                  >
                    <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: '15px', fontWeight: 600 }}>
                      الاختيارات المجانية غير مفعلة
                    </p>
                    <button
                      type="button"
                      className="btn p s"
                      onClick={() => {
                        setHasChoices(true);
                        if (formChoices.length === 0) setFormChoices(['']);
                      }}
                    >
                      تشغيل وإضافة اختيارات
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="f" style={{ maxWidth: '300px', marginBottom: '14px' }}>
                      عدد الاختيارات المسموح بها
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={formMaxChoices}
                        onChange={(e) => setFormMaxChoices(Math.max(1, Number(e.target.value) || 1))}
                        className="mp-themed-input"
                      />
                    </label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                      {formChoices.map((ch, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1fr) auto',
                            gap: '10px',
                            alignItems: 'center',
                            background: 'transparent',
                            border: 0,
                            borderBottom: '1px solid var(--mp-glass-divider, var(--line))',
                            borderRadius: 0,
                            padding: '8px 0',
                          }}
                        >
                          <input
                            type="text"
                            value={ch}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormChoices((prev) => prev.map((row, i) => (i === idx ? val : row)));
                            }}
                            placeholder={
                              terms.isStore
                                ? `الخيار #${idx + 1}`
                                : `الاختيار #${idx + 1}`
                            }
                            className="mp-themed-input"
                          />
                          <button
                            type="button"
                            aria-label="حذف الخيار"
                            onClick={() => {
                              if (formChoices.length === 1) {
                                setFormChoices(['']);
                              } else {
                                setFormChoices((prev) => prev.filter((_, i) => i !== idx));
                              }
                            }}
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '999px',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              background: 'rgba(239, 68, 68, 0.12)',
                              color: '#ef4444',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn s"
                        onClick={() => setFormChoices((prev) => [...prev, ''])}
                        style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Plus size={15} />
                        <span>إضافة خيار جديد</span>
                      </button>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {terms.isStore ? (
                          <>
                            <button
                              type="button"
                              className="btn s"
                              style={{ fontSize: '11.5px', color: 'var(--muted)' }}
                              onClick={() => setFormChoices(['اللون: أسود', 'اللون: فضي'])}
                            >
                              قالب: اللون: أسود / فضي
                            </button>
                            <button
                              type="button"
                              className="btn s"
                              style={{ fontSize: '11.5px', color: 'var(--muted)' }}
                              onClick={() => setFormChoices(['تغليف قياسي', 'تغليف هدية'])}
                            >
                              قالب: تغليف قياسي / هدية
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn s"
                              style={{ fontSize: '11.5px', color: 'var(--muted)' }}
                              onClick={() => setFormChoices(['خبز بريوش ذهبي', 'خبز بطاطا طري'])}
                            >
                              قالب: نوع الخبز
                            </button>
                            <button
                              type="button"
                              className="btn s"
                              style={{ fontSize: '11.5px', color: 'var(--muted)' }}
                              onClick={() => setFormChoices(['عادي (بارد)', 'سبايسي حار 🔥'])}
                            >
                              قالب: عادي / سبايسي
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4 */}
            {itemEditorTab === 'extraInfo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '10px 0 14px',
                    borderBottom: '1px solid var(--mp-glass-divider, var(--line))',
                  }}
                >
                  <div style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--ink)' }}>
                    {terms.isStore ? 'ظهور المنتج في المتجر' : 'ظهور العنصر في المنيو'}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formPublished}
                    onClick={() => setFormPublished((p) => !p)}
                    className={`ios-switch ${formPublished ? 'on' : 'off'}`}
                  >
                    <span className="ios-switch-thumb" />
                  </button>
                </div>

                <label className="f" style={{ marginBottom: 0 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {terms.isStore ? (
                      <ShieldCheck size={15} style={{ color: '#10b981' }} />
                    ) : (
                      <AlertTriangle size={15} style={{ color: '#f59e0b' }} />
                    )}
                    <span>
                      {terms.isStore ? 'المواصفات والضمان (اختياري)' : 'مسببات الحساسية (اختياري)'}
                    </span>
                  </span>
                  <textarea
                    rows={3}
                    value={formAllergens}
                    onChange={(e) => setFormAllergens(e.target.value)}
                    placeholder={
                      terms.isStore
                        ? 'ضمان 12 شهراً...'
                        : 'الجلوتين، الألبان...'
                    }
                    className="mp-themed-input"
                  />
                </label>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '12px 0',
                    borderTop: '1px solid var(--mp-glass-divider, var(--line))',
                    borderBottom: '1px solid var(--mp-glass-divider, var(--line))',
                  }}
                >
                  <div style={{ fontSize: '15px', fontWeight: 800, color: formDineInOnly ? 'var(--brand-ink, #34D399)' : 'var(--ink)' }}>
                    فقط صالة (بدون توصيل أو سفري)
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formDineInOnly}
                    onClick={() => setFormDineInOnly((p) => !p)}
                    className={`ios-switch ${formDineInOnly ? 'on' : 'off'}`}
                  >
                    <span className="ios-switch-thumb" />
                  </button>
                </div>

                {!formDineInOnly && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 2px',
                      }}
                    >
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                        متاح للتوصيل
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!formNoDelivery}
                        onClick={() => setFormNoDelivery((p) => !p)}
                        className={`ios-switch ${!formNoDelivery ? 'on' : 'off'}`}
                      >
                        <span className="ios-switch-thumb" />
                      </button>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 2px',
                      }}
                    >
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                        متاح للاستلام
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!formNoPickup}
                        onClick={() => setFormNoPickup((p) => !p)}
                        className={`ios-switch ${!formNoPickup ? 'on' : 'off'}`}
                      >
                        <span className="ios-switch-thumb" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 5 */}
            {itemEditorTab === 'badges' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>
                    اختر شارة جاهزة أو اكتب نصاً مخصصاً
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(terms.isStore
                      ? [
                          { text: 'الأكثر مبيعاً', type: 'red' as const },
                          { text: 'عرض خاص', type: 'gold' as const },
                          { text: 'جديد', type: 'green' as const },
                          { text: 'كفالة رسمية', type: 'accent' as const },
                          { text: 'نسخة أصلية ✨', type: 'gold' as const },
                        ]
                      : [
                          { text: 'الأكثر طلباً', type: 'red' as const },
                          { text: 'جديد', type: 'green' as const },
                          { text: 'توقيع الشيف', type: 'gold' as const },
                          { text: 'مميز', type: 'accent' as const },
                          { text: 'مقرمش 🔥', type: 'red' as const },
                        ]
                    ).map((b) => (
                      <button
                        key={b.text}
                        type="button"
                        className={`btn s ${formBadgeText === b.text ? 'p' : ''}`}
                        onClick={() => {
                          setFormBadgeText(b.text);
                          setFormBadgeType(b.type);
                        }}
                      >
                        {b.text}
                      </button>
                    ))}
                    {formBadgeText && (
                      <button
                        type="button"
                        className="btn s d"
                        onClick={() => setFormBadgeText('')}
                      >
                        إزالة الشارة
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                  <label className="f" style={{ marginBottom: 0 }}>
                    نص البادج (اختياري)
                    <input
                      type="text"
                      value={formBadgeText}
                      onChange={(e) => setFormBadgeText(e.target.value)}
                      placeholder="مثال: الأكثر طلباً"
                      className="mp-themed-input"
                    />
                  </label>

                  <label className="f" style={{ marginBottom: 0 }}>
                    لون الشارة
                    <AppSelect
                      title="اختيار لون الشارة"
                      value={formBadgeType}
                      onChange={(val) => setFormBadgeType(val as 'red' | 'gold' | 'green' | 'accent')}
                      options={[
                        { value: 'accent', label: 'لون البراند الأساسي' },
                        { value: 'red', label: 'أحمر بارز' },
                        { value: 'gold', label: 'ذهبي' },
                        { value: 'green', label: 'أخضر' },
                      ]}
                    />
                  </label>
                </div>
              </div>
            )}
          </motion.div>

          {/* Centered Action Button (Create mode only; editing auto-saves live) */}
          {!editingItemId && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '20px',
              }}
            >
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
                {terms.isStore ? 'إضافة منتج' : 'إضافة عنصر'}
              </button>
            </div>
          )}
        </form>

        <MediaLibraryModal
          isOpen={showMediaLibrary}
          items={mediaLibraryItems}
          currentUrl={formImage}
          onSelect={(url) => setFormImage(url)}
          onUploadFiles={uploadImagesToLibrary}
          onDeleteItem={(mediaId) => {
            const target = mediaLibraryItems.find((m) => m.id === mediaId);
            if (target && target.url === formImage) {
              setFormImage('');
            }
            removeMediaLibraryItem(mediaId);
          }}
          onClose={() => setShowMediaLibrary(false)}
        />
      </motion.div>
    );
  }

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <motion.div
        className="mp-items-toolbar"
        {...dashSectionMotion(prefersReducedMotion, 0)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={openNewItemEditor}
            className={`${atItemLimit ? 'btn s' : 'btn p'} mp-items-add-btn`}
          >
            <span>{atItemLimit ? 'الحد مكتمل 🔒' : terms.isStore ? 'إضافة منتج' : 'إضافة عنصر'}</span>
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
              <span>تعبئة منتجات متجر جاهزة</span>
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
                  setSearchItemQuery('');
                }
                return next;
              });
            }}
            className={`mp-compass-btn ${showCompassSearch || searchItemQuery.trim() ? 'is-active' : ''}`}
            aria-label={terms.isStore ? 'بحث سريع في المنتجات' : 'بحث سريع في الأصناف'}
            title={terms.isStore ? 'بحث عن منتج' : 'بحث عن أكلة أو صنف'}
          >
            <Compass size={18} />
          </button>

          <div
            className={`mp-items-count-box ${atItemLimit ? 'is-limit' : ''}`}
            aria-label={`${terms.isStore ? 'عدد المنتجات' : 'عدد العناصر'} ${itemLimitText}`}
          >
            <span className="mp-items-count-label">{terms.isStore ? 'عدد المنتجات' : 'عدد العناصر'}</span>
            <span className="mp-items-count-divider" aria-hidden="true" />
            <span dir="ltr" className="mp-items-count-num tabular-nums">
              {itemLimitText}
            </span>
          </div>
        </div>
      </motion.div>

      {(showCompassSearch || Boolean(searchItemQuery.trim())) && (
        <div className="mp-compass-search-bar" dir="rtl">
          <Compass size={17} className="mp-compass-search-ico" />
          <input
            ref={compassInputRef}
            type="search"
            value={searchItemQuery}
            onChange={(e) => setSearchItemQuery(e.target.value)}
            placeholder={terms.isStore ? 'ابحث عن اسم منتج...' : 'ابحث عن أكلة أو صنف...'}
            aria-label={terms.isStore ? 'ابحث عن منتج' : 'ابحث عن أكلة أو صنف'}
            className="mp-compass-search-input"
          />
          {searchItemQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchItemQuery('');
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
        className="mp-items-cats-bar"
        {...dashSectionMotion(prefersReducedMotion, 0.08)}
      >
        <button
          type="button"
          className="mp-items-cats-arrow"
          onClick={() => scrollCategoryPills('right')}
          title="السابق"
          aria-label="السابق"
        >
          <ChevronRight size={15} />
        </button>

        <div ref={categoryScrollRef} className="mp-items-cats-scroll" role="tablist" aria-label="الأقسام">
          <button
            type="button"
            role="tab"
            aria-selected={filterCatId === 'all'}
            className={`mp-items-cat-tab ${filterCatId === 'all' ? 'is-active' : ''}`}
            onClick={(e) => {
              setFilterCatId('all');
              e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
          >
            <span>الكل</span>
            <span className="mp-items-cat-count tabular-nums">({allItems.length})</span>
          </button>

          {allCategories.map((c) => {
            const count = itemCountByCatMap.get(c.id) || 0;
            const isSelected = filterCatId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`mp-items-cat-tab ${isSelected ? 'is-active' : ''}`}
                onClick={(e) => {
                  setFilterCatId(c.id);
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }}
              >
                <span>{c.n}</span>
                <span className="mp-items-cat-count tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="mp-items-cats-arrow"
          onClick={() => scrollCategoryPills('left')}
          title="التالي"
          aria-label="التالي"
        >
          <ChevronLeft size={15} />
        </button>
      </motion.div>

      <motion.div
        className="mp-items-list"
        {...dashSectionMotion(prefersReducedMotion, 0.16)}
      >
        {displayItems.map((item) => {
          const catObj = catByIdMap.get(item.cat);
          const nowDate = new Date(nowMs);
          const activePause = getActiveManualPause(item, nowDate);
          const isItemVisible = !activePause;
          const pauseStatusText = activePause ? formatManualPauseStatusLabel(activePause, nowDate) : '';
          const isBadgePause = activePause?.behavior === 'badge';
          const isDragging = draggingItemId === item.id;
          const hasSchedule = Boolean(item.availabilitySchedule?.enabled);
          const sizesCount = (item.sizes || []).length;
          return (
            <div
              key={item.id}
              ref={(el) => {
                if (el) {
                  rowRefs.current.set(item.id, el);
                } else {
                  rowRefs.current.delete(item.id);
                }
              }}
              className={`mp-item-card mp-food-item-card ${!isItemVisible ? 'is-hidden-item' : ''}`}
              style={
                draggingItemId
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
                <div className="mp-item-lead">
                  {canReorder && (
                    <button
                      type="button"
                      className="mp-item-drag-btn"
                      onPointerDown={(e) => startHandleDrag(e, item.id)}
                      title={terms.isStore ? 'اسحب لتحريك المنتج للأعلى أو للأسفل' : 'اسحب لتحريك العنصر للأعلى أو للأسفل'}
                      aria-label={terms.isStore ? `تحريك منتج ${item.n}` : `تحريك عنصر ${item.n}`}
                      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                    >
                      <SixDotDragHandle />
                    </button>
                  )}

                  {item.img ? (
                    <img
                      src={item.img}
                      alt={item.n}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="mp-item-thumb"
                    />
                  ) : (
                    <div className="mp-item-thumb-placeholder" aria-hidden="true">
                      <ImageIcon size={20} strokeWidth={1.7} />
                    </div>
                  )}
                </div>

                <div className="mp-item-info">
                  <div className="mp-item-title">{item.n}</div>

                  <div className="mp-item-price-wrap">

                  {quickPriceItemId === item.id ? (
                    <div
                      className="mp-item-quick-price"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="number"
                        min={0}
                        step={250}
                        dir="ltr"
                        autoFocus
                        value={quickPriceDraft}
                        onChange={(e) => setQuickPriceDraft(e.target.value)}
                        onBlur={() => {
                          if (quickPriceDraft.trim() !== '' && Number(quickPriceDraft) !== Number(item.pr ?? 0)) {
                            if (handleQuickUpdateItemPrice(item, Number(quickPriceDraft))) {
                              setQuickPriceItemId(null);
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (handleQuickUpdateItemPrice(item, Number(quickPriceDraft))) {
                              setQuickPriceItemId(null);
                            }
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setQuickPriceItemId(null);
                          }
                        }}
                        aria-label={`تعديل سريع لسعر ${item.n}`}
                      />
                      <button
                        type="button"
                        className="mp-item-quick-save"
                        onClick={() => {
                          if (handleQuickUpdateItemPrice(item, Number(quickPriceDraft))) {
                            setQuickPriceItemId(null);
                          }
                        }}
                        title="تأكيد السعر"
                        aria-label="تأكيد السعر"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        className="mp-item-quick-cancel"
                        onClick={() => setQuickPriceItemId(null)}
                        title="إلغاء"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="mp-item-price-btn"
                        onClick={() => {
                          setQuickPriceItemId(item.id);
                          setQuickPriceDraft(String(item.pr ?? 0));
                        }}
                        title="اضغط للتعديل السريع على السعر"
                      >
                        <span className="tabular-nums">
                          {sizesCount > 0 ? `من ${formatNumber(item.pr)} ${currency}` : `${formatNumber(item.pr)} ${currency}`}
                        </span>
                        <Edit size={12} style={{ opacity: 0.8, flexShrink: 0 }} />
                      </button>

                      {pauseStatusText && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
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
                  )}
                  </div>
                </div>
              </div>

              <div className="desktop-inline-only mp-item-cat-col">
                {catObj?.n || 'بدون قسم'}
              </div>

              <div className="mp-item-actions">
                <div className="mp-item-visibility-wrap">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isItemVisible}
                    aria-label={
                      isItemVisible
                        ? terms.isStore
                          ? 'إطفاء وإخفاء المنتج'
                          : 'إطفاء وإخفاء العنصر'
                        : terms.isStore
                        ? 'تشغيل وإظهار المنتج'
                        : 'تشغيل وإظهار العنصر'
                    }
                    title={
                      isItemVisible
                        ? terms.isStore
                          ? 'ظاهر في المتجر — اضغط للإطفاء'
                          : 'ظاهر في المنيو — اضغط للإطفاء'
                        : `${pauseStatusText || 'مطفأ'} — اضغط للتشغيل`
                    }
                    onClick={() => handleToggleItemVisibility(item)}
                    className={`ios-switch sm ${isItemVisible ? 'on' : 'off'}`}
                  >
                    <span className="ios-switch-thumb" />
                  </button>
                </div>

                <div className="mp-item-action-btns">
                  <button
                    type="button"
                    className={`mp-item-icon-btn ${hasSchedule ? 'is-scheduled' : ''}`}
                    onClick={() => openScheduleModal(item)}
                    title={terms.isStore ? 'تعيين وقت توفر المنتج' : 'تعيين وقت توفر العنصر'}
                    aria-label={terms.isStore ? 'تعيين وقت توفر المنتج' : 'تعيين وقت توفر العنصر'}
                  >
                    <Clock size={15} />
                  </button>

                  <button
                    type="button"
                    className="mp-item-icon-btn"
                    onClick={() => handleEditItem(item)}
                    title={terms.isStore ? 'تعديل المنتج' : 'تعديل العنصر'}
                    aria-label={`تعديل ${item.n}`}
                  >
                    <Edit size={15} />
                  </button>

                  <button
                    type="button"
                    className="mp-item-icon-btn"
                    onClick={() => handleDeleteItem(item)}
                    title={terms.isStore ? 'حذف المنتج' : 'حذف العنصر'}
                    aria-label={`حذف ${item.n}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Dedicated Schedule / Timer Modal opened from the row Clock button */}
      {scheduleModalItem && (() => {
        const schedModalNode = (
          <div
            onClick={() => setScheduleModalItem(null)}
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
              aria-label={`توقيت توفر: ${scheduleModalItem.n}`}
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
              className="mp-modal-card"
              style={{
                width: 'min(480px, 100%)',
                maxHeight: 'calc(100dvh - 32px)',
                overflowY: 'auto',
                borderRadius: '28px',
                padding: '18px 16px 20px',
                boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
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
                {`توقيت توفر: ${scheduleModalItem.n}`}
              </h3>
              <button
                type="button"
                onClick={() => setScheduleModalItem(null)}
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
                  if (scheduleModalItem) {
                    handleSaveItemSchedule(scheduleModalItem, next);
                  }
                }}
                targetLabel={terms.isStore ? 'المنتج' : 'العنصر'}
                flat
              />

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setScheduleModalItem(null)}
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

      {showBatchModal && (() => {
        const batchModalNode = (
          <div
            onClick={() => setShowBatchModal(false)}
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
              aria-label={terms.isStore ? 'إضافة منتجات سريعة بالجملة' : 'إضافة عناصر سريعة بالجملة'}
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
              className="mp-modal-card"
              style={{
                width: 'min(480px, 100%)',
                maxHeight: 'calc(100dvh - 32px)',
                overflowY: 'auto',
                borderRadius: '28px',
                padding: '24px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
              }}
            >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--brand-ink, #34D399)', margin: 0 }}>
                {terms.isStore ? 'إضافة منتجات سريعة بالجملة ✨' : 'إضافة عناصر سريعة بالجملة ✨'}
              </h3>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '13.5px', color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
              {terms.isStore ? 'أدخل كل منتج في سطر منفصل بصيغة: ' : 'أدخل كل عنصر في سطر منفصل بصيغة: '}
              <b>الاسم - السعر - الوصف</b>
            </p>

            <label className="f">
              {terms.isStore ? 'قائمة المنتجات' : 'قائمة العناصر'}
              <textarea
                value={batchLinesInput}
                onChange={(e) => setBatchLinesInput(e.target.value)}
                placeholder={
                  terms.isStore
                    ? 'سماعة بلوتوث لاسلكية - 35000 - صوت نقي وعزل ضوضاء\nشاحن سريع 65 واط - 25000 - منفذ Type-C PD'
                    : 'برجر دبل تشيز - 8500 - لحم طازج مع جبنة شيدر\nبيتزا مارجريتا - 9000 - عجينة إيطالية وموتزاريلا'
                }
                rows={5}
                className="mp-themed-input"
              />
            </label>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn" onClick={() => setShowBatchModal(false)}>
                إلغاء
              </button>
              <button type="button" className="btn p" onClick={handleBatchAddItems} style={{ fontWeight: 800 }}>
                {terms.isStore ? 'إضافة المنتجات للمتجر' : 'إضافة العناصر للمنيو'}
              </button>
            </div>
            </motion.div>
          </div>
        );
        return typeof document !== 'undefined' ? createPortal(batchModalNode, document.body) : batchModalNode;
      })()}
    </div>
  );
};
