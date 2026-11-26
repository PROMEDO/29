/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

export interface ResolvedPwaIcon {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  isCustom: boolean;
}

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const SRC_ASSETS_DIR = path.resolve(process.cwd(), 'src/assets');
const FALLBACK_ICON_512 = path.join(PUBLIC_DIR, 'pwa-512x512.png');
const FALLBACK_ICON_192 = path.join(PUBLIC_DIR, 'pwa-192x192.png');
const MAX_REMOTE_ICON_BYTES = 5 * 1024 * 1024;
const REMOTE_FETCH_TIMEOUT_MS = 5000;

interface RemoteIconCacheEntry {
  icon: ResolvedPwaIcon;
  expiresAt: number;
}
const remoteIconCache = new Map<string, RemoteIconCacheEntry>();
const REMOTE_ICON_CACHE_TTL_MS = 30 * 60 * 1000;

export function getRestaurantRecordForPwa(
  allData: Record<string, unknown>,
  targetRid: string
): { rest?: Record<string, unknown>; logo: string; name: string } {
  const cleanRid = String(targetRid || '').trim();
  if (!cleanRid) {
    return { logo: '', name: '' };
  }
  const rest = allData[`restaurants/${cleanRid}`] as Record<string, unknown> | undefined;
  if (!rest || typeof rest !== 'object') {
    return { logo: '', name: '' };
  }
  let logo = typeof rest.logo === 'string' ? rest.logo.trim() : '';
  if (!logo && rest.parentRid) {
    const parent = allData[`restaurants/${String(rest.parentRid)}`] as Record<string, unknown> | undefined;
    if (parent && typeof parent === 'object' && typeof parent.logo === 'string') {
      logo = parent.logo.trim();
    }
  }
  const name = typeof rest.n === 'string' ? rest.n.trim() : '';
  return { rest, logo, name };
}

export function computePwaLogoVersion(logo: string): string {
  const clean = String(logo || '').trim();
  if (!clean) return 'default';
  return crypto.createHash('sha256').update(clean).digest('hex').slice(0, 10);
}

function detectMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF: GIF87a / GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return 'image/gif';
  }
  // WebP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function detectImageDimensions(buf: Buffer, mimeType: string): { width: number; height: number } {
  if (mimeType === 'image/png' && buf.length >= 24) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width > 0 && height > 0 && width <= 16384 && height <= 16384) {
      return { width, height };
    }
  }

  if (mimeType === 'image/gif' && buf.length >= 10) {
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }

  if (mimeType === 'image/jpeg' && buf.length > 4) {
    let offset = 2;
    while (offset + 8 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const segLen = buf.readUInt16BE(offset + 2);
      if (segLen < 2) break;
      // SOF0, SOF1, SOF2, SOF3
      if (marker >= 0xc0 && marker <= 0xc3 && offset + 9 <= buf.length) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        if (width > 0 && height > 0 && width <= 16384 && height <= 16384) {
          return { width, height };
        }
      }
      offset += 2 + segLen;
    }
  }

  if (mimeType === 'image/webp' && buf.length >= 30) {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && buf.length >= 30) {
      const width = 1 + buf.readUIntLE(24, 3);
      const height = 1 + buf.readUIntLE(27, 3);
      return { width, height };
    }
    if (chunk === 'VP8 ' && buf.length >= 30) {
      const width = buf.readUInt16LE(26) & 0x3fff;
      const height = buf.readUInt16LE(28) & 0x3fff;
      return { width, height };
    }
    if (chunk === 'VP8L' && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return { width, height };
    }
  }

  return { width: 0, height: 0 };
}

function isDisallowedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  const ipVer = net.isIP(host);
  if (ipVer === 4) {
    const parts = host.split('.').map(Number);
    if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  } else if (ipVer === 6) {
    if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
      return true;
    }
  }
  return false;
}

function readLocalWorkspaceImage(logoPath: string): Buffer | null {
  const cleanRel = logoPath.split('?')[0].split('#')[0].replace(/^\/+/, '');
  if (!cleanRel || cleanRel.includes('..')) return null;

  const candidateBases = cleanRel.startsWith('src/assets/')
    ? [SRC_ASSETS_DIR]
    : [PUBLIC_DIR, path.resolve(process.cwd(), 'dist')];

  for (const base of candidateBases) {
    const target = cleanRel.startsWith('src/assets/')
      ? path.resolve(process.cwd(), cleanRel)
      : path.resolve(base, cleanRel);
    if (!target.startsWith(base + path.sep)) continue;
    try {
      if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        return fs.readFileSync(target);
      }
    } catch {
      // try next base
    }
  }
  return null;
}

async function fetchPublicImageBuffer(urlStr: string): Promise<Buffer | null> {
  const cached = remoteIconCache.get(urlStr);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.icon.buffer;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (isDisallowedHostname(parsed.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'image/png,image/jpeg,image/webp,image/*;q=0.8',
      },
    });
    if (!res.ok) return null;
    if (res.url) {
      try {
        const finalUrl = new URL(res.url);
        if (isDisallowedHostname(finalUrl.hostname)) return null;
      } catch {
        return null;
      }
    }
    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_REMOTE_ICON_BYTES) return null;

    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > MAX_REMOTE_ICON_BYTES) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function getFallbackPwaIcon(): ResolvedPwaIcon {
  const fallbackFile = fs.existsSync(FALLBACK_ICON_512)
    ? FALLBACK_ICON_512
    : FALLBACK_ICON_192;
  const buffer = fs.existsSync(fallbackFile)
    ? fs.readFileSync(fallbackFile)
    : Buffer.alloc(0);
  const dims = detectImageDimensions(buffer, 'image/png');
  return {
    buffer,
    mimeType: 'image/png',
    width: dims.width || 512,
    height: dims.height || 512,
    isCustom: false,
  };
}

export async function resolveRestaurantPwaIcon(
  allData: Record<string, unknown>,
  targetRid: string
): Promise<ResolvedPwaIcon> {
  const { logo } = getRestaurantRecordForPwa(allData, targetRid);
  if (!logo) {
    return getFallbackPwaIcon();
  }

  let rawBuffer: Buffer | null = null;

  if (logo.startsWith('data:')) {
    const match = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(logo);
    if (match) {
      try {
        const decoded = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
        if (decoded.length > 0 && decoded.length <= MAX_REMOTE_ICON_BYTES) {
          rawBuffer = decoded;
        }
      } catch {
        rawBuffer = null;
      }
    }
  } else if (logo.startsWith('/')) {
    rawBuffer = readLocalWorkspaceImage(logo);
  } else if (logo.startsWith('https://') || logo.startsWith('http://')) {
    const cached = remoteIconCache.get(logo);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.icon;
    }
    rawBuffer = await fetchPublicImageBuffer(logo);
  }

  if (!rawBuffer) {
    return getFallbackPwaIcon();
  }

  const mimeType = detectMimeFromBuffer(rawBuffer);
  if (!mimeType) {
    return getFallbackPwaIcon();
  }

  const dims = detectImageDimensions(rawBuffer, mimeType);
  const resolved: ResolvedPwaIcon = {
    buffer: rawBuffer,
    mimeType,
    width: dims.width,
    height: dims.height,
    isCustom: true,
  };

  if (logo.startsWith('https://') || logo.startsWith('http://')) {
    if (remoteIconCache.size > 200) {
      remoteIconCache.clear();
    }
    remoteIconCache.set(logo, {
      icon: resolved,
      expiresAt: Date.now() + REMOTE_ICON_CACHE_TTL_MS,
    });
  }

  return resolved;
}
