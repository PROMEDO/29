/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermissionState = NotificationPermission | 'unsupported';

export function getDashboardNotificationPermission(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function requestDashboardNotificationPermission(): Promise<PushPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export async function syncDashboardPushSubscription(options?: {
  requestPermission?: boolean;
}): Promise<{
  ok: boolean;
  permission: PushPermissionState;
  subscribed: boolean;
}> {
  const currentPerm = getDashboardNotificationPermission();
  if (!isWebPushSupported()) {
    return { ok: false, permission: currentPerm, subscribed: false };
  }

  let permission = currentPerm;
  if (options?.requestPermission && permission === 'default') {
    permission = await requestDashboardNotificationPermission();
  }

  if (permission !== 'granted') {
    return { ok: false, permission, subscribed: false };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg || !reg.pushManager) {
      return { ok: false, permission, subscribed: false };
    }

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      const keyRes = await fetch('/api/pwa/push-public-key', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!keyRes.ok) {
        return { ok: false, permission, subscribed: false };
      }
      const keyData = (await keyRes.json()) as { publicKey?: string };
      const publicKey = String(keyData.publicKey || '').trim();
      if (!publicKey) {
        return { ok: false, permission, subscribed: false };
      }

      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
    }

    const res = await fetch('/api/pwa/push-subscribe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    return { ok: res.ok, permission, subscribed: res.ok };
  } catch {
    return { ok: false, permission, subscribed: false };
  }
}
