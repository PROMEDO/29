/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import type { AvailabilitySchedule } from '../types';
import { TimePickerField } from './TimePickerField';
import {
  formatScheduleLabel,
  getAvailabilityDays,
  getAvailabilityPresets,
  getScheduleWindows,
  isWithinAvailabilitySchedule,
  normalizeAvailabilitySchedule,
} from '../utils/availability';

interface AvailabilityScheduleEditorProps {
  value: AvailabilitySchedule;
  onChange: (next: AvailabilitySchedule) => void;
  targetLabel?: string;
  inputStyle?: React.CSSProperties;
  flat?: boolean;
}

export const AvailabilityScheduleEditor: React.FC<AvailabilityScheduleEditorProps> = ({
  value,
  onChange,
  targetLabel,
  inputStyle,
  flat = false,
}) => {
  const effectiveTarget = targetLabel || 'العنصر';
  const presets = getAvailabilityPresets();
  const days = getAvailabilityDays();
  const sched = normalizeAvailabilitySchedule(value);
  const windows = getScheduleWindows(sched);
  const selectedDays = sched.days || [];
  const allDaysSelected = selectedDays.length === 0 || selectedDays.length === 7;
  const activeNow = sched.enabled ? isWithinAvailabilitySchedule(sched) : true;
  const scheduleSummary = sched.enabled ? formatScheduleLabel(sched) : '';

  const updateWindows = (nextWindows: Array<{ from: string; to: string }>) => {
    const clean = nextWindows.length > 0 ? nextWindows : [{ from: '08:00', to: '12:00' }];
    onChange({
      ...sched,
      enabled: true,
      from: clean[0].from,
      to: clean[0].to,
      windows: clean,
    });
  };

  const toggleDay = (dayKey: string) => {
    const cur = new Set(selectedDays);
    if (cur.has(dayKey)) {
      cur.delete(dayKey);
    } else {
      cur.add(dayKey);
    }
    const arr = Array.from(cur);
    onChange({
      ...sched,
      days: arr.length === 7 ? [] : arr,
    });
  };

  return (
    <div className={`mp-avail-wrap${flat ? ' is-flat' : ''}`}>
      {/* Header + Toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <Clock
            size={19}
            style={{
              color: sched.enabled ? 'var(--brand-ink, #34D399)' : 'var(--muted)',
              flexShrink: 0,
            }}
          />
          <div style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3 }}>
            متوفر بأوقات محددة
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 800,
              color: sched.enabled ? '#10b981' : 'var(--muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {sched.enabled ? 'مفعّل' : 'دائماً'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={sched.enabled}
            aria-label={`تفعيل أوقات التوفر المحددة لـ ${effectiveTarget}`}
            onClick={() =>
              onChange({
                ...sched,
                enabled: !sched.enabled,
              })
            }
            className={`ios-switch ${sched.enabled ? 'on' : 'off'}`}
          >
            <span className="ios-switch-thumb" />
          </button>
        </div>
      </div>

      {sched.enabled && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            paddingTop: '12px',
            borderTop: '1px solid var(--mp-glass-divider, var(--line))',
          }}
        >
          {/* Quick Presets (2x2 clean grid) */}
          <div>
            <div className="mp-avail-section-label">
              أوقات سريعة
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '7px',
              }}
            >
              {presets.map((preset) => {
                const isSelected =
                  windows.length === 1 &&
                  windows[0].from === preset.from &&
                  windows[0].to === preset.to;
                return (
                  <button
                    key={preset.from + preset.to}
                    type="button"
                    onClick={() => updateWindows([{ from: preset.from, to: preset.to }])}
                    style={{
                      minHeight: '40px',
                      padding: '8px 10px',
                      borderRadius: '14px',
                      border: isSelected ? '1px solid var(--brand)' : '1px solid var(--mp-glass-border, var(--line))',
                      background: isSelected
                        ? 'color-mix(in srgb, var(--brand) 16%, transparent)'
                        : 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                      color: isSelected ? 'var(--brand-ink, #34D399)' : 'var(--ink)',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Windows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--muted)' }}>
                ساعات التوفر
              </span>
              {windows.length < 3 && (
                <button
                  type="button"
                  onClick={() => updateWindows([...windows, { from: '18:00', to: '23:00' }])}
                  style={{
                    height: '32px',
                    padding: '0 12px',
                    borderRadius: '999px',
                    border: '1px solid var(--mp-glass-border, var(--line))',
                    background: 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                    color: 'var(--ink)',
                    fontSize: '13px',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  <span>فترة إضافية</span>
                </button>
              )}
            </div>

            {windows.map((win, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    windows.length > 1 ? 'minmax(0, 1fr) minmax(0, 1fr) 42px' : 'minmax(0, 1fr) minmax(0, 1fr)',
                  gap: '10px',
                  alignItems: 'end',
                  padding: idx > 0 ? '10px 0 0' : '2px 0',
                  borderTop: idx > 0 ? '1px solid var(--mp-glass-divider, var(--line))' : 'none',
                }}
              >
                <div className="f" style={{ marginBottom: 0, gap: '5px', minWidth: 0 }}>
                  <span style={{ fontSize: '12.5px', color: 'var(--muted)', fontWeight: 700 }}>
                    {windows.length > 1 ? `من (#${idx + 1})` : 'من'}
                  </span>
                  <TimePickerField
                    value={win.from}
                    title={windows.length > 1 ? `وقت البدء (#${idx + 1})` : 'وقت البدء'}
                    onChange={(val) => {
                      updateWindows(windows.map((row, i) => (i === idx ? { ...row, from: val } : row)));
                    }}
                    className="mp-avail-time-input"
                    style={inputStyle}
                  />
                </div>

                <div className="f" style={{ marginBottom: 0, gap: '5px', minWidth: 0 }}>
                  <span style={{ fontSize: '12.5px', color: 'var(--muted)', fontWeight: 700 }}>
                    إلى
                  </span>
                  <TimePickerField
                    value={win.to}
                    title={windows.length > 1 ? `وقت الانتهاء (#${idx + 1})` : 'وقت الانتهاء'}
                    onChange={(val) => {
                      updateWindows(windows.map((row, i) => (i === idx ? { ...row, to: val } : row)));
                    }}
                    className="mp-avail-time-input"
                    style={inputStyle}
                  />
                </div>

                {windows.length > 1 && (
                  <button
                    type="button"
                    aria-label="حذف الفترة"
                    onClick={() => updateWindows(windows.filter((_, i) => i !== idx))}
                    style={{
                      width: '42px',
                      height: '44px',
                      borderRadius: '999px',
                      border: '1px solid var(--mp-glass-border, var(--line))',
                      background: 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                      color: 'var(--ink)',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Days Selector */}
          <div>
            <div className="mp-avail-section-label">
              الأيام المتاحة
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: '7px',
              }}
            >
              <button
                type="button"
                onClick={() => onChange({ ...sched, days: [] })}
                style={{
                  height: '40px',
                  padding: '0 6px',
                  borderRadius: '12px',
                  border: allDaysSelected ? '1px solid var(--brand)' : '1px solid var(--mp-glass-border, var(--line))',
                  background: allDaysSelected
                    ? 'color-mix(in srgb, var(--brand) 18%, transparent)'
                    : 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                  color: allDaysSelected ? 'var(--brand-ink, #34D399)' : 'var(--ink)',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                كل الأيام
              </button>
              {days.map((day) => {
                const isSelected = !allDaysSelected && selectedDays.includes(day.key);
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => toggleDay(day.key)}
                    style={{
                      height: '40px',
                      padding: '0 6px',
                      borderRadius: '12px',
                      border: isSelected ? '1px solid var(--brand)' : '1px solid var(--mp-glass-border, var(--line))',
                      background: isSelected ? 'var(--brand)' : 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                      color: isSelected ? 'var(--on-brand, #fff)' : 'var(--ink)',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Behavior Outside Hours */}
          <div>
            <div className="mp-avail-section-label">
              خارج أوقات التوفر
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              {[
                {
                  key: 'badge' as const,
                  active: sched.behavior !== 'hide',
                  title: 'يظهر مع تنبيه الوقت',
                },
                {
                  key: 'hide' as const,
                  active: sched.behavior === 'hide',
                  title: 'إخفاء تلقائي خارج الوقت',
                },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => onChange({ ...sched, behavior: opt.key })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'start',
                    padding: '12px 14px',
                    borderRadius: '16px',
                    border: opt.active ? '1.5px solid var(--brand)' : '1px solid var(--mp-glass-border, var(--line))',
                    background: opt.active
                      ? 'color-mix(in srgb, var(--brand) 12%, var(--mp-glass-control, rgba(255,255,255,0.06)))'
                      : 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: opt.active ? '5px solid var(--brand)' : '1.5px solid var(--muted)',
                      background: opt.active ? '#fff' : 'transparent',
                      flexShrink: 0,
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ fontSize: '14.5px', fontWeight: 800, lineHeight: 1.3 }}>
                    {opt.title}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Live Status Preview */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              flexWrap: 'wrap',
              paddingTop: '10px',
              borderTop: '1px solid var(--mp-glass-divider, var(--line))',
              fontSize: '13.5px',
              fontWeight: 700,
              color: activeNow ? '#10b981' : '#f59e0b',
            }}
          >
            <span>
              {activeNow
                ? 'متاح الآن'
                : sched.behavior === 'hide'
                ? 'خارج الوقت — مخفي الآن'
                : 'خارج الوقت — غير متاح الآن'}
            </span>
            {scheduleSummary && (
              <span style={{ color: 'var(--ink)', fontSize: '13.5px', fontWeight: 800 }}>
                {scheduleSummary}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
