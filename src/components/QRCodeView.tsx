/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Copy, Check, Printer, FileCode2 } from 'lucide-react';

export type QrDotStyle =
  | 'square'
  | 'rounded'
  | 'dots'
  | 'diamond'
  | 'classy'
  | 'bars'
  | 'star';

export type QrEyeOuterStyle = 'square' | 'rounded' | 'circle' | 'leaf' | 'shield';
export type QrEyeInnerStyle = 'square' | 'rounded' | 'circle' | 'diamond';

export type QrBgPreset =
  | 'white'
  | 'cream'
  | 'dark'
  | 'emerald'
  | 'gold'
  | 'midnight'
  | 'sunset'
  | 'rose'
  | 'ocean'
  | 'royal'
  | 'obsidian'
  | 'terracotta'
  | 'custom';

export type QrBgPattern = 'none' | 'dots' | 'grid' | 'waves' | 'diagonal' | 'aura' | 'sparkle';

export type QrFramePreset =
  | 'minimal'
  | 'table'
  | 'classic'
  | 'badge'
  | 'modern'
  | 'ribbon'
  | 'poster'
  | 'sticker';

export type QrGradientDir = 'diagonal' | 'vertical' | 'horizontal' | 'radial';
export type QrTileBgMode = 'light' | 'cream' | 'soft' | 'dark' | 'custom';
export type QrCenterMode = 'none' | 'logo' | 'initials' | 'scan' | 'utensils';
export type QrLogoShape = 'rounded' | 'circle';
export type QrLogoSize = 'sm' | 'md' | 'lg';

export interface QrThemeDefinition {
  label: string;
  cardBg: string;
  cardBg2: string;
  qrTileBg: string;
  textColor: string;
  subColor: string;
  borderColor: string;
  defaultQrColor: string;
  accentColor: string;
  swatch: string;
  isDarkSurface: boolean;
}

export const QR_BG_THEMES: Record<QrBgPreset, QrThemeDefinition> = {
  white: {
    label: 'أبيض نقي',
    cardBg: '#ffffff',
    cardBg2: '#f1f5f9',
    qrTileBg: '#ffffff',
    textColor: '#0f172a',
    subColor: '#475569',
    borderColor: '#cbd5e1',
    defaultQrColor: '#0f172a',
    accentColor: '#0f766e',
    swatch: 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%)',
    isDarkSurface: false,
  },
  cream: {
    label: 'كريمي دافئ',
    cardBg: '#fdf6ec',
    cardBg2: '#f3e5cf',
    qrTileBg: '#fffdf9',
    textColor: '#292018',
    subColor: '#6b5b4a',
    borderColor: '#dfc6a4',
    defaultQrColor: '#451a03',
    accentColor: '#b45309',
    swatch: 'linear-gradient(135deg, #fdf6ec 0%, #ecd6b8 100%)',
    isDarkSurface: false,
  },
  dark: {
    label: 'داكن فاخر',
    cardBg: '#0f172a',
    cardBg2: '#1e293b',
    qrTileBg: '#ffffff',
    textColor: '#f8fafc',
    subColor: '#94a3b8',
    borderColor: '#334155',
    defaultQrColor: '#0f172a',
    accentColor: '#10b981',
    swatch: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
    isDarkSurface: true,
  },
  emerald: {
    label: 'زمردي أنيق',
    cardBg: '#064e3b',
    cardBg2: '#047857',
    qrTileBg: '#ffffff',
    textColor: '#ecfdf5',
    subColor: '#a7f3d0',
    borderColor: '#34d399',
    defaultQrColor: '#064e3b',
    accentColor: '#10b981',
    swatch: 'linear-gradient(135deg, #064e3b 0%, #10b981 100%)',
    isDarkSurface: true,
  },
  gold: {
    label: 'ذهبي ملكي',
    cardBg: '#181410',
    cardBg2: '#332613',
    qrTileBg: '#fffbeb',
    textColor: '#fef3c7',
    subColor: '#fcd34d',
    borderColor: '#d97706',
    defaultQrColor: '#78350f',
    accentColor: '#f59e0b',
    swatch: 'linear-gradient(135deg, #f59e0b 0%, #78350f 100%)',
    isDarkSurface: true,
  },
  midnight: {
    label: 'كحلي ليلي',
    cardBg: '#0a0f2c',
    cardBg2: '#1e1b4b',
    qrTileBg: '#ffffff',
    textColor: '#eef2ff',
    subColor: '#a5b4fc',
    borderColor: '#6366f1',
    defaultQrColor: '#1e1b4b',
    accentColor: '#818cf8',
    swatch: 'linear-gradient(135deg, #0a0f2c 0%, #4338ca 100%)',
    isDarkSurface: true,
  },
  sunset: {
    label: 'غروب دافئ',
    cardBg: '#7c2d12',
    cardBg2: '#db2777',
    qrTileBg: '#ffffff',
    textColor: '#fff7ed',
    subColor: '#fed7aa',
    borderColor: '#fb923c',
    defaultQrColor: '#9a3412',
    accentColor: '#f97316',
    swatch: 'linear-gradient(135deg, #f97316 0%, #db2777 100%)',
    isDarkSurface: true,
  },
  rose: {
    label: 'وردي مخملي',
    cardBg: '#fff1f2',
    cardBg2: '#ffe4e6',
    qrTileBg: '#ffffff',
    textColor: '#4c0519',
    subColor: '#9f1239',
    borderColor: '#fda4af',
    defaultQrColor: '#881337',
    accentColor: '#e11d48',
    swatch: 'linear-gradient(135deg, #fff1f2 0%, #fda4af 100%)',
    isDarkSurface: false,
  },
  ocean: {
    label: 'أزرق محيطي',
    cardBg: '#0c4a6e',
    cardBg2: '#0284c7',
    qrTileBg: '#ffffff',
    textColor: '#f0f9ff',
    subColor: '#bae6fd',
    borderColor: '#38bdf8',
    defaultQrColor: '#0c4a6e',
    accentColor: '#0ea5e9',
    swatch: 'linear-gradient(135deg, #0c4a6e 0%, #38bdf8 100%)',
    isDarkSurface: true,
  },
  royal: {
    label: 'بنفسجي ملكي',
    cardBg: '#3b0764',
    cardBg2: '#7e22ce',
    qrTileBg: '#ffffff',
    textColor: '#faf5ff',
    subColor: '#e9d5ff',
    borderColor: '#c084fc',
    defaultQrColor: '#4c1d95',
    accentColor: '#a855f7',
    swatch: 'linear-gradient(135deg, #3b0764 0%, #9333ea 100%)',
    isDarkSurface: true,
  },
  obsidian: {
    label: 'أوبسيديان نيون',
    cardBg: '#09090b',
    cardBg2: '#18181b',
    qrTileBg: '#ffffff',
    textColor: '#fafafa',
    subColor: '#34d399',
    borderColor: '#10b981',
    defaultQrColor: '#09090b',
    accentColor: '#10b981',
    swatch: 'linear-gradient(135deg, #09090b 0%, #059669 100%)',
    isDarkSurface: true,
  },
  terracotta: {
    label: 'تيراكوتا عصري',
    cardBg: '#fef2f2',
    cardBg2: '#fed7aa',
    qrTileBg: '#ffffff',
    textColor: '#431407',
    subColor: '#9a3412',
    borderColor: '#fdba74',
    defaultQrColor: '#7c2d12',
    accentColor: '#ea580c',
    swatch: 'linear-gradient(135deg, #ffedd5 0%, #ea580c 100%)',
    isDarkSurface: false,
  },
  custom: {
    label: 'تخصيص حر',
    cardBg: '#0f766e',
    cardBg2: '#0f172a',
    qrTileBg: '#ffffff',
    textColor: '#ffffff',
    subColor: '#cbd5e1',
    borderColor: '#2dd4bf',
    defaultQrColor: '#0f172a',
    accentColor: '#14b8a6',
    swatch: 'conic-gradient(from 90deg, #10b981, #3b82f6, #ec4899, #f59e0b, #10b981)',
    isDarkSurface: true,
  },
};

