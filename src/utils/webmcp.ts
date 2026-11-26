/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPlans, getSite, resolveRestaurantByIdOrSlug } from './storage';
import { getSupportWhatsapp } from './businessDefaults';
import { DEFAULT_PLANS_V2, calcDiscountedPlanPrice } from './plans';

export interface WebMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
  };
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
}

interface ModelContextContainer {
  registerTool?: (tool: WebMcpToolDefinition) => void;
  unregisterTool?: (name: string) => void;
}

declare global {
  interface Navigator {
    modelContext?: ModelContextContainer;
  }
}

declare module 'react' {
  interface FormHTMLAttributes<T> extends React.HTMLAttributes<T> {
    toolname?: string;
    tooldescription?: string;
  }
}

let webMcpRegistered = false;

export function getWebMcpToolDefinitions(): WebMcpToolDefinition[] {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://menuplus.io';

  return [
    {
      name: 'search_menus',
      description:
        'Search public restaurants, cafés, and digital QR menus hosted on Menu Plus by name or keyword.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional search keyword to filter restaurant or store menus.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of stores to return (default 10).',
          },
        },
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const q = String(input?.query || '').trim().toLowerCase();
        const limit = Math.min(25, Math.max(1, Number(input?.limit || 10)));
        try {
          const res = await fetch('/api/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'tools/call',
              params: { name: 'search_menus', arguments: { query: q, limit } },
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.result) return data.result;
          }
        } catch {
          // fallback cleanly to local demo info
        }
        return {
          stores: [
            {
              name: 'Cap Burger',
              slug: 'cap-burger',
              url: `${origin}/cap-burger`,
              type: 'restaurant',
            },
          ],
        };
      },
    },
    {
      name: 'get_menu_details',
      description:
        'Retrieve categories, menu items, descriptions, and prices for a public Menu Plus restaurant or store by its slug.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: {
            type: 'string',
            description: 'The store URL slug (for example: cap-burger).',
          },
        },
        required: ['slug'],
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const rawSlug = String(input?.slug || 'cap-burger').trim().replace(/^\/+/, '');
        const resolved = resolveRestaurantByIdOrSlug(rawSlug);
        const target = resolved?.slug || rawSlug;
        const res = await fetch(`/api/public/menu/${encodeURIComponent(target)}`);
        if (!res.ok) {
          return { error: `Menu not found for slug: ${rawSlug}` };
        }
        const data = (await res.json()) as { records?: Record<string, Record<string, unknown>> };
        const records = data?.records || {};
        const cats = Object.entries(records)
          .filter(([k]) => k.startsWith('cats/'))
          .map(([, v]) => ({ id: v.id, name: v.n }));
        const items = Object.entries(records)
          .filter(([k]) => k.startsWith('items/'))
          .map(([, v]) => ({
            id: v.id,
            categoryId: v.cat,
            name: v.n,
            description: v.d || '',
            price: Number(v.pr || 0),
          }));
        return { slug: target, url: `${origin}/${encodeURIComponent(target)}`, categories: cats, items };
      },
    },
    {
      name: 'get_pricing_plans',
      description:
        'List Menu Plus subscription plans, monthly and annual prices, currency, and included features (0% sales commission).',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const storedPlans = getPlans();
        const activePlans = (storedPlans && storedPlans.length > 0 ? storedPlans : DEFAULT_PLANS_V2).filter(
          (p) => p.id !== 'free' && Number(p.pr) > 0
        );
        return {
          currency: 'IQD',
          commissionRate: '0%',
          plans: activePlans.map((p) => ({
            id: p.id,
            name: p.n,
            tagline: p.tagline || '',
            monthlyPrice: calcDiscountedPlanPrice(Number(p.pr) || 0, Number(p.discountPercent) || 0),
            annualPrice: Number(p.annualPrice || 0) || calcDiscountedPlanPrice(Number(p.pr) || 0, Number(p.discountPercent) || 0) * 10,
            features: p.fs || [],
          })),
        };
      },
    },
    {
      name: 'get_platform_info',
      description:
        'Return Menu Plus platform summary, support contact details (email, phone, WhatsApp), and key documentation URLs.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const site = getSite();
        const wa = getSupportWhatsapp(site);
        const email = site.em || 'support@menuplus.io';
        return {
          name: 'Menu Plus',
          description:
            'Smart QR digital menu and WhatsApp catalog platform for restaurants, cafés, and online stores with 0% sales commission.',
          url: `${origin}/`,
          contact: {
            email,
            telephone: `+${wa.replace(/^\+/, '')}`,
            whatsapp: `https://wa.me/${wa.replace(/^\+/, '')}`,
            instagram: 'https://instagram.com/iq.menu',
          },
          pages: {
            home: `${origin}/`,
            about: `${origin}/about`,
            contact: `${origin}/contact`,
            terms: `${origin}/terms`,
            privacy: `${origin}/privacy`,
            pricing: `${origin}/pricing`,
            faq: `${origin}/faq`,
            llms: `${origin}/llms.txt`,
            mcpServerCard: `${origin}/.well-known/mcp/server-card.json`,
          },
        };
      },
    },
  ];
}

export function registerWebMcpTools(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (webMcpRegistered) return;
  const modelContext = navigator.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== 'function') return;

  webMcpRegistered = true;
  const tools = getWebMcpToolDefinitions();
  for (const tool of tools) {
    try {
      modelContext.registerTool(tool);
    } catch {
      // ignore duplicate or unsupported tool registration errors cleanly
    }
  }
}
