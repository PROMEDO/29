/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StaffPermissions } from '../types';
import { getAuthHeaders } from './storage';

export interface ManagedStaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  roleTitle: string;
  active: boolean;
  permissions: StaffPermissions;
  createdAt?: string;
  updatedAt?: string;
  hasPassword?: boolean;
}

export interface StaffMutationPayload {
  name: string;
  email: string;
  phone?: string;
  roleTitle: string;
  password?: string;
  active: boolean;
  permissions: StaffPermissions;
}

export interface ManagedAccountRecord {
  id: string;
  source: 'account' | 'restaurant' | 'telegram_only';
  name: string;
  phone: string;
  identifier: string;
  email: string;
  role: 'admin' | 'partner' | 'demo' | 'telegram_only';
  roleLabel: string;
  status: 'active' | 'suspended' | 'telegram_verified';
  statusLabel: string;
  active: boolean;
  registrationDate: string;
  rid?: string;
  done?: number;
  slug?: string;
  subdomain?: string;
  social?: Record<string, string>;
  restaurantName?: string;
  projectName?: string;
  projectType?: string;
  projectTypeLabel?: string;
  planId?: string;
  planName?: string;
  isPaid?: boolean;
  verifiedPartner?: boolean;
  expiresAt?: string;
  restaurantActive?: boolean;
  telegramLinked: boolean;
  telegramUsername?: string;
  telegramChatId?: string;
  telegramLinkedAt?: string;
  lastSentAt?: string;
  hasPassword: boolean;
  isProtected: boolean;
  isCurrentUser?: boolean;
  authMethod?: string;
  itemsCount?: number;
  catsCount?: number;
  ordersCount?: number;
  hasOwnedMenu?: boolean;
  isSelfRegisteredMenuOwner?: boolean;
  permissionsSummary: string;
}

export interface AccountsStats {
  total: number;
  active: number;
  suspended: number;
  telegramVerified: number;
  admins: number;
  partners: number;
  paid?: number;
}

export interface AccountUpdatePayload {
  name?: string;
  phone?: string;
  email?: string;
  role?: 'admin' | 'partner';
  active?: boolean;
  newPassword?: string;
  projectName?: string;
  projectType?: string;
  planId?: string;
  planName?: string;
  isPaid?: boolean;
  durationDays?: number;
  expiresAt?: string;
  extendFromCurrent?: boolean;
  slug?: string;
  subdomain?: string;
  social?: Record<string, string>;
  verifiedPartner?: boolean;
}

export interface CreatePartnerPayload {
  projectName: string;
  ownerName?: string;
  phone?: string;
  projectType?: string;
  planId?: string;
  planName?: string;
  durationDays?: number;
  isPaid?: boolean;
  password?: string;
}

export interface MyAccountProfile {
  kind: 'owner' | 'staff';
  id: string;
  name: string;
  email: string;
  phone: string;
  roleTitle: string;
  createdAt: string;
  active: boolean;
  isProtected: boolean;
  permissions: StaffPermissions;
}

export interface UpdateMyAccountPayload {
  staffId?: string;
  accountId?: string;
  name: string;
  email: string;
  phone: string;
  roleTitle: string;
  newPassword?: string;
}

async function parseApiJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & {
    success?: boolean;
    error?: string;
  };
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `فشل الطلب برمز (${res.status})`);
  }
  return data;
}

