/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, ChevronUp, Clock, X } from 'lucide-react';
import { DASH_EASE, dashModalMotion } from '../utils/dashboardMotion';

export interface TimePickerFieldProps {
  value: string; // "HH:mm" 24-hour string
  onChange: (nextHHmm: string) => void;
  title?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

type DayPeriod = 'AM' | 'PM';

const QUICK_MINUTES = [0, 15, 30, 45];

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

export function parse24hTime(raw?: string): {
  hour12: number;
  minute: number;
  period: DayPeriod;
} {
  const clean = String(raw || '').trim();
  const match = /^(\d{1,2}):(\d{1,2})/.exec(clean);
  if (!match) {
    return { hour12: 9, minute: 0, period: 'AM' };
  }
  const h24 = Math.min(23, Math.max(0, Number(match[1]) || 0));
  const min = Math.min(59, Math.max(0, Number(match[2]) || 0));
  const period: DayPeriod = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12: h12, minute: min, period };
}

export function formatTo24hTime(hour12: number, minute: number, period: DayPeriod): string {
  const safeH12 = Math.min(12, Math.max(1, Math.floor(hour12)));
  const safeMin = Math.min(59, Math.max(0, Math.floor(minute)));
  const h24 =
    period === 'AM'
      ? safeH12 === 12
        ? 0
        : safeH12
      : safeH12 === 12
      ? 12
      : safeH12 + 12;
  return `${pad2(h24)}:${pad2(safeMin)}`;
}

export function formatDisplayTimeArabic(raw?: string): string {
  const { hour12, minute, period } = parse24hTime(raw);
  return `${pad2(hour12)}:${pad2(minute)} ${period === 'AM' ? 'ص' : 'م'}`;
}

export const TimePickerField: React.FC<TimePickerFieldProps> = ({
  value,
  onChange,
  title = 'تحديد الوقت',
  placeholder = 'اختر الوقت',
  disabled = false,
  className = '',
  style,
  'aria-label': ariaLabel,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);

  const parsed = parse24hTime(value);
  const [draftHour, setDraftHour] = useState<number>(parsed.hour12);
  const [draftMinute, setDraftMinute] = useState<number>(parsed.minute);
  const [draftPeriod, setDraftPeriod] = useState<DayPeriod>(parsed.period);

  useEffect(() => {
    if (!open) return;
    const p = parse24hTime(value);
    setDraftHour(p.hour12);
    setDraftMinute(p.minute);
    setDraftPeriod(p.period);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, value]);

  const stepHour = (delta: number) => {
    setDraftHour((h) => {
      const next = ((h - 1 + delta + 12) % 12) + 1;
      return next;
    });
  };

  const stepMinute = (delta: number) => {
    setDraftMinute((m) => (m + delta + 60) % 60);
  };

  const handleConfirm = () => {
    onChange(formatTo24hTime(draftHour, draftMinute, draftPeriod));
    setOpen(false);
  };

  const formattedDisplay = value ? formatDisplayTimeArabic(value) : placeholder;

  const modalNode =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="mp-modal-backdrop"
                dir="rtl"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.16, ease: DASH_EASE }}
                onClick={() => setOpen(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 100025,
                  background: 'rgba(2, 6, 23, 0.64)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                }}
              >
                <motion.div
                  className="mp-time-mini-modal"
                  onClick={(e) => e.stopPropagation()}
                  {...dashModalMotion(prefersReducedMotion)}
                >
                  {/* Compact Header */}
                  <div className="mp-time-mini-head">
                    <span className="mp-time-mini-title">
                      <Clock size={15} style={{ color: 'var(--brand-ink, var(--brand))' }} />
                      <span>{title}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="إغلاق"
                      className="mp-time-mini-close"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Compact Clock Wheels + AM/PM */}
                  <div className="mp-time-mini-body">
                    <div className="mp-time-mini-row">
                      {/* Hour : Minute Steppers (LTR order so Hour is left, Minute is right) */}
                      <div className="mp-time-mini-wheels" dir="ltr">
                        <div className="mp-time-wheel-col">
                          <button
                            type="button"
                            aria-label="زيادة الساعة"
                            onClick={() => stepHour(1)}
                            className="mp-time-arrow-btn"
                          >
                            <ChevronUp size={18} />
                          </button>
                          <div className="mp-time-wheel-val">{pad2(draftHour)}</div>
                          <button
                            type="button"
                            aria-label="إنقاص الساعة"
                            onClick={() => stepHour(-1)}
                            className="mp-time-arrow-btn"
                          >
                            <ChevronDown size={18} />
                          </button>
                        </div>

                        <span className="mp-time-wheel-sep">:</span>

                        <div className="mp-time-wheel-col">
                          <button
                            type="button"
                            aria-label="زيادة الدقيقة"
                            onClick={() => stepMinute(1)}
                            className="mp-time-arrow-btn"
                          >
                            <ChevronUp size={18} />
                          </button>
                          <div className="mp-time-wheel-val">{pad2(draftMinute)}</div>
                          <button
                            type="button"
                            aria-label="إنقاص الدقيقة"
                            onClick={() => stepMinute(-1)}
                            className="mp-time-arrow-btn"
                          >
                            <ChevronDown size={18} />
                          </button>
                        </div>
                      </div>

                      {/* Compact AM / PM Switch */}
                      <div className="mp-time-mini-ampm" role="radiogroup" aria-label="صباحاً أو مساءً">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={draftPeriod === 'AM'}
                          onClick={() => setDraftPeriod('AM')}
                          className={`mp-time-ampm-pill${draftPeriod === 'AM' ? ' is-active' : ''}`}
                        >
                          صباحاً
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={draftPeriod === 'PM'}
                          onClick={() => setDraftPeriod('PM')}
                          className={`mp-time-ampm-pill${draftPeriod === 'PM' ? ' is-active' : ''}`}
                        >
                          مساءً
                        </button>
                      </div>
                    </div>

                    {/* 1-Row Quick Minutes */}
                    <div className="mp-time-quick-mins" dir="ltr">
                      {QUICK_MINUTES.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDraftMinute(m)}
                          className={`mp-time-qmin-btn${draftMinute === m ? ' is-active' : ''}`}
                        >
                          :{pad2(m)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Compact Footer */}
                  <div className="mp-time-mini-foot">
                    <button type="button" onClick={handleConfirm} className="btn p mp-time-mini-ok">
                      <Check size={15} />
                      <span>
                        حفظ ({pad2(draftHour)}:{pad2(draftMinute)} {draftPeriod === 'AM' ? 'ص' : 'م'})
                      </span>
                    </button>
                    <button type="button" onClick={() => setOpen(false)} className="btn mp-time-mini-cancel">
                      إلغاء
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        aria-label={ariaLabel || `${title}: ${formattedDisplay}`}
        className={`mp-time-trigger${className ? ` ${className}` : ''}`}
        style={style}
      >
        <Clock size={15} className="mp-time-trigger-ico" />
        <span className="mp-time-trigger-val">{formattedDisplay}</span>
      </button>
      {modalNode}
    </>
  );
};
