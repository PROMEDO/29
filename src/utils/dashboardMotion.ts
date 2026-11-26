/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MotionSettingsConfig, SiteSettings } from '../types';
import { isDashboardPath } from './router';

export const DASH_EASE = [0.22, 1, 0.36, 1] as const;

export type MotionPresetCategory =
  | 'slide'
  | 'fade'
  | 'zoom'
  | 'blur'
  | 'spring'
  | 'tilt_3d'
  | 'special';

export interface MotionPresetDefinition {
  id: string;
  officialName: string;
  arabicLabel: string;
  category: MotionPresetCategory;
  curveLabel: string;
  baseDuration: number; // baseline duration in seconds at 1.0x speed
  initial: Record<string, any>;
  animate: Record<string, any>;
  exit: Record<string, any>;
  ease?: readonly [number, number, number, number];
  springBounce?: number;
  isInstant?: boolean;
}

export const DEFAULT_MOTION_CONFIG: MotionSettingsConfig = {
  presetId: 'silk_glide',
  speedMultiplier: 1.0,
  applyToAdmin: true,
  applyToDashboard: true,
  applyToSite: true,
};

export const MOTION_PRESETS: MotionPresetDefinition[] = [
  // 1-6: Fade Family
  {
    id: 'silk_glide',
    officialName: 'Silk Glide',
    arabicLabel: 'انزلاق حريري متدرج',
    category: 'slide',
    curveLabel: 'cubic-bezier(0.22, 1, 0.36, 1)',
    baseDuration: 0.34,
    initial: { opacity: 0, x: -12, scale: 0.99 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: 10, scale: 0.99 },
    ease: [0.22, 1, 0.36, 1],
  },
  {
    id: 'fade_in',
    officialName: 'Fade In',
    arabicLabel: 'ظهور تدريجي ناعم',
    category: 'fade',
    curveLabel: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    baseDuration: 0.55,
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    ease: [0.25, 0.1, 0.25, 1],
  },
  {
    id: 'fade_in_up',
    officialName: 'Fade In Up',
    arabicLabel: 'ظهور تدريجي للأعلى',
    category: 'fade',
    curveLabel: 'cubic-bezier(0.16, 1, 0.3, 1)',
    baseDuration: 0.58,
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
    ease: [0.16, 1, 0.3, 1],
  },
  {
    id: 'fade_in_down',
    officialName: 'Fade In Down',
    arabicLabel: 'ظهور تدريجي للأسفل',
    category: 'fade',
    curveLabel: 'cubic-bezier(0.16, 1, 0.3, 1)',
    baseDuration: 0.58,
    initial: { opacity: 0, y: -24 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 12 },
    ease: [0.16, 1, 0.3, 1],
  },
  {
    id: 'fade_in_left',
    officialName: 'Fade In Left',
    arabicLabel: 'ظهور تدريجي من اليسار',
    category: 'fade',
    curveLabel: 'cubic-bezier(0.16, 1, 0.3, 1)',
    baseDuration: 0.58,
    initial: { opacity: 0, x: -28 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 16 },
    ease: [0.16, 1, 0.3, 1],
  },
  {
    id: 'fade_in_right',
    officialName: 'Fade In Right',
    arabicLabel: 'ظهور تدريجي من اليمين',
    category: 'fade',
    curveLabel: 'cubic-bezier(0.16, 1, 0.3, 1)',
    baseDuration: 0.58,
    initial: { opacity: 0, x: 28 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -16 },
    ease: [0.16, 1, 0.3, 1],
  },

  // 7-11: Slide Family
  {
    id: 'slide_in_up',
    officialName: 'Slide In Up',
    arabicLabel: 'انزلاق صاعد سريع',
    category: 'slide',
    curveLabel: 'cubic-bezier(0.19, 1, 0.22, 1)',
    baseDuration: 0.52,
    initial: { opacity: 0, y: 42 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    ease: [0.19, 1, 0.22, 1],
  },
  {
    id: 'slide_in_down',
    officialName: 'Slide In Down',
    arabicLabel: 'انزلاق هابط انسيابي',
    category: 'slide',
    curveLabel: 'cubic-bezier(0.19, 1, 0.22, 1)',
    baseDuration: 0.52,
    initial: { opacity: 0, y: -42 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
    ease: [0.19, 1, 0.22, 1],
  },
  {
    id: 'slide_in_left',
    officialName: 'Slide In Left',
    arabicLabel: 'انزلاق أفقي من اليسار',
    category: 'slide',
    curveLabel: 'cubic-bezier(0.19, 1, 0.22, 1)',
    baseDuration: 0.52,
    initial: { opacity: 0, x: -48 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 24 },
    ease: [0.19, 1, 0.22, 1],
  },
  {
    id: 'slide_in_right',
    officialName: 'Slide In Right',
    arabicLabel: 'انزلاق أفقي من اليمين',
    category: 'slide',
    curveLabel: 'cubic-bezier(0.19, 1, 0.22, 1)',
    baseDuration: 0.52,
    initial: { opacity: 0, x: 48 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -24 },
    ease: [0.19, 1, 0.22, 1],
  },
  {
    id: 'parallax_drift_up',
    officialName: 'Parallax Drift Up',
    arabicLabel: 'طفو عميق متدرج للأعلى',
    category: 'slide',
    curveLabel: 'cubic-bezier(0.12, 0.9, 0.24, 1)',
    baseDuration: 0.78,
    initial: { opacity: 0, y: 34, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -14, scale: 0.98 },
    ease: [0.12, 0.9, 0.24, 1],
  },

  // 12-17: Zoom & Scale Family
  {
    id: 'zoom_in',
    officialName: 'Zoom In',
    arabicLabel: 'تكبير تدريجي للداخل',
    category: 'zoom',
    curveLabel: 'cubic-bezier(0.16, 1, 0.3, 1)',
    baseDuration: 0.5,
    initial: { opacity: 0, scale: 0.86 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.92 },
    ease: [0.16, 1, 0.3, 1],
  },
  {
    id: 'zoom_out',
    officialName: 'Zoom Out',
    arabicLabel: 'تصغير متزن للداخل',
    category: 'zoom',
    curveLabel: 'cubic-bezier(0.16, 1, 0.3, 1)',
    baseDuration: 0.54,
    initial: { opacity: 0, scale: 1.12 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.04 },
    ease: [0.16, 1, 0.3, 1],
  },
  {
    id: 'zoom_in_up',
    officialName: 'Zoom In Up',
    arabicLabel: 'تكبير متصاعد',
    category: 'zoom',
    curveLabel: 'cubic-bezier(0.2, 0.95, 0.3, 1)',
    baseDuration: 0.56,
    initial: { opacity: 0, scale: 0.88, y: 26 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.94, y: -12 },
    ease: [0.2, 0.95, 0.3, 1],
  },
  {
    id: 'zoom_in_down',
    officialName: 'Zoom In Down',
    arabicLabel: 'تكبير هابط',
    category: 'zoom',
    curveLabel: 'cubic-bezier(0.2, 0.95, 0.3, 1)',
    baseDuration: 0.56,
    initial: { opacity: 0, scale: 0.88, y: -26 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.94, y: 12 },
    ease: [0.2, 0.95, 0.3, 1],
  },
  {
    id: 'scale_pop',
    officialName: 'Scale Pop',
    arabicLabel: 'بروز خاطف بالحجم',
    category: 'zoom',
    curveLabel: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    baseDuration: 0.46,
    initial: { opacity: 0, scale: 0.78 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
    ease: [0.34, 1.56, 0.64, 1],
  },
  {
    id: 'pulse_pop',
    officialName: 'Pulse Pop Entrance',
    arabicLabel: 'نبضة دخول واضحة',
    category: 'zoom',
    curveLabel: 'cubic-bezier(0.22, 1.4, 0.36, 1)',
    baseDuration: 0.54,
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    ease: [0.22, 1.4, 0.36, 1],
  },

  // 18-22: Blur & Focus Family
  {
    id: 'iris_bloom',
    officialName: 'Iris Bloom',
    arabicLabel: 'تفتح ضبابي سينمائي',
    category: 'blur',
    curveLabel: 'cubic-bezier(0.22, 1, 0.36, 1)',
    baseDuration: 0.66,
    initial: { opacity: 0, scale: 0.94, filter: 'blur(10px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, scale: 0.97, filter: 'blur(6px)' },
    ease: [0.22, 1, 0.36, 1],
  },
  {
    id: 'focus_reveal',
    officialName: 'Focus Sharp Reveal',
    arabicLabel: 'تركيز بصري للوضوح',
    category: 'blur',
    curveLabel: 'cubic-bezier(0.16, 1, 0.3, 1)',
    baseDuration: 0.6,
    initial: { opacity: 0, scale: 1.05, filter: 'blur(9px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, filter: 'blur(5px)' },
    ease: [0.16, 1, 0.3, 1],
  },
  {
    id: 'glass_unblur',
    officialName: 'Glass Unblur Slide',
    arabicLabel: 'انزلاق زجاجي صافي',
    category: 'blur',
    curveLabel: 'cubic-bezier(0.19, 1, 0.22, 1)',
    baseDuration: 0.62,
    initial: { opacity: 0, y: 18, filter: 'blur(7px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -10, filter: 'blur(4px)' },
    ease: [0.19, 1, 0.22, 1],
  },
  {
    id: 'depth_push',
    officialName: 'Depth Push Forward',
    arabicLabel: 'دفع عميق من الخلف',
    category: 'blur',
    curveLabel: 'cubic-bezier(0.22, 1, 0.36, 1)',
    baseDuration: 0.64,
    initial: { opacity: 0, scale: 0.84, filter: 'blur(8px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, scale: 1.05, filter: 'blur(5px)' },
    ease: [0.22, 1, 0.36, 1],
  },
  {
    id: 'mist_appear',
    officialName: 'Soft Mist Appear',
    arabicLabel: 'ظهور ضبابي هادئ',
    category: 'blur',
    curveLabel: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    baseDuration: 0.74,
    initial: { opacity: 0, filter: 'blur(12px)' },
    animate: { opacity: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, filter: 'blur(8px)' },
    ease: [0.25, 0.46, 0.45, 0.94],
  },

  // 23-28: Spring & Bounce Family
  {
    id: 'spring_pop',
    officialName: 'Spring Pop',
    arabicLabel: 'ارتداد زنبركي حيوي',
    category: 'spring',
    curveLabel: 'Spring (bounce: 0.42)',
    baseDuration: 0.62,
    initial: { opacity: 0, scale: 0.82, y: 14 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.92 },
    springBounce: 0.42,
  },
  {
    id: 'spring_glide',
    officialName: 'Smooth Spring Settle',
    arabicLabel: 'استقرار زنبركي ناعم',
    category: 'spring',
    curveLabel: 'Spring (bounce: 0.2)',
    baseDuration: 0.6,
    initial: { opacity: 0, x: -24, y: 10 },
    animate: { opacity: 1, x: 0, y: 0 },
    exit: { opacity: 0, x: 14 },
    springBounce: 0.2,
  },
  {
    id: 'bounce_in',
    officialName: 'Bounce In',
    arabicLabel: 'قفزة ارتدادية مرنة',
    category: 'spring',
    curveLabel: 'Spring (bounce: 0.52)',
    baseDuration: 0.68,
    initial: { opacity: 0, scale: 0.72 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.86 },
    springBounce: 0.52,
  },
  {
    id: 'bounce_in_up',
    officialName: 'Bounce In Up',
    arabicLabel: 'ارتداد صاعد مرن',
    category: 'spring',
    curveLabel: 'Spring (bounce: 0.46)',
    baseDuration: 0.66,
    initial: { opacity: 0, y: 36, scale: 0.92 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -16 },
    springBounce: 0.46,
  },
  {
    id: 'rubber_band',
    officialName: 'Rubber Band Snap',
    arabicLabel: 'شد مطاطي متوازن',
    category: 'spring',
    curveLabel: 'Spring (bounce: 0.48)',
    baseDuration: 0.64,
    initial: { opacity: 0, scaleX: 0.84, scaleY: 1.12 },
    animate: { opacity: 1, scaleX: 1, scaleY: 1 },
    exit: { opacity: 0, scaleX: 0.92 },
    springBounce: 0.48,
  },
  {
    id: 'elastic_drop',
    officialName: 'Elastic Drop',
    arabicLabel: 'هبوط مطاطي من الأعلى',
    category: 'spring',
    curveLabel: 'Spring (bounce: 0.44)',
    baseDuration: 0.65,
    initial: { opacity: 0, y: -38, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 16 },
    springBounce: 0.44,
  },

  // 29-35: 3D, Flip & Rotate Family
  {
    id: 'flip_in_x',
    officialName: 'Flip In X',
    arabicLabel: 'قلب ثلاثي الأبعاد عمودي',
    category: 'tilt_3d',
    curveLabel: 'cubic-bezier(0.22, 1, 0.36, 1)',
    baseDuration: 0.64,
    initial: { opacity: 0, rotateX: -55, transformPerspective: 900, scale: 0.95 },
    animate: { opacity: 1, rotateX: 0, transformPerspective: 900, scale: 1 },
    exit: { opacity: 0, rotateX: 30, transformPerspective: 900 },
    ease: [0.22, 1, 0.36, 1],
  },
  {
    id: 'flip_in_y',
    officialName: 'Flip In Y',
    arabicLabel: 'قلب ثلاثي الأبعاد أفقي',
    category: 'tilt_3d',
    curveLabel: 'cubic-bezier(0.22, 1, 0.36, 1)',
    baseDuration: 0.64,
    initial: { opacity: 0, rotateY: 55, transformPerspective: 900, scale: 0.95 },
    animate: { opacity: 1, rotateY: 0, transformPerspective: 900, scale: 1 },
    exit: { opacity: 0, rotateY: -30, transformPerspective: 900 },
    ease: [0.22, 1, 0.36, 1],
  },
  {
    id: 'card_tilt_3d',
    officialName: '3D Card Tilt Reveal',
    arabicLabel: 'إمالة بطاقة ثلاثية الأبعاد',
    category: 'tilt_3d',
    curveLabel: 'cubic-bezier(0.16, 1, 0.3, 1)',
    baseDuration: 0.62,
    initial: { opacity: 0, rotateX: 18, rotateY: -14, y: 20, transformPerspective: 900 },
    animate: { opacity: 1, rotateX: 0, rotateY: 0, y: 0, transformPerspective: 900 },
    exit: { opacity: 0, rotateX: -10, y: -10, transformPerspective: 900 },
    ease: [0.16, 1, 0.3, 1],
  },
  {
    id: 'perspective_unfold',
    officialName: 'Perspective Unfold',
    arabicLabel: 'فتح منظوري ثلاثي',
    category: 'tilt_3d',
    curveLabel: 'cubic-bezier(0.19, 1, 0.22, 1)',
    baseDuration: 0.68,
    initial: { opacity: 0, rotateX: -35, y: 24, scale: 0.9, transformPerspective: 1000 },
    animate: { opacity: 1, rotateX: 0, y: 0, scale: 1, transformPerspective: 1000 },
    exit: { opacity: 0, scale: 0.95, transformPerspective: 1000 },
    ease: [0.19, 1, 0.22, 1],
  },
  {
    id: 'rotate_in_cw',
    officialName: 'Rotate In Clockwise',
    arabicLabel: 'دوران مع عقارب الساعة',
    category: 'tilt_3d',
    curveLabel: 'cubic-bezier(0.16, 1, 0.3, 1)',
    baseDuration: 0.56,
    initial: { opacity: 0, rotate: -10, scale: 0.9 },
    animate: { opacity: 1, rotate: 0, scale: 1 },
    exit: { opacity: 0, rotate: 6, scale: 0.94 },
    ease: [0.16, 1, 0.3, 1],
  },
  {
    id: 'rotate_in_ccw',
    officialName: 'Rotate In Counter-Clockwise',
    arabicLabel: 'دوران عكس عقارب الساعة',
    category: 'tilt_3d',
    curveLabel: 'cubic-bezier(0.16, 1, 0.3, 1)',
    baseDuration: 0.56,
    initial: { opacity: 0, rotate: 10, scale: 0.9 },
    animate: { opacity: 1, rotate: 0, scale: 1 },
    exit: { opacity: 0, rotate: -6, scale: 0.94 },
    ease: [0.16, 1, 0.3, 1],
  },
  {
    id: 'swing_pendulum',
    officialName: 'Swing Pendulum',
    arabicLabel: 'تأرجح بندول ناعم',
    category: 'tilt_3d',
    curveLabel: 'Spring (bounce: 0.36)',
    baseDuration: 0.68,
    initial: { opacity: 0, rotate: -8, y: -14 },
    animate: { opacity: 1, rotate: 0, y: 0 },
    exit: { opacity: 0, rotate: 5 },
    springBounce: 0.36,
  },

  // 36-40: Special Choreography & Instant
  {
    id: 'diagonal_ne',
    officialName: 'Diagonal Slide NE',
    arabicLabel: 'انزلاق قطري صاعد يميناً',
    category: 'special',
    curveLabel: 'cubic-bezier(0.19, 1, 0.22, 1)',
    baseDuration: 0.56,
    initial: { opacity: 0, x: -28, y: 24, scale: 0.96 },
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit: { opacity: 0, x: 16, y: -14 },
    ease: [0.19, 1, 0.22, 1],
  },
  {
    id: 'diagonal_nw',
    officialName: 'Diagonal Slide NW',
    arabicLabel: 'انزلاق قطري صاعد يساراً',
    category: 'special',
    curveLabel: 'cubic-bezier(0.19, 1, 0.22, 1)',
    baseDuration: 0.56,
    initial: { opacity: 0, x: 28, y: 24, scale: 0.96 },
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit: { opacity: 0, x: -16, y: -14 },
    ease: [0.19, 1, 0.22, 1],
  },
  {
    id: 'skew_glide',
    officialName: 'Skew Glide In',
    arabicLabel: 'انزلاق مائل ديناميكي',
    category: 'special',
    curveLabel: 'cubic-bezier(0.22, 1, 0.36, 1)',
    baseDuration: 0.52,
    initial: { opacity: 0, x: -30, skewX: -6 },
    animate: { opacity: 1, x: 0, skewX: 0 },
    exit: { opacity: 0, x: 18, skewX: 4 },
    ease: [0.22, 1, 0.36, 1],
  },
  {
    id: 'kinetic_whip',
    officialName: 'Kinetic Whip In',
    arabicLabel: 'اندفاع حركي سريع ودقيق',
    category: 'special',
    curveLabel: 'cubic-bezier(0.12, 0.98, 0.24, 1)',
    baseDuration: 0.42,
    initial: { opacity: 0, x: -42, scaleX: 1.06, scaleY: 0.96 },
    animate: { opacity: 1, x: 0, scaleX: 1, scaleY: 1 },
    exit: { opacity: 0, x: 24, scaleX: 0.97 },
    ease: [0.12, 0.98, 0.24, 1],
  },
  {
    id: 'instant_cut',
    officialName: 'Instant Cut (Zero Motion)',
    arabicLabel: 'انتقال فوري بدون حركة',
    category: 'special',
    curveLabel: 'linear (0ms)',
    baseDuration: 0,
    initial: { opacity: 1 },
    animate: { opacity: 1 },
    exit: { opacity: 1 },
    isInstant: true,
  },
];

export type MotionScope = 'admin' | 'dashboard' | 'site';

export type MotionElementShape =
  | 'page'
  | 'hero'
  | 'section'
  | 'card'
  | 'tile'
  | 'row'
  | 'pill'
  | 'button'
  | 'modal'
  | 'subtab'
  | 'media';

let activeMotionConfig: MotionSettingsConfig = { ...DEFAULT_MOTION_CONFIG };
let currentMotionScope: MotionScope = 'site';
let cachedLowEndDevice: boolean | null = null;

export function isLowEndDevice(): boolean {
  if (cachedLowEndDevice !== null) return cachedLowEndDevice;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  try {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    const reducedMedia =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 0;
    const mem = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 0;
    const saveData = Boolean(nav.connection?.saveData);
    const slowNet =
      nav.connection?.effectiveType === '2g' || nav.connection?.effectiveType === 'slow-2g';

    cachedLowEndDevice =
      Boolean(reducedMedia || saveData || slowNet) ||
      (cores > 0 && cores <= 4) ||
      (mem > 0 && mem <= 3);
  } catch {
    cachedLowEndDevice = false;
  }
  return cachedLowEndDevice;
}

export function syncPerfModeClass(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('mp-low-perf', isLowEndDevice());
}

if (typeof window !== 'undefined') {
  syncPerfModeClass();
}

export function clampMotionSpeed(raw?: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1.0;
  return Math.min(3.0, Math.max(0.35, Math.round(n * 100) / 100));
}

export function getMotionPresetById(id?: string): MotionPresetDefinition {
  const clean = String(id || '').trim();
  return MOTION_PRESETS.find((p) => p.id === clean) || MOTION_PRESETS[0];
}

export function setActiveDashboardMotion(
  config?: Partial<MotionSettingsConfig> | null,
  scope?: MotionScope
) {
  if (config) {
    activeMotionConfig = {
      presetId: getMotionPresetById(config.presetId).id,
      speedMultiplier: clampMotionSpeed(config.speedMultiplier),
      applyToAdmin: config.applyToAdmin !== false,
      applyToDashboard: config.applyToDashboard !== false,
      applyToSite: config.applyToSite !== false,
    };
  }
  if (scope) {
    currentMotionScope = scope;
  }
}

export function syncDashboardMotionFromSite(site?: SiteSettings | null, pathname?: string) {
  syncPerfModeClass();
  const path = String(pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '')).toLowerCase();
  const scope: MotionScope = path.startsWith('/admin')
    ? 'admin'
    : isDashboardPath(path)
    ? 'dashboard'
    : 'site';

  const cfg = site?.motionConfig;
  setActiveDashboardMotion(
    cfg
      ? {
          presetId: cfg.presetId,
          speedMultiplier: cfg.speedMultiplier,
          applyToAdmin: cfg.applyToAdmin,
          applyToDashboard: cfg.applyToDashboard,
          applyToSite: cfg.applyToSite,
        }
      : DEFAULT_MOTION_CONFIG,
    scope
  );
}

function getEffectivePresetAndSpeed(): {
  preset: MotionPresetDefinition;
  speed: number;
} {
  const enabledForScope =
    currentMotionScope === 'admin'
      ? activeMotionConfig.applyToAdmin !== false
      : currentMotionScope === 'dashboard'
      ? activeMotionConfig.applyToDashboard !== false
      : activeMotionConfig.applyToSite !== false;

  if (!enabledForScope) {
    return { preset: getMotionPresetById('instant_cut'), speed: 1.0 };
  }
  return {
    preset: getMotionPresetById(activeMotionConfig.presetId),
    speed: clampMotionSpeed(activeMotionConfig.speedMultiplier),
  };
}

export function computePresetDuration(preset: MotionPresetDefinition, speedMultiplier = 1.0): number {
  if (preset.isInstant) return 0;
  const speed = clampMotionSpeed(speedMultiplier);
  return Math.max(0.12, Math.round((preset.baseDuration / speed) * 1000) / 1000);
}

function buildTransitionSpec(
  preset: MotionPresetDefinition,
  speed: number,
  delaySeconds = 0,
  durationScale = 1.0,
  springBounceOverride?: number
) {
  if (preset.isInstant) {
    return { duration: 0 };
  }
  const duration = Math.max(0.12, computePresetDuration(preset, speed) * durationScale);
  const scaledDelay = Math.max(0, Math.round((delaySeconds / speed) * 1000) / 1000);
  const bounce =
    typeof springBounceOverride === 'number' ? springBounceOverride : preset.springBounce;
  if (typeof bounce === 'number') {
    return {
      type: 'spring' as const,
      duration,
      bounce,
      delay: scaledDelay,
    };
  }
  return {
    duration,
    delay: scaledDelay,
    ease: preset.ease || DASH_EASE,
  };
}

function deriveShapeKeyframes(
  preset: MotionPresetDefinition,
  shape: MotionElementShape,
  idx = 0
): {
  initial: Record<string, any>;
  animate: Record<string, any>;
  exit: Record<string, any>;
  durationScale: number;
  withHoverTap: boolean;
  hoverPreset?: Record<string, any>;
  tapPreset?: Record<string, any>;
  springBounceOverride?: number;
} {
  const baseInit = { ...preset.initial };
  const baseAnim = { ...preset.animate };
  const baseExit = { ...preset.exit };

  const num = (key: string, fallback = 0): number =>
    typeof baseInit[key] === 'number' ? baseInit[key] : fallback;

  const isOdd = idx % 2 === 1;
  const xSign = isOdd ? -1 : 1;

  const stripBlur = (obj: Record<string, any>): Record<string, any> => {
    if (!('filter' in obj)) return obj;
    const { filter: _ignored, ...rest } = obj;
    return rest;
  };

  switch (shape) {
    case 'page':
      return {
        initial: stripBlur(baseInit),
        animate: stripBlur(baseAnim),
        exit: stripBlur(baseExit),
        durationScale: 1.0,
        withHoverTap: false,
      };

    case 'hero': {
      const heroInit: Record<string, any> = {
        ...stripBlur(baseInit),
        y: typeof baseInit.y === 'number' ? baseInit.y * 1.15 : 22,
        scale: typeof baseInit.scale === 'number' ? Math.min(baseInit.scale, 0.965) : 0.965,
      };
      if (preset.category === 'tilt_3d') {
        heroInit.rotateX = typeof baseInit.rotateX === 'number' ? baseInit.rotateX * 0.75 : 10;
      }
      return {
        initial: heroInit,
        animate: { ...stripBlur(baseAnim), y: 0, scale: 1, rotateX: 0 },
        exit: stripBlur(baseExit),
        durationScale: 1.14,
        withHoverTap: false,
      };
    }

    case 'section': {
      return {
        initial: {
          ...stripBlur(baseInit),
          y: typeof baseInit.y === 'number' ? baseInit.y : 18,
        },
        animate: { ...stripBlur(baseAnim), y: 0 },
        exit: stripBlur(baseExit),
        durationScale: 1.0,
        withHoverTap: false,
      };
    }

    case 'card': {
      const cardInit: Record<string, any> = { ...stripBlur(baseInit) };
      if (preset.category === 'slide' || preset.category === 'fade') {
        cardInit.y = typeof baseInit.y === 'number' ? baseInit.y * 0.6 + 8 : 10;
        cardInit.x = (num('x') * 0.3) + (idx % 3 === 0 ? -6 : idx % 3 === 2 ? 6 : 0);
        cardInit.scale = typeof baseInit.scale === 'number' ? Math.max(baseInit.scale, 0.975) : 0.98;
      } else if (preset.category === 'tilt_3d') {
        cardInit.rotateY = (num('rotateY', 18) || 16) * xSign * 0.55;
        cardInit.y = 10;
      } else if (preset.category === 'zoom' || preset.category === 'spring') {
        cardInit.scale = typeof baseInit.scale === 'number' ? Math.max(baseInit.scale, 0.94) : 0.94;
        cardInit.y = 10;
      } else {
        cardInit.y = typeof baseInit.y === 'number' ? baseInit.y * 0.65 : 10;
        cardInit.scale = typeof baseInit.scale === 'number' ? Math.max(baseInit.scale, 0.97) : 0.975;
      }
      return {
        initial: cardInit,
        animate: { ...stripBlur(baseAnim), x: 0, y: 0, scale: 1, rotateX: 0, rotateY: 0 },
        exit: stripBlur(baseExit),
        durationScale: 0.72,
        withHoverTap: true,
        hoverPreset: { y: -2, scale: 1.008 },
        tapPreset: { scale: 0.985 },
      };
    }

    case 'tile': {
      const tileInit: Record<string, any> = {
        opacity: 0,
        scale: preset.category === 'spring' || preset.category === 'zoom' ? 0.92 : 0.96,
        y: 8,
        x: num('x') * 0.25,
      };
      return {
        initial: tileInit,
        animate: {
          ...stripBlur(baseAnim),
          opacity: 1,
          scale: 1,
          x: 0,
          y: 0,
        },
        exit: stripBlur(baseExit),
        durationScale: 0.65,
        withHoverTap: true,
        hoverPreset: { y: -2, scale: 1.015 },
        tapPreset: { scale: 0.975 },
      };
    }

    case 'row': {
      const baseX = num('x');
      const rowInit: Record<string, any> = {
        opacity: 0,
        x: baseX ? baseX * 0.5 : isOdd ? 8 : 12,
        y: preset.category === 'zoom' || preset.category === 'spring' ? 8 : 4,
      };
      if (preset.category === 'zoom' || preset.category === 'spring') {
        rowInit.scale = 0.98;
      }
      return {
        initial: rowInit,
        animate: {
          ...stripBlur(baseAnim),
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
        },
        exit: stripBlur(baseExit),
        durationScale: 0.65,
        withHoverTap: true,
        hoverPreset: { x: -2, scale: 1.003 },
        tapPreset: { scale: 0.99 },
      };
    }

    case 'pill': {
      const pillInit: Record<string, any> = {
        opacity: 0,
        scale: preset.category === 'fade' ? 0.92 : 0.86,
        y: 6,
      };
      return {
        initial: pillInit,
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.9 },
        durationScale: 0.62,
        withHoverTap: true,
        hoverPreset: { y: -1.5, scale: 1.045 },
        tapPreset: { scale: 0.94 },
        springBounceOverride: preset.category === 'spring' ? 0.34 : undefined,
      };
    }

    case 'button': {
      const btnInit: Record<string, any> = {
        opacity: 0,
        scale: 0.93,
        y: typeof baseInit.y === 'number' ? Math.max(-10, Math.min(12, baseInit.y * 0.45)) : 8,
      };
      return {
        initial: btnInit,
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95 },
        durationScale: 0.68,
        withHoverTap: true,
        hoverPreset: { y: -2, scale: 1.022 },
        tapPreset: { scale: 0.96 },
      };
    }

    case 'media': {
      const mediaInit: Record<string, any> = {
        opacity: 0,
        scale: preset.category === 'zoom' ? 0.9 : 1.055,
      };
      const hasBlur =
        preset.category === 'blur' &&
        currentMotionScope !== 'dashboard' &&
        currentMotionScope !== 'admin';
      if (hasBlur) {
        mediaInit.filter = 'blur(6px)';
      }
      if (preset.category === 'tilt_3d') {
        mediaInit.rotateY = 10;
      }
      return {
        initial: mediaInit,
        animate: {
          opacity: 1,
          scale: 1,
          rotateY: 0,
          ...(hasBlur ? { filter: 'blur(0px)' } : {}),
        },
        exit: { opacity: 0, scale: 0.97 },
        durationScale: 1.05,
        withHoverTap: false,
      };
    }

    case 'modal': {
      const hasBlur =
        preset.category === 'blur' &&
        currentMotionScope !== 'dashboard' &&
        currentMotionScope !== 'admin';
      return {
        initial: {
          opacity: 0,
          scale: 0.95,
          y: 12,
          ...(hasBlur ? { filter: 'blur(6px)' } : {}),
        },
        animate: {
          opacity: 1,
          scale: 1,
          y: 0,
          ...(hasBlur ? { filter: 'blur(0px)' } : {}),
        },
        exit: { opacity: 0, scale: 0.96, y: 8 },
        durationScale: 0.72,
        withHoverTap: false,
      };
    }

    case 'subtab': {
      return {
        initial: {
          ...stripBlur(baseInit),
          x: num('x', -14) * 0.65,
          y: typeof baseInit.y === 'number' ? baseInit.y * 0.55 : 0,
        },
        animate: { ...stripBlur(baseAnim), x: 0, y: 0 },
        exit: stripBlur(baseExit),
        durationScale: 0.72,
        withHoverTap: false,
      };
    }
  }
}

export function buildMotionPropsForPreset(
  preset: MotionPresetDefinition,
  speedMultiplier = 1.0,
  opts?: {
    shape?: MotionElementShape;
    idx?: number;
    delay?: number;
    durationScale?: number;
    targetOpacity?: number;
    useInView?: boolean;
    withHoverTap?: boolean;
    reduced?: boolean | null;
  }
) {
  const isDashScope = currentMotionScope === 'dashboard' || currentMotionScope === 'admin';
  const lowEnd = isLowEndDevice();
  const reduced = Boolean(opts?.reduced) || (isDashScope && lowEnd);
  const targetOpacity = opts?.targetOpacity ?? 1;
  // Never spawn per-row IntersectionObservers inside dashboards/admin to keep 120Hz scrolling lock-free
  const useInView = isDashScope ? false : Boolean(opts?.useInView);

  if (reduced || preset.isInstant) {
    return {
      initial: false as const,
      ...(useInView
        ? { whileInView: { opacity: targetOpacity }, viewport: { once: true, amount: 0.08 as const } }
        : { animate: { opacity: targetOpacity } }),
      transition: { duration: 0 },
    };
  }

  const shape = opts?.shape || 'page';

  // Snappy GPU-composited 120Hz path for dashboards & admin (opacity + subtle translateY only, CSS handles hover/tap)
  if (isDashScope) {
    const idx = opts?.idx ?? 0;
    const rawDelay = idx >= 8 ? 0 : Math.min(opts?.delay || 0, 0.036);
    const speed = clampMotionSpeed(speedMultiplier);
    const baseDashDur =
      shape === 'modal' ? 0.14 : shape === 'row' || shape === 'tile' || shape === 'pill' ? 0.11 : 0.14;
    const duration = Math.max(0.08, Math.round((baseDashDur / Math.max(0.75, speed)) * 1000) / 1000);
    const yOffset = shape === 'row' ? 4 : shape === 'card' || shape === 'tile' ? 6 : shape === 'modal' ? 8 : 6;

    return {
      initial: { opacity: 0, y: yOffset },
      animate: { opacity: targetOpacity, y: 0 },
      exit: { opacity: 0 },
      transition: {
        duration,
        delay: rawDelay,
        ease: DASH_EASE,
      },
    };
  }

  const shaped = deriveShapeKeyframes(preset, shape, opts?.idx || 0);

  const target = {
    ...shaped.animate,
    opacity: targetOpacity,
  };

  const transition = buildTransitionSpec(
    preset,
    speedMultiplier,
    opts?.delay || 0,
    opts?.durationScale || shaped.durationScale,
    shaped.springBounceOverride
  );

  const shouldHoverTap = opts?.withHoverTap !== undefined ? opts.withHoverTap : shaped.withHoverTap;

  return {
    initial: shaped.initial,
    ...(useInView
      ? { whileInView: target, viewport: { once: true, amount: 0.08 as const } }
      : { animate: target }),
    exit: shaped.exit,
    transition,
    ...(shouldHoverTap
      ? {
          whileHover: {
            ...(shaped.hoverPreset || { y: -3, scale: 1.012 }),
            transition: { duration: Math.max(0.14, 0.28 / clampMotionSpeed(speedMultiplier)), ease: DASH_EASE },
          },
          whileTap: {
            ...(shaped.tapPreset || { scale: 0.985 }),
            transition: { duration: Math.max(0.08, 0.14 / clampMotionSpeed(speedMultiplier)), ease: DASH_EASE },
          },
        }
      : {}),
  };
}

/**
 * Shared motion helpers driven dynamically by Admin "الأنيميشن" configuration,
 * adapting rhythm and geometry proportionally per element shape (hero, card, row, pill, button, tile, media, modal).
 */
export function dashShapeMotion(
  shape: MotionElementShape,
  reduced: boolean | null,
  opts?: {
    idx?: number;
    delay?: number;
    baseDelay?: number;
    targetOpacity?: number;
    useInView?: boolean;
    withHoverTap?: boolean;
  }
) {
  const { preset, speed } = getEffectivePresetAndSpeed();
  const idx = opts?.idx ?? 0;
  const isDashScope = currentMotionScope === 'dashboard' || currentMotionScope === 'admin';
  const computedDelay = isDashScope
    ? idx >= 8
      ? 0
      : shape === 'card' || shape === 'tile' || shape === 'row' || shape === 'pill'
      ? Math.min(idx * 0.006, 0.036)
      : 0
    : typeof opts?.delay === 'number'
    ? opts.delay
    : shape === 'card'
    ? Math.min((opts?.baseDelay ?? 0.02) + idx * 0.018, 0.12)
    : shape === 'row'
    ? Math.min(idx * 0.015, 0.09)
    : shape === 'tile'
    ? Math.min(idx * 0.014, 0.09)
    : shape === 'pill'
    ? Math.min(idx * 0.012, 0.07)
    : 0;

  return buildMotionPropsForPreset(preset, speed, {
    shape,
    idx,
    delay: computedDelay,
    targetOpacity: opts?.targetOpacity,
    useInView: isDashScope ? false : opts?.useInView,
    withHoverTap: isDashScope ? false : opts?.withHoverTap,
    reduced,
  });
}

export function dashTabMotion(reduced: boolean | null) {
  return dashShapeMotion('page', reduced);
}

export function dashHeroMotion(reduced: boolean | null, delay = 0) {
  return dashShapeMotion('hero', reduced, { delay });
}

export function dashSectionMotion(reduced: boolean | null, delay = 0, useInView = false) {
  return dashShapeMotion('section', reduced, { delay, useInView });
}

export function dashCardMotion(
  reduced: boolean | null,
  idx = 0,
  targetOpacity = 1,
  useInView = false,
  baseDelay = 0.02
) {
  return dashShapeMotion('card', reduced, {
    idx,
    targetOpacity,
    useInView,
    baseDelay,
    withHoverTap: true,
  });
}

export function dashRowMotion(reduced: boolean | null, idx = 0, useInView = false) {
  return dashShapeMotion('row', reduced, { idx, useInView });
}

export function dashPillMotion(reduced: boolean | null, idx = 0, useInView = false) {
  return dashShapeMotion('pill', reduced, { idx, useInView, withHoverTap: true });
}

export function dashButtonMotion(reduced: boolean | null, delay = 0) {
  return dashShapeMotion('button', reduced, { delay, withHoverTap: true });
}

export function dashMediaMotion(reduced: boolean | null, delay = 0, useInView = false) {
  return dashShapeMotion('media', reduced, { delay, useInView });
}

export function dashSubTabMotion(reduced: boolean | null) {
  return dashShapeMotion('subtab', reduced);
}

export function dashModalMotion(reduced: boolean | null) {
  return dashShapeMotion('modal', reduced);
}

export const DASH_SPRING_PILL = {
  type: 'spring' as const,
  stiffness: 340,
  damping: 32,
  mass: 0.7,
};