export async function fetchStaffApi(): Promise<{
  staff: ManagedStaffMember[];
  source: 'supabase' | 'file-memory';
  supabaseError?: string;
}> {
  const res = await fetch('/api/staff', {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function createStaffApi(payload: StaffMutationPayload): Promise<{
  staff: ManagedStaffMember;
  persistedToSupabase: boolean;
  source: 'supabase' | 'file-memory';
}> {
  const res = await fetch('/api/staff', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function updateStaffApi(
  id: string,
  payload: StaffMutationPayload
): Promise<{
  staff: ManagedStaffMember;
  persistedToSupabase: boolean;
  source: 'supabase' | 'file-memory';
}> {
  const res = await fetch(`/api/staff/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function deleteStaffApi(id: string): Promise<{
  deletedId: string;
  physicalDelete: boolean;
  deletedFromSupabase: boolean;
  source: 'supabase' | 'file-memory';
}> {
  const res = await fetch(`/api/staff/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function fetchAccountsApi(): Promise<{
  accounts: ManagedAccountRecord[];
  stats: AccountsStats;
  source: 'supabase' | 'file-memory';
  supabaseError?: string;
}> {
  const res = await fetch('/api/accounts', {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function createPartnerApi(payload: CreatePartnerPayload): Promise<{
  account: ManagedAccountRecord;
  persistedToSupabase: boolean;
  source: 'supabase' | 'file-memory';
}> {
  const res = await fetch('/api/partners', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function updateAccountApi(
  id: string,
  payload: AccountUpdatePayload
): Promise<{
  account: ManagedAccountRecord;
  persistedToSupabase: boolean;
  source: 'supabase' | 'file-memory';
}> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function deleteAccountApi(
  id: string,
  _deleteTelegram = false
): Promise<{
  deletedId: string;
  physicalDelete: boolean;
  deletedFromSupabase: boolean;
  deletedTelegram: boolean;
}> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(id)}?deleteTelegram=false`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function cleanupUnusedImagesApi(): Promise<{
  removedOrphanRecords: number;
  strippedUnreferencedImages: number;
  reclaimedBytes: number;
}> {
  const res = await fetch('/api/maintenance/cleanup-images', {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function fetchMyAccountApi(params: {
  staffId?: string;
  email?: string;
  phone?: string;
}): Promise<{
  profile: MyAccountProfile;
  source: 'supabase' | 'file-memory';
}> {
  const qs = new URLSearchParams();
  if (params.staffId) qs.set('staffId', params.staffId);
  if (params.email) qs.set('email', params.email);
  if (params.phone) qs.set('phone', params.phone);
  const res = await fetch(`/api/my-account?${qs.toString()}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function updateMyAccountApi(payload: UpdateMyAccountPayload): Promise<{
  profile: MyAccountProfile;
  sessionPatch: {
    name: string;
    email: string;
    phone: string;
    roleTitle: string;
  };
  persistedToSupabase: boolean;
  source: 'supabase' | 'file-memory';
}> {
  const res = await fetch('/api/my-account', {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

// ============================================================================
// INTERNAL TELEGRAM BOT SETTINGS API (/api/admin/telegram/*)
// ============================================================================

export interface TelegramAdminConfig {
  enabled: boolean;
  botUsername: string;
  hasBotTokenOverride: boolean;
  hasEnvToken: boolean;
  hasEffectiveToken: boolean;
  tokenSource?: 'override' | 'env' | 'none';
  botTokenValid?: boolean;
  botTokenError?: string | null;
  maskedToken: string;
  proxyUrl?: string;
  welcomeSharePhoneText: string;
  verifiedSuccessText: string;
  orderHeaderText: string;
  orderFooterText: string;
  updatedAt: string | null;
  runtime: {
    configured: boolean;
    enabled: boolean;
    botUsername: string;
    boundUsersCount: number;
    linkedStoresCount?: number;
    pollingActive: boolean;
    botTokenValid?: boolean;
    botTokenError?: string | null;
    tokenSource?: 'override' | 'env' | 'none';
    provider: 'telegram';
    lastPollError: string | null;
    lastPollSuccessAt: string | null;
  };
}

export interface UpdateTelegramSettingsPayload {
  enabled?: boolean;
  botUsername?: string;
  botTokenOverride?: string;
  clearTokenOverride?: boolean;
  proxyUrl?: string;
  welcomeSharePhoneText?: string;
  verifiedSuccessText?: string;
  orderHeaderText?: string;
  orderFooterText?: string;
}

export async function fetchTelegramSettingsApi(): Promise<{
  success: boolean;
  config: TelegramAdminConfig;
}> {
  const res = await fetch('/api/admin/telegram/settings', {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function updateTelegramSettingsApi(
  payload: UpdateTelegramSettingsPayload
): Promise<{
  success: boolean;
  config: TelegramAdminConfig;
}> {
  const res = await fetch('/api/admin/telegram/settings', {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function testTelegramBotApi(botToken?: string): Promise<{
  ok: boolean;
  bot?: { id: number; username?: string; first_name?: string };
  webhookUrl?: string;
  error?: string;
}> {
  const res = await fetch('/api/admin/telegram/test-connection', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(botToken ? { botToken } : {}),
  });
  return res.json();
}

export async function sendTelegramTestMessageApi(
  target: string,
  message?: string
): Promise<{
  ok: boolean;
  chatId?: string;
  message: string;
}> {
  const res = await fetch('/api/admin/telegram/send-test', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ target, message }),
  });
  return res.json();
}

// ============================================================================
// PARTNER DASHBOARD TELEGRAM ORDER NOTIFICATIONS API (/api/dashboard/telegram/*)
// ============================================================================

export interface DashboardTelegramStatus {
  ok: boolean;
  linked: boolean;
  enabled: boolean;
  orderChannel?: 'both' | 'telegram' | 'whatsapp' | 'app';
  whatsappConfigured?: boolean;
  telegramSendReady?: boolean;
  pollingActive?: boolean;
  pollingHealthy?: boolean;
  lastPollError?: string | null;
  lastSendError?: string | null;
  lastPollSuccessAt?: number | null;
  botEnabled: boolean;
  botConfigured: boolean;
  botTokenValid?: boolean;
  botTokenError?: string | null;
  botUsername: string;
  configuredBotUsername?: string;
  verifiedBotUsername?: string | null;
  telegramPhone: string;
  telegramUsername: string;
  proxyUrl?: string;
}

export async function fetchDashboardTelegramStatusApi(rid: string): Promise<DashboardTelegramStatus> {
  const res = await fetch(`/api/dashboard/telegram/status?rid=${encodeURIComponent(rid)}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function linkDashboardTelegramApi(
  rid: string,
  phone: string
): Promise<{
  ok: boolean;
  linked: boolean;
  botUrl: string;
  botUsername: string;
  telegramPhone: string;
  telegramUsername?: string;
  message: string;
}> {
  const res = await fetch('/api/dashboard/telegram/link', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ rid, phone }),
  });
  return res.json();
}

export async function toggleDashboardTelegramApi(
  rid: string,
  enabled: boolean
): Promise<{ ok: boolean; enabled: boolean }> {
  const res = await fetch('/api/dashboard/telegram/toggle', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ rid, enabled }),
  });
  return parseApiJson(res);
}

export async function unlinkDashboardTelegramApi(rid: string): Promise<{ ok: boolean }> {
  const res = await fetch('/api/dashboard/telegram/unlink', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ rid }),
  });
  return parseApiJson(res);
}

export async function testDashboardTelegramApi(rid: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/dashboard/telegram/test', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ rid }),
  });
  return res.json();
}

export async function verifyDashboardTelegramApi(rid: string): Promise<{
  ok: boolean;
  diagnosticMessage: string;
  status?: DashboardTelegramStatus;
}> {
  const res = await fetch('/api/dashboard/telegram/verify', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ rid }),
  });
  return parseApiJson(res);
}

export interface VisitorStatsResponse {
  ok: boolean;
  last24h: number;
  total: number;
  siteLast24h?: number;
  menuLast24h?: number;
  updatedAt?: number;
}

export async function fetchAdminVisitorStatsApi(): Promise<VisitorStatsResponse> {
  const res = await fetch('/api/admin/visitor-stats', {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

