/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { applyChanges, readAll } from './neon-store.ts';
import { clearAuthSessionsByTarget } from './auth.ts';
import {
  deleteTelegramUserByPhone,
  normalizePhoneKeys,
  updateAdminTelegramConfig,
} from './telegram-otp.ts';
import {
  extractPlansList,
  generateUniqueMenuCode,
  isPaidPlanForRestaurant,
  isValidSixCharCode,
  normalizeSubdomainRules,
  sanitizeSubdomainValue,
  SYSTEM_RESERVED_SUBDOMAINS,
  type StoreRecord,
} from './subdomain.ts';

export async function runStartupMigrations(): Promise<void> {
  const allData = await readAll(false).catch(() => ({} as Record<string, unknown>));
  const putData: Record<string, unknown> = {};
  const delKeys: string[] = [];

  if (!allData['migrations/purged_7833239944_v3']) {
    const targetKeys = new Set(normalizePhoneKeys('07833239944'));
    const matchesTarget = (val: unknown): boolean =>
      typeof val === 'string' &&
      val.trim() !== '' &&
      normalizePhoneKeys(val).some((k) => targetKeys.has(k));

    for (const [k, v] of Object.entries(allData)) {
      if (!v || typeof v !== 'object') continue;
      const rec = v as Record<string, any>;
      if (k.startsWith('accounts/')) {
        const isProtectedAdmin =
          k === 'accounts/acc_admin_owner' || rec.admin === true || rec.r === 'admin';
        if (
          !isProtectedAdmin &&
          (matchesTarget(rec.phone) ||
            matchesTarget(rec.projectPhone) ||
            matchesTarget(rec.em) ||
            matchesTarget(rec.username) ||
            matchesTarget(rec.e) ||
            matchesTarget(rec.u))
        ) {
          delKeys.push(k);
          if (rec.rid && rec.rid !== 'demo') {
            await clearAuthSessionsByTarget(String(rec.rid), k.slice('accounts/'.length)).catch(
              () => {}
            );
          }
        }
      } else if (k.startsWith('staff/')) {
        if (matchesTarget(rec.phone) || matchesTarget(rec.email)) {
          delKeys.push(k);
        }
      } else if (k.startsWith('restaurants/') && !k.slice('restaurants/'.length).includes('/')) {
        if (matchesTarget(rec.ph) || matchesTarget(rec.ow)) {
          putData[k] = {
            ...rec,
            ...(matchesTarget(rec.ph) ? { ph: '' } : {}),
            ...(matchesTarget(rec.ow) ? { ow: '' } : {}),
          };
        }
      }
    }

    await deleteTelegramUserByPhone('07833239944').catch(() => {});
    await deleteTelegramUserByPhone('9647833239944').catch(() => {});
    putData['migrations/purged_7833239944_v3'] = true;
  }

  if (!allData['migrations/default_light_platform_v1']) {
    const existingSite =
      allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? (allData['settings/site'] as Record<string, any>)
        : {};
    const existingTheme =
      allData['settings/theme'] && typeof allData['settings/theme'] === 'object'
        ? (allData['settings/theme'] as Record<string, any>)
        : {};

    putData['settings/site'] = {
      ...existingSite,
      homeThemeMode: 'light',
    };
    putData['settings/theme'] = {
      c1: '#0F766E',
      c2: '#FFFFFF',
      c3: '#059669',
      bg: '#F8FAFC',
      mode: 'light',
      c4: '#F1F5F9',
      c5: '#0F766E',
      font:
        existingTheme.font && !String(existingTheme.font).toLowerCase().startsWith('thmanyah')
          ? existingTheme.font
          : 'tajawal',
      ...(existingTheme.typography ? { typography: existingTheme.typography } : {}),
      preset: 'clean_light',
    };
    putData['migrations/default_light_platform_v1'] = true;
  }

  if (!allData['migrations/hero_iraq_copy_v1']) {
    const existingHome =
      allData['settings/home'] && typeof allData['settings/home'] === 'object'
        ? (allData['settings/home'] as Record<string, any>)
        : {};
    const existingHero =
      existingHome.hero && typeof existingHome.hero === 'object' ? existingHome.hero : {};
    putData['settings/home'] = {
      ...existingHome,
      hero: {
        ...existingHero,
        titleLine1: 'المنيو الأذكى بالعراق',
        titleLine2: 'لمتجرك أو مطعمك',
        title: 'المنيو الأذكى بالعراق — لمتجرك أو مطعمك',
        lead: 'أطلق متجرك الآن واستقبل الطلبات',
      },
    };
    putData['migrations/hero_iraq_copy_v1'] = true;
  }

  if (!allData['migrations/root_codes_and_disable_google_subdomain_v1']) {
    const existingSite =
      putData['settings/site'] && typeof putData['settings/site'] === 'object'
        ? (putData['settings/site'] as Record<string, any>)
        : allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? (allData['settings/site'] as Record<string, any>)
        : {};
    const normalizedSubRules = normalizeSubdomainRules(existingSite);
    putData['settings/site'] = {
      ...existingSite,
      googleAuthEnabled: false,
      subdomainRules: {
        ...normalizedSubRules,
        enabled: false,
      },
    };

    const existingHome =
      putData['settings/home'] && typeof putData['settings/home'] === 'object'
        ? (putData['settings/home'] as Record<string, any>)
        : allData['settings/home'] && typeof allData['settings/home'] === 'object'
        ? (allData['settings/home'] as Record<string, any>)
        : null;
    if (existingHome) {
      const existingHero =
        existingHome.hero && typeof existingHome.hero === 'object' ? existingHome.hero : {};
      const curCta1 = String(existingHero.cta1Link || '').trim();
      if (!curCta1 || curCta1 === '/menu/demo') {
        putData['settings/home'] = {
          ...existingHome,
          hero: {
            ...existingHero,
            cta1Link: '/cap-burger',
          },
        };
      }
    }

    const plansList = extractPlansList(allData['settings/plans']);
    if (allData['settings/plans'] && typeof allData['settings/plans'] === 'object') {
      const rawPlansDoc = allData['settings/plans'] as Record<string, any>;
      if (Array.isArray(rawPlansDoc.list)) {
        putData['settings/plans'] = {
          ...rawPlansDoc,
          list: rawPlansDoc.list.map((pl: any) => ({
            ...pl,
            featuresMap: {
              ...(pl.featuresMap || {}),
              customSlug: !(pl.id === 'free' && Number(pl.pr || 0) <= 0),
            },
          })),
        };
      }
    }

    const takenSlugs = new Set<string>();
    const restEntries: Array<[string, Record<string, any>]> = [];
    for (const [k, v] of Object.entries(allData)) {
      if (
        !k.startsWith('restaurants/') ||
        k.slice('restaurants/'.length).includes('/') ||
        !v ||
        typeof v !== 'object'
      ) {
        continue;
      }
      const rec = (putData[k] as Record<string, any> | undefined) || (v as Record<string, any>);
      restEntries.push([k, rec]);
    }

    for (const [k, rec] of restEntries) {
      const rid = k.slice('restaurants/'.length);
      if (rid === 'demo') {
        takenSlugs.add('cap-burger');
        continue;
      }
      const { isPaid } = isPaidPlanForRestaurant(rec as StoreRecord, plansList);
      if (isPaid) {
        const curSlug = sanitizeSubdomainValue(String(rec.slug || rec.subdomain || ''));
        if (
          curSlug &&
          curSlug.length >= 3 &&
          !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug) &&
          !takenSlugs.has(curSlug)
        ) {
          takenSlugs.add(curSlug);
        }
      }
    }

    for (const [k, rec] of restEntries) {
      const rid = k.slice('restaurants/'.length);
      if (rid === 'demo') {
        const demoSlug = sanitizeSubdomainValue(String(rec.slug || '')) || 'cap-burger';
        putData[k] = {
          ...rec,
          slug: demoSlug,
          subdomain: '',
          isPaid: true,
        };
        continue;
      }

      const { isPaid } = isPaidPlanForRestaurant(rec as StoreRecord, plansList);
      const curSlug = sanitizeSubdomainValue(String(rec.slug || rec.subdomain || ''));

      let nextSlug: string;
      if (isPaid) {
        if (curSlug && curSlug.length >= 3 && !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)) {
          nextSlug = curSlug;
          takenSlugs.add(curSlug);
        } else {
          nextSlug = generateUniqueMenuCode(takenSlugs);
        }
      } else {
        if (
          isValidSixCharCode(curSlug) &&
          !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug) &&
          !takenSlugs.has(curSlug)
        ) {
          nextSlug = curSlug;
          takenSlugs.add(curSlug);
        } else {
          nextSlug = generateUniqueMenuCode(takenSlugs);
        }
      }

      putData[k] = {
        ...rec,
        isPaid,
        slug: nextSlug,
        subdomain: '',
      };
    }

    putData['migrations/root_codes_and_disable_google_subdomain_v1'] = true;
  }

  if (!allData['migrations/branches_and_links_v2']) {
    const existingSite =
      putData['settings/site'] && typeof putData['settings/site'] === 'object'
        ? (putData['settings/site'] as Record<string, any>)
        : allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? (allData['settings/site'] as Record<string, any>)
        : {};
    const subRules = normalizeSubdomainRules(existingSite);
    const plansList = extractPlansList(allData['settings/plans']);

    const curHome =
      putData['settings/home'] && typeof putData['settings/home'] === 'object'
        ? (putData['settings/home'] as Record<string, any>)
        : allData['settings/home'] && typeof allData['settings/home'] === 'object'
        ? (allData['settings/home'] as Record<string, any>)
        : null;
    if (
      curHome?.hero &&
      (String(curHome.hero.cta1Link || '').includes('/menu/') || !curHome.hero.cta1Link)
    ) {
      putData['settings/home'] = {
        ...curHome,
        hero: {
          ...curHome.hero,
          cta1Link: '/cap-burger',
        },
      };
    }

    const takenSlugs = new Set<string>(['cap-burger']);
    const restItems: Array<[string, Record<string, any>]> = [];
    for (const [k, v] of Object.entries(allData)) {
      if (
        !k.startsWith('restaurants/') ||
        k.slice('restaurants/'.length).includes('/') ||
        !v ||
        typeof v !== 'object'
      ) {
        continue;
      }
      const rec = (putData[k] as Record<string, any> | undefined) || (v as Record<string, any>);
      restItems.push([k, rec]);
      const rid = k.slice('restaurants/'.length);
      if (rid === 'demo') continue;
      const parentRec = rec.parentRid
        ? (allData[`restaurants/${rec.parentRid}`] as Record<string, any> | undefined)
        : undefined;
      const { isPaid } = isPaidPlanForRestaurant((parentRec || rec) as StoreRecord, plansList);
      const curSlug = sanitizeSubdomainValue(String(rec.slug || rec.subdomain || ''));
      if (isPaid && curSlug && curSlug.length >= 3 && !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)) {
        takenSlugs.add(curSlug);
      } else if (
        !isPaid &&
        isValidSixCharCode(curSlug) &&
        !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)
      ) {
        takenSlugs.add(curSlug);
      }
    }

    for (const [k, rec] of restItems) {
      const rid = k.slice('restaurants/'.length);
      if (rid === 'demo') continue;
      const parentRec = rec.parentRid
        ? (allData[`restaurants/${rec.parentRid}`] as Record<string, any> | undefined)
        : undefined;
      const { isPaid } = isPaidPlanForRestaurant((parentRec || rec) as StoreRecord, plansList);
      const curSlug = sanitizeSubdomainValue(String(rec.slug || rec.subdomain || ''));

      let nextSlug = curSlug;
      if (isPaid) {
        if (!curSlug || curSlug.length < 3 || SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)) {
          nextSlug = generateUniqueMenuCode(takenSlugs);
        }
      } else {
        if (!isValidSixCharCode(curSlug) || SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)) {
          nextSlug = generateUniqueMenuCode(takenSlugs);
        }
      }

      const nextSubdomain = subRules.enabled && isPaid ? nextSlug : '';
      if (
        rec.slug !== nextSlug ||
        (rec.subdomain || '') !== nextSubdomain ||
        Boolean(rec.isPaid) !== isPaid
      ) {
        putData[k] = {
          ...rec,
          isPaid,
          slug: nextSlug,
          subdomain: nextSubdomain,
        };
      }
    }

    putData['migrations/branches_and_links_v2'] = true;
  }

  if (!allData['migrations/home_phone_demo_off_v1']) {
    const curHome =
      putData['settings/home'] && typeof putData['settings/home'] === 'object'
        ? (putData['settings/home'] as Record<string, any>)
        : allData['settings/home'] && typeof allData['settings/home'] === 'object'
        ? (allData['settings/home'] as Record<string, any>)
        : {};
    const curSections =
      curHome.sections && typeof curHome.sections === 'object'
        ? (curHome.sections as Record<string, any>)
        : {};
    const { phoneDemo: _legacyPhoneDemo, ...restHome } = curHome;
    putData['settings/home'] = {
      ...restHome,
      sections: {
        hero: curSections.hero !== false,
        services: curSections.services !== false,
        faq: curSections.faq !== false,
        pricing: curSections.pricing !== false,
        footer: curSections.footer !== false,
      },
    };
    putData['migrations/home_phone_demo_off_v1'] = true;
  }

  if (!allData['migrations/cap_burger_phone_07833239944_v1']) {
    const curDemo =
      putData['restaurants/demo'] && typeof putData['restaurants/demo'] === 'object'
        ? (putData['restaurants/demo'] as Record<string, any>)
        : allData['restaurants/demo'] && typeof allData['restaurants/demo'] === 'object'
        ? (allData['restaurants/demo'] as Record<string, any>)
        : null;
    if (curDemo) {
      putData['restaurants/demo'] = {
        ...curDemo,
        ph: '07724799679',
      };
    }
    putData['migrations/cap_burger_phone_07833239944_v1'] = true;
  }

  if (!allData['migrations/platform_phone_07724799679_v1']) {
    const curSite =
      putData['settings/site'] && typeof putData['settings/site'] === 'object'
        ? (putData['settings/site'] as Record<string, any>)
        : allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? (allData['settings/site'] as Record<string, any>)
        : {};
    const oldPlaceholders = new Set([
      '',
      '07833239944',
      '9647833239944',
      '+9647833239944',
      '07701234567',
    ]);
    const curWa = String(curSite.wa || '').trim();
    const curSupportWa = String(curSite.supportWhatsapp || '').trim();
    if (oldPlaceholders.has(curWa) || oldPlaceholders.has(curSupportWa)) {
      putData['settings/site'] = {
        ...curSite,
        wa: oldPlaceholders.has(curWa) ? '07724799679' : curWa,
        supportWhatsapp: oldPlaceholders.has(curSupportWa) ? '07724799679' : curSupportWa,
      };
    }

    const curDemo =
      putData['restaurants/demo'] && typeof putData['restaurants/demo'] === 'object'
        ? (putData['restaurants/demo'] as Record<string, any>)
        : allData['restaurants/demo'] && typeof allData['restaurants/demo'] === 'object'
        ? (allData['restaurants/demo'] as Record<string, any>)
        : null;
    if (curDemo) {
      const curSocial =
        curDemo.social && typeof curDemo.social === 'object' ? curDemo.social : {};
      const curDemoSocialWa = String(curSocial.whatsapp || '').trim();
      putData['restaurants/demo'] = {
        ...curDemo,
        ph: '07724799679',
        social: {
          ...curSocial,
          whatsapp:
            !curDemoSocialWa ||
            curDemoSocialWa === '9647711448594' ||
            curDemoSocialWa.includes('7833239944')
              ? '9647724799679'
              : curDemoSocialWa,
        },
      };
    }
    putData['migrations/platform_phone_07724799679_v1'] = true;
  }

  if (!allData['migrations/demo_verified_partner_v1']) {
    const curDemo =
      putData['restaurants/demo'] && typeof putData['restaurants/demo'] === 'object'
        ? (putData['restaurants/demo'] as Record<string, any>)
        : allData['restaurants/demo'] && typeof allData['restaurants/demo'] === 'object'
        ? (allData['restaurants/demo'] as Record<string, any>)
        : null;
    if (curDemo) {
      putData['restaurants/demo'] = {
        ...curDemo,
        verifiedPartner: true,
      };
    }
    putData['migrations/demo_verified_partner_v1'] = true;
  }

  if (!allData['migrations/disable_signup_default_v1']) {
    const curSite =
      putData['settings/site'] && typeof putData['settings/site'] === 'object'
        ? (putData['settings/site'] as Record<string, any>)
        : allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? (allData['settings/site'] as Record<string, any>)
        : {};
    putData['settings/site'] = {
      ...curSite,
      signupEnabled: false,
      su: 0,
    };
    putData['migrations/disable_signup_default_v1'] = true;
  }

  if (!allData['migrations/remove_thmanyah_default_tajawal_v1']) {
    const curTheme =
      putData['settings/theme'] && typeof putData['settings/theme'] === 'object'
        ? (putData['settings/theme'] as Record<string, any>)
        : allData['settings/theme'] && typeof allData['settings/theme'] === 'object'
        ? (allData['settings/theme'] as Record<string, any>)
        : {};
    const curTypo =
      curTheme.typography && typeof curTheme.typography === 'object'
        ? { ...(curTheme.typography as Record<string, any>) }
        : {};
    delete curTypo.thmanyahFamily;
    const rawKey = String(curTypo.fontKey || curTheme.font || '').trim().toLowerCase();
    const normalizedKey =
      rawKey === 'firjar'
        ? 'firjar'
        : rawKey === 'alan_sans' || rawKey === 'alansans' || rawKey === 'alan sans'
        ? 'alan_sans'
        : 'tajawal';
    putData['settings/theme'] = {
      ...curTheme,
      font: normalizedKey,
      typography: {
        ...curTypo,
        fontKey: normalizedKey,
        separateHeadingFont: false,
        headingFontKey: normalizedKey,
        bodyFontKey: normalizedKey,
        headingScale: curTypo.headingScale ?? 100,
        bodySize: curTypo.bodySize ?? 15,
        descSize: curTypo.descSize ?? 13.5,
        headingWeight: curTypo.headingWeight ?? 800,
        subHeadingWeight: curTypo.subHeadingWeight ?? 700,
        bodyWeight: curTypo.bodyWeight ?? 400,
        descWeight: curTypo.descWeight ?? 400,
        headingLineHeight: curTypo.headingLineHeight ?? 1.28,
        bodyLineHeight: curTypo.bodyLineHeight ?? 1.7,
        letterSpacing: curTypo.letterSpacing ?? 0,
        fontStretch: curTypo.fontStretch ?? 100,
      },
    };
    putData['migrations/curated_google_fonts_cleanup_v1'] = true;
    putData['migrations/remove_thmanyah_default_tajawal_v1'] = true;
  }
  if (allData['migrations/thmanyah_serif_display_headings_v1']) {
    delKeys.push('migrations/thmanyah_serif_display_headings_v1');
  }

  if (!allData['migrations/purge_file_accounts_v1']) {
    const fileSeededAccountKeys = [
      'accounts/acc_admin_demo',
      'accounts/acc_menu_demo',
      'accounts/acc_admin_user',
      'accounts/acc_admin_email',
      'accounts/acc_admin_personal',
    ];
    for (const accKey of fileSeededAccountKeys) {
      if (Object.prototype.hasOwnProperty.call(allData, accKey)) {
        delKeys.push(accKey);
      }
    }
    if (Object.prototype.hasOwnProperty.call(allData, 'migrations/demo_platform_admin_07711448594_v1')) {
      delKeys.push('migrations/demo_platform_admin_07711448594_v1');
    }
    putData['migrations/purge_file_accounts_v1'] = true;
  }

  if (allData['migrations/telegram_otp_off_v1']) {
    const curSite =
      putData['settings/site'] && typeof putData['settings/site'] === 'object'
        ? { ...(putData['settings/site'] as Record<string, any>) }
        : allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? { ...(allData['settings/site'] as Record<string, any>) }
        : null;
    if (curSite && 'telegramAuthEnabled' in curSite) {
      delete curSite.telegramAuthEnabled;
      putData['settings/site'] = curSite;
    }
    await updateAdminTelegramConfig({ enabled: true }).catch(() => {});
    delKeys.push('migrations/telegram_otp_off_v1');
  }

  if (!allData['migrations/remove_free_plan_v1']) {
    const existingPlans =
      allData['settings/plans'] && typeof allData['settings/plans'] === 'object'
        ? (allData['settings/plans'] as { list?: Array<Record<string, any>>; [k: string]: any })
        : null;
    if (existingPlans && Array.isArray(existingPlans.list)) {
      const nextList = existingPlans.list.filter(
        (pl) => pl && pl.id !== 'free' && Number(pl.pr) > 0
      );
      putData['settings/plans'] = {
        ...existingPlans,
        list: nextList,
        planNoFreeV8: true,
      };
    }

    const existingHome =
      allData['settings/home'] && typeof allData['settings/home'] === 'object'
        ? { ...(allData['settings/home'] as Record<string, any>) }
        : null;
    if (existingHome) {
      if (existingHome.nav && typeof existingHome.nav === 'object') {
        existingHome.nav = { ...existingHome.nav };
        if (existingHome.nav.modalSignup === 'إنشاء حساب مجاني') {
          existingHome.nav.modalSignup = 'إنشاء حساب';
        }
      }
      if (existingHome.hero && typeof existingHome.hero === 'object') {
        existingHome.hero = { ...existingHome.hero };
        if (typeof existingHome.hero.cta1 === 'string' && /مجانا|مجاناً/i.test(existingHome.hero.cta1)) {
          existingHome.hero.cta1 = 'جرّب المنيو الآن';
        }
      }
      if (existingHome.pricing && typeof existingHome.pricing === 'object') {
        const nextPricing = { ...existingHome.pricing };
        delete nextPricing.freeBadge;
        delete nextPricing.freeCta;
        if (typeof nextPricing.sub !== 'string' || /مجان|مجانية|تجريبية/i.test(nextPricing.sub)) {
          nextPricing.sub =
            'اشترك بالباقة المناسبة لمشروعك بدون أي عمولة على مبيعاتك، وطوّر باقتك في أي وقت مع نمو طلباتك.';
        }
        existingHome.pricing = nextPricing;
      }
      if (existingHome.faq && Array.isArray(existingHome.faq.items)) {
        existingHome.faq = {
          ...existingHome.faq,
          items: existingHome.faq.items.map((item: Record<string, any>) =>
            item?.id === 'faq_5' ||
            /الباقة المجانية|أبدأ مجاناً/i.test(`${item?.q || ''} ${item?.a || ''}`)
              ? {
                  ...item,
                  q: 'كيف يتم تفعيل الاشتراك وما هي الباقات المتوفرة؟',
                  a: 'نوفر 3 باقات مرنة (الاقتصادية، الاحترافية، وباقة الأعمال الشاملة) باشتراك شهري أو سنوي بدون أي عمولات على مبيعاتك، ويمكنك الترقية بين الباقات في أي وقت.',
                }
              : item
          ),
        };
      }
      putData['settings/home'] = existingHome;
    }

    for (const [k, v] of Object.entries(allData)) {
      if (
        !k.startsWith('restaurants/') ||
        k.slice('restaurants/'.length).includes('/') ||
        !v ||
        typeof v !== 'object'
      ) {
        continue;
      }
      const r = v as Record<string, any>;
      const planStr = String(r.p || '').trim();
      if (r.planId === 'free' || planStr === 'الباقة المجانية' || planStr === 'البداية المجانية') {
        putData[k] = {
          ...r,
          planId: 'starter',
          p: 'الباقة الاقتصادية',
          isPaid: true,
        };
      }
    }

    putData['migrations/remove_free_plan_v1'] = true;
  }

  for (const k of Object.keys(allData)) {
    if (k.startsWith('promo_codes/')) {
      delKeys.push(k);
    } else if (k.startsWith('items/')) {
      const itemRec = allData[k] as Record<string, any> | undefined;
      if (
        itemRec &&
        typeof itemRec.img === 'string' &&
        itemRec.img.includes('1576107232684-1279f3908594')
      ) {
        putData[k] = {
          ...itemRec,
          img: '/uploads/hmo/item_046.jpg',
        };
      }
    }
  }

  for (const [k, v] of Object.entries(allData)) {
    if (
      !k.startsWith('restaurants/') ||
      k.slice('restaurants/'.length).includes('/') ||
      !v ||
      typeof v !== 'object'
    ) {
      continue;
    }
    const rec = (putData[k] as Record<string, any> | undefined) || (v as Record<string, any>);
    const parentRid = String(rec.parentRid || '').trim();
    if (!parentRid || rec.deleted === true || rec.a !== 0) continue;
    const parentRec =
      (putData[`restaurants/${parentRid}`] as Record<string, any> | undefined) ||
      (allData[`restaurants/${parentRid}`] as Record<string, any> | undefined);
    if (parentRec && parentRec.a !== 0) {
      putData[k] = {
        ...rec,
        a: parentRec.a ?? 1,
      };
    }
  }

  if (!allData['migrations/brand_menu_plus_v1']) {
    const replaceBrandStr = (s: unknown) =>
      typeof s === 'string'
        ? s
            .replace(
              /منيو\s*بلس\s*\|\s*Menu\+|Menu\+\s*\|\s*منيو\s*بلس|منيو\s*بلس\s*\(Menu\+\)|منيو\s*بلس/g,
              'Menu Plus'
            )
            .replace(/مینیۆ\s*پڵەس/g, 'Menu Plus')
            .replace(/Menu\+(?![a-zA-Z0-9_])/gi, 'Menu Plus')
        : s;

    const curSite =
      putData['settings/site'] && typeof putData['settings/site'] === 'object'
        ? { ...(putData['settings/site'] as Record<string, any>) }
        : allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? { ...(allData['settings/site'] as Record<string, any>) }
        : null;
    if (curSite) {
      curSite.name = 'Menu Plus';
      curSite.logoText = 'Menu Plus';
      putData['settings/site'] = curSite;
    }

    const curHome =
      putData['settings/home'] && typeof putData['settings/home'] === 'object'
        ? { ...(putData['settings/home'] as Record<string, any>) }
        : allData['settings/home'] && typeof allData['settings/home'] === 'object'
        ? { ...(allData['settings/home'] as Record<string, any>) }
        : null;
    if (curHome) {
      if (curHome.hero && typeof curHome.hero === 'object') {
        curHome.hero = { ...curHome.hero };
        if (curHome.hero.cta1 === 'جرب المنيو الان') {
          curHome.hero.cta1 = 'جرّب المنيو الآن';
        }
      }
      if (curHome.steps && typeof curHome.steps === 'object') {
        curHome.steps = { ...curHome.steps, title: replaceBrandStr(curHome.steps.title) };
      }
      if (curHome.demo && typeof curHome.demo === 'object') {
        curHome.demo = { ...curHome.demo, title: replaceBrandStr(curHome.demo.title) };
      }
      if (curHome.faq && typeof curHome.faq === 'object') {
        curHome.faq = {
          ...curHome.faq,
          title:
            curHome.faq.title === 'أسئلة ممكن تجي في بالك'
              ? 'الأسئلة الشائعة'
              : replaceBrandStr(curHome.faq.title),
        };
      }
      if (typeof curHome.footer === 'string') {
        curHome.footer = replaceBrandStr(curHome.footer);
      }
      putData['settings/home'] = curHome;
    }
    putData['migrations/brand_menu_plus_v1'] = true;
  }

  if (!allData['migrations/default_tabs_order_labels_v1']) {
    const curSite =
      putData['settings/site'] && typeof putData['settings/site'] === 'object'
        ? { ...(putData['settings/site'] as Record<string, any>) }
        : allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? { ...(allData['settings/site'] as Record<string, any>) }
        : {};
    curSite.adminTabOrder = [
      'home',
      'notes',
      'partners',
      'staff',
      'home_editor',
      'reports',
      'settings',
    ];
    curSite.adminTabLabels = {
      home: 'الصفحة الرئيسية',
      notes: 'الملاحظات',
      partners: 'الحسابات',
      staff: 'الادارة',
      home_editor: 'تعديل الرئيسية',
      reports: 'البلاغات',
      settings: 'الإعدادات',
    };
    curSite.dashboardTabOrder = [
      'home',
      'stats',
      'cats',
      'menu',
      'orders',
      'appearance',
      'branches',
      'addons',
      'qr',
      'set',
    ];
    curSite.dashboardTabLabels = {
      home: 'الصفحة الرئيسية',
      stats: 'احصائيات احترافية',
      cats: 'الأقسام',
      menu: 'العناصر',
      orders: 'الطلبات',
      appearance: 'المظهر',
      branches: 'عدة أفرع',
      addons: 'الإضافات',
      qr: 'كود QR',
      set: 'الإعدادات',
    };
    putData['settings/site'] = curSite;
    putData['migrations/default_tabs_order_labels_v1'] = true;
  }

  if (!allData['migrations/separate_branch_telegram_v1']) {
    for (const [k, v] of Object.entries(allData)) {
      if (!k.startsWith('restaurants/') || k.slice('restaurants/'.length).includes('/')) continue;
      if (!v || typeof v !== 'object') continue;
      const rec = v as Record<string, any>;
      const parentRid = String(rec.parentRid || '').trim();
      const isBranch = rec.isBranch === true || Boolean(parentRid);
      if (!isBranch || !parentRid) continue;
      const parentRec = (putData[`restaurants/${parentRid}`] || allData[`restaurants/${parentRid}`]) as
        | Record<string, any>
        | undefined;
      if (!parentRec || typeof parentRec !== 'object') continue;

      const branchChat = String(rec.telegramChatId || '').trim();
      const parentChat = String(parentRec.telegramChatId || '').trim();
      const branchTgPhone = String(rec.telegramPhone || '').trim();
      const parentTgPhone = String(parentRec.telegramPhone || '').trim();
      const parentPh = String(parentRec.ph || '').trim();
      const parentWa = String(parentRec.social?.whatsapp || '').trim();

      const sameChat = Boolean(branchChat && parentChat && branchChat === parentChat);
      const inheritedPhone = Boolean(
        branchTgPhone &&
          ((parentTgPhone && branchTgPhone === parentTgPhone) ||
            (parentPh && branchTgPhone === parentPh) ||
            (parentWa && branchTgPhone === parentWa))
      );

      if (sameChat || inheritedPhone) {
        putData[k] = {
          ...rec,
          telegramPhone: '',
          telegramChatId: '',
          telegramUsername: '',
          telegramLinked: false,
          telegramUnlinkedManually: true,
        };
      }
    }
    putData['migrations/separate_branch_telegram_v1'] = true;
  }

  if (Object.keys(putData).length > 0 || delKeys.length > 0) {
    await applyChanges({ put: putData, del: delKeys }, false);
  }
}
