/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { LoyaltyCustomer, OrderType, RestaurantAddons } from '../../types';
import type { ActiveMenuDiscount } from '../../data/addonsCatalog';
import { formatNumber } from '../../utils/storage';

export interface MenuPromoTicketItem {
  id: string;
  kind: 'discount' | 'free_delivery' | 'loyalty' | 'location';
  eyebrow: string;
  title: string;
  footer: string;
  isUnlocked?: boolean;
  modalTitle: string;
  minOrderText?: string;
  maxDiscountText?: string;
  rewardNote?: string;
  pointsPerThousand?: number;
  loyaltyBalance?: number;
  loyaltyCustomerName?: string;
  loyaltyCustomerPhone?: string;
  restaurantName?: string;
  currency?: string;
  canSwitchToTable?: boolean;
  isTableSelected?: boolean;
  googleMapsUrl?: string;
  wazeUrl?: string;
}

export interface BuildMenuPromoTicketsInput {
  addons: RestaurantAddons;
  activeMenuDiscount: ActiveMenuDiscount;
  orderType: OrderType;
  currency: string;
  formatMoney: (amt: number) => string;
  firstOrderPct?: number;
  pickupPct?: number;
  canSelectTable?: boolean;
  freeDeliveryEnabled?: boolean;
  freeDeliveryMin?: number;
  qualifiesFreeDelivery?: boolean;
  spinFreeDelivery?: boolean;
  minOrderEnabled?: boolean;
  minOrderAmount?: number;
  loyaltyBalance?: number;
  loyaltyCustomerName?: string;
  loyaltyCustomerPhone?: string;
  restaurantName?: string;
  googleMapsUrl?: string;
  wazeUrl?: string;
}

