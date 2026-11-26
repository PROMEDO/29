/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Check,
  CheckCircle2,
  Copy,
  Edit2,
  ExternalLink,
  GitBranch,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { copyTextReliable, getCollection, getSlugForRestaurantId } from '../../utils/storage';
import { Category, MenuItem } from '../../types';
import { getFullSubdomainUrl, getPublicMenuUrlPath } from '../../utils/businessDefaults';
import { getDashboardTabPath } from '../../utils/router';
import { useDashboard } from './DashboardContext';
import {
  DASH_EASE,
  dashButtonMotion,
  dashCardMotion,
  dashModalMotion,
  dashSectionMotion,
} from '../../utils/dashboardMotion';

export const BranchesPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const {
    mainRid,
    activeRid,
    mainRest,
    branchesList,
    resolvedPlan,
    terms,
    site,
    switchActiveBranch,
    createBranch,
    renameBranch,
    deleteBranch,
    onNavigate,
    openUpgradeModal,
    showToast,
  } = useDashboard();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchPhone, setNewBranchPhone] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [cloneOnCreate, setCloneOnCreate] = useState(true);

  const [editingBranch, setEditingBranch] = useState<{ id: string; name: string; isMain: boolean } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [copiedDashId, setCopiedDashId] = useState<string | null>(null);

  const handleCopyBranchDashboardUrl = async (targetRid: string, label: string) => {
    const slug = getSlugForRestaurantId(targetRid);
    const path = getDashboardTabPath('home', targetRid === mainRid ? undefined : targetRid, slug);
    const fullUrl = `${window.location.origin}${path}`;
    const ok = await copyTextReliable(fullUrl);
    if (ok) {
      setCopiedDashId(targetRid);
      showToast(`تم نسخ رابط لوحة تحكم "${label}" ✓`);
      window.setTimeout(() => {
        setCopiedDashId((cur) => (cur === targetRid ? null : cur));
      }, 2200);
    } else {
      showToast('تعذر نسخ الرابط، يرجى المحاولة مجدداً');
    }
  };

  const maxB = resolvedPlan.maxBranches;
  const isLocked = maxB === 0;
  const atLimit = maxB !== -1 && branchesList.length >= maxB;

  const allCats = getCollection<Category>('cats');
  const allItems = getCollection<MenuItem>('items');

  const getBranchUrl = (r: typeof mainRest) => {
    const sub = getFullSubdomainUrl(r, site, resolvedPlan);
    if (sub) return sub;
    return `${window.location.origin}${getPublicMenuUrlPath(r, resolvedPlan)}`;
  };

  const handleOpenCreateModal = () => {
    if (isLocked) {
      openUpgradeModal('pro');
      return;
    }
    if (atLimit) {
      showToast(`وصلت للحد الأقصى للأفرع في باقتك (${maxB} فرع) 🔒`);
      openUpgradeModal('vip');
      return;
    }
    setShowCreateModal(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = createBranch(newBranchName, newBranchPhone, newBranchAddress, cloneOnCreate);
    if (ok) {
      setNewBranchName('');
      setNewBranchPhone('');
      setNewBranchAddress('');
      setShowCreateModal(false);
    }
  };

  const openRenameModal = (id: string, currentName: string, isMain: boolean) => {
    setEditingBranch({ id, name: currentName, isMain });
    setRenameValue(currentName);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch || isRenaming) return;
    setIsRenaming(true);
    try {
      const ok = await renameBranch(editingBranch.id, renameValue);
      if (ok) {
        setEditingBranch(null);
      }
    } finally {
      setIsRenaming(false);
    }
  };

  const getBranchTelegramInfo = (r: typeof mainRest) => {
    const isTgEnabled =
      r.telegramNotificationsEnabled !== undefined
        ? r.telegramNotificationsEnabled !== false
        : r.orderChannel !== 'whatsapp' && r.orderChannel !== 'app';
    const isLinked = Boolean(
      r.telegramLinked ||
        (r.telegramChatId && String(r.telegramChatId).trim()) ||
        (r.telegramPhone && String(r.telegramPhone).trim() && r.telegramUnlinkedManually !== true)
    );
    if (!isTgEnabled) {
      return {
        label: 'تيليجرام: متوقف',
        color: '#f59e0b',
      };
    }
    if (isLinked) {
      return {
        label: `تيليجرام: مربوط${r.telegramPhone ? ` (${r.telegramPhone})` : ''}`,
        color: '#10b981',
      };
    }
    return {
      label: 'تيليجرام: غير مربوط',
      color: 'var(--muted)',
    };
  };

  const renderOpenMenuAction = (branchItem: typeof mainRest) => {
    const hasSubdomain = Boolean(getFullSubdomainUrl(branchItem, site, resolvedPlan));
    const url = getBranchUrl(branchItem);
    const label = terms.isStore ? 'فتح المتجر' : 'فتح المنيو';

    if (hasSubdomain) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn s"
          style={{ textDecoration: 'none', minHeight: '38px', fontWeight: 700 }}
        >
          <ExternalLink size={14} />
          <span>{label}</span>
        </a>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onNavigate(getPublicMenuUrlPath(branchItem, resolvedPlan))}
        className="btn s"
        style={{ minHeight: '38px', fontWeight: 700 }}
      >
        <ExternalLink size={14} />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <>
      {branchesList.length === 0 ? (
        <div
          style={{
            minHeight: 'calc(100dvh - 150px)',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <motion.button
            type="button"
            onClick={handleOpenCreateModal}
            className="btn p"
            {...dashButtonMotion(prefersReducedMotion)}
            style={{
              height: '46px',
              padding: '0 24px',
              borderRadius: '999px',
              fontSize: '14.5px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 10px 28px color-mix(in srgb, var(--brand) 28%, transparent)',
            }}
          >
            <Plus size={18} />
            <span>إضافة فرع جديد</span>
          </motion.button>
        </div>
      ) : (
        <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 2px' }}>
            <motion.button
              type="button"
              onClick={handleOpenCreateModal}
              className="btn p"
              {...dashButtonMotion(prefersReducedMotion)}
              style={{
                height: '42px',
                padding: '0 20px',
                borderRadius: '999px',
                fontSize: '13.5px',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
              }}
            >
              <Plus size={16} />
              <span>إضافة فرع جديد</span>
            </motion.button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(() => {
              const isManagingMain = activeRid === mainRid;
              const mainCatsCount = allCats.filter((c) => c.rid === mainRid).length;
              const mainItemsCount = allItems.filter((i) => i.rid === mainRid).length;
              const mainTg = getBranchTelegramInfo(mainRest);

              return (
                <motion.div
                  {...dashSectionMotion(prefersReducedMotion, 0.04)}
                  className={`mp-surface-card mp-branch-card${isManagingMain ? ' is-active' : ''}`}
                >
                  <div
                    onClick={() => !isManagingMain && switchActiveBranch(mainRid)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      minWidth: 0,
                      flex: '1 1 220px',
                      cursor: isManagingMain ? 'default' : 'pointer',
                    }}
                  >
                    <GitBranch size={22} style={{ color: 'var(--brand-ink, #34D399)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <b style={{ fontSize: '16.5px', color: 'var(--ink)' }}>
                          {mainRest.branchName?.trim() || mainRest.n}
                        </b>
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--muted)' }}>
                          (الرئيسي)
                        </span>
                        {isManagingMain && (
                          <span
                            style={{
                              fontSize: '12.5px',
                              fontWeight: 800,
                              color: '#10b981',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <CheckCircle2 size={14} /> نشط
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }} className="tabular-nums">
                        <span>{mainCatsCount} أقسام · {mainItemsCount} {terms.isStore ? 'منتج' : 'عنصر'}</span>
                        <span style={{ color: mainTg.color, fontWeight: 700, fontSize: '12.5px' }}>
                          · {mainTg.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {!isManagingMain && (
                      <button
                        type="button"
                        onClick={() => void switchActiveBranch(mainRid)}
                        className="btn p"
                        style={{ minHeight: '38px', fontWeight: 700 }}
                      >
                        <GitBranch size={14} />
                        <span>فتح اللوحة</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void switchActiveBranch(mainRid, { tab: 'set', settingsSection: 'telegram' })}
                      className="btn s"
                      style={{ minHeight: '38px', fontWeight: 700 }}
                    >
                      <Send size={14} style={{ color: '#0088cc' }} />
                      <span>إعداد تيليجرام</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyBranchDashboardUrl(mainRid, mainRest.branchName?.trim() || mainRest.n)}
                      className="btn s"
                      style={{ minHeight: '38px', fontWeight: 700 }}
                      title="نسخ رابط لوحة تحكم الفرع الرئيسي"
                    >
                      {copiedDashId === mainRid ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                      <span>{copiedDashId === mainRid ? 'تم النسخ' : 'نسخ رابط اللوحة'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openRenameModal(mainRid, mainRest.branchName?.trim() || mainRest.n, true)}
                      className="btn s"
                      style={{ minHeight: '38px', fontWeight: 700 }}
                    >
                      <Edit2 size={14} />
                      <span>تعديل الاسم</span>
                    </button>
                    {renderOpenMenuAction(mainRest)}
                  </div>
                </motion.div>
              );
            })()}

            {branchesList.map((branch, idx) => {
              const isManagingThis = activeRid === branch.id;
              const branchLabel = branch.branchName || branch.n;
              const branchCats = allCats.filter((c) => c.rid === branch.id).length;
              const branchItems = allItems.filter((i) => i.rid === branch.id).length;
              const branchTg = getBranchTelegramInfo(branch);

              return (
                <motion.div
                  key={branch.id}
                  {...dashCardMotion(prefersReducedMotion, idx, 1, false, 0.08)}
                  className={`mp-surface-card mp-branch-card${isManagingThis ? ' is-active' : ''}`}
                >
                  <div
                    onClick={() => !isManagingThis && switchActiveBranch(branch.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      minWidth: 0,
                      flex: '1 1 220px',
                      cursor: isManagingThis ? 'default' : 'pointer',
                    }}
                  >
                    <GitBranch size={22} style={{ color: 'var(--brand-ink, var(--brand))', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <b style={{ fontSize: '16.5px', color: 'var(--ink)' }}>{branchLabel}</b>
                        {isManagingThis && (
                          <span
                            style={{
                              fontSize: '12.5px',
                              fontWeight: 800,
                              color: '#10b981',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <CheckCircle2 size={14} /> نشط
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }} className="tabular-nums">
                        <span>{branchCats} أقسام · {branchItems} {terms.isStore ? 'منتج' : 'عنصر'}</span>
                        <span style={{ color: branchTg.color, fontWeight: 700, fontSize: '12.5px' }}>
                          · {branchTg.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {!isManagingThis && (
                      <button
                        type="button"
                        onClick={() => void switchActiveBranch(branch.id)}
                        className="btn p"
                        style={{ minHeight: '38px', fontWeight: 700 }}
                      >
                        <GitBranch size={14} />
                        <span>فتح اللوحة</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void switchActiveBranch(branch.id, { tab: 'set', settingsSection: 'telegram' })}
                      className="btn s"
                      style={{ minHeight: '38px', fontWeight: 700 }}
                    >
                      <Send size={14} style={{ color: '#0088cc' }} />
                      <span>إعداد تيليجرام</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyBranchDashboardUrl(branch.id, branchLabel)}
                      className="btn s"
                      style={{ minHeight: '38px', fontWeight: 700 }}
                      title="نسخ رابط لوحة تحكم هذا الفرع لإرسالها للأدمن"
                    >
                      {copiedDashId === branch.id ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                      <span>{copiedDashId === branch.id ? 'تم النسخ' : 'نسخ رابط اللوحة'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openRenameModal(branch.id, branchLabel, false)}
                      className="btn s"
                      style={{ minHeight: '38px', fontWeight: 700 }}
                    >
                      <Edit2 size={14} />
                      <span>تعديل الاسم</span>
                    </button>
                    {renderOpenMenuAction(branch)}
                    <button
                      type="button"
                      onClick={() => deleteBranch(branch.id, branchLabel)}
                      className="btn s d"
                      style={{ minHeight: '38px', fontWeight: 700 }}
                      title="حذف الفرع"
                    >
                      <Trash2 size={14} />
                      <span>حذف</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rename Branch Modal */}
      <AnimatePresence>
        {editingBranch && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.14, ease: DASH_EASE }}
            onClick={() => setEditingBranch(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0, 0, 0, 0.62)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <motion.form
              onSubmit={handleRenameSubmit}
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
              className="mp-modal-card"
              style={{
                width: '100%',
                maxWidth: '420px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--ink)' }}>
                  تعديل اسم الفرع
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingBranch(null)}
                  aria-label="إغلاق"
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '999px',
                    border: '1px solid var(--mp-glass-border, var(--line))',
                    background: 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                    color: 'var(--muted)',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={17} />
                </button>
              </div>

              <label className="f" style={{ margin: 0 }}>
                اسم الفرع *
                <input
                  type="text"
                  required
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="mp-themed-input"
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setEditingBranch(null)}
                  className="btn s"
                  disabled={isRenaming}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn p"
                  disabled={isRenaming}
                  style={{ fontWeight: 800 }}
                >
                  <span>{isRenaming ? 'جاري الحفظ...' : 'حفظ الاسم'}</span>
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create New Branch Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.14, ease: DASH_EASE }}
            onClick={() => setShowCreateModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0, 0, 0, 0.62)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <motion.form
              onSubmit={handleCreate}
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
              className="mp-modal-card"
              style={{
                width: '100%',
                maxWidth: '480px',
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Plus size={20} style={{ color: 'var(--brand-ink, var(--brand))' }} />
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--ink)' }}>
                    إضافة فرع جديد
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  aria-label="إغلاق"
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '999px',
                    border: '1px solid var(--mp-glass-border, var(--line))',
                    background: 'var(--mp-glass-control, rgba(255,255,255,0.06))',
                    color: 'var(--muted)',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={17} />
                </button>
              </div>

              <label className="f" style={{ margin: 0 }}>
                اسم الفرع *
                <input
                  type="text"
                  required
                  autoFocus
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder={terms.isStore ? 'معرض المنصور' : 'فرع المنصور'}
                  className="mp-themed-input"
                />
              </label>

              <label className="f" style={{ margin: 0 }}>
                رقم الهاتف (اختياري)
                <input
                  type="tel"
                  dir="ltr"
                  value={newBranchPhone}
                  onChange={(e) => setNewBranchPhone(e.target.value)}
                  placeholder={mainRest.ph || '07701234567'}
                  className="mp-themed-input"
                  style={{ textAlign: 'left' }}
                />
              </label>

              <label className="f" style={{ margin: 0 }}>
                العنوان (اختياري)
                <input
                  type="text"
                  value={newBranchAddress}
                  onChange={(e) => setNewBranchAddress(e.target.value)}
                  placeholder="بغداد - المنصور"
                  className="mp-themed-input"
                />
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14.5px', fontWeight: 700, color: 'var(--ink)' }}>
                <input
                  type="checkbox"
                  checked={cloneOnCreate}
                  onChange={(e) => setCloneOnCreate(e.target.checked)}
                />
                <span>
                  {terms.isStore
                    ? 'نسخ أقسام ومنتجات الفرع الرئيسي'
                    : 'نسخ أقسام وأصناف الفرع الرئيسي'}
                </span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn s"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn p"
                  style={{ fontWeight: 800 }}
                >
                  <Plus size={16} />
                  <span>إنشاء الفرع وتفعيله</span>
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
