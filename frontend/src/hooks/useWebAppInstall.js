import { useSyncExternalStore } from 'react';

let installEvent = null;
let installedThisVisit = false;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  const standalone = window.matchMedia('(display-mode: standalone)');
  standalone.addEventListener('change', listener);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    standalone.removeEventListener('change', listener);
  };
}

function snapshot() {
  if (installedThisVisit || window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) return 'installed';
  return installEvent ? 'available' : 'manual';
}

export function captureWebAppInstall() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installEvent = event;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    installedThisVisit = true;
    installEvent = null;
    notify();
  });
}

export function useWebAppInstall() {
  return useSyncExternalStore(subscribe, snapshot);
}

export function useInstallGuideOffer() {
  const install = useWebAppInstall();
  if (install === 'installed' || window.isSecureContext === false) return false;
  if (install === 'available') return true;
  const { userAgent, maxTouchPoints } = window.navigator;
  const appleMobile = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (appleMobile) return /Version\/.*Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|Zalo/.test(userAgent);
  return /Android.*Chrome\//.test(userAgent) && !/\bwv\b|EdgA|OPR|SamsungBrowser|FBAN|FBAV|Instagram|Zalo/.test(userAgent);
}

export async function requestWebAppInstall() {
  const event = installEvent;
  if (!event) return;

  installEvent = null;
  notify();
  try {
    await event.prompt();
  } catch {
    // The platform instructions remain visible when the native prompt is unavailable.
  }
}
