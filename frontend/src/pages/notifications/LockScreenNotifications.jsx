import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing } from 'lucide-react';
import { Button } from '../../components/ui/index.js';
import { activePushRegistration, createWebPushAdapter } from '../../services/notifications-api.js';

const push = createWebPushAdapter();

export function LockScreenNotifications({ api }) {
  const [device, setDevice] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const supported = push.supported();

  useEffect(() => {
    if (!api?.pushStatus || !supported) return;
    const abort = new AbortController();
    const workers = window.navigator.serviceWorker;
    async function load() {
      try {
        const response = await api.pushStatus({ signal: abort.signal });
        const registration = response.data?.enabled ? await activePushRegistration(workers) : null;
        const subscription = await registration?.pushManager.getSubscription();
        if (abort.signal.aborted) return;
        setStatus(response.data);
        setDevice({ registration, subscribed: Boolean(subscription) });
      } catch {
        if (!abort.signal.aborted) setError('Chưa kiểm tra được thông báo thiết bị. Hãy tải lại trang.');
      }
    }
    load();
    workers.addEventListener('controllerchange', load);
    return () => { abort.abort(); workers.removeEventListener('controllerchange', load); };
  }, [api, supported]);

  if (!api?.pushStatus || (supported && !status && !error)) return null;
  const blocked = supported && window.Notification.permission === 'denied';
  const subscribed = status?.subscribed && (device?.subscribed || blocked);

  async function toggle() {
    setBusy(true);
    setError('');
    try {
      const manager = device?.registration?.pushManager;
      if (subscribed) {
        await api.unsubscribe();
        setStatus(value => ({ ...value, subscribed: false }));
        const subscription = await manager?.getSubscription();
        await subscription?.unsubscribe();
        setDevice(value => ({ ...value, subscribed: false }));
      } else {
        // Keep subscribe() inside the user's tap, as required by iOS.
        const subscription = await manager.subscribe({ userVisibleOnly: true, applicationServerKey: status.publicKey });
        await api.subscribe(subscription.toJSON());
        setDevice(value => ({ ...value, subscribed: true }));
        setStatus(value => ({ ...value, subscribed: true }));
      }
    } catch {
      setError(window.Notification.permission === 'denied'
        ? 'Quyền thông báo đang bị chặn. Bạn có thể bật lại trong cài đặt thiết bị.'
        : 'Chưa đổi được trạng thái. Kiểm tra kết nối và thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (status?.enabled && subscribed) {
    return <details className="notification-device-settings">
      <summary>Cài đặt thông báo thiết bị</summary>
      <Button variant="secondary" loading={busy} disabled={busy} onClick={toggle}>Tắt trên thiết bị này</Button>
      {error && <p role="alert">{error}</p>}
    </details>;
  }

  return <section className="notification-device" aria-labelledby="notification-device-title">
    <div>
      <h2 id="notification-device-title"><BellRing size={18} aria-hidden="true" /> Thông báo trên thiết bị</h2>
      <p>{!supported ? 'Trên iPhone/iPad, hãy cài ứng dụng rồi mở từ biểu tượng trên màn hình chính.'
        : status?.enabled === false ? 'Thông báo thiết bị đang tạm thời chưa khả dụng.'
        : blocked ? 'Mở cài đặt thiết bị để cấp quyền cho Paw World Care.'
        : status?.enabled && !device?.registration ? 'Hãy mở lại ứng dụng sau khi cập nhật để bật thông báo.'
        : 'Cho phép Paw World Care báo khi có thông báo mới, kể cả khi đã đóng ứng dụng.'}</p>
      {error && <p role="alert">{error}</p>}
    </div>
    {!supported && <Link to="/install">Hướng dẫn cài ứng dụng</Link>}
    {status?.enabled && device?.registration && !blocked &&
      <Button variant="primary" loading={busy} disabled={busy} onClick={toggle}>
        Bật thông báo
      </Button>}
  </section>;
}
