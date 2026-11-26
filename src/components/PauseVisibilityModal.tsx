/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Ban, CalendarOff, Clock, EyeOff, PowerOff, X } from 'lucide-react';
import type { ManualPauseBehavior, ManualPauseDurationPreset } from '../types';
import { computePauseUntil, formatEpochTime12 } from '../utils/availability';
import { dashModalMotion } from '../utils/dashboardMotion';

export interface PauseModalTarget {
  kind: 'category' | 'item';
  id: string;
  name: string;
}

interface PauseVisibilityModalProps {
  target: PauseModalTarget | null;
  isStore?: boolean;
  onClose: () => void;
  onConfirm: (preset: ManualPauseDurationPreset, behavior: ManualPauseBehavior) => void;
}

const DURATION_OPTIONS: Array<{
  preset: ManualPauseDurationPreset;
  label: string;
}> = [
  { preset: '1h', label: 'لمدة ساعة' },
  { preset: '2h', label: 'لمدة ساعتين' },
  { preset: 'end_of_day', label: 'لنهاية اليوم' },
  { preset: 'end_of_week', label: 'لنهاية الأسبوع' },
  { preset: 'permanent', label: 'إطفاء كامل' },
];

export const PauseVisibilityModal: React.FC<PauseVisibilityModalProps> = ({
  target,
  isStore = false,
  onClose,
  onConfirm,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [preset, setPreset] = useState<ManualPauseDurationPreset | null>(null);
  const [behavior, setBehavior] = useState<ManualPauseBehavior | null>(null);

  useEffect(() => {
    if (!target) return;
    setPreset(null);
    setBehavior(null);
  }, [target?.id, target?.kind]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [target, onClose]);

  if (!target) return null;

  const targetNoun =
    target.kind === 'category' ? 'القسم' : isStore ? 'المنتج' : 'العنصر';

  const now = new Date();
  const previewUntil = preset ? computePauseUntil(preset, now) : null;
  const previewTimeLabel = previewUntil ? formatEpochTime12(previewUntil) : '';
  const canConfirm = Boolean(preset && behavior);

  const modalNode = (
    <div
      onClick={onClose}
      dir="rtl"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(2.5px)',
        WebkitBackdropFilter: 'blur(2.5px)',
        zIndex: 99999,
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`إطفاء ${targetNoun}: ${target.name}`}
        onClick={(e) => e.stopPropagation()}
        {...dashModalMotion(prefersReducedMotion)}
        style={{
          width: 'min(420px, 100%)',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          background: 'var(--mp-glass-bg-elevated, rgba(22, 32, 46, 0.9))',
          backdropFilter: 'blur(13px) saturate(1.45)',
          WebkitBackdropFilter: 'blur(13px) saturate(1.45)',
          border: '1px solid var(--mp-glass-border, rgba(255,255,255,0.16))',
          color: 'var(--ink)',
          borderRadius: '28px',
          padding: '20px',
          boxShadow: 'var(--mp-glass-shadow, 0 24px 60px rgba(0, 0, 0, 0.45))',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <PowerOff size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <h3
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 900,
                color: 'var(--ink)',
                lineHeight: 1.35,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {`إطفاء: ${target.name}`}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              background: 'var(--mp-glass-control, rgba(255,255,255,0.08))',
              border: '1px solid var(--mp-glass-border, rgba(255,255,255,0.14))',
              borderRadius: '999px',
              width: '34px',
              height: '34px',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--muted)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Step 1: Duration */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: '8px',
            }}
          >
            <span
              style={{
                fontSize: '14.5px',
                fontWeight: 800,
                color: 'var(--ink)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Clock size={15} style={{ color: 'var(--brand)' }} />
              <span>المدة</span>
            </span>
            {previewTimeLabel && (preset === '1h' || preset === '2h') && (
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 800,
                  color: 'var(--brand-ink, #34D399)',
                }}
              >
                يعود {previewTimeLabel}
              </span>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '8px',
            }}
          >
            {DURATION_OPTIONS.map((opt) => {
              const isSelected = preset === opt.preset;
              const isFull = opt.preset === 'permanent';
              return (
                <button
                  key={opt.preset}
                  type="button"
                  onClick={() => setPreset(opt.preset)}
                  style={{
                    gridColumn: isFull ? '1 / -1' : undefined,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    minHeight: '44px',
                    padding: '10px 12px',
                    borderRadius: '16px',
                    border: isSelected
                      ? '1.5px solid var(--brand)'
                      : '1px solid var(--mp-glass-border, rgba(255,255,255,0.14))',
                    background: isSelected
                      ? 'color-mix(in srgb, var(--brand) 16%, var(--mp-glass-control, rgba(255,255,255,0.06)))'
                      : 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                    color: isSelected ? 'var(--brand-ink, #34D399)' : 'var(--ink)',
                    cursor: 'pointer',
                    fontSize: '14.5px',
                    fontWeight: 800,
                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                  }}
                >
                  {isFull && <CalendarOff size={15} style={{ opacity: 0.85 }} />}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Visibility Method */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '14.5px',
              fontWeight: 800,
              color: 'var(--ink)',
              marginBottom: '8px',
            }}
          >
            الطريقة
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
            {[
              {
                key: 'badge' as const,
                title: 'ظهور "غير متوفر"',
                icon: <Ban size={16} />,
              },
              {
                key: 'hide' as const,
                title: 'إخفاء من المنيو',
                icon: <EyeOff size={16} />,
              },
            ].map((opt) => {
              const active = behavior === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setBehavior(opt.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    minHeight: '46px',
                    padding: '10px 10px',
                    borderRadius: '16px',
                    border: active ? '1.5px solid var(--brand)' : '1px solid var(--mp-glass-border, rgba(255,255,255,0.14))',
                    background: active
                      ? 'color-mix(in srgb, var(--brand) 16%, var(--mp-glass-control, rgba(255,255,255,0.06)))'
                      : 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                    color: active ? 'var(--brand-ink, #34D399)' : 'var(--ink)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 800,
                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                  }}
                >
                  {opt.icon}
                  <span>{opt.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Validation nudge when only one is chosen */}
        {!canConfirm && (preset || behavior) && (
          <div
            style={{
              marginBottom: '10px',
              padding: '7px 10px',
              borderRadius: '14px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              color: '#f59e0b',
              fontSize: '12px',
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            {!preset ? 'يرجى اختيار المدة أولاً' : 'يرجى اختيار طريقة الظهور لإكمال الإطفاء'}
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <button
            type="button"
            className="btn p"
            disabled={!canConfirm}
            onClick={() => {
              if (!preset || !behavior) return;
              onConfirm(preset, behavior);
            }}
            style={{
              flex: 1,
              height: '42px',
              borderRadius: '999px',
              fontSize: '14px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              opacity: canConfirm ? 1 : 0.45,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
          >
            <PowerOff size={15} />
            <span>تأكيد الإطفاء</span>
          </button>

          <button
            type="button"
            className="btn"
            onClick={onClose}
            style={{
              minWidth: '88px',
              height: '44px',
              borderRadius: '999px',
              background: 'var(--mp-glass-control, rgba(255,255,255,0.06))',
              color: 'var(--ink)',
              border: '1px solid var(--mp-glass-border, rgba(255,255,255,0.14))',
              fontSize: '14.5px',
              fontWeight: 700,
            }}
          >
            إلغاء
          </button>
        </div>
      </motion.div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};