function normalizeSafeMapUrl(raw?: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function buildMenuPromoTickets({
  addons,
  activeMenuDiscount,
  orderType,
  currency,
  formatMoney,
  firstOrderPct = 0,
  pickupPct = 0,
  canSelectTable = false,
  freeDeliveryEnabled = false,
  freeDeliveryMin = 0,
  qualifiesFreeDelivery = false,
  spinFreeDelivery = false,
  minOrderEnabled = false,
  minOrderAmount = 0,
  loyaltyBalance = 0,
  loyaltyCustomerName = '',
  loyaltyCustomerPhone = '',
  restaurantName = '',
  googleMapsUrl = '',
  wazeUrl = '',
}: BuildMenuPromoTicketsInput): MenuPromoTicketItem[] {
  const tickets: MenuPromoTicketItem[] = [];
  const resolveMinOrderText = (addonMin = 0) => {
    const effectiveMin = addonMin > 0 ? addonMin : minOrderEnabled && minOrderAmount > 0 ? minOrderAmount : 0;
    return effectiveMin > 0 ? formatMoney(effectiveMin) : 'لا يوجد حد أدنى';
  };

  if (addons.loyaltyPoints?.enabled) {
    const pts = Math.max(1, Number(addons.loyaltyPoints.pointsPerThousand) || 1);
    const customNote = (addons.loyaltyPoints.rewardNote || '').trim();
    const cleanName = loyaltyCustomerName.trim();
    const cleanPhone = loyaltyCustomerPhone.trim();
    const hasRegistered = Boolean(cleanPhone);

    tickets.push({
      id: 'promo-loyalty',
      kind: 'loyalty',
      eyebrow: cleanName || `${formatNumber(pts)} نقطة / 1,000 ${currency}`,
      title: hasRegistered ? `${formatNumber(loyaltyBalance)} نقطة` : 'بطاقة النقاط',
      footer: hasRegistered ? 'بطاقتك مفعّلة ✓' : 'سجّل واجمع نقاط',
      isUnlocked: hasRegistered,
      modalTitle: hasRegistered ? `بطاقة نقاط ${cleanName || 'الزبون'}` : 'بطاقة النقاط والمكافآت',
      rewardNote: customNote || 'اجمع نقاط مع كل طلب واستبدلها بمكافآت مجانية',
      pointsPerThousand: pts,
      loyaltyBalance,
      loyaltyCustomerName: cleanName,
      loyaltyCustomerPhone: cleanPhone,
      restaurantName,
      currency,
    });
  }

  if (activeMenuDiscount.active && activeMenuDiscount.value > 0) {
    const isFixed = activeMenuDiscount.type === 'fixed';
    const discountLabel = isFixed
      ? `خصم ${formatMoney(activeMenuDiscount.value)}`
      : `خصم ${formatNumber(activeMenuDiscount.value)}٪`;
    const isLimitedTakeaway = activeMenuDiscount.sourceType === 'limitedTime';
    const eyebrow =
      activeMenuDiscount.sourceType === 'happyHour'
        ? 'ساعة السعادة'
        : isLimitedTakeaway
        ? 'خصم على طلبات السفري'
        : activeMenuDiscount.sourceType === 'countdown'
        ? addons.countdownTimer?.title?.trim() || 'على طلبك القادم'
        : 'على طلبك القادم';
    const maxCap = Math.max(0, Number(activeMenuDiscount.maxDiscountAmount || 0));
    const minReq = Math.max(0, Number(activeMenuDiscount.minOrderAmount || 0));

    tickets.push({
      id: 'promo-active-discount',
      kind: 'discount',
      eyebrow,
      title: discountLabel,
      footer: 'يُطبق تلقائياً',
      modalTitle: isLimitedTakeaway
        ? maxCap > 0 && !isFixed
          ? `خصم ${formatNumber(activeMenuDiscount.value)}٪ على طلبات السفري لغاية ${formatMoney(maxCap)}`
          : `خصم ${formatNumber(activeMenuDiscount.value)}٪ على طلبات السفري`
        : maxCap > 0 && !isFixed
        ? `خصم ${formatNumber(activeMenuDiscount.value)}٪ لغاية ${formatMoney(maxCap)}`
        : isFixed
        ? `خصم ${formatMoney(activeMenuDiscount.value)} على طلبك`
        : `خصم ${formatNumber(activeMenuDiscount.value)}٪ على طلبك`,
      minOrderText: resolveMinOrderText(minReq),
      maxDiscountText: maxCap > 0 ? formatMoney(maxCap) : 'لا يوجد حد أقصى',
    });
  }

  if (firstOrderPct > 0 && addons.firstOrderDiscount?.enabled) {
    const minReq = Math.max(0, Number(addons.firstOrderDiscount.minOrderAmount || 0));
    const maxCap = Math.max(0, Number(addons.firstOrderDiscount.maxDiscountAmount || 0));
    tickets.push({
      id: 'promo-first-order',
      kind: 'discount',
      eyebrow: 'على طلبك الأول',
      title: `خصم ${formatNumber(firstOrderPct)}٪`,
      footer: 'يُطبق تلقائياً',
      modalTitle:
        maxCap > 0
          ? `خصم ${formatNumber(firstOrderPct)}٪ لغاية ${formatMoney(maxCap)}`
          : `خصم ${formatNumber(firstOrderPct)}٪ على طلبك الأول`,
      minOrderText: resolveMinOrderText(minReq),
      maxDiscountText: maxCap > 0 ? formatMoney(maxCap) : 'لا يوجد حد أقصى',
    });
  }

  if (pickupPct > 0 && addons.pickupInstantDiscount?.enabled && orderType === 'pickup') {
    const minReq = Math.max(0, Number(addons.pickupInstantDiscount.minOrderAmount || 0));
    const maxCap = Math.max(0, Number(addons.pickupInstantDiscount.maxDiscountAmount || 0));
    tickets.push({
      id: 'promo-pickup-discount',
      kind: 'discount',
      eyebrow: 'عند الاستلام الذاتي',
      title: `خصم ${formatNumber(pickupPct)}٪`,
      footer: 'يُطبق تلقائياً',
      modalTitle:
        maxCap > 0
          ? `خصم ${formatNumber(pickupPct)}٪ لغاية ${formatMoney(maxCap)}`
          : `خصم ${formatNumber(pickupPct)}٪ عند الاستلام الذاتي`,
      minOrderText: resolveMinOrderText(minReq),
      maxDiscountText: maxCap > 0 ? formatMoney(maxCap) : 'لا يوجد حد أقصى',
    });
  }

  if (addons.dineInDiscount?.enabled) {
    const dineInPct = Math.max(0, Math.min(90, Number(addons.dineInDiscount.discountPercent ?? 10) || 10));
    if (dineInPct > 0) {
      const minReq = Math.max(0, Number(addons.dineInDiscount.minOrderAmount || 0));
      const maxCap = Math.max(0, Number(addons.dineInDiscount.maxDiscountAmount || 0));
      const rawTitle = (addons.dineInDiscount.title || '').trim();
      const eyebrowTitle =
        !rawTitle || rawTitle === 'خصم خاص لطلبات الصالة' || rawTitle === 'خصم طلبات الصالة'
          ? 'خصم على طلبات الصالة'
          : rawTitle;
      const isTableSelected = orderType === 'table';
      const safeGoogleMapsUrl = normalizeSafeMapUrl(googleMapsUrl);
      const safeWazeUrl = normalizeSafeMapUrl(wazeUrl);
      tickets.push({
        id: 'promo-dinein-discount',
        kind: 'discount',
        eyebrow: eyebrowTitle,
        title: `خصم ${formatNumber(dineInPct)}٪`,
        footer: isTableSelected ? 'مُفعّل لطلبك ✓' : 'عند الطلب داخل الصالة',
        isUnlocked: isTableSelected,
        modalTitle:
          maxCap > 0
            ? `خصم ${formatNumber(dineInPct)}٪ على طلبات الصالة لغاية ${formatMoney(maxCap)}`
            : `خصم ${formatNumber(dineInPct)}٪ على طلبات الصالة`,
        minOrderText: resolveMinOrderText(minReq),
        maxDiscountText: maxCap > 0 ? formatMoney(maxCap) : 'لا يوجد حد أقصى',
        canSwitchToTable: canSelectTable && !isTableSelected,
        isTableSelected,
        googleMapsUrl: safeGoogleMapsUrl || undefined,
        wazeUrl: safeWazeUrl || undefined,
        restaurantName,
      });
    }
  }

  if ((freeDeliveryEnabled || spinFreeDelivery) && orderType === 'delivery') {
    const hasMin = freeDeliveryMin > 0 && !spinFreeDelivery;
    const maxCap = Math.max(0, Number(addons.freeDeliveryProgress?.maxDiscountAmount || 0));
    tickets.push({
      id: 'promo-free-delivery',
      kind: 'free_delivery',
      eyebrow: hasMin ? `عند الطلب بـ ${formatMoney(freeDeliveryMin)}` : 'على طلبك القادم',
      title: 'توصيل مجاني',
      footer: qualifiesFreeDelivery ? 'مُفعّل لطلبك ✓' : 'يُطبق تلقائياً',
      isUnlocked: qualifiesFreeDelivery,
      modalTitle:
        maxCap > 0 ? `توصيل مجاني لغاية ${formatMoney(maxCap)}` : 'توصيل مجاني',
      minOrderText: hasMin ? formatMoney(freeDeliveryMin) : 'لا يوجد حد أدنى',
      maxDiscountText: maxCap > 0 ? formatMoney(maxCap) : 'لا يوجد حد أقصى',
    });
  }

  return tickets;
}

const SCALLOP_SEAL_PATH =
  'M14 1.2L16.7 3.1L19.9 2.4L21.3 5.4L24.5 6.3L24.4 9.6L26.8 11.9L25.2 14.8L26.2 18L23.4 19.7L22.8 23L19.5 23.3L17.4 25.9L14.3 24.6L11.2 26L9.1 23.4L5.8 23.1L5.2 19.8L2.4 18.1L3.4 14.9L1.8 12L4.2 9.7L4.1 6.4L7.3 5.5L8.7 2.5L11.9 3.2L14 1.2Z';

function ScallopedRedPercentBadge() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d={SCALLOP_SEAL_PATH} fill="#E12D39" />
      <circle cx="11.2" cy="11.2" r="1.45" stroke="#FFFFFF" strokeWidth="1.5" />
      <circle cx="16.8" cy="16.8" r="1.45" stroke="#FFFFFF" strokeWidth="1.5" />
      <path d="M17.2 10.6L10.8 17.4" stroke="#FFFFFF" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ScallopedRedDeliveryBadge() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d={SCALLOP_SEAL_PATH} fill="#E12D39" />
      <circle cx="9.8" cy="17.8" r="2.1" fill="#FFFFFF" />
      <circle cx="18.3" cy="17.8" r="2.1" fill="#FFFFFF" />
      <path
        d="M8.6 16.2H12.2L14.1 11.4H16.6M13.3 13.8H18.2C19 13.8 19.6 14.4 19.8 15.2L20.1 16.5H16.5"
        stroke="#FFFFFF"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="8.2" y="12.1" width="3.8" height="2.7" rx="0.8" fill="#FFFFFF" />
    </svg>
  );
}