export function getLocalizedQrBgLabel(preset: QrBgPreset): string {
  return QR_BG_THEMES[preset]?.label || 'أبيض نقي';
}

function parseHexRgb(hex: string): [number, number, number] | null {
  const clean = (hex || '').trim().replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? [r, g, b] : null;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? [r, g, b] : null;
  }
  return null;
}

export function getRelativeLuminance(hex: string): number {
  const rgb = parseHexRgb(hex);
  if (!rgb) return 0.5;
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
}

export function getQrContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = getRelativeLuminance(fgHex);
  const l2 = getRelativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface QRCodeViewProps {
  url: string;
  restaurantName?: string;
  logoUrl?: string;
  size?: number;
  dotStyle?: QrDotStyle;
  eyeOuterStyle?: QrEyeOuterStyle;
  eyeInnerStyle?: QrEyeInnerStyle;
  bgPreset?: QrBgPreset;
  customBg1?: string;
  customBg2?: string;
  bgGradientAngle?: number;
  bgPattern?: QrBgPattern;
  framePreset?: QrFramePreset;
  qrColor?: string;
  qrUseGradient?: boolean;
  qrColor2?: string;
  qrGradientDir?: QrGradientDir;
  eyeColor?: string;
  tileBgMode?: QrTileBgMode;
  tileCustomBg?: string;
  tileBorder?: boolean;
  showLogo?: boolean;
  centerMode?: QrCenterMode;
  logoShape?: QrLogoShape;
  logoSize?: QrLogoSize;
  customTitle?: string;
  customSubtitle?: string;
  customCta?: string;
  tableNumber?: string;
  showUrlFooter?: boolean;
  hideActions?: boolean;
  onCopied?: () => void;
  isStore?: boolean;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(Math.max(0, r), w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawLeafRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(Math.max(0, r), w / 2, h / 2);
  // Top-left & bottom-right rounded; top-right & bottom-left sharp
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

function drawShieldRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(Math.max(0, r), w / 2, h / 2);
  // Top rounded slightly, bottom heavily rounded like a badge/shield
  const topR = rad * 0.45;
  const botR = rad * 1.15;
  ctx.beginPath();
  ctx.moveTo(x + topR, y);
  ctx.arcTo(x + w, y, x + w, y + topR, topR);
  ctx.lineTo(x + w, y + h - botR);
  ctx.arcTo(x + w, y + h, x + w - botR, y + h, botR);
  ctx.lineTo(x + botR, y + h);
  ctx.arcTo(x, y + h, x, y + h - botR, botR);
  ctx.lineTo(x, y + topR);
  ctx.arcTo(x, y, x + topR, y, topR);
  ctx.closePath();
}

function isFinderCell(row: number, col: number, count: number): boolean {
  const inTopLeft = row < 7 && col < 7;
  const inTopRight = row < 7 && col >= count - 7;
  const inBottomLeft = row >= count - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

function createQrFillStyle(
  ctx: CanvasRenderingContext2D,
  pixelSize: number,
  fgColor: string,
  useGradient: boolean,
  fgColor2: string,
  dir: QrGradientDir
): string | CanvasGradient {
  if (!useGradient || !fgColor2 || fgColor2 === fgColor) return fgColor;
  let grad: CanvasGradient;
  if (dir === 'vertical') {
    grad = ctx.createLinearGradient(0, 0, 0, pixelSize);
  } else if (dir === 'horizontal') {
    grad = ctx.createLinearGradient(0, 0, pixelSize, 0);
  } else if (dir === 'radial') {
    const c = pixelSize / 2;
    grad = ctx.createRadialGradient(c, c, pixelSize * 0.08, c, c, pixelSize * 0.68);
  } else {
    grad = ctx.createLinearGradient(0, 0, pixelSize, pixelSize);
  }
  grad.addColorStop(0, fgColor);
  grad.addColorStop(1, fgColor2);
  return grad;
}

function drawFourPointStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const inner = r * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const rad = i % 2 === 0 ? r : inner;
    const px = cx + Math.cos(angle) * rad;
    const py = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawStyledQrToCanvas(
  canvas: HTMLCanvasElement,
  url: string,
  pixelSize: number,
  opts: {
    dotStyle: QrDotStyle;
    eyeOuterStyle: QrEyeOuterStyle;
    eyeInnerStyle: QrEyeInnerStyle;
    fgColor: string;
    qrUseGradient: boolean;
    fgColor2: string;
    qrGradientDir: QrGradientDir;
    eyeColor: string;
    tileBg: string;
    restaurantName: string;
    logoImg: HTMLImageElement | null;
    centerMode: QrCenterMode;
    logoShape: QrLogoShape;
    logoSize: QrLogoSize;
  }
) {
  const {
    dotStyle,
    eyeOuterStyle,
    eyeInnerStyle,
    fgColor,
    qrUseGradient,
    fgColor2,
    qrGradientDir,
    eyeColor,
    tileBg,
    restaurantName,
    logoImg,
    centerMode,
    logoShape,
    logoSize,
  } = opts;

  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const modules = qr.modules;
  const count = modules.size;
  const marginModules = 2;
  const totalModules = count + marginModules * 2;

  const scale = 2;
  canvas.width = pixelSize * scale;
  canvas.height = pixelSize * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);

  ctx.fillStyle = tileBg;
  ctx.fillRect(0, 0, pixelSize, pixelSize);

  const cell = pixelSize / totalModules;
  const offset = marginModules * cell;
  const fgFill = createQrFillStyle(ctx, pixelSize, fgColor, qrUseGradient, fgColor2, qrGradientDir);
  ctx.fillStyle = fgFill;

  const showCenter = centerMode !== 'none';
  const clearRatio = logoSize === 'sm' ? 0.17 : logoSize === 'lg' ? 0.25 : 0.21;
  const centerClearModules = showCenter ? Math.floor(count * clearRatio) : 0;
  const centerMin = Math.floor((count - centerClearModules) / 2);
  const centerMax = centerMin + centerClearModules;

  const isCellCleared = (r: number, c: number) =>
    showCenter && r >= centerMin && r < centerMax && c >= centerMin && c < centerMax;

  // Draw data modules
  if (dotStyle === 'bars') {
    for (let c = 0; c < count; c++) {
      let r = 0;
      while (r < count) {
        const active =
          modules.get(r, c) && !isFinderCell(r, c, count) && !isCellCleared(r, c);
        if (!active) {
          r++;
          continue;
        }
        let endR = r + 1;
        while (
          endR < count &&
          modules.get(endR, c) &&
          !isFinderCell(endR, c, count) &&
          !isCellCleared(endR, c)
        ) {
          endR++;
        }
        const x = offset + c * cell + cell * 0.14;
        const y = offset + r * cell + cell * 0.08;
        const w = cell * 0.72;
        const h = (endR - r) * cell - cell * 0.16;
        drawRoundedRect(ctx, x, y, w, Math.max(w, h), w / 2);
        ctx.fill();
        r = endR;
      }
    }
  } else {
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!modules.get(r, c)) continue;
        if (isFinderCell(r, c, count)) continue;
        if (isCellCleared(r, c)) continue;

        const x = offset + c * cell;
        const y = offset + r * cell;

        if (dotStyle === 'dots') {
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42, 0, Math.PI * 2);
          ctx.fill();
        } else if (dotStyle === 'rounded') {
          drawRoundedRect(ctx, x + cell * 0.07, y + cell * 0.07, cell * 0.86, cell * 0.86, cell * 0.3);
          ctx.fill();
        } else if (dotStyle === 'diamond') {
          const cx = x + cell / 2;
          const cy = y + cell / 2;
          const rHalf = cell * 0.48;
          ctx.beginPath();
          ctx.moveTo(cx, cy - rHalf);
          ctx.lineTo(cx + rHalf, cy);
          ctx.lineTo(cx, cy + rHalf);
          ctx.lineTo(cx - rHalf, cy);
          ctx.closePath();
          ctx.fill();
        } else if (dotStyle === 'classy') {
          drawLeafRect(ctx, x + cell * 0.05, y + cell * 0.05, cell * 0.9, cell * 0.9, cell * 0.44);
          ctx.fill();
        } else if (dotStyle === 'star') {
          drawFourPointStar(ctx, x + cell / 2, y + cell / 2, cell * 0.52);
        } else {
          ctx.fillRect(x, y, cell + 0.35, cell + 0.35);
        }
      }
    }
  }

  // Draw the 3 Finder Patterns with independent outer/inner styles & accent color
  const finderOrigins: Array<[number, number]> = [
    [0, 0],
    [0, count - 7],
    [count - 7, 0],
  ];
  const resolvedEyeFill = eyeColor ? eyeColor : fgFill;

  for (const [fr, fc] of finderOrigins) {
    const fx = offset + fc * cell;
    const fy = offset + fr * cell;
    const outerSize = 7 * cell;
    const innerCutSize = 5 * cell;
    const pupilSize = 3 * cell;

    // Outer frame
    ctx.fillStyle = resolvedEyeFill;
    if (eyeOuterStyle === 'circle') {
      ctx.beginPath();
      ctx.arc(fx + outerSize / 2, fy + outerSize / 2, outerSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (eyeOuterStyle === 'leaf') {
      drawLeafRect(ctx, fx, fy, outerSize, outerSize, cell * 2.4);
      ctx.fill();
    } else if (eyeOuterStyle === 'shield') {
      drawShieldRect(ctx, fx, fy, outerSize, outerSize, cell * 2.1);
      ctx.fill();
    } else if (eyeOuterStyle === 'rounded') {
      drawRoundedRect(ctx, fx, fy, outerSize, outerSize, cell * 1.75);
      ctx.fill();
    } else {
      ctx.fillRect(fx, fy, outerSize, outerSize);
    }

    // Inner quiet cutout
    ctx.fillStyle = tileBg;
    if (eyeOuterStyle === 'circle') {
      ctx.beginPath();
      ctx.arc(fx + outerSize / 2, fy + outerSize / 2, innerCutSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (eyeOuterStyle === 'leaf') {
      drawLeafRect(ctx, fx + cell, fy + cell, innerCutSize, innerCutSize, cell * 1.65);
      ctx.fill();
    } else if (eyeOuterStyle === 'shield') {
      drawShieldRect(ctx, fx + cell, fy + cell, innerCutSize, innerCutSize, cell * 1.4);
      ctx.fill();
    } else if (eyeOuterStyle === 'rounded') {
      drawRoundedRect(ctx, fx + cell, fy + cell, innerCutSize, innerCutSize, cell * 1.15);
      ctx.fill();
    } else {
      ctx.fillRect(fx + cell, fy + cell, innerCutSize, innerCutSize);
    }

    // Center eye pupil
    ctx.fillStyle = resolvedEyeFill;
    const px = fx + 2 * cell;
    const py = fy + 2 * cell;
    if (eyeInnerStyle === 'circle') {
      ctx.beginPath();
      ctx.arc(fx + outerSize / 2, fy + outerSize / 2, pupilSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (eyeInnerStyle === 'diamond') {
      const cx = fx + outerSize / 2;
      const cy = fy + outerSize / 2;
      const r = pupilSize * 0.56;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
    } else if (eyeInnerStyle === 'rounded') {
      drawRoundedRect(ctx, px, py, pupilSize, pupilSize, cell * 0.9);
      ctx.fill();
    } else {
      ctx.fillRect(px, py, pupilSize, pupilSize);
    }
  }

  // Optional Centerpiece (logo / initials / scan icon / utensils icon)
  if (showCenter) {
    const boxSize = Math.max(24, centerClearModules * cell * 0.9);
    const bx = (pixelSize - boxSize) / 2;
    const by = (pixelSize - boxSize) / 2;
    const cx = pixelSize / 2;
    const cy = pixelSize / 2;
    const isCircle = logoShape === 'circle';
    const radius = isCircle ? boxSize / 2 : boxSize * 0.24;

    // Backing halo so QR modules never bleed into center badge
    ctx.fillStyle = tileBg;
    if (isCircle) {
      ctx.beginPath();
      ctx.arc(cx, cy, boxSize / 2 + 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawRoundedRect(ctx, bx - 4, by - 4, boxSize + 8, boxSize + 8, boxSize * 0.28);
      ctx.fill();
    }

    // Subtle crisp border
    ctx.strokeStyle = eyeColor || fgColor;
    ctx.lineWidth = Math.max(1.6, pixelSize * 0.008);
    if (isCircle) {
      ctx.beginPath();
      ctx.arc(cx, cy, boxSize / 2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      drawRoundedRect(ctx, bx, by, boxSize, boxSize, radius);
      ctx.stroke();
    }

    const drawInitials = () => {
      ctx.fillStyle = eyeColor || fgColor;
      ctx.font = `900 ${Math.round(boxSize * 0.42)}px Tajawal, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((restaurantName || 'M').trim().slice(0, 2), cx, cy + 1);
    };

    if (centerMode === 'logo' && logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
      ctx.save();
      if (isCircle) {
        ctx.beginPath();
        ctx.arc(cx, cy, boxSize / 2 - 2, 0, Math.PI * 2);
      } else {
        drawRoundedRect(ctx, bx + 2, by + 2, boxSize - 4, boxSize - 4, radius * 0.85);
      }
      ctx.clip();
      ctx.drawImage(logoImg, bx + 2, by + 2, boxSize - 4, boxSize - 4);
      ctx.restore();
    } else if (centerMode === 'scan') {
      // Minimalist viewfinder glyph
      const s = boxSize * 0.46;
      const hs = s / 2;
      const leg = s * 0.34;
      ctx.strokeStyle = eyeColor || fgColor;
      ctx.lineWidth = Math.max(2, boxSize * 0.075);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      // TL
      ctx.moveTo(cx - hs, cy - hs + leg);
      ctx.lineTo(cx - hs, cy - hs);
      ctx.lineTo(cx - hs + leg, cy - hs);
      // TR
      ctx.moveTo(cx + hs - leg, cy - hs);
      ctx.lineTo(cx + hs, cy - hs);
      ctx.lineTo(cx + hs, cy - hs + leg);
      // BR
      ctx.moveTo(cx + hs, cy + hs - leg);
      ctx.lineTo(cx + hs, cy + hs);
      ctx.lineTo(cx + hs - leg, cy + hs);
      // BL
      ctx.moveTo(cx - hs + leg, cy + hs);
      ctx.lineTo(cx - hs, cy + hs);
      ctx.lineTo(cx - hs, cy + hs - leg);
      ctx.stroke();

      // Inner mini square
      ctx.fillStyle = eyeColor || fgColor;
      drawRoundedRect(ctx, cx - s * 0.16, cy - s * 0.16, s * 0.32, s * 0.32, s * 0.08);
      ctx.fill();
    } else if (centerMode === 'utensils') {
      // Crisp geometric cloche / platter icon
      const s = boxSize * 0.5;
      ctx.strokeStyle = eyeColor || fgColor;
      ctx.fillStyle = eyeColor || fgColor;
      ctx.lineWidth = Math.max(2, boxSize * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.18, s * 0.42, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.5, cy + s * 0.24);
      ctx.lineTo(cx + s * 0.5, cy + s * 0.24);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.28, Math.max(1.5, boxSize * 0.06), 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawInitials();
    }
  }
}

function buildQrSvgString(
  url: string,
  opts: {
    dotStyle: QrDotStyle;
    eyeOuterStyle: QrEyeOuterStyle;
    eyeInnerStyle: QrEyeInnerStyle;
    fgColor: string;
    qrUseGradient: boolean;
    fgColor2: string;
    qrGradientDir: QrGradientDir;
    eyeColor: string;
    tileBg: string;
    centerMode: QrCenterMode;
    logoSize: QrLogoSize;
  }
): string {
  const {
    dotStyle,
    eyeOuterStyle,
    eyeInnerStyle,
    fgColor,
    qrUseGradient,
    fgColor2,
    qrGradientDir,
    eyeColor,
    tileBg,
    centerMode,
    logoSize,
  } = opts;
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const modules = qr.modules;
  const count = modules.size;
  const margin = 2;
  const size = 512;
  const total = count + margin * 2;
  const cell = size / total;
  const offset = margin * cell;

  const showCenter = centerMode !== 'none';
  const clearRatio = logoSize === 'sm' ? 0.17 : logoSize === 'lg' ? 0.25 : 0.21;
  const centerClearModules = showCenter ? Math.floor(count * clearRatio) : 0;
  const centerMin = Math.floor((count - centerClearModules) / 2);
  const centerMax = centerMin + centerClearModules;

  const fgAttr = qrUseGradient && fgColor2 && fgColor2 !== fgColor ? 'url(#qrFgGrad)' : fgColor;
  const eyeFillAttr = eyeColor || fgAttr;

  let gradDef = '';
  if (qrUseGradient && fgColor2 && fgColor2 !== fgColor) {
    if (qrGradientDir === 'radial') {
      gradDef = `<radialGradient id="qrFgGrad" cx="50%" cy="50%" r="65%"><stop offset="0%" stop-color="${fgColor}"/><stop offset="100%" stop-color="${fgColor2}"/></radialGradient>`;
    } else {
      const coords =
        qrGradientDir === 'vertical'
          ? 'x1="0%" y1="0%" x2="0%" y2="100%"'
          : qrGradientDir === 'horizontal'
          ? 'x1="0%" y1="0%" x2="100%" y2="0%"'
          : 'x1="0%" y1="0%" x2="100%" y2="100%"';
      gradDef = `<linearGradient id="qrFgGrad" ${coords}><stop offset="0%" stop-color="${fgColor}"/><stop offset="100%" stop-color="${fgColor2}"/></linearGradient>`;
    }
  }

  const shapes: string[] = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!modules.get(r, c)) continue;
      if (isFinderCell(r, c, count)) continue;
      if (showCenter && r >= centerMin && r < centerMax && c >= centerMin && c < centerMax) continue;
      const x = offset + c * cell;
      const y = offset + r * cell;
      if (dotStyle === 'dots') {
        shapes.push(`<circle cx="${(x + cell / 2).toFixed(2)}" cy="${(y + cell / 2).toFixed(2)}" r="${(cell * 0.42).toFixed(2)}"/>`);
      } else if (dotStyle === 'rounded' || dotStyle === 'classy' || dotStyle === 'bars') {
        const rad = dotStyle === 'bars' ? cell * 0.36 : cell * 0.3;
        shapes.push(`<rect x="${(x + cell * 0.08).toFixed(2)}" y="${(y + cell * 0.08).toFixed(2)}" width="${(cell * 0.84).toFixed(2)}" height="${(cell * 0.84).toFixed(2)}" rx="${rad.toFixed(2)}"/>`);
      } else if (dotStyle === 'diamond' || dotStyle === 'star') {
        const cx = x + cell / 2;
        const cy = y + cell / 2;
        const rh = cell * 0.48;
        shapes.push(`<polygon points="${cx.toFixed(2)},${(cy - rh).toFixed(2)} ${(cx + rh).toFixed(2)},${cy.toFixed(2)} ${cx.toFixed(2)},${(cy + rh).toFixed(2)} ${(cx - rh).toFixed(2)},${cy.toFixed(2)}"/>`);
      } else {
        shapes.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(cell + 0.3).toFixed(2)}" height="${(cell + 0.3).toFixed(2)}"/>`);
      }
    }
  }

  const finderOrigins: Array<[number, number]> = [
    [0, 0],
    [0, count - 7],
    [count - 7, 0],
  ];
  const eyes: string[] = [];
  for (const [fr, fc] of finderOrigins) {
    const fx = offset + fc * cell;
    const fy = offset + fr * cell;
    const oSize = 7 * cell;
    const iSize = 5 * cell;
    const pSize = 3 * cell;
    const outerRx =
      eyeOuterStyle === 'circle'
        ? oSize / 2
        : eyeOuterStyle === 'square'
        ? 0
        : cell * 1.65;
    const innerRx =
      eyeOuterStyle === 'circle'
        ? iSize / 2
        : eyeOuterStyle === 'square'
        ? 0
        : cell * 1.1;
    const pupilRx =
      eyeInnerStyle === 'circle'
        ? pSize / 2
        : eyeInnerStyle === 'square'
        ? 0
        : cell * 0.85;

    eyes.push(`<rect x="${fx.toFixed(2)}" y="${fy.toFixed(2)}" width="${oSize.toFixed(2)}" height="${oSize.toFixed(2)}" rx="${outerRx.toFixed(2)}" fill="${eyeFillAttr}"/>`);
    eyes.push(`<rect x="${(fx + cell).toFixed(2)}" y="${(fy + cell).toFixed(2)}" width="${iSize.toFixed(2)}" height="${iSize.toFixed(2)}" rx="${innerRx.toFixed(2)}" fill="${tileBg}"/>`);
    if (eyeInnerStyle === 'diamond') {
      const cx = fx + oSize / 2;
      const cy = fy + oSize / 2;
      const r = pSize * 0.56;
      eyes.push(`<polygon points="${cx.toFixed(2)},${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)},${cy.toFixed(2)} ${cx.toFixed(2)},${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)},${cy.toFixed(2)}" fill="${eyeFillAttr}"/>`);
    } else {
      eyes.push(`<rect x="${(fx + 2 * cell).toFixed(2)}" y="${(fy + 2 * cell).toFixed(2)}" width="${pSize.toFixed(2)}" height="${pSize.toFixed(2)}" rx="${pupilRx.toFixed(2)}" fill="${eyeFillAttr}"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  ${gradDef ? `<defs>${gradDef}</defs>` : ''}
  <rect width="${size}" height="${size}" fill="${tileBg}" rx="28"/>
  <g fill="${fgAttr}">${shapes.join('')}</g>
  <g>${eyes.join('')}</g>
</svg>`;
}

function drawCanvasPatternOverlay(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pattern: QrBgPattern,
  isDark: boolean,
  accentColor: string
) {
  if (pattern === 'none') return;
  ctx.save();
  const baseInk = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.065)';

  if (pattern === 'aura') {
    const g1 = ctx.createRadialGradient(W * 0.18, H * 0.14, 10, W * 0.18, H * 0.14, W * 0.65);
    g1.addColorStop(0, isDark ? 'rgba(255,255,255,0.18)' : `${accentColor}26`);
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    const g2 = ctx.createRadialGradient(W * 0.86, H * 0.88, 10, W * 0.86, H * 0.88, W * 0.6);
    g2.addColorStop(0, `${accentColor}33`);
    g2.addColorStop(1, 'transparent');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
  } else if (pattern === 'dots') {
    ctx.fillStyle = baseInk;
    for (let y = 24; y < H; y += 34) {
      for (let x = 24; x < W; x += 34) {
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === 'grid') {
    ctx.strokeStyle = baseInk;
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  } else if (pattern === 'diagonal') {
    ctx.strokeStyle = baseInk;
    ctx.lineWidth = 2;
    for (let i = -H; i < W + H; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + H * 0.75, H);
      ctx.stroke();
    }
  } else if (pattern === 'waves') {
    ctx.strokeStyle = baseInk;
    ctx.lineWidth = 2.2;
    for (let y = 40; y < H; y += 56) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const wy = y + Math.sin((x / W) * Math.PI * 4) * 14;
        if (x === 0) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
  } else if (pattern === 'sparkle') {
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.22)' : `${accentColor}40`;
    const points = [
      [0.12, 0.11, 10],
      [0.88, 0.13, 12],
      [0.14, 0.45, 7],
      [0.89, 0.54, 8],
      [0.16, 0.85, 11],
      [0.85, 0.87, 9],
      [0.5, 0.06, 6],
    ];
    for (const [rx, ry, r] of points) {
      drawFourPointStar(ctx, W * rx, H * ry, r);
    }
  }
  ctx.restore();
}

function getPreviewPatternCss(
  pattern: QrBgPattern,
  isDark: boolean,
  accentColor: string
): React.CSSProperties {
  const dotInk = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)';
  const lineInk = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
  if (pattern === 'dots') {
    return {
      backgroundImage: `radial-gradient(${dotInk} 1.3px, transparent 1.3px)`,
      backgroundSize: '16px 16px',
    };
  }
  if (pattern === 'grid') {
    return {
      backgroundImage: `linear-gradient(${lineInk} 1px, transparent 1px), linear-gradient(90deg, ${lineInk} 1px, transparent 1px)`,
      backgroundSize: '22px 22px',
    };
  }
  if (pattern === 'diagonal') {
    return {
      backgroundImage: `repeating-linear-gradient(-45deg, ${lineInk} 0px, ${lineInk} 1.5px, transparent 1.5px, transparent 14px)`,
    };
  }
  if (pattern === 'aura') {
    return {
      backgroundImage: `radial-gradient(circle at 18% 15%, ${isDark ? 'rgba(255,255,255,0.2)' : `${accentColor}2b`}, transparent 55%), radial-gradient(circle at 85% 88%, ${accentColor}38, transparent 52%)`,
    };
  }
  if (pattern === 'waves') {
    return {
      backgroundImage: `radial-gradient(ellipse at 50% 0%, transparent 64%, ${lineInk} 65%, ${lineInk} 68%, transparent 69%)`,
      backgroundSize: '42px 24px',
    };
  }
  if (pattern === 'sparkle') {
    return {
      backgroundImage: `radial-gradient(circle at 15% 18%, ${isDark ? 'rgba(255,255,255,0.24)' : `${accentColor}44`} 2px, transparent 3px), radial-gradient(circle at 86% 24%, ${isDark ? 'rgba(255,255,255,0.2)' : `${accentColor}40`} 2.2px, transparent 3.2px), radial-gradient(circle at 82% 82%, ${isDark ? 'rgba(255,255,255,0.22)' : `${accentColor}44`} 2px, transparent 3px), radial-gradient(circle at 18% 78%, ${isDark ? 'rgba(255,255,255,0.18)' : `${accentColor}3a`} 1.8px, transparent 2.8px)`,
    };
  }
  return {};
}

export const QRCodeView: React.FC<QRCodeViewProps> = ({
  url,
  restaurantName,
  logoUrl,
  size = 204,
  dotStyle = 'rounded',
  eyeOuterStyle = 'rounded',
  eyeInnerStyle = 'rounded',
  bgPreset = 'white',
  customBg1 = '#0f766e',
  customBg2 = '#0f172a',
  bgGradientAngle = 145,
  bgPattern = 'aura',
  framePreset = 'table',
  qrColor,
  qrUseGradient = false,
  qrColor2 = '#059669',
  qrGradientDir = 'diagonal',
  eyeColor = '',
  tileBgMode = 'light',
  tileCustomBg = '#ffffff',
  tileBorder = true,
  showLogo = false,
  centerMode,
  logoShape = 'rounded',
  logoSize = 'md',
  customTitle,
  customSubtitle,
  customCta,
  tableNumber,
  showUrlFooter = false,
  hideActions = false,
  onCopied,
  isStore = false,
}) => {
  const displayRestName = (customTitle ?? '').trim() || restaurantName || 'مشروعي';
  const defaultSub = isStore
    ? 'امسح الكود بالكاميرا لفتح المتجر والطلب'
    : 'امسح الكود بالكاميرا لفتح المنيو والطلب';
  const displaySub = (customSubtitle ?? '').trim() || defaultSub;
  const defaultCta =
    framePreset === 'badge' || framePreset === 'modern' || framePreset === 'poster'
      ? 'امسح للطلب الفوري'
      : 'امسح الكود للطلب المباشر';
  const displayCta = (customCta ?? '').trim() || defaultCta;
  const cleanTable = (tableNumber ?? '').trim();

  const effectiveUrl = useMemo(() => {
    if (!url || !cleanTable) return url;
    try {
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}table=${encodeURIComponent(cleanTable)}`;
    } catch {
      return url;
    }
  }, [url, cleanTable]);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cardDataUrl, setCardDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const bgTheme = useMemo<QrThemeDefinition>(() => {
    if (bgPreset === 'custom') {
      const c1 = customBg1 || '#0f766e';
      const c2 = customBg2 || '#0f172a';
      const dark = getRelativeLuminance(c1) * 0.5 + getRelativeLuminance(c2) * 0.5 < 0.38;
      return {
        ...QR_BG_THEMES.custom,
        cardBg: c1,
        cardBg2: c2,
        textColor: dark ? '#f8fafc' : '#0f172a',
        subColor: dark ? '#cbd5e1' : '#475569',
        borderColor: dark ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.18)',
        accentColor: c1,
        isDarkSurface: dark,
      };
    }
    return QR_BG_THEMES[bgPreset] || QR_BG_THEMES.white;
  }, [bgPreset, customBg1, customBg2]);

  const effectiveQrColor = qrColor || bgTheme.defaultQrColor;

  const qrTileBg = useMemo(() => {
    if (tileBgMode === 'custom' && tileCustomBg) return tileCustomBg;
    if (tileBgMode === 'cream') return '#fffdf7';
    if (tileBgMode === 'soft') return '#f1f5f9';
    if (tileBgMode === 'dark') return '#0f172a';
    return bgPreset === 'cream' ? '#fffdf9' : bgPreset === 'gold' ? '#fffbeb' : '#ffffff';
  }, [tileBgMode, tileCustomBg, bgPreset]);

  const resolvedCenterMode: QrCenterMode = useMemo(() => {
    if (centerMode) return centerMode;
    return showLogo ? 'logo' : 'none';
  }, [centerMode, showLogo]);

  useEffect(() => {
    if (!effectiveUrl) return;
    let active = true;

    const renderAll = (loadedLogo: HTMLImageElement | null) => {
      if (!active) return;

      const qrOpts = {
        dotStyle,
        eyeOuterStyle,
        eyeInnerStyle,
        fgColor: effectiveQrColor,
        qrUseGradient,
        fgColor2: qrColor2,
        qrGradientDir,
        eyeColor,
        tileBg: qrTileBg,
        restaurantName: displayRestName,
        logoImg: loadedLogo,
        centerMode: resolvedCenterMode,
        logoShape,
        logoSize,
      };

      if (qrCanvasRef.current) {
        drawStyledQrToCanvas(qrCanvasRef.current, effectiveUrl, size, qrOpts);
      }

      // Render high-res composite stand card for crisp PNG download & Print
      const outCanvas = document.createElement('canvas');
      const W = 820;
      const isMinimal = framePreset === 'minimal';
      const H = isMinimal ? 840 : showUrlFooter ? 1080 : 1020;
      outCanvas.width = W;
      outCanvas.height = H;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return;

      const fontStack = 'Tajawal, sans-serif';
      const radAngle = ((bgGradientAngle - 90) * Math.PI) / 180;
      const gx = Math.cos(radAngle) * (W / 2);
      const gy = Math.sin(radAngle) * (H / 2);
      const grad = ctx.createLinearGradient(W / 2 - gx, H / 2 - gy, W / 2 + gx, H / 2 + gy);
      grad.addColorStop(0, bgTheme.cardBg);
      grad.addColorStop(1, bgTheme.cardBg2);

      ctx.save();
      drawRoundedRect(ctx, 0, 0, W, H, framePreset === 'sticker' ? 86 : 46);
      ctx.clip();

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      drawCanvasPatternOverlay(ctx, W, H, bgPattern, bgTheme.isDarkSurface, bgTheme.accentColor);

      // Frame treatments
      if (framePreset === 'classic') {
        ctx.strokeStyle = bgTheme.borderColor;
        ctx.lineWidth = 10;
        drawRoundedRect(ctx, 24, 24, W - 48, H - 48, 34);
        ctx.stroke();
        ctx.lineWidth = 3;
        drawRoundedRect(ctx, 38, 38, W - 76, H - 76, 26);
        ctx.stroke();
      } else if (framePreset === 'badge') {
        ctx.strokeStyle = bgTheme.borderColor;
        ctx.lineWidth = 5;
        drawRoundedRect(ctx, 16, 16, W - 32, H - 32, 38);
        ctx.stroke();
      } else if (framePreset === 'modern') {
        ctx.fillStyle = bgTheme.accentColor;
        ctx.fillRect(0, 0, W, 18);
      } else if (framePreset === 'ribbon') {
        ctx.fillStyle = bgTheme.accentColor;
        drawRoundedRect(ctx, 48, 32, W - 96, 118, 28);
        ctx.fill();
      } else if (framePreset === 'sticker') {
        ctx.setLineDash([14, 10]);
        ctx.strokeStyle = bgTheme.borderColor;
        ctx.lineWidth = 4;
        drawRoundedRect(ctx, 20, 20, W - 40, H - 40, 72);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Header copy
      if (!isMinimal) {
        if (framePreset === 'ribbon') {
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.font = `900 42px ${fontStack}`;
          ctx.fillText(displayRestName, W / 2, 105, W - 140);

          ctx.fillStyle = bgTheme.subColor;
          ctx.font = `700 24px ${fontStack}`;
          ctx.fillText(displaySub, W / 2, 192, W - 100);
        } else {
          ctx.fillStyle = bgTheme.textColor;
          ctx.textAlign = 'center';
          ctx.font = framePreset === 'poster' ? `900 48px ${fontStack}` : `900 44px ${fontStack}`;
          ctx.fillText(displayRestName, W / 2, 114, W - 100);

          ctx.fillStyle = bgTheme.subColor;
          ctx.font = `600 24px ${fontStack}`;
          ctx.fillText(displaySub, W / 2, 164, W - 100);
        }
      }

      // Optional Table Number Badge
      let tileTopOffset = isMinimal ? 94 : framePreset === 'ribbon' ? 228 : 208;
      if (cleanTable && !isMinimal) {
        const pillText = `طاولة ${cleanTable}`;
        ctx.font = `800 23px ${fontStack}`;
        const pillW = Math.min(340, Math.max(170, ctx.measureText(pillText).width + 52));
        const pillH = 44;
        const px = (W - pillW) / 2;
        const py = framePreset === 'ribbon' ? 208 : 186;
        ctx.fillStyle = bgTheme.isDarkSurface ? 'rgba(255,255,255,0.16)' : `${bgTheme.accentColor}1f`;
        drawRoundedRect(ctx, px, py, pillW, pillH, 22);
        ctx.fill();
        ctx.strokeStyle = bgTheme.accentColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = bgTheme.textColor;
        ctx.textAlign = 'center';
        ctx.fillText(pillText, W / 2, py + 30);
        tileTopOffset = py + 62;
      }

      // QR Inner Tile
      const tileSize = 530;
      const tileX = (W - tileSize) / 2;
      const tileY = tileTopOffset;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
      ctx.shadowBlur = 32;
      ctx.shadowOffsetY = 14;
      ctx.fillStyle = qrTileBg;
      drawRoundedRect(ctx, tileX, tileY, tileSize, tileSize, 36);
      ctx.fill();
      ctx.restore();

      if (tileBorder) {
        ctx.strokeStyle = bgTheme.borderColor;
        ctx.lineWidth = 3;
        drawRoundedRect(ctx, tileX, tileY, tileSize, tileSize, 36);
        ctx.stroke();
      }

      // Crisp QR Matrix
      const qrOff = document.createElement('canvas');
      drawStyledQrToCanvas(qrOff, effectiveUrl, 480, qrOpts);
      ctx.drawImage(qrOff, tileX + 25, tileY + 25, 480, 480);

      // Bottom Caption / CTA Pill
      const bottomY = tileY + tileSize + 72;
      if (isMinimal) {
        ctx.fillStyle = bgTheme.textColor;
        ctx.textAlign = 'center';
        ctx.font = `900 34px ${fontStack}`;
        ctx.fillText(displayRestName, W / 2, bottomY + 12, W - 90);
      } else if (framePreset === 'badge' || framePreset === 'modern' || framePreset === 'poster') {
        const pillW = 420;
        const pillH = 66;
        const pillX = (W - pillW) / 2;
        const pillY = tileY + tileSize + 44;
        ctx.fillStyle = effectiveQrColor;
        drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 33);
        ctx.fill();
        ctx.fillStyle = getRelativeLuminance(effectiveQrColor) > 0.55 ? '#0f172a' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = `800 26px ${fontStack}`;
        ctx.fillText(displayCta, W / 2, pillY + 42, pillW - 32);
      } else {
        ctx.fillStyle = bgTheme.textColor;
        ctx.textAlign = 'center';
        ctx.font = `800 29px ${fontStack}`;
        ctx.fillText(displayCta, W / 2, bottomY + 8, W - 90);
      }

      if (showUrlFooter && !isMinimal) {
        const cleanDisplayUrl = effectiveUrl.replace(/^https?:\/\//, '');
        ctx.fillStyle = bgTheme.subColor;
        ctx.textAlign = 'center';
        ctx.font = `600 19px ${fontStack}`;
        ctx.fillText(cleanDisplayUrl, W / 2, H - 38, W - 80);
      }

      ctx.restore();

      try {
        setCardDataUrl(outCanvas.toDataURL('image/png'));
      } catch {
        // Fallback without cross-origin logo if canvas is tainted
        drawStyledQrToCanvas(qrOff, effectiveUrl, 480, {
          ...qrOpts,
          logoImg: null,
          centerMode: resolvedCenterMode === 'logo' ? 'initials' : resolvedCenterMode,
        });
        ctx.drawImage(qrOff, tileX + 25, tileY + 25, 480, 480);
        setCardDataUrl(outCanvas.toDataURL('image/png'));
      }
    };

    if (resolvedCenterMode === 'logo' && logoUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => renderAll(img);
      img.onerror = () => renderAll(null);
      img.src = logoUrl;
    } else {
      renderAll(null);
    }

    return () => {
      active = false;
    };
  }, [
    effectiveUrl,
    size,
    dotStyle,
    eyeOuterStyle,
    eyeInnerStyle,
    bgPreset,
    bgGradientAngle,
    bgPattern,
    framePreset,
    effectiveQrColor,
    qrUseGradient,
    qrColor2,
    qrGradientDir,
    eyeColor,
    qrTileBg,
    tileBorder,
    displayRestName,
    displaySub,
    displayCta,
    cleanTable,
    showUrlFooter,
    logoUrl,
    resolvedCenterMode,
    logoShape,
    logoSize,
    bgTheme,
  ]);

  const handleDownloadPng = () => {
    if (!cardDataUrl) return;
    const safeName = `QR-${displayRestName.replace(/\s+/g, '-')}${cleanTable ? `-T${cleanTable}` : ''}.png`;
    const a = document.createElement('a');
    a.href = cardDataUrl;
    a.download = safeName;
    a.click();
  };

  const handleDownloadSvg = () => {
    if (!effectiveUrl) return;
    const svg = buildQrSvgString(effectiveUrl, {
      dotStyle,
      eyeOuterStyle,
      eyeInnerStyle,
      fgColor: effectiveQrColor,
      qrUseGradient,
      fgColor2: qrColor2,
      qrGradientDir,
      eyeColor,
      tileBg: qrTileBg,
      centerMode: resolvedCenterMode,
      logoSize,
    });
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `QR-${displayRestName.replace(/\s+/g, '-')}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(effectiveUrl);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handlePrint = () => {
    document.body.classList.add('printing-active');
    const cleanup = () => {
      document.body.classList.remove('printing-active');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 1200);
    }, 60);
  };

  const patternCss = useMemo(
    () => getPreviewPatternCss(bgPattern, bgTheme.isDarkSurface, bgTheme.accentColor),
    [bgPattern, bgTheme.isDarkSurface, bgTheme.accentColor]
  );

  const ctaIsLight = getRelativeLuminance(effectiveQrColor) > 0.55;
  const cleanUrlText = effectiveUrl.replace(/^https?:\/\//, '');

  return (
    <div className="mp-qr-preview-wrap">
      {cardDataUrl && (
        <div className="print-only-sheet" dir="rtl" style={{ textAlign: 'center' }}>
          <img
            src={cardDataUrl}
            alt={`كود QR ${displayRestName}`}
            style={{
              width: '360px',
              maxWidth: '90vw',
              height: 'auto',
              margin: '30px auto',
              display: 'block',
              borderRadius: '20px',
            }}
          />
        </div>
      )}

      {/* Styled Live Preview Stand Card */}
      <div
        className={`mp-qr-live-card is-${framePreset}`}
        style={{
          backgroundColor: bgTheme.cardBg,
          backgroundImage: patternCss.backgroundImage
            ? `${patternCss.backgroundImage}, linear-gradient(${bgGradientAngle}deg, ${bgTheme.cardBg}, ${bgTheme.cardBg2})`
            : `linear-gradient(${bgGradientAngle}deg, ${bgTheme.cardBg}, ${bgTheme.cardBg2})`,
          backgroundSize: patternCss.backgroundSize ? `${patternCss.backgroundSize}, 100% 100%` : '100% 100%',
          color: bgTheme.textColor,
          borderRadius: framePreset === 'sticker' ? '34px' : '26px',
          padding: framePreset === 'minimal' ? '20px' : '24px 18px',
          border:
            framePreset === 'classic'
              ? `4px double ${bgTheme.borderColor}`
              : framePreset === 'sticker'
              ? `2px dashed ${bgTheme.borderColor}`
              : framePreset === 'badge' || framePreset === 'poster'
              ? `2px solid ${bgTheme.borderColor}`
              : `1px solid ${bgTheme.borderColor}`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {framePreset === 'modern' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '7px',
              background: bgTheme.accentColor,
            }}
          />
        )}

        {framePreset !== 'minimal' && (
          <div
            className="mp-qr-card-head"
            style={
              framePreset === 'ribbon'
                ? {
                    background: bgTheme.accentColor,
                    color: '#ffffff',
                    padding: '10px 16px',
                    borderRadius: '14px',
                    width: '100%',
                  }
                : undefined
            }
          >
            <b
              style={{
                display: 'block',
                fontSize: framePreset === 'poster' ? '20px' : '18px',
                fontWeight: 900,
                color: framePreset === 'ribbon' ? '#ffffff' : bgTheme.textColor,
                lineHeight: 1.25,
              }}
            >
              {displayRestName}
            </b>
            {framePreset !== 'ribbon' && (
              <span
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: bgTheme.subColor,
                  marginTop: '4px',
                  lineHeight: 1.4,
                }}
              >
                {displaySub}
              </span>
            )}
          </div>
        )}

        {framePreset === 'ribbon' && (
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: bgTheme.subColor }}>
            {displaySub}
          </span>
        )}

        {cleanTable && framePreset !== 'minimal' && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 14px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 800,
              background: bgTheme.isDarkSurface ? 'rgba(255,255,255,0.14)' : `${bgTheme.accentColor}1c`,
              border: `1.5px solid ${bgTheme.accentColor}`,
              color: bgTheme.textColor,
            }}
          >
            طاولة {cleanTable}
          </span>
        )}

        <div
          className="mp-qr-tile"
          style={{
            background: qrTileBg,
            padding: '12px',
            borderRadius: '20px',
            border: tileBorder ? `1.5px solid ${bgTheme.borderColor}` : 'none',
            boxShadow: '0 10px 26px rgba(0, 0, 0, 0.16)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            maxWidth: '100%',
          }}
        >
          <canvas
            ref={qrCanvasRef}
            style={{
              width: `min(100%, ${size}px)`,
              maxWidth: '100%',
              height: 'auto',
              aspectRatio: '1 / 1',
              borderRadius: '10px',
              display: 'block',
            }}
          />
        </div>

        {framePreset === 'minimal' ? (
          <b style={{ fontSize: '15.5px', fontWeight: 900, color: bgTheme.textColor }}>
            {displayRestName}
          </b>
        ) : framePreset === 'badge' || framePreset === 'modern' || framePreset === 'poster' ? (
          <span
            style={{
              background: effectiveQrColor,
              color: ctaIsLight ? '#0f172a' : '#ffffff',
              padding: '7px 18px',
              borderRadius: '999px',
              fontSize: '12.5px',
              fontWeight: 800,
              maxWidth: '100%',
            }}
          >
            {displayCta}
          </span>
        ) : (
          <span style={{ fontSize: '13px', fontWeight: 800, color: bgTheme.textColor }}>
            {displayCta}
          </span>
        )}

        {showUrlFooter && framePreset !== 'minimal' && (
          <span
            dir="ltr"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: bgTheme.subColor,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cleanUrlText}
          </span>
        )}
      </div>

      {!hideActions && (
        <div className="mp-qr-actions-grid">
          <button
            type="button"
            onClick={handleDownloadPng}
            className="btn p mp-qr-action-btn"
          >
            <Download size={15} />
            <span>تحميل PNG</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadSvg}
            className="btn mp-qr-action-btn"
          >
            <FileCode2 size={15} />
            <span>تحميل SVG</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="btn mp-qr-action-btn"
          >
            <Printer size={15} />
            <span>طباعة للستاند</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="btn mp-qr-action-btn"
          >
            {copied ? <Check size={15} color="var(--brand-ink, var(--brand))" /> : <Copy size={15} />}
            <span>{copied ? 'تم النسخ' : 'نسخ الرابط'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
