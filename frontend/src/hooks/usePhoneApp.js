import { useSyncExternalStore } from 'react';

const phone = '(max-width: 768px)';

function subscribe(onChange) {
  const queries = [window.matchMedia?.(phone)];
  queries.forEach(query => query?.addEventListener?.('change', onChange));
  return () => queries.forEach(query => query?.removeEventListener?.('change', onChange));
}

function snapshot() {
  return Boolean(window.matchMedia?.(phone)?.matches);
}

export function usePhoneApp() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
