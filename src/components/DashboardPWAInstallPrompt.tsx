/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Download, MoreVertical, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import type { PushPermissionState } from '../utils/pwaPush';

interface DashboardPWAInstallProps {
  restaurantName: string;
  branchName?: string;
  storageKeyId?: string;
  showToast: (msg: string) => void;
}

const DISMISS_KEY = 'mp_dash_pwa_banner_dismissed';

export const DashboardPWAInstallBanner: React.FC<DashboardPWAInstallProps> = ({
  restaurantName,
  branchName,
  storageKeyId,
  showToast,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const resolvedDismissKey = storageKeyId ? `${DISMISS_KEY}_${storageKeyId}` : DISMISS_KEY;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem(resolvedDismissKey) === '1';
    } catch {
      return false;
    }
  });
  const [guideOpen, setGuideOpen] = useState(false);

  if (isInstalled || dismissed) {
    return null;
  }

  const targetTitle = branchName ? `${restaurantName} (${branchName})` : restaurantName;

  const handleInstallClick = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (outcome === 'accepted') {
        showToast('تم تثبيت لوحة التحكم كتطبيق بنجاح ✓');
      }
      return;
    }
    setGuideOpen(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(resolvedDismissKey, '1');
    } catch {
      // ignore storage errors
    }
  };

  return (
    <>
      <div className="mp-pwa-banner" dir="rtl">
        <div className="mp-pwa-banner-info">
          <div className="mp-pwa-banner-ico" aria-hidden="true">
            <Smartphone size={21} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="mp-pwa-banner-title">ثبّت لوحة التحكم كتطبيق</div>
          </div>
        </div>

        <div className="mp-pwa-banner-actions">
          <button
            type="button"
            className="mp-pwa-install-btn"
            onClick={() => void handleInstallClick()}
          >
            <Download size={15} />
            <span>تثبيت التطبيق</span>
          </button>

          <button
            type="button"
            className="mp-pwa-dismiss-btn"
            onClick={handleDismiss}
            aria-label="إخفاء إشعار التثبيت"
            title="إخفاء"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {guideOpen && (
        <InstallGuideModal
          isIOS={isIOS}
          restaurantName={targetTitle}
          onClose={() => setGuideOpen(false)}
        />
      )}
    </>
  );
};

export const DashboardPushPermissionBanner: React.FC<{
  permission: PushPermissionState;
  onEnable: () => void;
}> = ({ permission, onEnable }) => {
  const [dismissed, setDismissed] = useState(false);

  if (permission !== 'default' || dismissed) {
    return null;
  }

  return (
    <div className="mp-pwa-banner" dir="rtl" style={{ marginBottom: '12px' }}>
      <div className="mp-pwa-banner-info">
        <div className="mp-pwa-banner-ico" aria-hidden="true">
          <Bell size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="mp-pwa-banner-title">تفعيل إشعارات الطلبات الفورية</div>
        </div>
      </div>

      <div className="mp-pwa-banner-actions">
        <button
          type="button"
          className="mp-pwa-install-btn"
          onClick={onEnable}
        >
          <Bell size={15} />
          <span>تفعيل الإشعارات</span>
        </button>

        <button
          type="button"
          className="mp-pwa-dismiss-btn"
          onClick={() => setDismissed(true)}
          aria-label="إغلاق"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
};

export const DashboardSidebarInstallButton: React.FC<
  DashboardPWAInstallProps & { onAction?: () => void }
> = ({ restaurantName, branchName, showToast, onAction }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [guideOpen, setGuideOpen] = useState(false);

  if (isInstalled) {
    return null;
  }

  const targetTitle = branchName ? `${restaurantName} (${branchName})` : restaurantName;

  const handleClick = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (outcome === 'accepted') {
        showToast('تم تثبيت لوحة التحكم كتطبيق بنجاح ✓');
        onAction?.();
      }
      return;
    }
    setGuideOpen(true);
  };

  const handleCloseGuide = () => {
    setGuideOpen(false);
    onAction?.();
  };

  return (
    <>
      <button
        type="button"
        className="sb-footer-item mp-sb-pwa-btn"
        onClick={() => void handleClick()}
      >
        <Download size={17} style={{ color: 'var(--brand-ink, #10b981)', flexShrink: 0 }} />
        <span>ثبّت لوحة التحكم كتطبيق</span>
      </button>

      {guideOpen && (
        <InstallGuideModal
          isIOS={isIOS}
          restaurantName={targetTitle}
          onClose={handleCloseGuide}
        />
      )}
    </>
  );
};

const InstallGuideModal: React.FC<{
  isIOS: boolean;
  restaurantName: string;
  onClose: () => void;
}> = ({ isIOS, restaurantName, onClose }) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="mp-modal-backdrop"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: 'rgba(2, 6, 23, 0.68)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          borderRadius: '28px',
          padding: '22px',
          background: 'var(--mp-glass-bg-elevated)',
          backdropFilter: 'blur(13px) saturate(1.45)',
          WebkitBackdropFilter: 'blur(13px) saturate(1.45)',
          border: '1px solid var(--mp-glass-border)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
          color: 'var(--ink)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid var(--mp-glass-divider)', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Smartphone size={22} style={{ color: 'var(--brand-ink, var(--brand))', flexShrink: 0 }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>
                تثبيت التطبيق
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                {restaurantName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '999px',
              border: '1px solid var(--mp-glass-border)',
              background: 'var(--mp-glass-control)',
              color: 'var(--muted)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {isIOS ? (
          <ol
            style={{
              margin: '12px 0 18px',
              paddingInlineStart: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              fontSize: '14.5px',
              lineHeight: 1.6,
              color: 'var(--ink)',
            }}
          >
            <li>
              اضغط على زر <b>المشاركة</b>{' '}
              <Share size={15} style={{ display: 'inline', verticalAlign: 'middle', color: 'var(--brand-ink, var(--brand))' }} />{' '}
              في Safari.
            </li>
            <li>
              اختر <b>إضافة إلى الشاشة الرئيسية</b>.
            </li>
            <li>
              اضغط <b>إضافة</b>.
            </li>
          </ol>
        ) : (
          <ol
            style={{
              margin: '12px 0 18px',
              paddingInlineStart: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              fontSize: '14.5px',
              lineHeight: 1.6,
              color: 'var(--ink)',
            }}
          >
            <li>
              افتح قائمة المتصفح{' '}
              <MoreVertical size={15} style={{ display: 'inline', verticalAlign: 'middle' }} />
            </li>
            <li>
              اختر <b>تثبيت التطبيق</b> أو <b>إضافة للشاشة الرئيسية</b>.
            </li>
          </ol>
        )}

        <button
          type="button"
          className="btn p"
          onClick={onClose}
          style={{ width: '100%', height: '44px', borderRadius: '999px', fontSize: '15px', fontWeight: 800 }}
        >
          حسناً
        </button>
      </div>
    </div>,
    document.body
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div
      dir="rtl"
      role="status"
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderRadius: '999px',
        background: '#d97706',
        color: '#ffffff',
        padding: '8px 14px',
        fontSize: '12px',
        fontWeight: 800,
        boxShadow: '0 10px 28px rgba(0, 0, 0, 0.28)',
      }}
    >
      <WifiOff size={14} />
      <span>وضع عدم الاتصال — يتم استخدام البيانات المحفوظة</span>
    </div>
  );
};
