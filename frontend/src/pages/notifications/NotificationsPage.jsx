import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import './notifications.css';

const DATE_FORMAT = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh'
});

function displayDate(value) {
  if (typeof value !== 'string') return 'Chưa có thời gian';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? DATE_FORMAT.format(date)
    : 'Chưa có thời gian';
}

function PageNotice({ state, title, children, onRetry }) {
  return (
    <Notice
      state={state}
      title={title}
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Thử tải lại
          </Button>
        ) : undefined
      }
    >
      {children}
    </Notice>
  );
}

function NotificationCard({ item, onRead, busy }) {
  const content = (
    <>
      <div className="notification-card__heading">
        <h2>{item.title}</h2>
        {!item.readAt && <span className="notification-card__unread">Mới</span>}
      </div>
      <p>{item.message}</p>
      <small>{displayDate(item.createdAt)}</small>
    </>
  );
  return (
    <li
      className={`notification-card${item.readAt ? '' : ' notification-card--unread'}`}
    >
      {item.deepLink ? (
        <a className="notification-card__link" href={item.deepLink}>
          {content}
        </a>
      ) : (
        <div className="notification-card__link">{content}</div>
      )}
      {!item.readAt && (
        <Button variant="ghost" onClick={() => onRead(item.id)} disabled={busy}>
          Đánh dấu đã đọc
        </Button>
      )}
    </li>
  );
}

export function NotificationsPage({ api }) {
  const [cursor, setCursor] = useState(null);
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [readStatus, setReadStatus] = useState(null);
  const requestKey = useMemo(() => cursor || 'first', [cursor]);
  const load = useCallback(
    ({ signal }) => {
      if (typeof api?.list !== 'function')
        return Promise.resolve({ data: null, pending: true });
      return Promise.resolve(api.list({ cursor, signal })).then((result) => ({
        ...result,
        meta: { ...(result?.meta || {}), __requestKey: requestKey }
      }));
    },
    [api, cursor, requestKey]
  );
  const resource = useApiResource(load);
  useEffect(() => {
    if (
      resource.status === 'loading' ||
      resource.meta?.__requestKey !== requestKey
    )
      return;
    const incoming = Array.isArray(resource.data)
      ? resource.data
      : resource.data?.items;
    const next = Array.isArray(incoming) ? incoming : [];
    setRows((current) => (cursor ? [...current, ...next] : next));
  }, [cursor, requestKey, resource.data, resource.meta, resource.status]);
  const retry = useCallback(() => {
    setCursor(null);
    setRows([]);
    resource.retry();
  }, [resource.retry]);
  const read = useCallback(
    async (notificationId) => {
      if (typeof api?.markRead !== 'function') return;
      setBusyId(notificationId);
      setReadStatus(null);
      try {
        const result = await api.markRead(
          notificationId,
          `notification-read:${notificationId}`
        );
        if (result?.pending) {
          setReadStatus('pending');
          return;
        }
        setRows((current) =>
          current.map((item) =>
            item.id === notificationId
              ? { ...item, readAt: new Date().toISOString() }
              : item
          )
        );
      } catch {
        setReadStatus('error');
      } finally {
        setBusyId(null);
      }
    },
    [api]
  );
  const nextCursor =
    resource.meta?.nextCursor ?? resource.data?.nextCursor ?? null;
  return (
    <main className="notifications-page" aria-labelledby="notifications-title">
      <header className="notifications-page__header">
        <div>
          <p className="notifications-page__eyebrow">Paw World Care</p>
          <h1 id="notifications-title">Thông báo</h1>
          <p>Thông tin được phân quyền theo tài khoản của bạn.</p>
        </div>
        <Button variant="secondary" onClick={retry}>
          Tải lại
        </Button>
      </header>
      {readStatus && (
        <PageNotice
          state={readStatus}
          title={
            readStatus === 'pending'
              ? 'Đang chờ xác nhận đã đọc'
              : 'Chưa đánh dấu được thông báo'
          }
        >
          Trạng thái chỉ thay đổi khi máy chủ xác nhận. Bạn có thể tải lại để
          đối soát.
        </PageNotice>
      )}
      <section
        aria-label="Danh sách thông báo"
        aria-busy={resource.status === 'loading'}
      >
        {resource.status === 'loading' && !rows.length && (
          <PageNotice state="loading" title="Đang tải thông báo">
            Đang đọc trạng thái từ máy chủ.
          </PageNotice>
        )}
        {resource.status === 'pending' && (
          <PageNotice state="pending" title="Đang chờ máy chủ xác nhận">
            Không suy ra thông báo khi yêu cầu chưa được xác nhận.
          </PageNotice>
        )}
        {resource.status === 'forbidden' && (
          <PageNotice state="forbidden" title="Không thể xem thông báo">
            Phiên hiện tại không có quyền đọc thông báo.
          </PageNotice>
        )}
        {resource.status === 'error' && (
          <PageNotice
            state="error"
            title="Chưa tải được thông báo"
            onRetry={retry}
          >
            Hãy kiểm tra kết nối rồi thử lại.
          </PageNotice>
        )}
        {resource.status === 'empty' && !rows.length && (
          <PageNotice state="empty" title="Chưa có thông báo">
            Thông báo mới sẽ xuất hiện ở đây.
          </PageNotice>
        )}
        {rows.length > 0 && (
          <ul className="notifications-page__list">
            {rows.map((item) => (
              <NotificationCard
                key={item.id}
                item={item}
                onRead={read}
                busy={busyId === item.id}
              />
            ))}
          </ul>
        )}
        {rows.length > 0 && nextCursor && (
          <div className="notifications-page__more">
            <Button
              variant="secondary"
              onClick={() => setCursor(nextCursor)}
              disabled={resource.status === 'loading'}
              loading={resource.status === 'loading'}
            >
              Tải thêm
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
