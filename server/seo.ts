/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import { getRealtimeVersion, readAll, subscribeStoreChanges } from './neon-store.ts';
import { computePwaLogoVersion, getRestaurantRecordForPwa } from './pwa-icon.ts';
import {
  injectSubdomainHtmlMeta,
  sanitizeSubdomainValue,
  type ResolvedSubdomainResult,
} from './subdomain.ts';
import {
  getSnapshotBuckets,
  injectInitialHomeBootstrapIntoHtml,
  injectInitialMenuBootstrapIntoHtml,
  resolvePublicMenuFamily,
  resolveRestaurantEntryByIdOrSlug,
} from './snapshot.ts';

const SEO_RESERVED_SEGMENTS = new Set([
  'login',
  'signup',
  'forgot',
  'onboard',
  'dashboard',
  'admin',
  'menu',
  'explore',
  'services',
  'steps',
  'pricing',
  'faq',
  'demo',
  'menu-demo',
  'about',
  'contact',
  'terms',
  'privacy',
  'api',
  'assets',
  'uploads',
]);

const VALID_STATIC_PLATFORM_ROUTES = new Set([
  'home',
  'explore',
  'services',
  'steps',
  'pricing',
  'faq',
  'about',
  'contact',
  'terms',
  'privacy',
  'login',
  'signup',
  'forgot',
  'onboard',
  'demo',
  'menu-demo',
]);

const VALID_DASHBOARD_TABS_SERVER = new Set([
  'home',
  'overview',
  'stats',
  'analytics',
  'cats',
  'categories',
  'items',
  'menu',
  'orders',
  'appearance',
  'lay',
  'theme',
  'branches',
  'qr',
  'addons',
  'telegram',
  'settings',
  'set',
]);

const VALID_ADMIN_TABS_SERVER = new Set([
  'home',
  'partners',
  'accounts',
  'notes',
  'reports',
  'staff',
  'home_editor',
  'home-editor',
  'plans',
  'settings',
  'account',
]);

