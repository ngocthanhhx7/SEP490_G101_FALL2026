import { useEffect, useRef, useState } from 'react';
import './web-app-status.css';

export function WebAppStatus({ enableWorker }) {
  const [offline, setOffline] = useState(() => !window.navigator.onLine);
  const [update, setUpdate] = useState(false);
  const applyUpdate = useRef(null);

  useEffect(() => {
    const updateConnection = () => setOffline(!window.navigator.onLine);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  useEffect(() => {
    const workers = window.navigator.serviceWorker;
    if (!enableWorker || !workers || !window.isSecureContext) return;

    let active = true;
    let registration;
    let installing;
    let applying = false;
    function inspect() {
      if (active && workers.controller && registration.waiting) setUpdate(true);
    }
    function watchInstall() {
      installing?.removeEventListener('statechange', inspect);
      installing = registration.installing;
      installing?.addEventListener('statechange', inspect);
    }
    function controllerChanged() {
      setUpdate(false);
      if (applying) window.location.reload();
    }
    applyUpdate.current = () => {
      if (!registration?.waiting || applying) return;
      applying = true;
      registration.waiting.postMessage('PWC_ACTIVATE_UPDATE');
    };

    workers.addEventListener('controllerchange', controllerChanged);
    workers.register('/pwc-sw.js', { updateViaCache: 'none' }).then((result) => {
      if (!active) return;
      registration = result;
      registration.addEventListener('updatefound', watchInstall);
      watchInstall();
      inspect();
    }).catch(() => {
      // Installation and navigation can still use normal browser behavior.
    });

    return () => {
      active = false;
      registration?.removeEventListener('updatefound', watchInstall);
      installing?.removeEventListener('statechange', inspect);
      workers.removeEventListener('controllerchange', controllerChanged);
      applyUpdate.current = null;
    };
  }, [enableWorker]);

  if (offline) return <p className="pwc-web-app-status" role="status">Bạn đang mất kết nối. Kiểm tra trạng thái yêu cầu khi có mạng trước khi gửi lại.</p>;
  if (!update) return null;

  return <aside className="pwc-web-app-status">
    <span role="status">Có bản mới. Hãy lưu nội dung đang làm trước khi tải lại.</span>
    <button type="button" onClick={() => applyUpdate.current?.()}>
      Cập nhật và tải lại
    </button>
  </aside>;
}