function MintPlusSealBadge() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M5.4 6.2C7.4 4.1 10.5 3 14 3C20.1 3 25 7.9 25 14C25 20.1 20.1 25 14 25C7.9 25 3 20.1 3 14C3 11.4 3.9 9 5.4 7.1L4.6 5.2L6.8 5.6Z"
        fill="#00B67A"
      />
      <path
        d="M14 9.7V18.3M9.7 14H18.3"
        stroke="#FFFFFF"
        strokeWidth="2.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LocationPinSealBadge() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d={SCALLOP_SEAL_PATH} fill="#0284C7" />
      <path
        d="M14 8.2C11.4 8.2 9.4 10.2 9.4 12.7C9.4 16 14 20.2 14 20.2C14 20.2 18.6 16 18.6 12.7C18.6 10.2 16.6 8.2 14 8.2Z"
        fill="#FFFFFF"
      />
      <circle cx="14" cy="12.6" r="1.8" fill="#0284C7" />
    </svg>
  );
}

function GoogleMapsMiniIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2Z"
        fill="currentColor"
      />
      <circle cx="12" cy="9" r="2.6" fill="#FFFFFF" />
    </svg>
  );
}

function WazeMiniIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12.4 4C7.9 4 4.5 7.1 4.5 11.2C4.5 12.8 5 14.2 5.9 15.4C5.4 16.2 4.4 16.6 4.4 16.6C4.4 16.6 5.6 18.2 8.2 18.2H8.4C8.6 19.2 9.5 20 10.5 20C11.6 20 12.5 19.1 12.6 18H14.4C14.5 19.1 15.4 20 16.5 20C17.6 20 18.5 19.1 18.5 18C19.8 16.7 20.5 14.6 20.5 11.9C20.5 7.4 17 4 12.4 4Z"
        fill="currentColor"
      />
      <circle cx="10.2" cy="10.5" r="1.2" fill="#FFFFFF" />
      <circle cx="15.2" cy="10.5" r="1.2" fill="#FFFFFF" />
      <path d="M10.2 13.7C11 14.7 13.8 14.7 14.8 13.7" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function DiscountTags3DIllustration() {
  return (
    <svg width="96" height="92" viewBox="0 0 96 92" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="mpTagBack" x1="34" y1="16" x2="78" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E6F4EF" />
        </linearGradient>
        <linearGradient id="mpTagFront" x1="20" y1="22" x2="62" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#EEF2F6" />
        </linearGradient>
        <filter id="mpIllusShadow" x="0" y="0" width="96" height="92" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#0F172A" floodOpacity="0.12" />
        </filter>
      </defs>
      <ellipse cx="48" cy="81" rx="26" ry="5" fill="#0F172A" fillOpacity="0.08" />
      <g filter="url(#mpIllusShadow)">
        <g transform="rotate(-24 50 48)">
          <rect
            x="35"
            y="18"
            width="36"
            height="54"
            rx="9"
            fill="url(#mpTagBack)"
            stroke="#00B67A"
            strokeWidth="2.5"
          />
          <circle cx="53" cy="27" r="3.8" fill="#CBD5E1" />
        </g>
        <g transform="rotate(20 44 48)">
          <rect
            x="24"
            y="19"
            width="37"
            height="55"
            rx="10"
            fill="url(#mpTagFront)"
            stroke="#E2E8F0"
            strokeWidth="1.5"
          />
          <circle cx="42.5" cy="28.5" r="4.2" fill="#E2E8F0" />
          <circle cx="42.5" cy="28.5" r="2.2" fill="#94A3B8" />
        </g>
      </g>
      <path
        d="M36 22C33 13 38 7 43 9C47.5 10.8 47.5 18 44 23.5"
        stroke="#94A3B8"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <path
        d="M36.5 21.5C34 14 38.5 8.5 42.6 10"
        stroke="#E2E8F0"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <g transform="translate(18 47) scale(1.22)">
        <path
          d={SCALLOP_SEAL_PATH}
          fill="#E12D39"
          stroke="#FFFFFF"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="11.2" cy="11.2" r="1.45" stroke="#FFFFFF" strokeWidth="1.55" />
        <circle cx="16.8" cy="16.8" r="1.45" stroke="#FFFFFF" strokeWidth="1.55" />
        <path d="M17.2 10.6L10.8 17.4" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function DeliveryScooter3DIllustration() {
  return (
    <svg width="104" height="92" viewBox="0 0 104 92" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="mpScootBody" x1="26" y1="26" x2="78" y2="74" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>
        <linearGradient id="mpScootMint" x1="50" y1="36" x2="78" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14D196" />
          <stop offset="100%" stopColor="#009E6B" />
        </linearGradient>
      </defs>
      <ellipse cx="52" cy="80" rx="31" ry="5.5" fill="#0F172A" fillOpacity="0.1" />
      <path
        d="M17 44L14 50H19L16 56"
        stroke="#00B67A"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 41L21.5 46H25.5L23 51"
        stroke="#10B981"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="33" cy="69" r="9.5" fill="#1F2937" />
      <circle cx="33" cy="69" r="4.8" fill="#E2E8F0" />
      <circle cx="71" cy="69" r="9.5" fill="#1F2937" />
      <circle cx="71" cy="69" r="4.8" fill="#E2E8F0" />
      <path
        d="M52 43H70C75 43 79 46.5 80 51.5L82 62C82 65.5 79 68 74 68H57C53 68 50 66 49 62.5L47 52C46.5 46.5 48.5 43 52 43Z"
        fill="url(#mpScootBody)"
        stroke="#CBD5E1"
        strokeWidth="1.2"
      />
      <rect x="52" y="38" width="21" height="7" rx="3.5" fill="url(#mpScootMint)" />
      <path
        d="M28 64C27 52 32 39 39 34L42 22H47L44 37C42.5 46 44 57 48 63H31"
        fill="url(#mpScootBody)"
        stroke="#CBD5E1"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="37" cy="31" r="4.5" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.4" />
      <path d="M40 21H52" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
      <circle cx="53.5" cy="17.5" r="2.6" fill="#CBD5E1" />
      <path d="M48 21L52.5 18.5" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M35 62H68" stroke="#CBD5E1" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function LoyaltyMedal3DIllustration() {
  return (
    <svg width="96" height="92" viewBox="0 0 96 92" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="mpCoinGold" x1="50" y1="22" x2="78" y2="74" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="55%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <linearGradient id="mpMedalFace" x1="20" y1="26" x2="54" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>
      </defs>
      <ellipse cx="48" cy="80" rx="28" ry="5" fill="#0F172A" fillOpacity="0.08" />
      <path d="M41 18L44 10" stroke="#00B67A" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M49 20L55 13" stroke="#10B981" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="62" cy="68" rx="14" ry="5.5" fill="#B45309" />
      <ellipse cx="62" cy="64.5" rx="14" ry="5.5" fill="url(#mpCoinGold)" />
      <ellipse cx="62" cy="59.5" rx="14" ry="5.5" fill="#B45309" />
      <ellipse cx="62" cy="56" rx="14" ry="5.5" fill="url(#mpCoinGold)" />
      <ellipse cx="62" cy="51" rx="14" ry="5.5" fill="#D97706" />
      <ellipse cx="62" cy="48" rx="14" ry="5.5" fill="#FDE68A" />
      <circle cx="63" cy="36" r="14.5" fill="url(#mpCoinGold)" stroke="#FEF3C7" strokeWidth="1.5" />
      <circle cx="63" cy="36" r="10.5" stroke="#D97706" strokeOpacity="0.45" strokeWidth="1.2" />
      <path d="M29 53L25 75L35 69L41 75L42 54" fill="#00B67A" />
      <path d="M43 53L44 74L51 68L57 73L52 52" fill="#059669" />
      <circle cx="38" cy="43" r="18.5" fill="url(#mpMedalFace)" stroke="#E2E8F0" strokeWidth="1.6" />
      <circle cx="38" cy="43" r="14.5" stroke="#CBD5E1" strokeWidth="1.1" />
      <path
        d="M38 32.5L40.9 38.4L47.4 39.3L42.7 43.9L43.8 50.4L38 47.3L32.2 50.4L33.3 43.9L28.6 39.3L35.1 38.4L38 32.5Z"
        fill="#00B67A"
      />
    </svg>
  );
}

function LoyaltyCardCornerOrnament() {
  return (
    <svg
      className="mp-promo-loyalty-ornament"
      width="58"
      height="54"
      viewBox="0 0 58 54"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="36" cy="24" r="11" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.2" />
      <ellipse cx="36" cy="41" rx="10" ry="4" fill="#F59E0B" />
      <ellipse cx="36" cy="37" rx="10" ry="4" fill="#FDE68A" />
      <path d="M16 33L14 48L20 44L25 48L24 33" fill="#00B67A" />
      <circle cx="20" cy="27" r="12" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.2" />
      <path
        d="M20 20.5L21.9 24.3L26.1 24.9L23 27.9L23.8 32.1L20 30.1L16.2 32.1L17 27.9L13.9 24.9L18.1 24.3L20 20.5Z"
        fill="#00B67A"
      />
    </svg>
  );
}

function LocationMap3DIllustration() {
  return (
    <svg width="98" height="92" viewBox="0 0 98 92" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="mpMapTile" x1="16" y1="36" x2="82" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E0F2FE" />
          <stop offset="100%" stopColor="#BAE6FD" />
        </linearGradient>
        <linearGradient id="mpPinGrad" x1="36" y1="12" x2="62" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
      </defs>
      <ellipse cx="49" cy="81" rx="30" ry="5" fill="#0F172A" fillOpacity="0.1" />
      <rect x="17" y="40" width="64" height="36" rx="10" fill="url(#mpMapTile)" stroke="#FFFFFF" strokeWidth="2.2" />
      <path d="M22 58L41 50L57 62L76 47" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M49 14C39.6 14 32 21.4 32 30.6C32 42.4 49 58 49 58C49 58 66 42.4 66 30.6C66 21.4 58.4 14 49 14Z" fill="url(#mpPinGrad)" stroke="#FFFFFF" strokeWidth="2" />
      <circle cx="49" cy="30" r="6.5" fill="#FFFFFF" />
    </svg>
  );
}

interface MenuPromoTicketsProps {
  tickets: MenuPromoTicketItem[];
  isLightSurface?: boolean;
  className?: string;
  onRegisterLoyalty?: (
    name: string,
    phone: string
  ) => Promise<{ ok: boolean; customer?: LoyaltyCustomer; error?: string }>;
  onSwitchToTable?: () => void;
}

export const MenuPromoTickets: React.FC<MenuPromoTicketsProps> = ({
  tickets,
  isLightSurface = true,
  className = '',
  onRegisterLoyalty,
  onSwitchToTable,
}) => {
  const [activeTicket, setActiveTicket] = useState<MenuPromoTicketItem | null>(null);
  const [loyaltyNameDraft, setLoyaltyNameDraft] = useState('');
  const [loyaltyPhoneDraft, setLoyaltyPhoneDraft] = useState('');
  const [loyaltySaving, setLoyaltySaving] = useState(false);
  const [loyaltyFeedback, setLoyaltyFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [editingLoyaltyInfo, setEditingLoyaltyInfo] = useState(false);

  const liveActiveTicket = activeTicket
    ? tickets.find((tk) => tk.id === activeTicket.id) || activeTicket
    : null;

  useEffect(() => {
    if (!activeTicket) return;
    if (activeTicket.kind === 'loyalty') {
      setLoyaltyNameDraft(activeTicket.loyaltyCustomerName || '');
      setLoyaltyPhoneDraft(activeTicket.loyaltyCustomerPhone || '');
      setEditingLoyaltyInfo(!activeTicket.loyaltyCustomerPhone);
      setLoyaltyFeedback(null);
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveTicket(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTicket]);

  if (!tickets || tickets.length === 0) return null;

  const modeClass = isLightSurface ? 'is-light' : 'is-dark';

  const handleLoyaltySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRegisterLoyalty) return;
    const cleanName = loyaltyNameDraft.trim();
    const cleanPhone = loyaltyPhoneDraft.trim();
    if (!cleanName || cleanPhone.length < 7) {
      setLoyaltyFeedback({ type: 'err', text: 'يرجى كتابة الاسم ورقم الهاتف الصحيح.' });
      return;
    }
    setLoyaltySaving(true);
    setLoyaltyFeedback(null);
    try {
      const res = await onRegisterLoyalty(cleanName, cleanPhone);
      if (res.ok && res.customer) {
        setLoyaltyNameDraft(res.customer.name);
        setLoyaltyPhoneDraft(res.customer.phone);
        setEditingLoyaltyInfo(false);
        setLoyaltyFeedback({
          type: 'ok',
          text: `تم تفعيل بطاقتك بنجاح · رصيدك الحالي: ${formatNumber(res.customer.points)} نقطة`,
        });
      } else {
        setLoyaltyFeedback({ type: 'err', text: res.error || 'تعذر حفظ البطاقة حالياً.' });
      }
    } finally {
      setLoyaltySaving(false);
    }
  };

  return (
    <>
      <div
        className={`mp-promo-strip ${modeClass} ${className}`.trim()}
        aria-label="العروض والمكافآت"
      >
        {tickets.map((tk) => {
          const isLoyalty = tk.kind === 'loyalty';
          const isLocation = tk.kind === 'location';

          if (isLocation) {
            return (
              <div
                key={tk.id}
                role="button"
                tabIndex={0}
                className={`mp-promo-ticket ${modeClass} is-location`}
                onClick={() => setActiveTicket(tk)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveTicket(tk);
                  }
                }}
              >
                <span className="mp-promo-ticket-badge">
                  <LocationPinSealBadge />
                </span>

                <span className="mp-promo-ticket-eyebrow">{tk.eyebrow}</span>
                <strong className="mp-promo-ticket-title">{tk.title}</strong>

                <span className="mp-promo-ticket-divider" aria-hidden="true" />

                <div className="mp-promo-location-actions" onClick={(e) => e.stopPropagation()}>
                  {tk.googleMapsUrl && (
                    <a
                      href={tk.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mp-promo-loc-btn is-google"
                      title="فتح في خرائط كوكل"
                    >
                      <GoogleMapsMiniIcon />
                      <span>كوكل</span>
                    </a>
                  )}
                  {tk.wazeUrl && (
                    <a
                      href={tk.wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mp-promo-loc-btn is-waze"
                      title="فتح في ويز"
                    >
                      <WazeMiniIcon />
                      <span>ويز</span>
                    </a>
                  )}
                </div>
              </div>
            );
          }

          return (
            <button
              key={tk.id}
              type="button"
              className={`mp-promo-ticket ${modeClass} ${isLoyalty ? 'is-loyalty' : 'is-coupon'}`}
              onClick={() => setActiveTicket(tk)}
            >
              {isLoyalty && (
                <>
                  <svg
                    className="mp-promo-loyalty-wave"
                    viewBox="0 0 180 42"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path d="M0 16C45 4 95 28 180 10V42H0V16Z" fill="currentColor" />
                  </svg>
                  <LoyaltyCardCornerOrnament />
                </>
              )}

              <span className="mp-promo-ticket-badge">
                {tk.kind === 'loyalty' ? (
                  <MintPlusSealBadge />
                ) : tk.kind === 'free_delivery' ? (
                  <ScallopedRedDeliveryBadge />
                ) : (
                  <ScallopedRedPercentBadge />
                )}
              </span>

              <span className="mp-promo-ticket-eyebrow">{tk.eyebrow}</span>
              <strong className="mp-promo-ticket-title tabular-nums">{tk.title}</strong>

              <span className="mp-promo-ticket-divider" aria-hidden="true" />
              <span className={`mp-promo-ticket-footer ${tk.isUnlocked ? 'is-unlocked' : ''}`}>
                {tk.footer}
              </span>
            </button>
          );
        })}
      </div>

      {liveActiveTicket && (
        <div
          className={`mp-promo-sheet-backdrop ${modeClass}`}
          onClick={() => setActiveTicket(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mp-promo-sheet-title"
        >
          <div
            className={`mp-promo-sheet ${modeClass}`}
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mp-promo-sheet-handle" aria-hidden="true" />

            <div className="mp-promo-sheet-hero">
              {liveActiveTicket.kind === 'loyalty' ? (
                <LoyaltyMedal3DIllustration />
              ) : liveActiveTicket.kind === 'free_delivery' ? (
                <DeliveryScooter3DIllustration />
              ) : liveActiveTicket.kind === 'location' ? (
                <LocationMap3DIllustration />
              ) : (
                <DiscountTags3DIllustration />
              )}
            </div>

            <h2 id="mp-promo-sheet-title" className="mp-promo-sheet-title tabular-nums">
              {liveActiveTicket.modalTitle}
            </h2>

            {liveActiveTicket.kind === 'location' ? (
              <div className={`mp-promo-sheet-ticket-box ${modeClass}`}>
                <p className="mp-promo-sheet-loyalty-note" style={{ marginBottom: '14px' }}>
                  اختر تطبيق الخرائط المفضل للوصول إلى {liveActiveTicket.restaurantName || 'الموقع'} مباشرة
                </p>
                <div className="mp-promo-sheet-loc-grid">
                  {liveActiveTicket.googleMapsUrl && (
                    <a
                      href={liveActiveTicket.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mp-promo-sheet-loc-btn is-google"
                    >
                      <GoogleMapsMiniIcon />
                      <span>فتح في خرائط كوكل</span>
                    </a>
                  )}
                  {liveActiveTicket.wazeUrl && (
                    <a
                      href={liveActiveTicket.wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mp-promo-sheet-loc-btn is-waze"
                    >
                      <WazeMiniIcon />
                      <span>فتح في ويز (Waze)</span>
                    </a>
                  )}
                </div>
              </div>
            ) : liveActiveTicket.kind === 'loyalty' ? (
              <div className="mp-promo-loyalty-sheet-body">
                {/* Digital Loyalty Card Preview */}
                <div className={`mp-promo-loyalty-digital-card ${modeClass}`}>
                  <div className="mp-promo-loyalty-digital-top">
                    <div className="mp-promo-loyalty-digital-identity">
                      <span className="mp-promo-loyalty-digital-label">
                        {liveActiveTicket.restaurantName || 'بطاقة الولاء'}
                      </span>
                      <strong className="mp-promo-loyalty-digital-name">
                        {liveActiveTicket.loyaltyCustomerName || 'زائر جديد'}
                      </strong>
                      {liveActiveTicket.loyaltyCustomerPhone && (
                        <span className="mp-promo-loyalty-digital-phone tabular-nums" dir="ltr">
                          {liveActiveTicket.loyaltyCustomerPhone}
                        </span>
                      )}
                    </div>
                    <div className="mp-promo-loyalty-digital-pts">
                      <strong className="tabular-nums">
                        {formatNumber(liveActiveTicket.loyaltyBalance || 0)}
                      </strong>
                      <span>نقطة</span>
                    </div>
                  </div>
                  <div className="mp-promo-loyalty-digital-rule tabular-nums">
                    <span>
                      كل 1,000 {liveActiveTicket.currency || 'د.ع'} ={' '}
                      {formatNumber(liveActiveTicket.pointsPerThousand || 1)} نقطة
                    </span>
                    {onRegisterLoyalty && liveActiveTicket.loyaltyCustomerPhone && !editingLoyaltyInfo && (
                      <button
                        type="button"
                        className="mp-promo-loyalty-edit-btn"
                        onClick={() => setEditingLoyaltyInfo(true)}
                      >
                        تغيير الرقم
                      </button>
                    )}
                  </div>
                </div>

                {liveActiveTicket.rewardNote && (
                  <p className="mp-promo-sheet-loyalty-note" style={{ marginBottom: '12px' }}>
                    {liveActiveTicket.rewardNote}
                  </p>
                )}

                {onRegisterLoyalty && editingLoyaltyInfo && (
                  <form className={`mp-promo-loyalty-form ${modeClass}`} onSubmit={handleLoyaltySubmit}>
                    <div className="mp-promo-loyalty-form-title">
                      سجّل اسمك ورقم هاتفك لحساب نقاطك على كل طلب
                    </div>
                    <input
                      type="text"
                      value={loyaltyNameDraft}
                      onChange={(e) => setLoyaltyNameDraft(e.target.value)}
                      placeholder="الاسم الكامل"
                      required
                      className="mp-promo-loyalty-input"
                    />
                    <input
                      type="tel"
                      dir="ltr"
                      value={loyaltyPhoneDraft}
                      onChange={(e) => setLoyaltyPhoneDraft(e.target.value)}
                      placeholder="07XXXXXXXXX"
                      required
                      className="mp-promo-loyalty-input"
                      style={{ textAlign: 'left' }}
                    />
                    <button
                      type="submit"
                      disabled={loyaltySaving}
                      className="mp-promo-loyalty-submit"
                    >
                      {loyaltySaving ? 'جاري الحفظ...' : 'حفظ البطاقة وعرض النقاط'}
                    </button>
                  </form>
                )}

                {loyaltyFeedback && (
                  <div
                    className={`mp-promo-loyalty-feedback ${
                      loyaltyFeedback.type === 'ok' ? 'is-ok' : 'is-err'
                    }`}
                  >
                    {loyaltyFeedback.text}
                  </div>
                )}
              </div>
            ) : (
              <div className={`mp-promo-sheet-ticket-box ${modeClass}`}>
                <div className="mp-promo-sheet-ticket-grid">
                  <div className="mp-promo-sheet-ticket-cell">
                    <span className="mp-promo-sheet-cell-label">الحد الأدنى للطلب</span>
                    <strong className="mp-promo-sheet-cell-val tabular-nums">
                      {liveActiveTicket.minOrderText || 'لا يوجد حد أدنى'}
                    </strong>
                  </div>
                  <div className="mp-promo-sheet-ticket-cell">
                    <span className="mp-promo-sheet-cell-label">الحد الأقصى للخصم</span>
                    <strong className="mp-promo-sheet-cell-val tabular-nums">
                      {liveActiveTicket.maxDiscountText || 'لا يوجد حد أقصى'}
                    </strong>
                  </div>
                </div>
                {(liveActiveTicket.googleMapsUrl || liveActiveTicket.wazeUrl) && (
                  <>
                    <span className="mp-promo-sheet-ticket-divider" aria-hidden="true" />
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--mp-sheet-muted)',
                        marginBottom: '8px',
                      }}
                    >
                      موقع {liveActiveTicket.restaurantName || 'المطعم'} للوصول إلى الصالة
                    </div>
                    <div className="mp-promo-sheet-loc-grid">
                      {liveActiveTicket.googleMapsUrl && (
                        <a
                          href={liveActiveTicket.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mp-promo-sheet-loc-btn is-google"
                        >
                          <GoogleMapsMiniIcon />
                          <span>فتح في خرائط كوكل</span>
                        </a>
                      )}
                      {liveActiveTicket.wazeUrl && (
                        <a
                          href={liveActiveTicket.wazeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mp-promo-sheet-loc-btn is-waze"
                        >
                          <WazeMiniIcon />
                          <span>فتح في ويز (Waze)</span>
                        </a>
                      )}
                    </div>
                  </>
                )}
                <span className="mp-promo-sheet-ticket-divider" aria-hidden="true" />
                <div
                  className={`mp-promo-sheet-ticket-footer ${
                    liveActiveTicket.isUnlocked ? 'is-unlocked' : ''
                  }`}
                >
                  {liveActiveTicket.footer}
                </div>
              </div>
            )}

            {liveActiveTicket.canSwitchToTable && onSwitchToTable ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  className="mp-promo-sheet-cta"
                  onClick={() => {
                    onSwitchToTable();
                    setActiveTicket(null);
                  }}
                >
                  اختيار الطلب داخل الصالة وتفعيل الخصم
                </button>
                <button
                  type="button"
                  className={`mp-promo-sheet-secondary-cta ${modeClass}`}
                  onClick={() => setActiveTicket(null)}
                >
                  إغلاق
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="mp-promo-sheet-cta"
                onClick={() => setActiveTicket(null)}
              >
                حسناً
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