const MCP_TOOLS_CATALOG = [
  {
    name: 'search_menus',
    description:
      'Search public restaurants, cafés, and digital QR menus hosted on Menu Plus by name or keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional search keyword to filter stores.' },
        limit: { type: 'number', description: 'Maximum results to return (1-25, default 10).' },
      },
    },
  },
  {
    name: 'get_menu_details',
    description:
      'Retrieve categories, menu items, descriptions, and prices for a Menu Plus store by slug.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Store slug, e.g. cap-burger.' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'get_pricing_plans',
    description:
      'List Menu Plus subscription plans, monthly/annual prices, and included features (0% sales commission).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_platform_info',
    description:
      'Return Menu Plus overview, machine-readable contact details, and key documentation URLs.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

const DEFAULT_SEO_FAQS = [
  {
    q: 'ما هو المنيو والكتالوج الإلكتروني الذكي؟',
    a: 'هو رابط خاص وباركود QR باسم مشروعك يفتحه الزبون فوراً من متصفح هاتفه دون الحاجة لتحميل أي تطبيق؛ يتصفح الأقسام والوجبات أو المنتجات بالصور والأسعار، يضيفها إلى السلة، ويرسل لك الطلب مرتباً بالكامل على واتساب.',
  },
  {
    q: 'هل منصة Menu Plus مناسبة لمطعمي أو متجري؟',
    a: 'نعم، المنصة مصممة بمرونة كاملة لتناسب المطاعم، الكافيهات، محلات الحلويات والعصائر، وكذلك المتاجر الإلكترونية ومحلات العطور والملابس والإكسسوارات.',
  },
  {
    q: 'هل يمكنني استخدام اسمي وشعاري وتغيير الألوان والمظهر؟',
    a: 'بالتأكيد! يمكنك رفع شعار مشروعك، والاختيار بين المظهر النهاري الفاتح والمظهر الليلي الداكن مع قوالب ألوان احترافية ورابط مخصص باسم مشروعك.',
  },
  {
    q: 'هل توجد نسبة أو عمولة على المبيعات والطلبات؟',
    a: 'لا، 0% عمولة على مبيعاتك للأبد. كل أرباح طلبات التوصيل والاستلام والطاولات تبقى لك بالكامل وتستلمها مباشرة على رقم الواتساب الخاص بك.',
  },
  {
    q: 'كيف يتم تفعيل الاشتراك وما هي الباقات المتوفرة؟',
    a: 'نوفر 3 باقات مرنة (الاقتصادية، الاحترافية، وباقة الأعمال الشاملة) باشتراك شهري أو سنوي بدون أي عمولات على مبيعاتك، ويمكنك الترقية بين الباقات في أي وقت.',
  },
  {
    q: 'هل يمكنني تفعيل مشروعي وتعديل الأسعار فوراً؟',
    a: 'نعم، خلال دقائق معدودة تسجّل برقم هاتفك، تضيف أقسامك ومنتجاتك، وتطبع رمز الـ QR لتبدأ باستقبال الطلبات فوراً.',
  },
];

function safeDecodeUriSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export function resolveRequestOrigin(req: Request, baseDomain = 'menuplus.io'): string {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
    .split(',')[0]
    .trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || baseDomain)
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

function escapeSeoAttr(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function xmlEscape(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeTelUri(rawPhone: string): string {
  let clean = String(rawPhone || '').replace(/\D/g, '');
  if (!clean) clean = '9647724799679';
  else if (clean.startsWith('00')) clean = clean.slice(2);
  else if (clean.startsWith('0')) clean = `964${clean.slice(1)}`;
  else if (!clean.startsWith('964') && /^(77|78|75|79)/.test(clean)) clean = `964${clean}`;
  return `+${clean}`;
}

function applyAgentLinkHeaders(res: Response, origin: string, cleanPath: string): void {
  if (res.headersSent) return;
  const mdHref = `${origin}${cleanPath === '/' ? '/' : cleanPath}`;
  res.setHeader(
    'Link',
    [
      `<${origin}/llms.txt>; rel="alternate"; type="text/plain"; title="LLMs Guide"`,
      `<${mdHref}>; rel="alternate"; type="text/markdown"; title="Markdown"`,
      `<${origin}/.well-known/mcp/server-card.json>; rel="describedby"; type="application/json"; title="MCP Server Card"`,
    ].join(', ')
  );
  res.setHeader('Vary', 'Accept, Accept-Encoding');
}

function wantsMarkdownResponse(req: Request): boolean {
  const accept = String(req.headers.accept || '').toLowerCase();
  if (!accept.includes('text/markdown')) return false;
  return req.accepts(['text/markdown', 'text/html']) === 'text/markdown';
}

function resolvePublicAssetUrl(
  origin: string,
  rawUrl: unknown,
  fallbackPath = '/assets/logo.png'
): string {
  const s = String(rawUrl || '').trim();
  if (!s || s.startsWith('data:')) return `${origin}${fallbackPath}`;
  if (/^https?:\/\//i.test(s)) return s;
  return `${origin}${s.startsWith('/') ? s : `/${s}`}`;
}

function doesRouteExistOnServer(
  cleanPath: string,
  allData: Record<string, unknown>,
  subdomainResolved?: ResolvedSubdomainResult
): boolean {
  const rawSegs = cleanPath.replace(/^\/+/, '').split('/').filter(Boolean);

  if (subdomainResolved?.found) {
    if (rawSegs.length === 0) return true;
    const s0 = rawSegs[0].toLowerCase();
    if (
      rawSegs.length === 1 &&
      (s0 === 'login' || s0 === 'onboard' || s0 === 'forgot' || s0 === 'dashboard')
    ) {
      return true;
    }
    if (s0 === 'dashboard') {
      if (rawSegs.length === 2) {
        return VALID_DASHBOARD_TABS_SERVER.has(rawSegs[1].toLowerCase());
      }
      if ((rawSegs.length === 3 || rawSegs.length === 4) && rawSegs[1].toLowerCase() === 'b') {
        const branchId = safeDecodeUriSegment(rawSegs[2]);
        if (!branchId) return false;
        const branchExists = branchId === 'demo' || Boolean(allData[`restaurants/${branchId}`]);
        if (!branchExists) return false;
        return rawSegs.length === 3 || VALID_DASHBOARD_TABS_SERVER.has(rawSegs[3].toLowerCase());
      }
    }
    if (
      (rawSegs.length === 2 || rawSegs.length === 3) &&
      rawSegs[1].toLowerCase() === 'dashboard' &&
      !SEO_RESERVED_SEGMENTS.has(s0)
    ) {
      const decodedSlug = safeDecodeUriSegment(rawSegs[0]);
      if (!decodedSlug) return false;
      const matched = resolveRestaurantEntryByIdOrSlug(allData, decodedSlug);
      if (!matched || matched.rest.deleted === true) return false;
      return rawSegs.length === 2 || VALID_DASHBOARD_TABS_SERVER.has(rawSegs[2].toLowerCase());
    }
    return false;
  }

  if (rawSegs.length === 0) return true;

  const seg0Lower = rawSegs[0].toLowerCase();

  if (rawSegs.length === 1) {
    if (VALID_STATIC_PLATFORM_ROUTES.has(seg0Lower)) return true;
    if (seg0Lower === 'admin' || seg0Lower === 'dashboard') return true;
    const legacyMenuMatch = /^menu-([a-zA-Z0-9_-]+)$/.exec(rawSegs[0]);
    if (legacyMenuMatch) {
      const fam = resolvePublicMenuFamily(allData, legacyMenuMatch[1]);
      return Boolean(fam && fam.rest.deleted !== true);
    }
    if (SEO_RESERVED_SEGMENTS.has(seg0Lower)) {
      return false;
    }
    const decodedSlug = safeDecodeUriSegment(rawSegs[0]);
    if (!decodedSlug) return false;
    const fam = resolvePublicMenuFamily(allData, decodedSlug);
    return Boolean(fam && fam.rest.deleted !== true);
  }

  if (seg0Lower === 'admin') {
    return rawSegs.length === 2 && VALID_ADMIN_TABS_SERVER.has(rawSegs[1].toLowerCase());
  }

  if (seg0Lower === 'dashboard') {
    if (rawSegs.length === 2) {
      return VALID_DASHBOARD_TABS_SERVER.has(rawSegs[1].toLowerCase());
    }
    if ((rawSegs.length === 3 || rawSegs.length === 4) && rawSegs[1].toLowerCase() === 'b') {
      const branchId = safeDecodeUriSegment(rawSegs[2]);
      if (!branchId) return false;
      const branchExists = branchId === 'demo' || Boolean(allData[`restaurants/${branchId}`]);
      if (!branchExists) return false;
      return rawSegs.length === 3 || VALID_DASHBOARD_TABS_SERVER.has(rawSegs[3].toLowerCase());
    }
    return false;
  }

  if (
    (rawSegs.length === 2 || rawSegs.length === 3) &&
    rawSegs[1].toLowerCase() === 'dashboard' &&
    !SEO_RESERVED_SEGMENTS.has(seg0Lower)
  ) {
    const decodedSlug = safeDecodeUriSegment(rawSegs[0]);
    if (!decodedSlug) return false;
    const matched = resolveRestaurantEntryByIdOrSlug(allData, decodedSlug);
    if (!matched || matched.rest.deleted === true) return false;
    return rawSegs.length === 2 || VALID_DASHBOARD_TABS_SERVER.has(rawSegs[2].toLowerCase());
  }

  if (seg0Lower === 'menu' && rawSegs.length === 2) {
    const decodedTarget = safeDecodeUriSegment(rawSegs[1]);
    if (!decodedTarget) return false;
    const fam = resolvePublicMenuFamily(allData, decodedTarget);
    return Boolean(fam && fam.rest.deleted !== true);
  }

  return false;
}

function buildNotFoundMarkdown(req: Request, baseDomain: string): string {
  const origin = resolveRequestOrigin(req, baseDomain);
  const cleanPath = req.path === '/' ? '/' : req.path.replace(/\/+$/, '');
  return [
    '# 404 — Page Not Found | Menu Plus',
    '',
    `> The requested page (${cleanPath}) does not exist on Menu Plus.`,
    '',
    '## Available Pages',
    `- [Home](${origin}/)`,
    `- [Explore Menus](${origin}/explore)`,
    `- [Pricing](${origin}/pricing)`,
    `- [FAQ](${origin}/faq)`,
    `- [About](${origin}/about)`,
    `- [Contact](${origin}/contact)`,
  ].join('\n');
}

function injectNotFoundIntoHtml(
  html: string,
  req: Request,
  baseDomain: string,
  res?: Response
): string {
  const origin = resolveRequestOrigin(req, baseDomain);
  const titleText = '404 — الصفحة غير موجودة | Menu Plus';
  const descText = 'عذراً، الصفحة المطلوبة غير موجودة أو تم نقلها | Menu Plus';
  const safeTitle = escapeSeoAttr(titleText);
  const safeDesc = escapeSeoAttr(descText);
  const safeOrigin = escapeSeoAttr(origin);

  if (res && !res.headersSent) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }

  let out = html
    .replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta\s+name="robots"[^>]*\/?>/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*\/?>/gi, '')
    .replace(/<link\s+rel="alternate"[^>]*type="text\/(?:markdown|plain)"[^>]*\/?>/gi, '');

  out = out.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${safeTitle}</title>`);
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    () => `<meta name="description" content="${safeDesc}" />`
  );
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    () => `<meta property="og:title" content="${safeTitle}" />`
  );
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    () => `<meta property="og:description" content="${safeDesc}" />`
  );

  const headInject = [
    `<meta name="robots" content="noindex, nofollow" />`,
    `<script>window.__MENUPLUS_NOT_FOUND__=true;</script>`,
  ].join('\n  ');
  if (out.includes('</head>')) {
    out = out.replace('</head>', () => `  ${headInject}\n  </head>`);
  }

  const ssr404Root = [
    `<header data-mp-ssr><nav aria-label="التنقل الرئيسي">`,
    `<a href="${safeOrigin}/">Menu Plus</a> `,
    `<a href="${safeOrigin}/explore">استكشف</a> `,
    `<a href="${safeOrigin}/pricing">الأسعار</a> `,
    `<a href="${safeOrigin}/contact">تواصل معنا</a>`,
    `</nav></header>`,
    `<main data-mp-ssr><h1>404 — الصفحة غير موجودة</h1><p>${safeDesc}</p><p><a href="${safeOrigin}/">العودة إلى الرئيسية</a></p></main>`,
  ].join('');

  out = out.replace(
    /<div\s+id="root">[\s\S]*?(?:<\/footer>\s*)?<\/div>/i,
    () => `<div id="root">${ssr404Root}</div>`
  );
  return out;
}

function buildSsrRootHtml(opts: {
  heading: string;
  description: string;
  origin: string;
  siteEmail: string;
  siteTel: string;
  sectionKey: string;
  plans?: Array<{ name: string; price: string }>;
  faqs?: Array<{ q: string; a: string }>;
  items?: Array<{ title: string; detail?: string }>;
  stores?: Array<{ name: string; href: string }>;
}): string {
  const {
    heading,
    description,
    origin,
    siteEmail,
    siteTel,
    sectionKey,
    plans = [],
    faqs = [],
    items = [],
    stores = [],
  } = opts;

  let bodyExtra = '';
  if (sectionKey === 'about') {
    bodyExtra =
      `<section><h2>عن منصة Menu Plus</h2><p>تساعد منصة Menu Plus أصحاب المطاعم والكافيهات والمتاجر في العراق والعالم العربي على إطلاق قائمة طعام إلكترونية تفاعلية عبر باركود QR واستقبال طلبات التوصيل والطاولات مباشرة على واتساب بدون أي عمولات على المبيعات.</p>` +
      `<ul><li>تشغيل فوري من المتصفح دون تحميل تطبيق</li><li>دعم العربية والكردية والإنجليزية</li><li>لوحة تحكم سحابية لإدارة الأصناف والأفرع</li></ul></section>`;
  } else if (sectionKey === 'contact') {
    bodyExtra =
      `<section><h2>قنوات التواصل المباشر</h2><ul>` +
      `<li>البريد الإلكتروني: <a href="mailto:${escapeSeoAttr(siteEmail)}">${escapeSeoAttr(siteEmail)}</a></li>` +
      `<li>الهاتف: <a href="tel:${escapeSeoAttr(siteTel)}">${escapeSeoAttr(siteTel)}</a></li>` +
      `<li>واتساب: <a href="https://wa.me/${escapeSeoAttr(siteTel.replace(/^\+/, ''))}">تواصل عبر واتساب</a></li>` +
      `<li>إنستقرام: <a href="https://instagram.com/iq.menu">@iq.menu</a></li>` +
      `</ul></section>`;
  } else if (sectionKey === 'terms' || sectionKey === 'privacy') {
    bodyExtra =
      `<section><h2>${sectionKey === 'privacy' ? 'حماية البيانات والخصوصية' : 'بنود الاستخدام والاشتراكات'}</h2>` +
      `<p>تلتزم منصة Menu Plus بحماية خصوصية بيانات الشركاء والزبائن وعدم بيع أو مشاركة أرقام الهواتف مع أي أطراف ثالثة. تُستخدم بيانات الطلبات حصراً لإيصال الطلب مباشرة إلى واتساب المتجر.</p>` +
      `<p>الاشتراكات مرنة شهرية أو سنوية بـ 0% عمولة على المبيعات، ويتحمل كل متجر مسؤولية دقة أسعاره وتوافر منتجاته.</p></section>`;
  } else {
    if (items.length > 0) {
      bodyExtra += `<section><h2>الأصناف والمنتجات</h2><ul>${items
        .slice(0, 24)
        .map(
          (it) =>
            `<li><strong>${escapeSeoAttr(it.title)}</strong>${it.detail ? ` — ${escapeSeoAttr(it.detail)}` : ''}</li>`
        )
        .join('')}</ul></section>`;
    } else {
      bodyExtra +=
        `<section><h2>لماذا Menu Plus؟</h2><ul>` +
        `<li>منيو إلكتروني QR سريع يفتح مباشرة من متصفح الهاتف</li>` +
        `<li>استقبال طلبات التوصيل والطاولات مرتبة على واتساب بـ 0% عمولة</li>` +
        `<li>إدارة الأقسام، الأسعار، العروض، والطاولات والأفرع من لوحة تحكم واحدة</li>` +
        `</ul></section>`;
    }
    if (plans.length > 0) {
      bodyExtra += `<section><h2>الباقات والأسعار</h2><ul>${plans
        .map(
          (p) =>
            `<li><strong>${escapeSeoAttr(p.name)}</strong>: ${escapeSeoAttr(p.price)} د.ع</li>`
        )
        .join('')}</ul></section>`;
    }
    if (stores.length > 0) {
      bodyExtra += `<section><h2>قوائم ومطاعم مباشرة</h2><ul>${stores
        .slice(0, 8)
        .map((s) => `<li><a href="${escapeSeoAttr(s.href)}">${escapeSeoAttr(s.name)}</a></li>`)
        .join('')}</ul></section>`;
    }
    if (faqs.length > 0) {
      bodyExtra += `<section><h2>الأسئلة الشائعة</h2>${faqs
        .slice(0, 6)
        .map((f) => `<article><h3>${escapeSeoAttr(f.q)}</h3><p>${escapeSeoAttr(f.a)}</p></article>`)
        .join('')}</section>`;
    }
  }

  return [
    `<header data-mp-ssr><nav aria-label="التنقل الرئيسي">`,
    `<a href="${escapeSeoAttr(`${origin}/`)}">Menu Plus</a> `,
    `<a href="${escapeSeoAttr(`${origin}/explore`)}">استكشف</a> `,
    `<a href="${escapeSeoAttr(`${origin}/services`)}">المميزات</a> `,
    `<a href="${escapeSeoAttr(`${origin}/pricing`)}">الأسعار</a> `,
    `<a href="${escapeSeoAttr(`${origin}/faq`)}">الأسئلة الشائعة</a> `,
    `<a href="${escapeSeoAttr(`${origin}/about`)}">عن المنصة</a> `,
    `<a href="${escapeSeoAttr(`${origin}/contact`)}">تواصل معنا</a>`,
    `</nav></header>`,
    `<main data-mp-ssr><h1>${escapeSeoAttr(heading)}</h1><p>${escapeSeoAttr(description)}</p>${bodyExtra}</main>`,
    `<footer data-mp-ssr>`,
    `<p>تواصل: <a href="mailto:${escapeSeoAttr(siteEmail)}">${escapeSeoAttr(siteEmail)}</a> | <a href="tel:${escapeSeoAttr(siteTel)}">${escapeSeoAttr(siteTel)}</a></p>`,
    `<nav aria-label="روابط قانونية ومعلوماتية">`,
    `<a href="${escapeSeoAttr(`${origin}/about`)}">عن Menu Plus</a> `,
    `<a href="${escapeSeoAttr(`${origin}/contact`)}">اتصل بنا</a> `,
    `<a href="${escapeSeoAttr(`${origin}/terms`)}">الشروط والأحكام</a> `,
    `<a href="${escapeSeoAttr(`${origin}/privacy`)}">سياسة الخصوصية</a> `,
    `<a href="${escapeSeoAttr(`${origin}/llms.txt`)}">llms.txt</a>`,
    `</nav>`,
    `</footer>`,
  ].join('');
}

function buildMarkdownDocument(
  req: Request,
  allData: Record<string, unknown>,
  baseDomain: string
): string {
  const origin = resolveRequestOrigin(req, baseDomain);
  const cleanPath = req.path === '/' ? '/' : req.path.replace(/\/+$/, '');
  const segs = cleanPath.replace(/^\/+/, '').split('/').filter(Boolean);
  const siteSettings = (allData['settings/site'] || {}) as Record<string, unknown>;
  const siteEmail = String(siteSettings.em || 'support@menuplus.io').trim();
  const siteTel = normalizeTelUri(String(siteSettings.supportWhatsapp || siteSettings.wa || ''));

  let targetSlugOrId = '';
  if (segs[0]?.toLowerCase() === 'menu' && segs[1]) {
    targetSlugOrId = safeDecodeUriSegment(segs[1]) || '';
  } else if (segs.length === 1 && !SEO_RESERVED_SEGMENTS.has(segs[0].toLowerCase())) {
    targetSlugOrId = safeDecodeUriSegment(segs[0]) || '';
  }

  if (targetSlugOrId) {
    const family = resolvePublicMenuFamily(allData, targetSlugOrId);
    if (family) {
      const restName = String(family.rest.n || family.slug);
      const currency = String(family.rest.currency || 'د.ع');
      const cats = Object.entries(family.bootstrapRecords)
        .filter(([k]) => k.startsWith('cats/'))
        .map(([, v]) => v as Record<string, unknown>);
      const items = Object.entries(family.bootstrapRecords)
        .filter(([k]) => k.startsWith('items/'))
        .map(([, v]) => v as Record<string, unknown>);
      const lines = [
        `# ${restName} — Menu Plus`,
        '',
        `> Digital QR menu for ${restName} hosted on Menu Plus.`,
        '',
        `- URL: ${origin}/${encodeURIComponent(family.slug)}`,
        `- Currency: ${currency}`,
        '',
        '## Menu Items',
        '',
      ];
      for (const cat of cats) {
        const catItems = items.filter((it) => it.cat === cat.id);
        if (catItems.length === 0) continue;
        lines.push(`### ${String(cat.n || '')}`);
        for (const it of catItems) {
          lines.push(
            `- **${String(it.n || '')}**: ${Number(it.pr || 0).toLocaleString('en-US')} ${currency}${it.d ? ` — ${String(it.d)}` : ''}`
          );
        }
        lines.push('');
      }
      return lines.join('\n');
    }
  }

  const section = segs[0]?.toLowerCase() || '';
  const plansDoc = allData['settings/plans'] as
    | { list?: Array<Record<string, unknown>> }
    | Array<Record<string, unknown>>
    | undefined;
  const rawPlans = Array.isArray(plansDoc)
    ? plansDoc
    : Array.isArray(plansDoc?.list)
    ? plansDoc.list
    : [];
  const activePlans = rawPlans.filter(
    (p) => String(p.id || '') !== 'free' && Number(p.pr || 0) > 0
  );
  const publicStores = Object.entries(allData)
    .filter(([k, v]) => k.startsWith('restaurants/') && v && typeof v === 'object')
    .map(([, v]) => v as Record<string, unknown>)
    .filter((r) => r.a !== 0 && !r.isBranch && String(r.n || '').trim())
    .slice(0, 8);

  const lines: string[] = [
    section === 'about'
      ? '# About Menu Plus'
      : section === 'contact'
      ? '# Contact Menu Plus'
      : section === 'terms'
      ? '# Terms of Service — Menu Plus'
      : section === 'privacy'
      ? '# Privacy Policy — Menu Plus'
      : section === 'pricing'
      ? '# Pricing & Plans — Menu Plus'
      : '# Menu Plus — Smart QR Digital Menu & WhatsApp Ordering Platform',
    '',
    '> Create an interactive QR digital menu and WhatsApp ordering catalog for your restaurant, café, or online store in minutes with 0% sales commission.',
    '',
    `Canonical: ${origin}${cleanPath}`,
    '',
    '## Key Capabilities',
    '- Fast browser-based QR digital menu (no mobile app required)',
    '- Structured WhatsApp order delivery & dine-in table checkout with GPS location',
    '- Cloud dashboard for categories, variants, branches, themes, and 50+ marketing add-ons',
    '- Multi-language support: Arabic, Kurdish, and English',
    '- 0% commission on all customer orders',
    '',
  ];

  if (activePlans.length > 0) {
    lines.push('## Pricing Plans (IQD)');
    for (const pl of activePlans) {
      lines.push(`- **${String(pl.n || '')}**: ${Number(pl.pr || 0).toLocaleString('en-US')} IQD / month`);
    }
    lines.push('');
  }

  if (publicStores.length > 0) {
    lines.push('## Live Menus');
    for (const r of publicStores) {
      const slug =
        sanitizeSubdomainValue(String(r.slug || r.subdomain || '')) ||
        (r.id === 'demo' ? 'cap-burger' : String(r.id || ''));
      lines.push(`- [${String(r.n || slug)}](${origin}/${encodeURIComponent(slug)})`);
    }
    lines.push('');
  }

  lines.push(
    '## FAQ',
    ...DEFAULT_SEO_FAQS.map((f) => `- **${f.q}**: ${f.a}`),
    '',
    '## Contact',
    `- Email: mailto:${siteEmail}`,
    `- Telephone: tel:${siteTel}`,
    `- WhatsApp: https://wa.me/${siteTel.replace(/^\+/, '')}`,
    `- Instagram: https://instagram.com/iq.menu`,
    '',
    '## Pages',
    `- [Home](${origin}/)`,
    `- [About](${origin}/about)`,
    `- [Contact](${origin}/contact)`,
    `- [Terms of Service](${origin}/terms)`,
    `- [Privacy Policy](${origin}/privacy)`,
    `- [Pricing](${origin}/pricing)`,
    `- [FAQ](${origin}/faq)`,
    `- [llms.txt](${origin}/llms.txt)`,
    `- [MCP Server Card](${origin}/.well-known/mcp/server-card.json)`
  );

  return lines.join('\n');
}

