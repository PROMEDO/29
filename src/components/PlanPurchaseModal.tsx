/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Check, Copy, CreditCard, MessageCircle, Smartphone, Sparkles, X } from 'lucide-react';
import { PricingPlan, SiteSettings, SupportedLanguage } from '../types';
import { copyTextReliable, waLink } from '../utils/storage';
import { getLocalizedCurrencyUnit, trByLang } from '../utils/i18n';
import { getLocalizedPlanName } from '../utils/plans';

interface PlanPurchaseModalProps {
  isOpen: boolean;
  plan: PricingPlan | null;
  site: SiteSettings;
  billingCycle?: 'monthly' | 'annual';
  restaurantName?: string;
  lang?: SupportedLanguage;
  onClose: () => void;
}

export const PlanPurchaseModal: React.FC<PlanPurchaseModalProps> = ({
  isOpen,
  plan,
  site,
  billingCycle = 'monthly',
  restaurantName,
  lang = 'ar',
  onClose,
}) => {
  const tr = (ar: string, ku: string, en: string) => trByLang(lang, ar, ku, en);
  const [copiedKey, setCopiedKey] = useState<'zain' | 'qi' | null>(null);

  if (!isOpen || !plan) return null;

  const isAnnual = billingCycle === 'annual';
  const planTitle = getLocalizedPlanName(plan, lang);
  const currencyUnit = getLocalizedCurrencyUnit('د.ع', lang);
  const priceValue = isAnnual
    ? Number(plan.annualPr || Math.round((Number(plan.pr) || 0) * 11))
    : Number(plan.pr || 0);
  const zainCashAccount = String(site.zainCashNumber || site.supportWhatsapp || site.wa || '07724799679').trim();
  const qiCardAccount = String(site.qiCardNumber || '5284 7100 3920 1188').trim();
  const supportPhone = String(site.supportWhatsapp || site.wa || '07724799679').trim();

  const handleCopy = async (val: string, key: 'zain' | 'qi') => {
    const ok = await copyTextReliable(val);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2200);
    }
  };

  const whatsappMessage = [
    tr(
      `مرحباً فريق Menu Plus، أرغب بالاشتراك وتفعيل باقة "${planTitle}".`,
      `سڵاو تیمی Menu Plus، دەمەوێت بەشداری بکەم و پاکێجی "${planTitle}" چالاک بکەم.`,
      `Hello Menu Plus team, I would like to subscribe and activate the "${planTitle}" plan.`
    ),
    restaurantName ? `${tr('اسم المشروع', 'ناوی پڕۆژە', 'Business name')}: ${restaurantName}` : '',
    `${tr('دورة الفوترة', 'خولی پارەدان', 'Billing cycle')}: ${
      isAnnual
        ? tr('سنوي (11 شهر + شهر مجاني)', 'ساڵانە (١١ مانگ + ١ مانگی بەخۆڕایی)', 'Annual (11 months + 1 month free)')
        : tr('شهري', 'مانگانە', 'Monthly')
    }`,
    priceValue > 0 ? `${tr('المبلغ المطلوب', 'بڕی پێویست', 'Amount due')}: ${priceValue.toLocaleString('en-US')} ${currencyUnit}` : '',
    tr(
      'سأقوم بتحويل المبلغ عبر زين كاش / كي كارد وإرسال وصل الدفع لتفعيل الباقة.',
      'بڕە پارەکە لە ڕێگەی زەین کاش / کی کاردەوە دەنێرم و پسووڵەی پارەدان دەنێرم بۆ چالاککردنی پاکێجەکە.',
      'I will transfer the amount via ZainCash / QiCard and send the payment receipt to activate the plan.'
    ),
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div
      className="ajax-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr(`شراء وتفعيل ${planTitle}`, `کڕین و چالاککردنی ${planTitle}`, `Buy and activate ${planTitle}`)}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ajax-box"
        style={{
          maxWidth: '470px',
          textAlign: 'start',
          padding: '22px',
          borderRadius: '28px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            paddingBottom: '14px',
            borderBottom: '1px solid var(--mp-glass-divider)',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <Sparkles size={20} style={{ color: 'var(--brand-ink, var(--brand))', flexShrink: 0 }} />
            <h3 style={{ margin: 0, fontSize: '18.5px', fontWeight: 900 }}>
              {tr('شراء وتفعيل الباقة', 'کڕین و چالاککردنی پاکێج', 'Purchase & Activate Plan')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('إغلاق', 'داخستن', 'Close')}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '999px',
              border: '1px solid var(--mp-glass-border)',
              background: 'var(--mp-glass-control)',
              color: 'var(--muted)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Plan Price Summary */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '18px',
            border: '1px solid color-mix(in srgb, var(--brand) 36%, var(--mp-glass-border))',
            background: 'color-mix(in srgb, var(--brand) 12%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px' }}>{planTitle}</div>
            <div className="muted" style={{ fontSize: '13.5px', marginTop: '2px' }}>
              {isAnnual
                ? tr('اشتراك سنوي', 'بەشداریی ساڵانە', 'Annual')
                : tr('اشتراك شهري', 'بەشداریی مانگانە', 'Monthly')}
            </div>
          </div>
          <div style={{ fontWeight: 900, fontSize: '20px', color: 'var(--brand-ink, var(--brand))' }} className="tabular-nums">
            {priceValue > 0 ? `${priceValue.toLocaleString('en-US')} ${currencyUnit}` : tr('مجاناً', 'بەخۆڕایی', 'Free')}
          </div>
        </div>

        {/* ZainCash & QiCard Details */}
        <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '6px', color: 'var(--muted)' }}>
          {tr('طرق الدفع المتوفرة', 'ڕێگاکانی پارەدان', 'Payment methods')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '12px 2px',
              borderBottom: '1px solid var(--mp-glass-divider)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <Smartphone size={20} style={{ color: '#10b981', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '14.5px' }}>
                  {tr('زين كاش (ZainCash)', 'زەین کاش (ZainCash)', 'ZainCash')}
                </div>
                <div dir="ltr" className="tabular-nums" style={{ fontSize: '14px', color: 'var(--muted)', marginTop: '2px' }}>
                  {zainCashAccount}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn s"
              onClick={() => void handleCopy(zainCashAccount, 'zain')}
              style={{ minHeight: '36px', padding: '5px 12px', fontSize: '13.5px' }}
            >
              {copiedKey === 'zain' ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedKey === 'zain' ? tr('تم النسخ', 'کۆپی کرا', 'Copied') : tr('نسخ', 'کۆپی', 'Copy')}</span>
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '12px 2px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <CreditCard size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '14.5px' }}>
                  {tr('كي كارد (QiCard)', 'کی کارد (QiCard)', 'QiCard')}
                </div>
                <div dir="ltr" className="tabular-nums" style={{ fontSize: '14px', color: 'var(--muted)', marginTop: '2px' }}>
                  {qiCardAccount}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn s"
              onClick={() => void handleCopy(qiCardAccount.replace(/\s+/g, ''), 'qi')}
              style={{ minHeight: '36px', padding: '5px 12px', fontSize: '13.5px' }}
            >
              {copiedKey === 'qi' ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedKey === 'qi' ? tr('تم النسخ', 'کۆپی کرا', 'Copied') : tr('نسخ', 'کۆپی', 'Copy')}</span>
            </button>
          </div>
        </div>

        <p className="muted" style={{ fontSize: '13.5px', margin: '0 0 16px', lineHeight: 1.55 }}>
          {(lang === 'ar' && site.paymentNote) ||
            tr(
              'أرسل وصل التحويل عبر واتساب للتفعيل الفوري.',
              'پسووڵەی پارەدان لە واتساپ بنێرە بۆ چالاککردنی خێرا.',
              'Send your transfer receipt via WhatsApp to activate.'
            )}
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <a
            href={waLink(supportPhone, whatsappMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn p"
            style={{
              flex: 1,
              minHeight: '44px',
              fontSize: '15px',
              background: '#1f9d55',
              borderColor: '#15803d',
              color: '#ffffff',
              justifyContent: 'center',
            }}
          >
            <MessageCircle size={17} />
            <span>{tr('تواصل عبر واتساب', 'پەیوەندی لە واتساپ', 'WhatsApp')}</span>
          </a>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            style={{ minHeight: '44px', fontSize: '15px', padding: '0 18px' }}
          >
            {tr('إغلاق', 'داخستن', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};
