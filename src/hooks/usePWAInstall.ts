/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptSubscribers = new Set<(ev: BeforeInstallPromptEvent | null) => void>();

function notifyPromptSubscribers(ev: BeforeInstallPromptEvent | null) {
  globalDeferredPrompt = ev;
  promptSubscribers.forEach((cb) => {
    try {
      cb(ev);
    } catch {
      // ignore subscriber error
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    notifyPromptSubscribers(e as BeforeInstallPromptEvent);
  });

  window.addEventListener('appinstalled', () => {
    notifyPromptSubscribers(null);
  });
}

export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const matchStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(matchStandalone || iosStandalone);
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isRunningStandalone());
  const [isIOS, setIsIOS] = useState<boolean>(false);

  useEffect(() => {
    setIsInstalled(isRunningStandalone());

    const ua = window.navigator.userAgent.toLowerCase();
    const isAppleMobile =
      /iphone|ipad|ipod/.test(ua) ||
      (ua.includes('macintosh') && 'ontouchend' in document);
    setIsIOS(isAppleMobile);

    const onPromptChange = (ev: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(ev);
      if (ev === null && isRunningStandalone()) {
        setIsInstalled(true);
      }
    };
    promptSubscribers.add(onPromptChange);

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleInstalled);

    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const handleDisplayChange = () => {
      if (isRunningStandalone()) {
        setIsInstalled(true);
      }
    };
    if (mq && typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleDisplayChange);
    }

    return () => {
      promptSubscribers.delete(onPromptChange);
      window.removeEventListener('appinstalled', handleInstalled);
      if (mq && typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', handleDisplayChange);
      }
    };
  }, []);

  const install = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const promptEvent = deferredPrompt || globalDeferredPrompt;
    if (!promptEvent) return 'unavailable';
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        notifyPromptSubscribers(null);
        return 'accepted';
      }
      return 'dismissed';
    } catch {
      return 'unavailable';
    }
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