const publicHtmlInjectionCache = new Map<
  string,
  { version: number; familyRids: string[] | null; html: string }
>();
const MAX_PUBLIC_HTML_CACHE = 200;

async function injectSeoMetaIntoHtml(
  html: string,
  req: Request,
  isProduction: boolean,
  baseDomain: string,
  res?: Response,
  preloadedAllData?: Record<string, unknown>
): Promise<string> {
  try {
    const origin = resolveRequestOrigin(req, baseDomain);
    const cleanPath = req.path === '/' ? '/' : req.path.replace(/\/+$/, '');
    const canonicalUrl = `${origin}${cleanPath === '/' ? '/' : cleanPath}`;

    let pageTitle = 'Menu Plus — المنيو الإلكتروني الذكي QR وكتالوج واتساب للمطاعم والمتاجر';
    let pageDesc =
      'أنشئ منيو إلكتروني QR احترافي وكتالوج مبيعات ذكي لمطعمك أو متجرك مع Menu Plus. استقبل طلبات التوصيل والطاولات مباشرة على واتساب بدون أي عمولة.';
    let noIndex = false;
    let embedImageUrl = `${origin}/assets/logo.png`;
    let embedImageAlt = 'Menu Plus — المنيو الإلكتروني الذكي للمطاعم والمتاجر';
    const ogType = 'website';
    let ssrRootHtml = '';
    const graphNodes: Record<string, unknown>[] = [];

    const segs = cleanPath.replace(/^\/+/, '').split('/').filter(Boolean);
    const isSlugDashRoute =
      segs.length >= 2 &&
      segs[1].toLowerCase() === 'dashboard' &&
      !SEO_RESERVED_SEGMENTS.has(segs[0].toLowerCase());
    const isAnyDashRoute = cleanPath.startsWith('/dashboard') || isSlugDashRoute;

    if (
      cleanPath.startsWith('/admin') ||
      isAnyDashRoute ||
      cleanPath === '/login' ||
      cleanPath === '/signup' ||
      cleanPath === '/forgot' ||
      cleanPath === '/onboard'
    ) {
      noIndex = true;
    }

    if (res && !res.headersSent) {
      res.setHeader(
        'X-Robots-Tag',
        noIndex
          ? 'noindex, nofollow'
          : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
      );
      if (!noIndex) {
        applyAgentLinkHeaders(res, origin, cleanPath);
      }
    }

    const isCacheablePublicHtml =
      !isAnyDashRoute && !cleanPath.startsWith('/admin') && !cleanPath.startsWith('/onboard');
    if (isCacheablePublicHtml && isProduction) {
      const cacheKey = `${origin}|${cleanPath}`;
      const cached = publicHtmlInjectionCache.get(cacheKey);
      if (cached && cached.version === getRealtimeVersion('menu', cached.familyRids)) {
        return cached.html;
      }
    }

    const stripStaticSeoTags = (input: string) =>
      input
        .replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<meta\s+name="robots"[^>]*\/?>/gi, '')
        .replace(/<link\s+rel="canonical"[^>]*\/?>/gi, '')
        .replace(/<link\s+rel="alternate"[^>]*type="text\/(?:markdown|plain)"[^>]*\/?>/gi, '');

    if (cleanPath.startsWith('/admin') || cleanPath.startsWith('/onboard')) {
      const safeTitle = escapeSeoAttr(pageTitle);
      const safeDesc = escapeSeoAttr(pageDesc);
      const safeCanonical = escapeSeoAttr(canonicalUrl);
      const safeEmbedImage = escapeSeoAttr(embedImageUrl);
      let out = stripStaticSeoTags(html).replace(
        /<title>[\s\S]*?<\/title>/i,
        () => `<title>${safeTitle}</title>`
      );
      out = out.replace(
        /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
        () => `<meta name="description" content="${safeDesc}" />`
      );
      out = out.replace(
        /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
        () => `<meta property="og:title" content="${safeTitle}" />`
      );
      out = out.replace(
        /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
        () => `<meta property="og:description" content="${safeDesc}" />`
      );
      out = out.replace(
        /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
        () => `<meta property="og:image" content="${safeEmbedImage}" />`
      );
      out = out.replace(
        /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
        () => `<meta name="twitter:image" content="${safeEmbedImage}" />`
      );
      const seoTags = [
        `<link rel="canonical" href="${safeCanonical}" />`,
        `<meta property="og:url" content="${safeCanonical}" />`,
        `<meta name="robots" content="noindex, nofollow" />`,
      ];
      if (out.includes('</head>')) {
        out = out.replace('</head>', () => `  ${seoTags.join('\n  ')}\n  </head>`);
      }
      return out;
    }

    const allData =
      preloadedAllData ?? (await readAll(false).catch(() => ({} as Record<string, unknown>)));
    const siteSettings = (allData['settings/site'] || {}) as Record<string, unknown>;
    const siteTel = normalizeTelUri(String(siteSettings.supportWhatsapp || siteSettings.wa || ''));
    const siteEmail = String(siteSettings.em || 'support@menuplus.io').trim();

    let targetSlugOrId = '';
    if (segs[0]?.toLowerCase() === 'menu' && segs[1]) {
      targetSlugOrId = safeDecodeUriSegment(segs[1]) || '';
    } else if (segs.length === 1 && !SEO_RESERVED_SEGMENTS.has(segs[0].toLowerCase())) {
      targetSlugOrId = safeDecodeUriSegment(segs[0]) || '';
    }

    let matchedFamily: ReturnType<typeof resolvePublicMenuFamily> = null;
    if (targetSlugOrId) {
      matchedFamily = resolvePublicMenuFamily(allData, targetSlugOrId);
      const matchedRest = matchedFamily?.rest;
      if (matchedRest && matchedFamily) {
        const restName =
          matchedRest.isBranch && String(matchedRest.branchName || '').trim()
            ? String(matchedRest.branchName).trim()
            : String(matchedRest.n || 'المنيو الإلكتروني');
        const rawTagline = String(matchedRest.tagline || '').trim();
        const isMatchedStore =
          String(matchedRest.projectType || '').toLowerCase().trim() === 'store';
        const cleanTagline =
          isMatchedStore && rawTagline === 'أشهى الأطباق المحضرة يومياً طازجة بجودة عالية'
            ? ''
            : rawTagline;
        const restAbout = String(cleanTagline || matchedRest.aboutText || '').trim();
        const storeSlug =
          sanitizeSubdomainValue(String(matchedRest.slug || matchedRest.subdomain || '')) ||
          String(matchedRest.id || targetSlugOrId);
        const storeCanonical = `${origin}/${encodeURIComponent(storeSlug)}`;
        pageTitle = `${restName} — المنيو الإلكتروني وطلبات الواتساب | Menu Plus`;
        pageDesc = restAbout
          ? `${restName}: ${restAbout.slice(0, 125)} — تصفح القائمة والأسعار واطلب مباشرة عبر واتساب على Menu Plus.`
          : `تصفح قائمة الطعام والمنتجات والأسعار في ${restName} واطلب مباشرة عبر واتساب بسهولة عبر منصة Menu Plus.`;
        embedImageUrl = resolvePublicAssetUrl(
          origin,
          (isMatchedStore && Array.isArray(matchedRest.coverImages) && matchedRest.coverImages[0]) ||
            matchedRest.logo,
          '/assets/logo.png'
        );
        embedImageAlt = `${restName} — Menu Plus`;

        const menuCats = Object.entries(matchedFamily.bootstrapRecords)
          .filter(([k, v]) => k.startsWith('cats/') && v && typeof v === 'object')
          .map(([, v]) => v as Record<string, unknown>);
        const menuItems = Object.entries(matchedFamily.bootstrapRecords)
          .filter(([k, v]) => k.startsWith('items/') && v && typeof v === 'object')
          .map(([, v]) => v as Record<string, unknown>);

        graphNodes.push(
          {
            '@type': 'WebSite',
            '@id': `${origin}/#website`,
            name: 'Menu Plus',
            alternateName: ['Menu Plus', 'منيو بلس'],
            url: `${origin}/`,
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Menu Plus', item: `${origin}/` },
              { '@type': 'ListItem', position: 2, name: 'تصفح المنيوهات', item: `${origin}/explore` },
              { '@type': 'ListItem', position: 3, name: restName, item: storeCanonical },
            ],
          },
          {
            '@type': isMatchedStore ? 'Store' : 'Restaurant',
            name: restName,
            description: pageDesc,
            url: storeCanonical,
            ...(matchedRest.ph ? { telephone: String(matchedRest.ph) } : {}),
            image: embedImageUrl,
            hasMenu: {
              '@type': 'Menu',
              name: `قائمة ${restName}`,
              url: storeCanonical,
              hasMenuSection: menuCats.slice(0, 8).map((cat) => ({
                '@type': 'MenuSection',
                name: String(cat.n || ''),
                hasMenuItem: menuItems
                  .filter((it) => it.cat === cat.id)
                  .slice(0, 10)
                  .map((it) => ({
                    '@type': 'MenuItem',
                    name: String(it.n || ''),
                    ...(it.d ? { description: String(it.d) } : {}),
                    offers: {
                      '@type': 'Offer',
                      price: String(Number(it.pr) || 0),
                      priceCurrency: 'IQD',
                    },
                  })),
              })),
            },
          }
        );

        ssrRootHtml = buildSsrRootHtml({
          heading: `${restName} — المنيو الإلكتروني | Menu Plus`,
          description: pageDesc,
          origin,
          siteEmail,
          siteTel,
          sectionKey: 'menu',
          items: menuItems.slice(0, 24).map((it) => ({
            title: String(it.n || ''),
            detail: it.pr
              ? `${Number(it.pr).toLocaleString('en-US')} ${String(matchedRest.currency || 'د.ع')}`
              : String(it.d || ''),
          })),
        });
      }
    } else if (!noIndex) {
      const routeSection = segs[0]?.toLowerCase() || '';
      const routeSectionNames: Record<
        string,
        { title: string; h1: string; desc: string; crumb: string }
      > = {
        explore: {
          title: 'تصفح المنيوهات والمتاجر المباشرة | Menu Plus',
          h1: 'استكشف لوحة تحكم وقوائم Menu Plus المباشرة',
          desc: 'اكتشف مطاعم وكافيهات ومتاجر تستخدم Menu Plus في العراق والوطن العربي، وتصفح القوائم التفاعلية المباشرة عبر باركود QR.',
          crumb: 'تصفح المنيوهات',
        },
        services: {
          title: 'مميزات المنيو الإلكتروني ونظام طلبات الواتساب | Menu Plus',
          h1: 'مميزات المنيو الإلكتروني الذكي وطلبات الواتساب',
          desc: 'باركود QR سريع، استقبال طلبات التوصيل والطاولات على واتساب، لوحة تحكم سحابية، فروع متعددة، وثيمات احترافية بـ 0% عمولة.',
          crumb: 'المميزات والخدمات',
        },
        steps: {
          title: 'خطوات إنشاء منيو إلكتروني QR لمطعمك في دقائق | Menu Plus',
          h1: 'خطوات إنشاء منيو إلكتروني QR في دقائق',
          desc: 'سجّل مشروعك، أضف الأقسام والأصناف بالصور والأسعار، واطبع كود QR لتستقبل طلبات زبائنك مباشرة على واتساب.',
          crumb: 'خطوات التشغيل',
        },
        pricing: {
          title: 'أسعار وباقات Menu Plus (0% عمولة على المبيعات)',
          h1: 'أسعار وباقات الاشتراك في Menu Plus',
          desc: 'اختر الباقة المناسبة لمطعمك أو متجرك باشتراك شهري أو سنوي مرن بدون أي عمولة على الطلبات والمبيعات في Menu Plus.',
          crumb: 'الأسعار والباقات',
        },
        faq: {
          title: 'الأسئلة الشائعة حول المنيو الإلكتروني QR | Menu Plus',
          h1: 'الأسئلة الشائعة حول المنيو الإلكتروني وطلبات الواتساب',
          desc: 'إجابات كاملة عن كيفية إنشاء المنيو الإلكتروني، كود QR للطاولات، ربط طلبات واتساب، الباقات، وتخصيص الهوية في Menu Plus.',
          crumb: 'الأسئلة الشائعة',
        },
        about: {
          title: 'عن منصة Menu Plus — نظام المنيو الإلكتروني وطلبات الواتساب',
          h1: 'عن منصة Menu Plus',
          desc: 'منصة عربية سحابية متخصصة في إنشاء المنيو الإلكتروني الذكي QR واستقبال طلبات المطاعم والكافيهات والمتاجر مباشرة على واتساب بـ 0% عمولة.',
          crumb: 'عن المنصة',
        },
        contact: {
          title: 'تواصل معنا — فريق دعم Menu Plus',
          h1: 'تواصل مع فريق Menu Plus',
          desc: 'تواصل مع فريق دعم ومبيعات Menu Plus عبر البريد الإلكتروني أو الهاتف أو واتساب للاستفسار عن الباقات وإعداد منيو مشروعك.',
          crumb: 'تواصل معنا',
        },
        terms: {
          title: 'الشروط والأحكام | Menu Plus',
          h1: 'الشروط والأحكام — Menu Plus',
          desc: 'الشروط والأحكام الخاصة باستخدام منصة Menu Plus لإنشاء القوائم الرقمية والكتالوجات وطلبات الواتساب.',
          crumb: 'الشروط والأحكام',
        },
        privacy: {
          title: 'سياسة الخصوصية وأمان البيانات | Menu Plus',
          h1: 'سياسة الخصوصية — Menu Plus',
          desc: 'التزام منصة Menu Plus الكامل بحماية بيانات المتاجر والزبائن وعدم مشاركتها مع أي أطراف ثالثة.',
          crumb: 'سياسة الخصوصية',
        },
      };

      const routeMeta = routeSectionNames[routeSection];
      if (routeMeta) {
        pageTitle = routeMeta.title;
        pageDesc = routeMeta.desc;
      }

      const homeDoc = allData['settings/home'] as
        | {
            faq?: {
              enabled?: boolean;
              items?: Array<{ q?: string; a?: string; visible?: boolean }>;
            };
            footerConfig?: { instagramUrl?: string; authorUrl?: string };
          }
        | undefined;
      const faqList =
        homeDoc?.faq?.items && homeDoc.faq.items.length > 0
          ? homeDoc.faq.items
              .filter((f) => f.visible !== false && f.q && f.a)
              .map((f) => ({ q: String(f.q), a: String(f.a) }))
          : DEFAULT_SEO_FAQS;
      const faqItems = faqList.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      }));

      const plansDoc = allData['settings/plans'] as
        | { list?: Array<{ id?: string; n?: string; pr?: number }> }
        | Array<{ id?: string; n?: string; pr?: number }>
        | undefined;
      const plansList = (
        Array.isArray(plansDoc) ? plansDoc : Array.isArray(plansDoc?.list) ? plansDoc.list : []
      ).filter((p) => String(p.id || '') !== 'free' && Number(p.pr || 0) > 0);
      const planPrices = plansList.map((p) => Number(p.pr || 0)).filter((p) => p > 0);
      const lowPrice = planPrices.length > 0 ? String(Math.min(...planPrices)) : '9000';
      const highPrice = planPrices.length > 0 ? String(Math.max(...planPrices)) : '29000';

      const publicStores = Object.entries(allData)
        .filter(([k, v]) => k.startsWith('restaurants/') && v && typeof v === 'object')
        .map(([, v]) => v as Record<string, unknown>)
        .filter((r) => r.a !== 0 && !r.isBranch && String(r.n || '').trim())
        .slice(0, 12);

      const sameAsLinks = Array.from(
        new Set(
          [
            homeDoc?.footerConfig?.instagramUrl,
            'https://instagram.com/iq.menu',
            homeDoc?.footerConfig?.authorUrl || 'https://instagram.com/weel',
          ]
            .map((s) => String(s || '').trim())
            .filter((s) => /^https?:\/\//i.test(s))
        )
      );

      graphNodes.push(
        {
          '@type': 'WebSite',
          '@id': `${origin}/#website`,
          name: 'Menu Plus',
          alternateName: ['Menu Plus', 'منيو بلس'],
          url: `${origin}/`,
          inLanguage: ['ar', 'en', 'ku'],
          potentialAction: {
            '@type': 'SearchAction',
            target: `${origin}/explore?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
        {
          '@type': 'Organization',
          '@id': `${origin}/#organization`,
          name: 'Menu Plus',
          alternateName: ['Menu Plus', 'منيو بلس'],
          url: `${origin}/`,
          logo: {
            '@type': 'ImageObject',
            url: `${origin}/pwa-512x512.png`,
            width: 512,
            height: 512,
          },
          image: `${origin}/assets/logo.png`,
          description:
            'منصة عربية متخصصة في إنشاء المنيو الإلكتروني الذكي بباركود QR والكتالوج التفاعلي وطلبات الواتساب للمطاعم والكافيهات والمتاجر بدون عمولة.',
          email: siteEmail,
          telephone: siteTel,
          areaServed: ['IQ', 'SA', 'AE', 'KW', 'QA', 'JO', 'OM', 'EG'],
          sameAs: sameAsLinks,
          address: {
            '@type': 'PostalAddress',
            addressCountry: 'IQ',
            addressLocality: 'Baghdad',
          },
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            telephone: siteTel,
            email: siteEmail,
            availableLanguage: ['Arabic', 'Kurdish', 'English'],
          },
        },
        {
          '@type': 'SoftwareApplication',
          '@id': `${origin}/#software`,
          name: 'Menu Plus',
          alternateName: ['Menu Plus', 'منيو بلس'],
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web, iOS, Android',
          inLanguage: ['ar', 'en', 'ku'],
          url: `${origin}/`,
          image: `${origin}/assets/logo.png`,
          description: pageDesc,
          publisher: { '@id': `${origin}/#organization` },
          featureList: [
            'منيو إلكتروني سريع برمز QR',
            'استقبال طلبات التوصيل والطاولات مباشرة على واتساب بدون عمولة',
            'لوحة تحكم سحابية متكاملة لإدارة الأقسام والأسعار والعروض',
            'دعم الفروع المتعددة وتخصيص الهوية والألوان',
          ],
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'IQD',
            lowPrice,
            highPrice,
            offerCount: String(Math.max(1, plansList.length || 3)),
          },
        },
        {
          '@type':
            routeSection === 'about'
              ? 'AboutPage'
              : routeSection === 'contact'
              ? 'ContactPage'
              : 'WebPage',
          '@id': `${canonicalUrl}#webpage`,
          url: canonicalUrl,
          name: pageTitle,
          description: pageDesc,
          isPartOf: { '@id': `${origin}/#website` },
          about: { '@id': `${origin}/#organization` },
        }
      );

      if (routeMeta) {
        graphNodes.push({
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Menu Plus', item: `${origin}/` },
            { '@type': 'ListItem', position: 2, name: routeMeta.crumb, item: canonicalUrl },
          ],
        });
      }

      if (
        faqItems.length > 0 &&
        homeDoc?.faq?.enabled !== false &&
        (!routeSection || routeSection === 'faq' || routeSection === 'pricing')
      ) {
        graphNodes.push({
          '@type': 'FAQPage',
          mainEntity: faqItems,
        });
      }

      if (publicStores.length > 0 && (!routeSection || routeSection === 'explore')) {
        graphNodes.push({
          '@type': 'ItemList',
          name: 'متاجر ومطاعم تستخدم Menu Plus',
          itemListElement: publicStores.map((r, idx) => {
            const slug =
              sanitizeSubdomainValue(String(r.slug || r.subdomain || '')) ||
              (r.id === 'demo' ? 'cap-burger' : String(r.id || ''));
            return {
              '@type': 'ListItem',
              position: idx + 1,
              name: String(r.n || slug),
              url: `${origin}/${encodeURIComponent(slug)}`,
            };
          }),
        });
      }

      ssrRootHtml = buildSsrRootHtml({
        heading: routeMeta?.h1 || 'Menu Plus — المنيو الإلكتروني الذكي QR وطلبات الواتساب',
        description: pageDesc,
        origin,
        siteEmail,
        siteTel,
        sectionKey: routeSection || 'home',
        plans: plansList.map((p) => ({
          name: String(p.n || ''),
          price: Number(p.pr || 0).toLocaleString('en-US'),
        })),
        faqs: faqList,
        stores: publicStores.map((r) => {
          const slug =
            sanitizeSubdomainValue(String(r.slug || r.subdomain || '')) ||
            (r.id === 'demo' ? 'cap-burger' : String(r.id || ''));
          return {
            name: String(r.n || slug),
            href: `${origin}/${encodeURIComponent(slug)}`,
          };
        }),
      });
    }

    const safeTitle = escapeSeoAttr(pageTitle);
    const safeDesc = escapeSeoAttr(pageDesc);
    const safeCanonical = escapeSeoAttr(canonicalUrl);
    const safeEmbedImage = escapeSeoAttr(embedImageUrl);
    const safeEmbedAlt = escapeSeoAttr(embedImageAlt);

    let out = stripStaticSeoTags(html).replace(
      /<title>[\s\S]*?<\/title>/i,
      () => `<title>${safeTitle}</title>`
    );
    out = out.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      () => `<meta name="description" content="${safeDesc}" />`
    );
    out = out.replace(
      /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
      () => `<meta property="og:type" content="${ogType}" />`
    );
    out = out.replace(
      /<meta\s+property="og:site_name"\s+content="[^"]*"\s*\/?>/i,
      () => `<meta property="og:site_name" content="Menu Plus" />`
    );
    out = out.replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      () => `<meta property="og:title" content="${safeTitle}" />`
    );
    out = out.replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      () => `<meta property="og:description" content="${safeDesc}" />`
    );
    out = out.replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
      () => `<meta property="og:image" content="${safeEmbedImage}" />`
    );
    out = out.replace(
      /<meta\s+property="og:image:alt"\s+content="[^"]*"\s*\/?>/i,
      () => `<meta property="og:image:alt" content="${safeEmbedAlt}" />`
    );
    out = out.replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
      () => `<meta name="twitter:title" content="${safeTitle}" />`
    );
    out = out.replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
      () => `<meta name="twitter:description" content="${safeDesc}" />`
    );
    out = out.replace(
      /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
      () => `<meta name="twitter:image" content="${safeEmbedImage}" />`
    );
    out = out.replace(
      /<meta\s+name="twitter:image:alt"\s+content="[^"]*"\s*\/?>/i,
      () => `<meta name="twitter:image:alt" content="${safeEmbedAlt}" />`
    );

    const seoTags: string[] = [
      `<link rel="canonical" href="${safeCanonical}" />`,
      `<link rel="alternate" type="text/markdown" href="${safeCanonical}" title="Markdown" />`,
      `<link rel="alternate" type="text/plain" href="${escapeSeoAttr(`${origin}/llms.txt`)}" title="llms.txt" />`,
      `<link rel="alternate" hreflang="ar" href="${safeCanonical}" />`,
      `<link rel="alternate" hreflang="ar-IQ" href="${safeCanonical}" />`,
      `<link rel="alternate" hreflang="x-default" href="${safeCanonical}" />`,
      `<meta property="og:url" content="${safeCanonical}" />`,
      `<meta name="twitter:url" content="${safeCanonical}" />`,
      `<meta name="robots" content="${noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}" />`,
    ];
    if (graphNodes.length > 0) {
      const unifiedGraph = { '@context': 'https://schema.org', '@graph': graphNodes };
      seoTags.push(
        `<script id="mp-ssr-jsonld" type="application/ld+json">${JSON.stringify(unifiedGraph).replace(/</g, '\\u003c')}</script>`
      );
    }

    if (out.includes('</head>')) {
      out = out.replace('</head>', () => `  ${seoTags.join('\n  ')}\n  </head>`);
    }
    if (ssrRootHtml && !noIndex) {
      out = out.replace(
        /<div\s+id="root">[\s\S]*?(?:<\/footer>\s*)?<\/div>/i,
        () => `<div id="root">${ssrRootHtml}</div>`
      );
    }
    if (matchedFamily) {
      out = injectInitialMenuBootstrapIntoHtml(out, matchedFamily);
    } else if (!isAnyDashRoute && !cleanPath.startsWith('/admin') && !cleanPath.startsWith('/onboard')) {
      out = injectInitialHomeBootstrapIntoHtml(out, allData);
    }

    if (isAnyDashRoute) {
      const branchMatch = /^\/dashboard\/b\/([a-zA-Z0-9_-]+)/.exec(req.path);
      const slugDashMatch = isSlugDashRoute ? decodeURIComponent(segs[0]) : '';
      const sessionRid = typeof req.authSession?.rid === 'string' ? req.authSession.rid.trim() : '';
      let targetRid = branchMatch ? branchMatch[1] : '';
      let resolvedSlug = slugDashMatch ? sanitizeSubdomainValue(slugDashMatch) : '';

      if (!targetRid && resolvedSlug) {
        const matched = resolveRestaurantEntryByIdOrSlug(allData, resolvedSlug);
        if (matched) targetRid = matched.rid;
      }
      if (!targetRid) {
        targetRid = sessionRid;
      }

      if (targetRid) {
        const restRec = allData[`restaurants/${targetRid}`] as Record<string, unknown> | undefined;
        const dbSlug = sanitizeSubdomainValue(String(restRec?.slug || restRec?.subdomain || ''));
        if (dbSlug) resolvedSlug = dbSlug;
        else if (targetRid === 'demo' && !resolvedSlug) resolvedSlug = 'cap-burger';
      }

      const { logo, name } = getRestaurantRecordForPwa(allData, targetRid);
      const ver = computePwaLogoVersion(logo);

      if (name) {
        const dashTitle = escapeSeoAttr(`لوحة تحكم ${name} | Menu Plus`);
        out = out.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${dashTitle}</title>`);
      }

      const manifestParams = new URLSearchParams();
      if (targetRid) manifestParams.set('rid', targetRid);
      if (resolvedSlug) manifestParams.set('slug', resolvedSlug);
      if (branchMatch) manifestParams.set('branchId', branchMatch[1]);
      if (name) manifestParams.set('name', name);
      if (logo) manifestParams.set('v', ver);
      const manifestQs = manifestParams.toString();
      const manifestHref = manifestQs
        ? `/api/pwa/dashboard-manifest.webmanifest?${manifestQs}`
        : '/api/pwa/dashboard-manifest.webmanifest';

      out = out.replace(
        /<link\s+rel="manifest"\s+href="[^"]*"\s*\/?>/i,
        () => `<link rel="manifest" href="${escapeSeoAttr(manifestHref)}" />`
      );

      if (targetRid && logo) {
        const iconHref = escapeSeoAttr(
          `/api/pwa/dashboard-icon?rid=${encodeURIComponent(targetRid)}&v=${encodeURIComponent(ver)}`
        );
        out = out.replace(
          /<link\s+rel="apple-touch-icon"[^>]*\/?>/gi,
          () => `<link rel="apple-touch-icon" href="${iconHref}" />`
        );
        out = out.replace(
          /<link\s+rel="icon"[^>]*\/?>/gi,
          () => `<link rel="icon" href="${iconHref}" />`
        );
      }

      if (name) {
        const shortTitle = name.length <= 14 ? name : `${name.slice(0, 13)}…`;
        out = out.replace(
          /<meta\s+name="apple-mobile-web-app-title"\s+content="[^"]*"\s*\/?>/i,
          () => `<meta name="apple-mobile-web-app-title" content="${escapeSeoAttr(shortTitle)}" />`
        );
      }
    }

    if (isCacheablePublicHtml && isProduction) {
      const famRids = matchedFamily ? Array.from(matchedFamily.familyRids) : null;
      const cacheVer = getRealtimeVersion('menu', famRids);
      if (publicHtmlInjectionCache.size >= MAX_PUBLIC_HTML_CACHE) {
        const firstKey = publicHtmlInjectionCache.keys().next().value;
        if (firstKey) publicHtmlInjectionCache.delete(firstKey);
      }
      publicHtmlInjectionCache.set(`${origin}|${cleanPath}`, {
        version: cacheVer,
        familyRids: famRids,
        html: out,
      });
    }

    return out;
  } catch {
    return html;
  }
}

export function createSeoAndMcpRouter(baseDomain: string): Router {
  const router = Router();
  const llmsTxtCache = new Map<string, string>();
  const sitemapXmlCache = new Map<string, string>();

  subscribeStoreChanges((ev) => {
    const shouldInvalidateSeo = ev.changedKeys.some(
      (k) => k === '__full_sync__' || k.startsWith('restaurants/') || k.startsWith('settings/')
    );
    if (shouldInvalidateSeo) {
      llmsTxtCache.clear();
      sitemapXmlCache.clear();
    }
  });

  router.options('/api/mcp', (_req, res) => {
    res
      .status(204)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
      .end();
  });

  router.post('/api/mcp', async (req, res) => {
    res
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Content-Type', 'application/json; charset=utf-8');

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      jsonrpc?: string;
      id?: string | number | null;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    const id = body.id ?? null;
    const method = String(body.method || '').trim();
    const origin = resolveRequestOrigin(req, baseDomain);

    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'menu-plus', title: 'Menu Plus', version: '1.0.0' },
        },
      });
    }

    if (method === 'ping') {
      return res.json({ jsonrpc: '2.0', id, result: {} });
    }

    if (method === 'tools/list') {
      return res.json({ jsonrpc: '2.0', id, result: { tools: MCP_TOOLS_CATALOG } });
    }

    if (method === 'tools/call') {
      const toolName = String(body.params?.name || '').trim();
      const args = (
        body.params?.arguments && typeof body.params.arguments === 'object'
          ? body.params.arguments
          : {}
      ) as Record<string, unknown>;
      const allData = await readAll(false).catch(() => ({} as Record<string, unknown>));

      if (toolName === 'search_menus') {
        const q = String(args.query || '').trim().toLowerCase();
        const limit = Math.min(25, Math.max(1, Number(args.limit || 10)));
        const stores = Object.entries(allData)
          .filter(([k, v]) => k.startsWith('restaurants/') && v && typeof v === 'object')
          .map(([k, v]) => {
            const r = v as Record<string, unknown>;
            const rid = String(r.id || k.slice('restaurants/'.length));
            const slug =
              sanitizeSubdomainValue(String(r.slug || r.subdomain || '')) ||
              (rid === 'demo' ? 'cap-burger' : rid);
            return {
              id: rid,
              name: String(r.n || slug),
              slug,
              url: `${origin}/${encodeURIComponent(slug)}`,
              type: String(r.projectType || 'restaurant'),
              active: r.a !== 0,
              isBranch: Boolean(r.isBranch),
            };
          })
          .filter(
            (st) =>
              st.active &&
              !st.isBranch &&
              (!q || st.name.toLowerCase().includes(q) || st.slug.toLowerCase().includes(q))
          )
          .slice(0, limit)
          .map(({ name, slug, url, type }) => ({ name, slug, url, type }));

        const payload = { stores };
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            ...payload,
            structuredContent: payload,
            content: [{ type: 'text', text: JSON.stringify(payload) }],
          },
        });
      }

      if (toolName === 'get_menu_details') {
        const slugArg = String(args.slug || 'cap-burger').trim();
        const family = resolvePublicMenuFamily(allData, slugArg);
        if (!family) {
          return res.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Menu not found: ${slugArg}` },
          });
        }
        const cats = Object.entries(family.bootstrapRecords)
          .filter(([k, v]) => k.startsWith('cats/') && v && typeof v === 'object')
          .map(([, v]) => ({
            id: (v as Record<string, unknown>).id,
            name: (v as Record<string, unknown>).n,
          }));
        const items = Object.entries(family.bootstrapRecords)
          .filter(([k, v]) => k.startsWith('items/') && v && typeof v === 'object')
          .map(([, v]) => {
            const it = v as Record<string, unknown>;
            return {
              id: it.id,
              categoryId: it.cat,
              name: it.n,
              description: it.d || '',
              price: Number(it.pr || 0),
            };
          });
        const payload = {
          name: String(family.rest.n || family.slug),
          slug: family.slug,
          url: `${origin}/${encodeURIComponent(family.slug)}`,
          currency: String(family.rest.currency || 'د.ع'),
          categories: cats,
          items,
        };
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            ...payload,
            structuredContent: payload,
            content: [{ type: 'text', text: JSON.stringify(payload) }],
          },
        });
      }

      if (toolName === 'get_pricing_plans') {
        const plansDoc = allData['settings/plans'] as
          | { list?: Array<Record<string, unknown>> }
          | Array<Record<string, unknown>>
          | undefined;
        const rawPlans = Array.isArray(plansDoc)
          ? plansDoc
          : Array.isArray(plansDoc?.list)
          ? plansDoc.list
          : [];
        const activePlans = rawPlans
          .filter((p) => String(p.id || '') !== 'free' && Number(p.pr || 0) > 0)
          .map((p) => ({
            id: p.id,
            name: p.n,
            monthlyPrice: Number(p.pr || 0),
            annualPrice: Number(p.annualPrice || 0) || Number(p.pr || 0) * 10,
            features: Array.isArray(p.fs) ? p.fs : [],
          }));
        const payload = { currency: 'IQD', commissionRate: '0%', plans: activePlans };
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            ...payload,
            structuredContent: payload,
            content: [{ type: 'text', text: JSON.stringify(payload) }],
          },
        });
      }

      if (toolName === 'get_platform_info') {
        const siteCfg = (allData['settings/site'] || {}) as Record<string, unknown>;
        const waRaw = String(siteCfg.supportWhatsapp || siteCfg.wa || '9647724799679').replace(
          /\D/g,
          ''
        );
        const phone = waRaw.startsWith('0')
          ? `+964${waRaw.slice(1)}`
          : `+${waRaw || '9647724799679'}`;
        const email = String(siteCfg.em || 'support@menuplus.io').trim();
        const payload = {
          name: 'Menu Plus',
          description:
            'Smart QR digital menu and WhatsApp catalog platform for restaurants, cafés, and online stores with 0% sales commission.',
          url: `${origin}/`,
          contact: { email, telephone: phone, whatsapp: `https://wa.me/${phone.replace(/^\+/, '')}` },
          pages: {
            about: `${origin}/about`,
            contact: `${origin}/contact`,
            terms: `${origin}/terms`,
            privacy: `${origin}/privacy`,
            pricing: `${origin}/pricing`,
            faq: `${origin}/faq`,
            llms: `${origin}/llms.txt`,
          },
        };
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            ...payload,
            structuredContent: payload,
            content: [{ type: 'text', text: JSON.stringify(payload) }],
          },
        });
      }

      return res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      });
    }

    return res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  });

  router.get('/robots.txt', (req, res) => {
    const origin = resolveRequestOrigin(req, baseDomain);
    res
      .status(200)
      .setHeader('Content-Type', 'text/plain; charset=utf-8')
      .setHeader('Cache-Control', 'public, max-age=3600')
      .send(
        [
          'User-agent: *',
          'Content-Signal: search=yes, ai-train=no',
          'Allow: /',
          'Allow: /about',
          'Allow: /contact',
          'Allow: /terms',
          'Allow: /privacy',
          'Allow: /explore',
          'Allow: /services',
          'Allow: /steps',
          'Allow: /pricing',
          'Allow: /faq',
          'Allow: /llms.txt',
          'Allow: /.well-known/mcp/server-card.json',
          'Disallow: /admin',
          'Disallow: /admin/',
          'Disallow: /dashboard',
          'Disallow: /dashboard/',
          'Disallow: /*/dashboard',
          'Disallow: /*/dashboard/',
          'Disallow: /login',
          'Disallow: /signup',
          'Disallow: /forgot',
          'Disallow: /onboard',
          'Disallow: /api/',
          `Sitemap: ${origin}/sitemap.xml`,
        ].join('\n')
      );
  });

  router.get('/llms.txt', async (req, res) => {
    try {
      const origin = resolveRequestOrigin(req, baseDomain);
      const cached = llmsTxtCache.get(origin);
      if (cached) {
        return res
          .status(200)
          .setHeader('Content-Type', 'text/plain; charset=utf-8')
          .setHeader('Access-Control-Allow-Origin', '*')
          .setHeader('Cache-Control', 'public, max-age=1800')
          .send(cached);
      }

      const allData = await readAll(false).catch(() => ({} as Record<string, unknown>));
      const buckets = getSnapshotBuckets(allData);
      const siteCfg = (allData['settings/site'] || {}) as Record<string, unknown>;
      const siteEmail = String(siteCfg.em || 'support@menuplus.io').trim();
      const siteTel = normalizeTelUri(String(siteCfg.supportWhatsapp || siteCfg.wa || ''));

      const plansDoc = allData['settings/plans'] as
        | { list?: Array<Record<string, unknown>> }
        | Array<Record<string, unknown>>
        | undefined;
      const rawPlans = Array.isArray(plansDoc)
        ? plansDoc
        : Array.isArray(plansDoc?.list)
        ? plansDoc.list
        : [];
      const activePlans = rawPlans.filter(
        (p) => String(p.id || '') !== 'free' && Number(p.pr || 0) > 0
      );
      const publicStores: Record<string, unknown>[] = [];
      for (const r of buckets.restaurants.values()) {
        if (r.a !== 0 && !r.isBranch && String(r.n || '').trim()) {
          publicStores.push(r);
          if (publicStores.length >= 12) break;
        }
      }

      const content = [
        '# Menu Plus',
        '',
        '> Smart QR digital menu and WhatsApp ordering storefront platform for restaurants, cafés, bakeries, and online stores with 0% sales commission.',
        '',
        '## Core Pages',
        `- [Homepage](${origin}/): Platform overview, interactive dashboard preview, plans, and FAQ.`,
        `- [About Menu Plus](${origin}/about): Mission, platform capabilities, and regional coverage.`,
        `- [Contact](${origin}/contact): Customer support channels, email, telephone, and WhatsApp.`,
        `- [Explore](${origin}/explore): Dashboard preview and live menu search.`,
        `- [Features](${origin}/services): QR menus, WhatsApp ordering, branches, and themes.`,
        `- [Pricing](${origin}/pricing): Monthly and annual subscription tiers (0% commission).`,
        `- [FAQ](${origin}/faq): Answers on QR codes, setup, and customization.`,
        `- [Terms of Service](${origin}/terms): Service terms and billing policies.`,
        `- [Privacy Policy](${origin}/privacy): Data protection and privacy commitments.`,
        '',
        ...(activePlans.length > 0
          ? [
              '## Subscription Plans (IQD)',
              ...activePlans.map(
                (p) => `- **${String(p.n || '')}**: ${Number(p.pr || 0).toLocaleString('en-US')} IQD / month`
              ),
              '',
            ]
          : []),
        ...(publicStores.length > 0
          ? [
              '## Public Storefronts',
              ...publicStores.map((r) => {
                const slug =
                  sanitizeSubdomainValue(String(r.slug || r.subdomain || '')) ||
                  (r.id === 'demo' ? 'cap-burger' : String(r.id || ''));
                return `- [${String(r.n || slug)}](${origin}/${encodeURIComponent(slug)})`;
              }),
              '',
            ]
          : []),
        '## Agent & Machine-Readable Endpoints',
        `- [Sitemap](${origin}/sitemap.xml)`,
        `- [Robots Policy](${origin}/robots.txt)`,
        `- [MCP Server Card](${origin}/.well-known/mcp/server-card.json)`,
        `- MCP Streamable HTTP Endpoint: ${origin}/api/mcp`,
        `- Markdown Representation: Send \`Accept: text/markdown\` to ${origin}/ or any public route.`,
        '',
        '## Contact',
        `- Email: mailto:${siteEmail}`,
        `- Telephone: tel:${siteTel}`,
        `- Instagram: https://instagram.com/iq.menu`,
      ].join('\n');

      if (llmsTxtCache.size >= 50) llmsTxtCache.clear();
      llmsTxtCache.set(origin, content);

      return res
        .status(200)
        .setHeader('Content-Type', 'text/plain; charset=utf-8')
        .setHeader('Access-Control-Allow-Origin', '*')
        .setHeader('Cache-Control', 'public, max-age=1800')
        .send(content);
    } catch {
      return res
        .status(500)
        .setHeader('Content-Type', 'text/plain')
        .send('Failed to generate llms.txt');
    }
  });

  router.get('/.well-known/mcp/server-card.json', (req, res) => {
    const origin = resolveRequestOrigin(req, baseDomain);
    const endpoint = `${origin}/api/mcp`;
    return res
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Cache-Control', 'public, max-age=3600')
      .json({
        $schema: 'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json',
        version: '1.0.0',
        protocolVersion: '2025-03-26',
        name: 'menu-plus',
        title: 'Menu Plus',
        description:
          'Smart QR Digital Menu and WhatsApp Ordering Platform for restaurants, cafés, and retail stores.',
        serverInfo: {
          name: 'menu-plus',
          title: 'Menu Plus',
          version: '1.0.0',
          description:
            'Smart QR Digital Menu and WhatsApp Ordering Platform for restaurants, cafés, and retail stores.',
        },
        endpoint,
        transport: {
          type: 'streamable-http',
          endpoint,
        },
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          prompts: { listChanged: false },
        },
        tools: MCP_TOOLS_CATALOG,
      });
  });

  router.get('/sitemap.xml', async (req, res) => {
    try {
      const origin = resolveRequestOrigin(req, baseDomain);
      const nowIso = new Date().toISOString().slice(0, 10);
      const cacheKey = `${origin}|${nowIso}`;
      const cachedXml = sitemapXmlCache.get(cacheKey);
      if (cachedXml) {
        return res
          .status(200)
          .setHeader('Content-Type', 'application/xml; charset=utf-8')
          .setHeader('Cache-Control', 'public, max-age=1800')
          .send(cachedXml);
      }

      const allData = await readAll(false).catch(() => ({} as Record<string, unknown>));
      const buckets = getSnapshotBuckets(allData);

      const demoRest = buckets.restaurants.get('demo');
      const demoSlug = sanitizeSubdomainValue(String(demoRest?.slug || '')) || 'cap-burger';
      const entries: Array<{
        loc: string;
        lastmod: string;
        priority: string;
        changefreq: string;
        image?: string;
        imageTitle?: string;
      }> = [
        {
          loc: `${origin}/`,
          lastmod: nowIso,
          priority: '1.0',
          changefreq: 'daily',
          image: `${origin}/assets/logo.png`,
          imageTitle: 'Menu Plus',
        },
        {
          loc: `${origin}/explore`,
          lastmod: nowIso,
          priority: '0.95',
          changefreq: 'daily',
          image: `${origin}/assets/logo.png`,
          imageTitle: 'تصفح المنيوهات المباشرة — Menu Plus',
        },
        { loc: `${origin}/services`, lastmod: nowIso, priority: '0.9', changefreq: 'weekly' },
        { loc: `${origin}/steps`, lastmod: nowIso, priority: '0.8', changefreq: 'weekly' },
        { loc: `${origin}/pricing`, lastmod: nowIso, priority: '0.9', changefreq: 'weekly' },
        { loc: `${origin}/faq`, lastmod: nowIso, priority: '0.8', changefreq: 'weekly' },
        { loc: `${origin}/about`, lastmod: nowIso, priority: '0.75', changefreq: 'monthly' },
        { loc: `${origin}/contact`, lastmod: nowIso, priority: '0.75', changefreq: 'monthly' },
        { loc: `${origin}/terms`, lastmod: nowIso, priority: '0.6', changefreq: 'monthly' },
        { loc: `${origin}/privacy`, lastmod: nowIso, priority: '0.6', changefreq: 'monthly' },
        {
          loc: `${origin}/${encodeURIComponent(demoSlug)}`,
          lastmod: nowIso,
          priority: '0.85',
          changefreq: 'daily',
          image: resolvePublicAssetUrl(
            origin,
            (demoRest?.projectType === 'store' &&
              Array.isArray(demoRest?.coverImages) &&
              demoRest?.coverImages[0]) ||
              demoRest?.logo,
            '/assets/logo.png'
          ),
          imageTitle: String(demoRest?.n || 'المنيو التجريبي — Menu Plus'),
        },
      ];

      const seen = new Set(entries.map((e) => e.loc));
      for (const [k, r] of buckets.restaurants.entries()) {
        const id = String(r.id || k);
        if (!id || id === 'demo' || r.a === 0 || r.isBranch) continue;
        const slug = sanitizeSubdomainValue(String(r.slug || r.subdomain || '')) || id;
        const loc = `${origin}/${encodeURIComponent(slug)}`;
        if (!seen.has(loc)) {
          seen.add(loc);
          const rawUpdated =
            typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt)
              ? new Date(r.updatedAt).toISOString().slice(0, 10)
              : nowIso;
          const imgUrl = resolvePublicAssetUrl(
            origin,
            (r.projectType === 'store' && Array.isArray(r.coverImages) && r.coverImages[0]) ||
              r.logo,
            '/assets/logo.png'
          );
          entries.push({
            loc,
            lastmod: rawUpdated,
            priority: '0.8',
            changefreq: 'daily',
            image: imgUrl,
            imageTitle: String(r.n || slug),
          });
        }
      }

      const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
        entries
          .map(
            (e) =>
              `  <url>\n` +
              `    <loc>${xmlEscape(e.loc)}</loc>\n` +
              `    <lastmod>${e.lastmod}</lastmod>\n` +
              `    <changefreq>${e.changefreq}</changefreq>\n` +
              `    <priority>${e.priority}</priority>\n` +
              (e.image
                ? `    <image:image>\n      <image:loc>${xmlEscape(e.image)}</image:loc>\n${
                    e.imageTitle ? `      <image:title>${xmlEscape(e.imageTitle)}</image:title>\n` : ''
                  }    </image:image>\n`
                : '') +
              `  </url>`
          )
          .join('\n') +
        `\n</urlset>`;

      if (sitemapXmlCache.size >= 50) sitemapXmlCache.clear();
      sitemapXmlCache.set(cacheKey, xml);

      return res
        .status(200)
        .setHeader('Content-Type', 'application/xml; charset=utf-8')
        .setHeader('Cache-Control', 'public, max-age=1800')
        .send(xml);
    } catch {
      return res
        .status(500)
        .setHeader('Content-Type', 'text/plain')
        .send('Failed to generate sitemap');
    }
  });

  return router;
}

