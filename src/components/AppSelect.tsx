/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, ChevronLeft, Search, X } from 'lucide-react';
import { DASH_EASE, dashModalMotion } from '../utils/dashboardMotion';

export interface AppSelectOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export interface AppSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  title?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  dir?: 'rtl' | 'ltr' | 'auto';
  'aria-label'?: string;
  onBlur?: () => void;
  onFocus?: () => void;
  variant?: 'default' | 'compact';
}

export const AppSelect: React.FC<AppSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'اختر خياراً',
  title,
  searchPlaceholder = 'ابحث ضمن الخيارات...',
  searchable,
  disabled = false,
  className = '',
  style,
  id,
  dir = 'rtl',
  'aria-label': ariaLabel,
  onBlur,
  onFocus,
  variant = 'default',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const showSearch = searchable ?? options.length > 7;

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.hint && opt.hint.toLowerCase().includes(q)) ||
        opt.value.toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        onBlur?.();
      }
    };
    window.addEventListener('keydown', handleKey);
    if (showSearch) {
      const t = window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 60);
      return () => {
        window.removeEventListener('keydown', handleKey);
        window.clearTimeout(t);
      };
    }
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, showSearch, onBlur]);

  const handleOpen = () => {
    if (disabled) return;
    onFocus?.();
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    onBlur?.();
  };

  const handlePick = (opt: AppSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    onBlur?.();
  };

  const modalTitle = title || ariaLabel || placeholder;

  const modalContent =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="mp-modal-backdrop"
                dir={dir}
                role="dialog"
                aria-modal="true"
                aria-label={modalTitle}
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.2, ease: DASH_EASE }}
                onClick={handleClose}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 100000,
                  background: 'rgba(2, 6, 23, 0.68)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                }}
              >
                <motion.div
                  className="mp-select-modal-box"
                  onClick={(e) => e.stopPropagation()}
                  {...dashModalMotion(prefersReducedMotion)}
                  style={{
                    width: 'min(420px, 100%)',
                    maxHeight: '82dvh',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: '28px',
                    background: 'var(--mp-glass-bg-elevated, rgba(22, 32, 46, 0.9))',
                    backdropFilter: 'var(--mp-glass-modal-blur, blur(13px) saturate(1.8))',
                    WebkitBackdropFilter: 'var(--mp-glass-modal-blur, blur(13px) saturate(1.8))',
                    border: '1px solid var(--mp-glass-border, rgba(255,255,255,0.16))',
                    boxShadow: 'var(--mp-glass-shadow, 0 28px 64px rgba(0, 0, 0, 0.45))',
                    overflow: 'hidden',
                    color: 'var(--ink, #f8fafc)',
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '16px 20px',
                      borderBottom: '1px solid var(--mp-glass-divider, rgba(255,255,255,0.1))',
                      background: 'transparent',
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '18px',
                        fontWeight: 900,
                        color: 'var(--ink, #f8fafc)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {modalTitle}
                    </h3>

                    <button
                      type="button"
                      onClick={handleClose}
                      aria-label="إغلاق"
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '999px',
                        border: '1px solid var(--mp-glass-border, rgba(255,255,255,0.14))',
                        background: 'var(--mp-glass-control, rgba(255,255,255,0.08))',
                        color: 'var(--muted, #94a3b8)',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Optional Search */}
                  {showSearch && (
                    <div
                      style={{
                        padding: '12px 16px 2px',
                      }}
                    >
                      <div className="mp-select-search-wrap">
                        <Search size={17} style={{ color: 'var(--muted, #94a3b8)', flexShrink: 0 }} />
                        <input
                          ref={searchInputRef}
                          type="text"
                          dir="auto"
                          className="mp-select-search-input"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={searchPlaceholder}
                        />
                        {query && (
                          <button
                            type="button"
                            className="mp-select-search-clear"
                            onClick={() => setQuery('')}
                            aria-label="مسح البحث"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Options List */}
                  <div className="mp-select-options">
                    {filteredOptions.length === 0 ? (
                      <div
                        style={{
                          padding: '24px 12px',
                          textAlign: 'center',
                          fontSize: '13.5px',
                          color: 'var(--muted, #94a3b8)',
                        }}
                      >
                        لا توجد خيارات مطابقة
                      </div>
                    ) : (
                      filteredOptions.map((opt) => {
                        const isActive = opt.value === value;
                        return (
                          <button
                            key={opt.value || '__empty__'}
                            type="button"
                            disabled={opt.disabled}
                            onClick={() => handlePick(opt)}
                            style={{
                              width: '100%',
                              padding: '13px 16px',
                              borderRadius: '16px',
                              border: isActive
                                ? '1.5px solid var(--brand, #10b981)'
                                : '1px solid var(--mp-glass-border, rgba(255,255,255,0.12))',
                              background: isActive
                                ? 'color-mix(in srgb, var(--brand, #10b981) 14%, var(--mp-glass-control, rgba(255,255,255,0.06)))'
                                : 'var(--mp-glass-control, rgba(255,255,255,0.05))',
                              cursor: opt.disabled ? 'not-allowed' : 'pointer',
                              opacity: opt.disabled ? 0.48 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '10px',
                              textAlign: 'start',
                              transition: 'border-color 0.16s ease, background 0.16s ease',
                              fontFamily: 'inherit',
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  fontSize: '15.5px',
                                  fontWeight: isActive ? 900 : 700,
                                  color: isActive
                                    ? 'var(--brand-ink, var(--brand, #34d399))'
                                    : 'var(--ink, #f8fafc)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {opt.label}
                              </div>
                              {opt.hint && (
                                <div
                                  style={{
                                    fontSize: '12.5px',
                                    color: 'var(--muted, #94a3b8)',
                                    marginTop: '2px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {opt.hint}
                                </div>
                              )}
                            </div>

                            {isActive ? (
                              <Check
                                size={18}
                                strokeWidth={2.8}
                                style={{ color: 'var(--brand-ink, var(--brand, #34d399))', flexShrink: 0 }}
                              />
                            ) : (
                              <ChevronLeft
                                size={16}
                                style={{ color: 'var(--muted, #94a3b8)', flexShrink: 0, opacity: 0.7 }}
                              />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )
      : null;

  const isCompact = variant === 'compact';

  return (
    <>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel || title || selectedOption?.label || placeholder}
        onClick={handleOpen}
        className={['mp-select-trigger', isCompact ? 'is-compact' : '', className].filter(Boolean).join(' ')}
        dir={dir}
        style={{
          color: selectedOption ? 'var(--ink, inherit)' : 'var(--muted, #94a3b8)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          ...style,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={isCompact ? 14 : 16}
          style={{
            color: 'var(--muted, #94a3b8)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s ease',
          }}
        />
      </button>
      {modalContent}
    </>
  );
};
