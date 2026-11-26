/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AvailabilitySchedule,
  AvailabilityWindow,
  Category,
  ManualPauseBehavior,
  ManualPauseConfig,
  ManualPauseDurationPreset,
  MenuItem,
} from '../types';

export const AVAILABILITY_DAYS = [
  { key: 'sat', label: 'السبت', short: 'السبت' },
  { key: 'sun', label: 'الأحد', short: 'الأحد' },
  { key: 'mon', label: 'الإثنين', short: 'الإثنين' },
  { key: 'tue', label: 'الثلاثاء', short: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء', short: 'الأربعاء' },
  { key: 'thu', label: 'الخميس', short: 'الخميس' },
  { key: 'fri', label: 'الجمعة', short: 'الجمعة' },
] as const;

export function getAvailabilityDays() {
  return AVAILABILITY_DAYS;
}

export const AVAILABILITY_PRESETS: Array<{ label: string; from: string; to: string }> = [
  { label: 'فطور (6 ص - 12 م)', from: '06:00', to: '12:00' },
  { label: 'غداء (12 م - 5 م)', from: '12:00', to: '17:00' },
  { label: 'عشاء (6 م - 12 ص)', from: '18:00', to: '23:59' },
  { label: 'سهرة (9 م - 3 ص)', from: '21:00', to: '03:00' },
];

export function getAvailabilityPresets(): Array<{ label: string; from: string; to: string }> {
  return AVAILABILITY_PRESETS;
}

export const DEFAULT_AVAILABILITY_SCHEDULE: AvailabilitySchedule = {
  enabled: false,
  from: '08:00',
  to: '12:00',
  windows: [{ from: '08:00', to: '12:00' }],
  days: [],
  behavior: 'badge',
};

const JS_DAY_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const VALID_DAY_SET = new Set<string>(JS_DAY_TO_KEY);

function normalizeTimeStr(raw: unknown, fallback = '08:00'): string {
  const s = String(raw || '').trim();
  const match = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return fallback;
  const h = Math.min(23, Math.max(0, Number(match[1]) || 0));
  const m = Math.min(59, Math.max(0, Number(match[2]) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  return (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
}

export function formatHhmm12(hhmm: string | undefined): string {
  const raw = String(hhmm || '').trim();
  if (!raw) return '';
  const [hRaw, mRaw] = raw.split(':').map(Number);
  if (Number.isNaN(hRaw)) return raw;
  const h24 = Math.min(23, Math.max(0, hRaw));
  const m = Number.isNaN(mRaw) ? 0 : Math.min(59, Math.max(0, mRaw));
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const period = h24 >= 12 ? 'م' : 'ص';
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function getScheduleWindows(schedule?: AvailabilitySchedule | null): AvailabilityWindow[] {
  if (!schedule) return [];
  if (Array.isArray(schedule.windows) && schedule.windows.length > 0) {
    return schedule.windows
      .map((w) => ({
        from: normalizeTimeStr(w?.from, '08:00'),
        to: normalizeTimeStr(w?.to, '12:00'),
      }))
      .slice(0, 3);
  }
  return [
    {
      from: normalizeTimeStr(schedule.from, '08:00'),
      to: normalizeTimeStr(schedule.to, '12:00'),
    },
  ];
}

export function normalizeAvailabilitySchedule(raw?: any): AvailabilitySchedule {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AVAILABILITY_SCHEDULE, windows: [{ from: '08:00', to: '12:00' }], days: [] };
  }
  const windows = getScheduleWindows(raw);
  const first = windows[0] || { from: '08:00', to: '12:00' };
  const days: string[] = Array.isArray(raw.days)
    ? Array.from(
        new Set<string>(
          raw.days.map((d: unknown) => String(d)).filter((d: string) => VALID_DAY_SET.has(d))
        )
      )
    : [];
  const behavior: 'badge' | 'hide' = raw.behavior === 'hide' ? 'hide' : 'badge';

  return {
    enabled: Boolean(raw.enabled),
    from: first.from,
    to: first.to,
    windows,
    days,
    behavior,
  };
}

export function sanitizeAvailabilityScheduleForSave(raw?: AvailabilitySchedule | null): AvailabilitySchedule | undefined {
  if (!raw || !raw.enabled) return undefined;
  const norm = normalizeAvailabilitySchedule(raw);
  const windows = getScheduleWindows(norm);
  const first = windows[0] || { from: '08:00', to: '12:00' };
  return {
    enabled: true,
    from: first.from,
    to: first.to,
    ...(windows.length > 1 ? { windows } : { windows: [first] }),
    ...(norm.days && norm.days.length > 0 && norm.days.length < 7 ? { days: norm.days } : {}),
    behavior: norm.behavior === 'hide' ? 'hide' : 'badge',
  };
}

export function formatTime12(hhmm?: string): string {
  return formatHhmm12(normalizeTimeStr(hhmm, '08:00'));
}

export function formatWindowsBadge(schedule?: AvailabilitySchedule | null): string {
  if (!schedule) return '';
  const windows = getScheduleWindows(schedule);
  if (windows.length === 0) return '';
  return windows.map((w) => `${formatTime12(w.from)} - ${formatTime12(w.to)}`).join(' · ');
}

export function formatScheduleLabel(schedule?: AvailabilitySchedule | null): string {
  if (!schedule || !schedule.enabled) return '';
  const timesText = formatWindowsBadge(schedule);
  const days = Array.isArray(schedule.days) ? schedule.days.filter((d) => VALID_DAY_SET.has(d)) : [];
  if (days.length > 0 && days.length < 7) {
    const dayLabels = AVAILABILITY_DAYS.filter((d) => days.includes(d.key)).map((d) => d.short);
    return `${timesText} (${dayLabels.join('، ')})`;
  }
  return timesText;
}

export function isWithinAvailabilitySchedule(
  schedule?: AvailabilitySchedule | null,
  nowDate: Date = new Date()
): boolean {
  if (!schedule || !schedule.enabled) return true;

  const windows = getScheduleWindows(schedule);
  if (windows.length === 0) return true;

  const days = Array.isArray(schedule.days)
    ? schedule.days.filter((d) => VALID_DAY_SET.has(d))
    : [];
  const hasDayRestriction = days.length > 0 && days.length < 7;

  const curMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
  const todayIdx = nowDate.getDay(); // 0=sun..6=sat
  const todayKey = JS_DAY_TO_KEY[todayIdx];
  const yesterdayKey = JS_DAY_TO_KEY[(todayIdx + 6) % 7];

  for (const win of windows) {
    const fromMin = toMinutes(win.from);
    const toMin = toMinutes(win.to);

    if (fromMin === toMin) {
      if (!hasDayRestriction || days.includes(todayKey)) return true;
      continue;
    }

    if (fromMin < toMin) {
      const inRange = toMin === 1439 ? curMinutes >= fromMin && curMinutes <= toMin : curMinutes >= fromMin && curMinutes < toMin;
      if (inRange && (!hasDayRestriction || days.includes(todayKey))) {
        return true;
      }
    } else {
      // Overnight window (e.g. 21:00 -> 03:00)
      if (curMinutes >= fromMin) {
        if (!hasDayRestriction || days.includes(todayKey)) return true;
      } else if (curMinutes < toMin) {
        if (!hasDayRestriction || days.includes(yesterdayKey)) return true;
      }
    }
  }

  return false;
}

export interface ActiveManualPauseInfo {
  paused: boolean;
  behavior: ManualPauseBehavior;
  preset?: ManualPauseDurationPreset;
  until: number | null;
  isTimed: boolean;
}

export function computePauseUntil(
  preset: ManualPauseDurationPreset,
  nowDate: Date = new Date()
): number | null {
  if (preset === '1h') {
    return nowDate.getTime() + 60 * 60 * 1000;
  }
  if (preset === '2h') {
    return nowDate.getTime() + 2 * 60 * 60 * 1000;
  }
  if (preset === 'end_of_day') {
    return new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate(),
      23,
      59,
      59,
      999
    ).getTime();
  }
  if (preset === 'end_of_week') {
    // AVAILABILITY_DAYS runs Saturday (6) -> Friday (5)
    const daysUntilFriday = (5 - nowDate.getDay() + 7) % 7;
    return new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate() + daysUntilFriday,
      23,
      59,
      59,
      999
    ).getTime();
  }
  return null;
}

export function formatEpochTime12(epochMs: number): string {
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return '';
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return formatHhmm12(hhmm);
}

export function getActiveManualPause(
  entity?: (Pick<Category, 'published' | 'manualPause'> & { available?: boolean }) | null,
  nowDate: Date = new Date()
): ActiveManualPauseInfo | null {
  if (!entity) return null;

  const mp = entity.manualPause;
  const nowMs = nowDate.getTime();
  if (mp && mp.paused) {
    const until = typeof mp.until === 'number' && Number.isFinite(mp.until) ? mp.until : null;
    if (until === null || nowMs < until) {
      return {
        paused: true,
        behavior: mp.behavior === 'badge' ? 'badge' : 'hide',
        preset: mp.preset,
        until,
        isTimed: until !== null,
      };
    }
    // Temporary pause expired -> treat as active unless legacy flags explicitly disabled it
    if (until !== null && nowMs >= until) {
      return null;
    }
  }

  if (entity.published === false || entity.available === false) {
    return {
      paused: true,
      behavior: mp?.behavior === 'badge' ? 'badge' : 'hide',
      preset: mp?.preset || 'permanent',
      until: null,
      isTimed: false,
    };
  }

  return null;
}

export function isEntityManuallyPaused(
  entity?: (Pick<Category, 'published' | 'manualPause'> & { available?: boolean }) | null,
  nowDate: Date = new Date()
): boolean {
  return Boolean(getActiveManualPause(entity, nowDate));
}

export function formatManualPauseStatusLabel(
  pause: ActiveManualPauseInfo | ManualPauseConfig | null | undefined,
  _nowDate: Date = new Date()
): string {
  if (!pause || !pause.paused) return '';
  const prefix = pause.behavior === 'badge' ? 'غير متوفر' : 'مخفي';
  const until = typeof pause.until === 'number' && Number.isFinite(pause.until) ? pause.until : null;
  if (until === null) {
    return pause.behavior === 'badge' ? 'غير متوفر للزبائن' : 'مخفي عن الزبائن';
  }
  if (pause.preset === 'end_of_day') {
    return `${prefix} • لنهاية اليوم`;
  }
  if (pause.preset === 'end_of_week') {
    return `${prefix} • لنهاية الأسبوع`;
  }
  const timeStr = formatEpochTime12(until);
  return timeStr ? `${prefix} • حتى ${timeStr}` : prefix;
}

export interface CategoryAvailabilityResult {
  available: boolean;
  hidden: boolean;
  outOfSchedule: boolean;
  hasSchedule: boolean;
  badgeText: string;
  reasonText: string;
}

export function evaluateCategoryAvailability(
  cat?: Category | null,
  nowDate: Date = new Date()
): CategoryAvailabilityResult {
  if (!cat) {
    return {
      available: true,
      hidden: false,
      outOfSchedule: false,
      hasSchedule: false,
      badgeText: '',
      reasonText: '',
    };
  }

  const activePause = getActiveManualPause(cat, nowDate);
  if (activePause) {
    const hideCompletely = activePause.behavior !== 'badge';
    return {
      available: false,
      hidden: hideCompletely,
      outOfSchedule: false,
      hasSchedule: Boolean(cat.availabilitySchedule?.enabled),
      badgeText: hideCompletely ? '' : 'غير متوفر حالياً',
      reasonText: hideCompletely
        ? 'هذا القسم غير متاح حالياً'
        : `قسم "${cat.n}" غير متوفر حالياً`,
    };
  }

  const sched = cat.availabilitySchedule;
  if (!sched || !sched.enabled) {
    return {
      available: true,
      hidden: false,
      outOfSchedule: false,
      hasSchedule: false,
      badgeText: '',
      reasonText: '',
    };
  }

  const label = formatScheduleLabel(sched);
  const inWindow = isWithinAvailabilitySchedule(sched, nowDate);
  if (inWindow) {
    return {
      available: true,
      hidden: false,
      outOfSchedule: false,
      hasSchedule: true,
      badgeText: formatWindowsBadge(sched),
      reasonText: '',
    };
  }

  const hideOutside = sched.behavior === 'hide';
  return {
    available: false,
    hidden: hideOutside,
    outOfSchedule: true,
    hasSchedule: true,
    badgeText: formatWindowsBadge(sched),
    reasonText: `قسم "${cat.n}" متوفر فقط في الأوقات: ${label}`,
  };
}

export interface ItemAvailabilityResult {
  available: boolean;
  hidden: boolean;
  outOfSchedule: boolean;
  hasSchedule: boolean;
  badgeText: string;
  reasonText: string;
  source: 'manual' | 'category' | 'item' | null;
}

export function evaluateItemAvailability(
  item: MenuItem,
  cat?: Category | null,
  nowDate: Date = new Date()
): ItemAvailabilityResult {
  const activePause = getActiveManualPause(item, nowDate);
  if (activePause) {
    const hideCompletely = activePause.behavior !== 'badge';
    return {
      available: false,
      hidden: hideCompletely,
      outOfSchedule: false,
      hasSchedule: Boolean(item.availabilitySchedule?.enabled),
      badgeText: 'غير متوفر',
      reasonText: 'هذا الصنف غير متوفر حالياً',
      source: 'manual',
    };
  }

  const catEval = evaluateCategoryAvailability(cat, nowDate);
  if (!catEval.available) {
    return {
      available: false,
      hidden: catEval.hidden,
      outOfSchedule: catEval.outOfSchedule,
      hasSchedule: catEval.hasSchedule || Boolean(item.availabilitySchedule?.enabled),
      badgeText: catEval.badgeText || (catEval.outOfSchedule ? 'خارج وقت التوفر' : 'غير متوفر'),
      reasonText: catEval.reasonText || 'هذا القسم غير متوفر في الوقت الحالي',
      source: 'category',
    };
  }

  const sched = item.availabilitySchedule;
  if (!sched || !sched.enabled) {
    return {
      available: true,
      hidden: false,
      outOfSchedule: false,
      hasSchedule: catEval.hasSchedule,
      badgeText: '',
      reasonText: '',
      source: null,
    };
  }

  const inWindow = isWithinAvailabilitySchedule(sched, nowDate);
  if (inWindow) {
    return {
      available: true,
      hidden: false,
      outOfSchedule: false,
      hasSchedule: true,
      badgeText: formatWindowsBadge(sched),
      reasonText: '',
      source: null,
    };
  }

  const label = formatScheduleLabel(sched);
  const hideOutside = sched.behavior === 'hide';
  return {
    available: false,
    hidden: hideOutside,
    outOfSchedule: true,
    hasSchedule: true,
    badgeText: formatWindowsBadge(sched),
    reasonText: `متوفر فقط في الأوقات: ${label}`,
    source: 'item',
  };
}
