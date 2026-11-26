-- Menu+ Supabase Schema
-- Run this in your Supabase SQL Editor if the tables do not exist yet.

create table if not exists public.menuplus_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_menuplus_kv_updated_at on public.menuplus_kv (updated_at desc);

create table if not exists public.telegram_users (
  normalized_phone text primary key,
  phone text not null,
  chat_id text not null,
  username text,
  first_name text,
  linked_at bigint not null,
  last_sent_at bigint
);

create index if not exists idx_telegram_users_chat_id on public.telegram_users (chat_id);

-- Dedicated subdomain column auto-synced from restaurant records with DB-level uniqueness
alter table public.menuplus_kv
  add column if not exists subdomain text generated always as (
    case
      when key like 'restaurants/%' and position('/' in substring(key from 13)) = 0
        then nullif(lower(btrim(value->>'subdomain')), '')
      else null
    end
  ) stored;

create unique index if not exists idx_menuplus_kv_unique_subdomain
  on public.menuplus_kv (subdomain)
  where subdomain is not null;

-- Lock down direct public/anon access; the Express backend uses SUPABASE_SECRET_KEY.
alter table public.menuplus_kv enable row level security;
alter table public.telegram_users enable row level security;

-- Performance indexes for PostgREST prefix scans, delta syncs, slug lookups, and rid-scoped queries
create index if not exists idx_menuplus_kv_key_pattern
  on public.menuplus_kv (key text_pattern_ops);

create index if not exists idx_menuplus_kv_updated_at_asc
  on public.menuplus_kv (updated_at asc, key);

create index if not exists idx_menuplus_kv_restaurant_slug
  on public.menuplus_kv ((lower(btrim(value->>'slug'))))
  where key like 'restaurants/%' and position('/' in substring(key from 13)) = 0;

create index if not exists idx_menuplus_kv_value_rid
  on public.menuplus_kv ((value->>'rid'))
  where key ~ '^(cats|items|orders|reports|loyalty)/';