export interface SpaPageHandlerOptions {
  isProduction: boolean;
  baseDomain: string;
  shouldSkipRequest: (reqPath: string) => boolean;
  onAssetSkipped?: (res: Response) => Response;
  loadHtmlTemplate: (req: Request) => Promise<string | null>;
  setNoStoreHtmlHeaders: (res: Response) => void;
  getServerBuildId: () => string;
  injectBuildFingerprint: (html: string, buildId: string) => string;
}

function isSubdomainSelfMenuPath(
  cleanPath: string,
  allData: Record<string, unknown>,
  subdomainResolved?: ResolvedSubdomainResult
): boolean {
  if (!subdomainResolved?.found || !subdomainResolved.restaurant) return false;
  const rawSegs = cleanPath.replace(/^\/+/, '').split('/').filter(Boolean);
  if (rawSegs.length === 0) return false;

  const subRest = subdomainResolved.restaurant;
  const subFamilyRootId = String(subRest.parentRid || subRest.id || '').trim();
  const subSlug = sanitizeSubdomainValue(String(subdomainResolved.subdomain || ''));
  const restSlug = sanitizeSubdomainValue(String(subRest.slug || ''));
  const restSub = sanitizeSubdomainValue(String(subRest.subdomain || ''));

  let targetSlugOrId = '';
  if (rawSegs.length === 1) {
    const s0Lower = rawSegs[0].toLowerCase();
    const legacyMenuMatch = /^menu-([a-zA-Z0-9_-]+)$/.exec(rawSegs[0]);
    if (legacyMenuMatch) {
      targetSlugOrId = safeDecodeUriSegment(legacyMenuMatch[1]) || '';
    } else if (!SEO_RESERVED_SEGMENTS.has(s0Lower)) {
      targetSlugOrId = safeDecodeUriSegment(rawSegs[0]) || '';
    }
  } else if (rawSegs.length === 2 && rawSegs[0].toLowerCase() === 'menu') {
    targetSlugOrId = safeDecodeUriSegment(rawSegs[1]) || '';
  }

  if (!targetSlugOrId) return false;
  const cleanTarget = sanitizeSubdomainValue(targetSlugOrId);
  if (
    (subSlug && cleanTarget === subSlug) ||
    (restSlug && cleanTarget === restSlug) ||
    (restSub && cleanTarget === restSub) ||
    targetSlugOrId === subRest.id ||
    (subRest.id === 'demo' && cleanTarget === 'cap-burger')
  ) {
    return true;
  }

  const fam = resolvePublicMenuFamily(allData, targetSlugOrId);
  if (!fam || fam.rest.deleted === true) return false;
  const famRootId = String(fam.mainRid || fam.rest.parentRid || fam.rest.id || '').trim();
  return Boolean(subFamilyRootId && (fam.rest.id === subRest.id || famRootId === subFamilyRootId));
}

