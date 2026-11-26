/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  CalendarClock,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  MapPin,
  MessageCircle,
  Phone,
  Store,
  Trash2,
  Truck,
  User,
  Utensils,
  X,
} from 'lucide-react';
import { Order } from '../../types';
import { copyTextReliable, formatNumber, waLink } from '../../utils/storage';
import { useDashboard } from './DashboardContext';
import { dashModalMotion, dashRowMotion, dashSectionMotion } from '../../utils/dashboardMotion';

function formatOrderDayAndTime(order: Order): string {
  const locale = 'ar-IQ-u-nu-latn';
  const rawTs = Number(order.at || 0);
  const parsedCreatedAt = !rawTs && order.createdAt ? Date.parse(order.createdAt) : NaN;
  const ts = rawTs > 0 ? rawTs : Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : 0;

  if (ts > 0) {
    const dt = new Date(ts);
    try {
      const dayPart = dt.toLocaleDateString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
      });
      const timePart = dt.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${dayPart} • ${timePart}`;
    } catch {
      return `${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  return order.createdAt || '—';
}

function getOrderTypeInfo(order: Order, isStore = false) {
  const rawType = order.type || order.cu?.orderType || 'delivery';
  const tableVal = String(order.table || order.cu?.table || '').trim();

  if (rawType === 'table') {
    const base = isStore ? 'داخل المعرض' : 'طاولة';
    return {
      key: 'table' as const,
      label: tableVal ? `${base} (${tableVal})` : base,
      Icon: isStore ? Store : Utensils,
    };
  }
  if (rawType === 'pickup') {
    return {
      key: 'pickup' as const,
      label: isStore ? 'استلام من المعرض' : 'استلام',
      Icon: Store,
    };
  }
  return {
    key: 'delivery' as const,
    label: 'توصيل',
    Icon: Truck,
  };
}

function getOrderStatusOptions() {
  return [
    { value: 'new', text: 'جديد', bg: '#ea580c' },
    { value: 'preparing', text: 'قيد التجهيز', bg: '#f59e0b' },
    { value: 'ready', text: 'جاهز', bg: '#3b82f6' },
    { value: 'delivering', text: 'قيد التوصيل', bg: '#8b5cf6' },
    { value: 'completed', text: 'مكتمل', bg: '#10b981' },
    { value: 'cancelled', text: 'ملغي', bg: '#ef4444' },
  ] as const;
}

function getNormalizedOrderStatus(order: Order): string {
  const raw = String(order.st || order.status || 'new').toLowerCase();
  if (raw === 'pending' || raw === 'new') return 'new';
  if (raw === 'preparing') return 'preparing';
  if (raw === 'ready') return 'ready';
  if (raw === 'delivering') return 'delivering';
  if (raw === 'completed') return 'completed';
  return 'cancelled';
}

function getOrderStatusInfo(order: Order) {
  const opts = getOrderStatusOptions();
  const key = getNormalizedOrderStatus(order);
  return opts.find((s) => s.value === key) || opts[0];
}

function getOrderDisplayNumber(order: Order): string {
  return order.orderSeq || order.seq
    ? `#${order.orderSeq || order.seq}`
    : `#${order.id.slice(-6).toUpperCase()}`;
}

function extractOrderLinks(
  order: Order,
  restName: string
): Array<{ label: string; url: string; kind: 'whatsapp' | 'map' | 'web' }> {
  const links: Array<{ label: string; url: string; kind: 'whatsapp' | 'map' | 'web' }> = [];
  const seen = new Set<string>();

  const addLink = (label: string, url: string, kind: 'whatsapp' | 'map' | 'web') => {
    const clean = String(url || '').trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    links.push({ label, url: clean, kind });
  };

  const ordName = order.name || order.cu?.n || '';
  const ordPhone = order.phone || order.cu?.ph || '';
  if (ordPhone) {
    addLink(
      'مراسلة الزبون عبر واتساب',
      waLink(
        ordPhone,
        `مرحباً ${ordName}، بخصوص طلبك ${getOrderDisplayNumber(order)} من ${restName}:`
      ),
      'whatsapp'
    );
  }

  const lat = order.lat ?? order.cu?.lat;
  const lng = order.lng ?? order.cu?.lng;
  if (lat && lng) {
    addLink(
      'موقع الزبون على خرائط Google',
      `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`,
      'map'
    );
  }

  const directMap = order.mapUrl || order.locationUrl || order.cu?.mapUrl || order.cu?.locationUrl;
  if (typeof directMap === 'string' && /^https?:\/\//i.test(directMap.trim())) {
    addLink('رابط الموقع المرفق', directMap.trim(), 'map');
  }

  const textPool = [
    order.address,
    order.cu?.address,
    order.notes,
    order.cu?.nt,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ');

  const urlMatches = textPool.match(/https?:\/\/[^\s]+/gi) || [];
  urlMatches.forEach((rawUrl, idx) => {
    const cleanUrl = rawUrl.replace(/[),.;]+$/, '');
    const isMap = /maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(cleanUrl);
    addLink(
      isMap ? 'رابط خرائط Google' : `رابط مرفق #${idx + 1}`,
      cleanUrl,
      isMap ? 'map' : 'web'
    );
  });

  return links;
}

interface MemoOrderRowProps {
  order: Order;
  idx: number;
  isStore: boolean;
  currency: string;
  restName: string;
  prefersReducedMotion: boolean | null;
  onOpenStatusPicker: (id: string) => void;
  onOpenDetails: (id: string) => void;
}

const MemoOrderRowCard: React.FC<MemoOrderRowProps> = React.memo(
  ({
    order,
    idx,
    isStore,
    currency,
    restName,
    prefersReducedMotion,
    onOpenStatusPicker,
    onOpenDetails,
  }) => {
    const ordName = order.name || order.cu?.n || '';
    const ordPhone = order.phone || order.cu?.ph || '';
    const typeInfo = getOrderTypeInfo(order, isStore);
    const TypeIcon = typeInfo.Icon;
    const statusInfo = getOrderStatusInfo(order);
    const displayOrderNum = getOrderDisplayNumber(order);
    const dateTimeLabel = formatOrderDayAndTime(order);
    const totalAmount = formatNumber(order.tot || order.total || 0);

    return (
      <motion.div
        className={`mp-order-row is-status-${statusInfo.value}`}
        style={{ '--order-status-color': statusInfo.bg } as React.CSSProperties}
        {...dashRowMotion(prefersReducedMotion, idx, true)}
      >
        <div className="mp-order-top-line">
          <div className="mp-order-meta-group">
            <span className="mp-order-num tabular-nums">{displayOrderNum}</span>

            <span className="mp-order-type-chip">
              <TypeIcon size={12} style={{ color: 'var(--brand-ink, #34D399)', flexShrink: 0 }} />
              <span>{typeInfo.label}</span>
            </span>
          </div>

          <div className="mp-order-end-group">
            <span className="mp-order-price tabular-nums">
              {totalAmount} {currency}
            </span>

            <button
              type="button"
              className="mp-order-status-btn"
              onClick={() => onOpenStatusPicker(order.id)}
              aria-label={`تغيير حالة الطلب ${displayOrderNum}`}
              title="تغيير حالة الطلب"
              style={{
                background: statusInfo.bg,
                borderColor: statusInfo.bg,
                color: '#ffffff',
              }}
            >
              <span>{statusInfo.text}</span>
              <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.9 }} aria-hidden="true" />
            </button>

            {ordPhone && (
              <a
                href={waLink(
                  ordPhone,
                  `مرحباً ${ordName}، بخصوص طلبك ${displayOrderNum} من ${restName}:`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="mp-order-icon-btn is-wa"
                title="مراسلة الزبون عبر واتساب"
                aria-label={`مراسلة الزبون عبر واتساب للطلب ${displayOrderNum}`}
              >
                <MessageCircle size={15} />
              </a>
            )}

            <button
              type="button"
              className="mp-order-icon-btn"
              onClick={() => onOpenDetails(order.id)}
              title="تفاصيل الطلب"
              aria-label={`تفاصيل الطلب ${displayOrderNum}`}
            >
              <Eye size={15} />
            </button>
          </div>
        </div>

        <div className="mp-order-bottom-line">
          <span className="mp-order-datetime tabular-nums">
            <CalendarClock size={12} style={{ flexShrink: 0, opacity: 0.8 }} />
            <span>{dateTimeLabel}</span>
          </span>

          <span className="mp-order-customer-mini">{ordName || 'زبون'}</span>
        </div>
      </motion.div>
    );
  }
);

export const OrdersPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const {
    rest,
    terms,
    currency,
    allOrders,
    filteredOrders,
    newOrdersCount,
    orderFilter,
    setOrderFilter,
    handleUpdateOrderStatus,
    handleDeleteOrder,
    handleCompleteAllOrders,
    showToast,
  } = useDashboard();

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusPickerOrderId, setStatusPickerOrderId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(50);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleLimit(50);
  }, [orderFilter]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleLimit((prev) => prev + 50);
        }
      },
      { rootMargin: '280px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filteredOrders.length, orderFilter]);

  const selectedOrder = useMemo(
    () => (selectedOrderId ? allOrders.find((o) => o.id === selectedOrderId) || null : null),
    [allOrders, selectedOrderId]
  );
  const statusPickerOrder = useMemo(
    () => (statusPickerOrderId ? allOrders.find((o) => o.id === statusPickerOrderId) || null : null),
    [allOrders, statusPickerOrderId]
  );

  const { completedOrdersCount, incompleteOrdersCount } = useMemo(() => {
    let completed = 0;
    let incomplete = 0;
    for (let i = 0; i < allOrders.length; i++) {
      const st = String(allOrders[i].st || allOrders[i].status || 'new');
      if (st === 'completed') completed++;
      else if (st !== 'cancelled') incomplete++;
    }
    return { completedOrdersCount: completed, incompleteOrdersCount: incomplete };
  }, [allOrders]);

  const statusOptions = useMemo(() => getOrderStatusOptions(), []);
  const handleOpenStatusPicker = useCallback((id: string) => setStatusPickerOrderId(id), []);
  const handleOpenOrderDetails = useCallback((id: string) => setSelectedOrderId(id), []);

  return (
    <div className="mp-page-container">
      <motion.div
        className="mp-orders-toolbar"
        {...dashSectionMotion(prefersReducedMotion, 0)}
      >
        <div className="mp-orders-tabs" role="tablist" aria-label="تصفية الطلبات">
          <button
            type="button"
            role="tab"
            aria-selected={orderFilter === 'all'}
            className={`mp-orders-tab ${orderFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setOrderFilter('all')}
          >
            <span>الكل</span>
            <span className="mp-orders-tab-count tabular-nums">({allOrders.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={orderFilter === 'new'}
            className={`mp-orders-tab ${orderFilter === 'new' ? 'is-active' : ''}`}
            onClick={() => setOrderFilter('new')}
          >
            <span>جديد</span>
            <span className="mp-orders-tab-count tabular-nums">({newOrdersCount})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={orderFilter === 'completed'}
            className={`mp-orders-tab ${orderFilter === 'completed' ? 'is-active' : ''}`}
            onClick={() => setOrderFilter('completed')}
          >
            <span>مكتمل</span>
            <span className="mp-orders-tab-count tabular-nums">({completedOrdersCount})</span>
          </button>
        </div>
        {incompleteOrdersCount > 0 && (
          <button
            type="button"
            className="btn p"
            onClick={() => void handleCompleteAllOrders()}
            style={{
              height: '38px',
              borderRadius: '999px',
              padding: '0 14px',
              fontSize: '12.5px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              flexShrink: 0,
            }}
          >
            <CheckCheck size={15} />
            <span>أكمل كل الطلبات ({incompleteOrdersCount})</span>
          </button>
        )}
      </motion.div>

      {filteredOrders.length === 0 ? (
        <div className="mp-surface-card mp-empty-state-card">
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>📦</div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px', color: 'var(--ink)' }}>
            لا توجد طلبات في هذا التصنيف حالياً
          </h3>
          <p style={{ fontSize: '13.5px', margin: 0, color: 'var(--muted)' }}>
            {terms.isStore
              ? 'عندما يقوم الزبائن بالطلب عبر المتجر ستظهر طلباتهم هنا فوراً.'
              : 'عندما يقوم الزبائن بالطلب عبر المنيو ستظهر طلباتهم هنا فوراً.'}
          </p>
        </div>
      ) : (
        <div className="mp-orders-list">
          {filteredOrders.slice(0, visibleLimit).map((order, idx) => (
            <MemoOrderRowCard
              key={order.id}
              order={order}
              idx={idx}
              isStore={terms.isStore}
              currency={currency}
              restName={rest.n}
              prefersReducedMotion={prefersReducedMotion}
              onOpenStatusPicker={handleOpenStatusPicker}
              onOpenDetails={handleOpenOrderDetails}
            />
          ))}
          {filteredOrders.length > visibleLimit && <div ref={loadMoreRef} style={{ height: '1px' }} />}
        </div>
      )}

      {selectedOrder && (() => {
        const ordName = selectedOrder.name || selectedOrder.cu?.n || '';
        const ordPhone = selectedOrder.phone || selectedOrder.cu?.ph || '';
        const ordAddr = selectedOrder.address || selectedOrder.cu?.address || '';
        const ordNotes = selectedOrder.notes || selectedOrder.cu?.nt || '';
        const ordArea = selectedOrder.cu?.area || selectedOrder.area || '';
        const ordCity = selectedOrder.cu?.city || selectedOrder.city || '';
        const ordTable = selectedOrder.table || selectedOrder.cu?.table || '';
        const deliveryFee = Number(selectedOrder.cu?.deliveryFee ?? selectedOrder.deliveryFee ?? 0);
        const typeInfo = getOrderTypeInfo(selectedOrder, terms.isStore);
        const TypeIcon = typeInfo.Icon;
        const statusInfo = getOrderStatusInfo(selectedOrder);
        const displayOrderNum = getOrderDisplayNumber(selectedOrder);
        const dateTimeLabel = formatOrderDayAndTime(selectedOrder);
        const orderLinks = extractOrderLinks(selectedOrder, rest.n);
        const whatsappLink = orderLinks.find((l) => l.kind === 'whatsapp');
        const mapLink = orderLinks.find((l) => l.kind === 'map');
        const extraWebLinks = orderLinks.filter((l) => l.kind === 'web');
        const orderItems = selectedOrder.items || [];
        const totalQty = orderItems.reduce((acc, it) => acc + Number(it.q || 1), 0);
        const orderTotalFormatted = formatNumber(selectedOrder.tot || selectedOrder.total || 0);

        const areaCity = [ordArea, ordCity].filter(Boolean).join(' - ');
        const fullLocation = [areaCity, ordAddr].filter(Boolean).join(' — ');

        const metaFacts: string[] = [];
        if (ordTable) {
          metaFacts.push(`${terms.isStore ? 'رقم المعرض' : 'طاولة'} ${ordTable}`);
        }
        if (selectedOrder.scheduledSlot) {
          metaFacts.push(`الموعد: ${selectedOrder.scheduledSlot}`);
        }
        if (typeof selectedOrder.needCutlery === 'boolean') {
          metaFacts.push(
            terms.isStore
              ? `تغليف: ${selectedOrder.needCutlery ? 'نعم' : 'لا'}`
              : `أدوات: ${selectedOrder.needCutlery ? 'نعم' : 'لا'}`
          );
        }

        const modalContent = (
          <div
            className="mp-order-modal-overlay"
            dir="rtl"
            onClick={() => setSelectedOrderId(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`طلب ${displayOrderNum}`}
              className="mp-od-sheet"
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
            >
              {/* 1. Compact Header + Hero Total */}
              <div className="mp-od-head">
                <div className="mp-od-head-top">
                  <div className="mp-od-title-group">
                    <h3 className="mp-od-num tabular-nums">{`طلب ${displayOrderNum}`}</h3>
                    <span
                      className="mp-od-status-pill"
                      style={{ background: statusInfo.bg }}
                    >
                      {statusInfo.text}
                    </span>
                    <span className="mp-od-type-meta">
                      <TypeIcon size={12} style={{ color: 'var(--brand-ink, #34D399)' }} />
                      <span>{typeInfo.label}</span>
                    </span>
                  </div>

                  <div className="mp-od-head-actions">
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteOrder(selectedOrder.id, () => {
                          setSelectedOrderId(null);
                          setStatusPickerOrderId(null);
                        })
                      }
                      title="حذف الطلب"
                      aria-label="حذف الطلب"
                      className="mp-od-icon-action is-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedOrderId(null)}
                      aria-label="إغلاق"
                      className="mp-od-icon-action"
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>

                <div className="mp-od-hero-sub">
                  <span className="mp-od-time tabular-nums">
                    <CalendarClock size={12} />
                    <span>{dateTimeLabel}</span>
                  </span>
                  <span className="mp-od-hero-total tabular-nums">
                    {orderTotalFormatted} {currency}
                  </span>
                </div>
              </div>

              {/* 2. Scrollable Body */}
              <div className="mp-od-body">
                {/* Customer & Location Summary */}
                <div className="mp-od-block">
                  <div className="mp-od-customer-row">
                    <div className="mp-od-customer-name">
                      <User size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                      <span>{ordName || 'زبون'}</span>
                    </div>

                    {ordPhone && (
                      <div className="mp-od-phone-wrap">
                        <a
                          href={`tel:${ordPhone}`}
                          dir="ltr"
                          className="mp-od-phone-link tabular-nums"
                        >
                          {ordPhone}
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            void copyTextReliable(ordPhone).then((ok) => {
                              showToast(ok ? 'تم نسخ الرقم ✓' : 'تعذر النسخ');
                            });
                          }}
                          title="نسخ الرقم"
                          aria-label="نسخ رقم الهاتف"
                          className="mp-od-copy-btn"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  {fullLocation && (
                    <div className="mp-od-line-row">
                      <MapPin size={13} style={{ color: 'var(--brand-ink, #34D399)', flexShrink: 0, marginTop: '2px' }} />
                      <span>{fullLocation}</span>
                    </div>
                  )}

                  {metaFacts.length > 0 && (
                    <div className="mp-od-meta-inline">
                      {metaFacts.join('  ·  ')}
                    </div>
                  )}

                  {ordNotes && (
                    <div className="mp-od-note-box">
                      <strong>ملاحظة:</strong> {ordNotes}
                    </div>
                  )}

                  {/* Quick 1-Row Contact Bar */}
                  {(whatsappLink || ordPhone || mapLink || extraWebLinks.length > 0) && (
                    <div className="mp-od-quick-actions">
                      {whatsappLink && (
                        <a
                          href={whatsappLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mp-od-action-btn is-wa"
                        >
                          <MessageCircle size={14} />
                          <span>واتساب</span>
                        </a>
                      )}
                      {ordPhone && (
                        <a href={`tel:${ordPhone}`} className="mp-od-action-btn">
                          <Phone size={14} />
                          <span>اتصال</span>
                        </a>
                      )}
                      {mapLink && (
                        <a
                          href={mapLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mp-od-action-btn"
                        >
                          <MapPin size={14} />
                          <span>الموقع</span>
                        </a>
                      )}
                      {extraWebLinks.map((lk, idx) => (
                        <a
                          key={idx}
                          href={lk.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mp-od-action-btn"
                        >
                          <ExternalLink size={14} />
                          <span>{extraWebLinks.length > 1 ? `رابط ${idx + 1}` : 'رابط'}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Items Receipt */}
                <div className="mp-od-block">
                  <div className="mp-od-receipt-head">
                    <span>
                      <FileText size={13} />
                      <span>الأصناف ({totalQty})</span>
                    </span>
                  </div>

                  <div className="mp-od-items-list">
                    {orderItems.map((it, idx) => {
                      const extrasList = Array.isArray(it.extras)
                        ? it.extras
                            .map((ex: any) => (typeof ex === 'string' ? ex : ex?.n || ''))
                            .filter(Boolean)
                        : [];
                      const choicesList = Array.isArray(it.choices) ? it.choices.filter(Boolean) : [];
                      const detailsParts = [it.size, ...choicesList, ...extrasList].filter(Boolean);

                      return (
                        <div key={idx} className="mp-od-item-row">
                          <div className="mp-od-item-main">
                            <div className="mp-od-item-name">
                              <span className="mp-od-item-qty tabular-nums">{it.q}×</span>
                              <span>{it.n}</span>
                            </div>
                            {detailsParts.length > 0 && (
                              <div className="mp-od-item-sub">
                                {detailsParts.join(' · ')}
                              </div>
                            )}
                            {it.notes && (
                              <div className="mp-od-item-note">
                                ملاحظة: {it.notes}
                              </div>
                            )}
                          </div>
                          <span className="mp-od-item-price tabular-nums">
                            {formatNumber((it.pr || it.p || 0) * it.q)} {currency}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mp-od-totals">
                    {deliveryFee > 0 && (
                      <div className="mp-od-total-row">
                        <span>التوصيل</span>
                        <span className="tabular-nums">{formatNumber(deliveryFee)} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.serviceFee || 0) > 0 && (
                      <div className="mp-od-total-row">
                        <span>الخدمة والتغليف</span>
                        <span className="tabular-nums">{formatNumber(selectedOrder.serviceFee)} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.tipAmount || 0) > 0 && (
                      <div className="mp-od-total-row">
                        <span>إكرامية</span>
                        <span className="tabular-nums">{formatNumber(selectedOrder.tipAmount)} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.itemsDiscountTotal || 0) > 0 && (
                      <div className="mp-od-total-row is-discount">
                        <span>خصم الأصناف{selectedOrder.menuDiscountLabel ? ` (${selectedOrder.menuDiscountLabel})` : ''}</span>
                        <span className="tabular-nums">-{formatNumber(Number(selectedOrder.itemsDiscountTotal || 0))} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.discount || 0) > 0 && (
                      <div className="mp-od-total-row is-discount">
                        <span>خصم{selectedOrder.couponCode ? ` (${selectedOrder.couponCode})` : ''}</span>
                        <span className="tabular-nums">-{formatNumber(Number(selectedOrder.discount || 0))} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.firstOrderDiscount || 0) > 0 && (
                      <div className="mp-od-total-row is-discount">
                        <span>خصم الطلب الأول</span>
                        <span className="tabular-nums">-{formatNumber(Number(selectedOrder.firstOrderDiscount || 0))} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.spinDiscount || 0) > 0 && (
                      <div className="mp-od-total-row is-discount">
                        <span>{selectedOrder.spinRewardLabel || 'خصم عجلة الحظ'}</span>
                        <span className="tabular-nums">-{formatNumber(Number(selectedOrder.spinDiscount || 0))} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.pickupDiscount || 0) > 0 && (
                      <div className="mp-od-total-row is-discount">
                        <span>{selectedOrder.pickupDiscountLabel || 'خصم الاستلام'}</span>
                        <span className="tabular-nums">-{formatNumber(Number(selectedOrder.pickupDiscount || 0))} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.dineInDiscount || 0) > 0 && (
                      <div className="mp-od-total-row is-discount">
                        <span>{selectedOrder.dineInDiscountLabel || 'خصم على طلبات الصالة'}</span>
                        <span className="tabular-nums">-{formatNumber(Number(selectedOrder.dineInDiscount || 0))} {currency}</span>
                      </div>
                    )}

                    {selectedOrder.freeGiftName && (
                      <div className="mp-od-total-row is-gift">
                        <span>هدية مجانية</span>
                        <span>{selectedOrder.freeGiftName}</span>
                      </div>
                    )}

                    <div className="mp-od-grand-total">
                      <span>الإجمالي</span>
                      <span className="tabular-nums" style={{ color: 'var(--brand-ink, #34D399)' }}>
                        {orderTotalFormatted} {currency}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Sticky Compact Status Footer */}
              <div className="mp-od-footer">
                <div className="mp-od-status-grid">
                  {statusOptions.map((opt) => {
                    const active = statusInfo.value === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleUpdateOrderStatus(selectedOrder.id, opt.value)}
                        className={`mp-od-status-btn ${active ? 'is-active' : ''}`}
                        style={
                          active
                            ? {
                                background: opt.bg,
                                borderColor: opt.bg,
                                color: '#ffffff',
                              }
                            : {
                                borderColor: `color-mix(in srgb, ${opt.bg} 30%, var(--line))`,
                              }
                        }
                      >
                        <span
                          className="mp-order-status-circle"
                          style={{ background: active ? '#ffffff' : opt.bg }}
                          aria-hidden="true"
                        />
                        <span>{opt.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        );

        return typeof document !== 'undefined'
          ? createPortal(modalContent, document.body)
          : modalContent;
      })()}

      {statusPickerOrder && (() => {
        const currentStatus = getOrderStatusInfo(statusPickerOrder);
        const displayNum = getOrderDisplayNumber(statusPickerOrder);
        const pickerModal = (
          <div
            className="mp-order-modal-overlay"
            dir="rtl"
            onClick={() => setStatusPickerOrderId(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`تغيير حالة الطلب ${displayNum}`}
              className="mp-status-picker-card"
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
            >
              <div className="mp-status-picker-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <h4 className="mp-status-picker-title tabular-nums">
                    {`حالة الطلب ${displayNum}`}
                  </h4>
                  <span
                    className="mp-order-status-dot"
                    style={{ background: currentStatus.bg }}
                  >
                    {currentStatus.text}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusPickerOrderId(null)}
                  aria-label="إغلاق"
                  className="mp-status-picker-close"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="mp-status-picker-list">
                {statusOptions.map((opt) => {
                  const isActive = currentStatus.value === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        handleUpdateOrderStatus(statusPickerOrder.id, opt.value);
                        setStatusPickerOrderId(null);
                      }}
                      className={`mp-status-picker-option ${isActive ? 'is-active' : ''}`}
                      style={
                        isActive
                          ? {
                              background: opt.bg,
                              borderColor: opt.bg,
                              color: '#ffffff',
                            }
                          : {
                              borderColor: `color-mix(in srgb, ${opt.bg} 34%, var(--mp-glass-border, var(--line)))`,
                              background: `color-mix(in srgb, ${opt.bg} 12%, var(--mp-glass-control, rgba(255,255,255,0.06)))`,
                            }
                      }
                    >
                      <span className="mp-status-picker-opt-main">
                        <span
                          className="mp-order-status-circle"
                          style={{ background: isActive ? '#ffffff' : opt.bg }}
                          aria-hidden="true"
                        />
                        <span>{opt.text}</span>
                      </span>
                      {isActive && <Check size={14} strokeWidth={2.75} aria-hidden="true" />}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    const targetId = statusPickerOrder.id;
                    setStatusPickerOrderId(null);
                    handleDeleteOrder(targetId, () => {
                      if (selectedOrderId === targetId) setSelectedOrderId(null);
                    });
                  }}
                  className="mp-status-picker-option"
                  style={{
                    borderColor: 'rgba(239, 68, 68, 0.42)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    marginTop: '4px',
                  }}
                >
                  <span className="mp-status-picker-opt-main">
                    <Trash2 size={14} strokeWidth={2.3} aria-hidden="true" />
                    <span>حذف الطلب نهائياً</span>
                  </span>
                </button>
              </div>
            </motion.div>
          </div>
        );

        return typeof document !== 'undefined'
          ? createPortal(pickerModal, document.body)
          : pickerModal;
      })()}
    </div>
  );
};
