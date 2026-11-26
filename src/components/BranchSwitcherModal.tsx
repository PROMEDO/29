/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, GitBranch, X } from 'lucide-react';
import { Restaurant } from '../types';
import { OwnedMenuSummary } from '../utils/storage';
import { DASH_EASE, dashModalMotion } from '../utils/dashboardMotion';

interface BranchSwitcherModalProps {
  isOpen: boolean;
  isStartupPrompt?: boolean;
  mainRid: string;
  activeRid: string;
  mainRest: Restaurant;
  branchesList: Restaurant[];
  ownedMenus?: OwnedMenuSummary[];
  isStore: boolean;
  onSelectBranch: (targetRid: string) => void;
  onSelectMenu?: (targetRid: string, targetSlug?: string) => void;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export const BranchSwitcherModal: React.FC<BranchSwitcherModalProps> = ({
  isOpen,
  mainRest,
  activeRid,
  branchesList,
  onSelectBranch,
  onClose,
}) => {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  const allBranches: Array<{ rest: Restaurant; isMain: boolean }> = [
    { rest: mainRest, isMain: true },
    ...branchesList.map((b) => ({ rest: b, isMain: false })),
  ];

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="mp-modal-backdrop"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mp-branch-modal-title"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.25, ease: DASH_EASE }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
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
            onClick={(e) => e.stopPropagation()}
            {...dashModalMotion(prefersReducedMotion)}
            style={{
              width: 'min(420px, 100%)',
              maxHeight: '84dvh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '28px',
              background: 'var(--mp-glass-bg-elevated, rgba(22, 32, 46, 0.9))',
              backdropFilter: 'blur(13px) saturate(1.45)',
              WebkitBackdropFilter: 'blur(13px) saturate(1.45)',
              border: '1px solid var(--mp-glass-border, rgba(255,255,255,0.16))',
              boxShadow: 'var(--mp-glass-shadow, 0 28px 64px rgba(0, 0, 0, 0.45))',
              overflow: 'hidden',
              color: 'var(--ink)',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <GitBranch size={20} style={{ color: 'var(--brand-ink, var(--brand))', flexShrink: 0 }} />
                <h3
                  id="mp-branch-modal-title"
                  style={{ margin: 0, fontSize: '18.5px', fontWeight: 900, color: 'var(--ink)' }}
                >
                  اختر الفرع
                </h3>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '999px',
                  border: '1px solid var(--mp-glass-border, rgba(255,255,255,0.14))',
                  background: 'var(--mp-glass-control, rgba(255,255,255,0.08))',
                  color: 'var(--muted)',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Branch Names Only */}
            <div
              style={{
                padding: '16px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {allBranches.map(({ rest: b, isMain }) => {
                const isActive = b.id === activeRid;
                const branchLabel = isMain
                  ? mainRest.branchName?.trim() || mainRest.n
                  : b.branchName?.trim() || b.n;

                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onSelectBranch(b.id)}
                    style={{
                      width: '100%',
                      padding: '15px 18px',
                      borderRadius: '16px',
                      border: isActive
                        ? '1.5px solid var(--brand)'
                        : '1px solid var(--mp-glass-border, rgba(255,255,255,0.12))',
                      background: isActive
                        ? 'color-mix(in srgb, var(--brand) 14%, var(--mp-glass-control, rgba(255,255,255,0.06)))'
                        : 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      textAlign: 'start',
                      transition: 'border-color 0.16s ease, background 0.16s ease',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '16px',
                        fontWeight: 900,
                        color: 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {branchLabel}
                    </span>

                    <ChevronLeft
                      size={17}
                      style={{ color: isActive ? 'var(--brand)' : 'var(--muted)', flexShrink: 0 }}
                    />
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