export function createSpaPageHandler(opts: SpaPageHandlerOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (opts.shouldSkipRequest(req.path)) {
      if (opts.onAssetSkipped) {
        return opts.onAssetSkipped(res);
      }
      return next();
    }

    const cleanPath = req.path === '/' ? '/' : req.path.replace(/\/+$/, '') || '/';
    const subdomainResolved = res.locals.subdomainResolved as ResolvedSubdomainResult | undefined;

    try {
      const allData = await readAll(false).catch(() => ({} as Record<string, unknown>));
      if (
        (req.method === 'GET' || req.method === 'HEAD') &&
        isSubdomainSelfMenuPath(cleanPath, allData, subdomainResolved)
      ) {
        const qIdx = req.originalUrl.indexOf('?');
        const qs = qIdx >= 0 ? req.originalUrl.slice(qIdx) : '';
        return res.redirect(302, `/${qs}`);
      }
      const routeExists = doesRouteExistOnServer(cleanPath, allData, subdomainResolved);
      if (!routeExists) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        if (wantsMarkdownResponse(req)) {
          res.setHeader('Cache-Control', 'no-store');
          return res
            .status(404)
            .setHeader('Content-Type', 'text/markdown; charset=utf-8')
            .send(buildNotFoundMarkdown(req, opts.baseDomain));
        }
        opts.setNoStoreHtmlHeaders(res);
        const rawHtml404 = await opts.loadHtmlTemplate(req);
        if (!rawHtml404) {
          return res
            .status(404)
            .setHeader('Content-Type', 'text/plain; charset=utf-8')
            .send('404 Not Found');
        }
        const notFoundHtml = opts.injectBuildFingerprint(
          injectNotFoundIntoHtml(rawHtml404, req, opts.baseDomain, res),
          opts.getServerBuildId()
        );
        return res
          .status(404)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .send(notFoundHtml);
      }

      if (wantsMarkdownResponse(req)) {
        const origin = resolveRequestOrigin(req, opts.baseDomain);
        applyAgentLinkHeaders(res, origin, cleanPath);
        return res
          .status(200)
          .setHeader('Content-Type', 'text/markdown; charset=utf-8')
          .send(buildMarkdownDocument(req, allData, opts.baseDomain));
      }

      const rawHtml = await opts.loadHtmlTemplate(req);
      if (!rawHtml) {
        return res.status(500).send('Build output not found. Run npm run build first.');
      }
      opts.setNoStoreHtmlHeaders(res);

      if (subdomainResolved?.found) {
        let subHtml = injectSubdomainHtmlMeta(rawHtml, subdomainResolved);
        if (subdomainResolved.restaurant?.id) {
          const subFamily = resolvePublicMenuFamily(allData, subdomainResolved.restaurant.id);
          subHtml = injectInitialMenuBootstrapIntoHtml(subHtml, subFamily);
        }
        const injected = opts.injectBuildFingerprint(subHtml, opts.getServerBuildId());
        applyAgentLinkHeaders(res, resolveRequestOrigin(req, opts.baseDomain), cleanPath);
        return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(injected);
      }

      const seoInjected = opts.injectBuildFingerprint(
        await injectSeoMetaIntoHtml(
          rawHtml,
          req,
          opts.isProduction,
          opts.baseDomain,
          res,
          allData
        ),
        opts.getServerBuildId()
      );
      return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(seoInjected);
    } catch (err) {
      return next(err);
    }
  };
}
