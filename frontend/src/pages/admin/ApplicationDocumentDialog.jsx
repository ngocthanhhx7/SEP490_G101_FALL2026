import { useEffect, useState } from 'react';
import { Button, Dialog, Notice } from '../../components/ui/index.js';

export function ApplicationDocumentDialog({ api, applicationId, document, onClose }) {
  const [view, setView] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    setView({ status: 'loading' });
    Promise.resolve().then(() => api.readDocument({ applicationId, documentId: document.documentId, signal: controller.signal }))
      .then(({ blob }) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setView({ status: 'success', url: objectUrl });
      }).catch(error => {
        if (!controller.signal.aborted) setView({ status: 'error', code: error.code });
      });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, applicationId, document.documentId, attempt]);
  const title = document.documentType === 'IDENTITY' ? 'Giấy tờ định danh' : 'Tài liệu bổ sung';
  return <Dialog open onClose={onClose} title={title} className="application-document-dialog"
    description="Tài liệu riêng tư chỉ phục vụ thẩm định hồ sơ. Lượt xem được ghi nhận.">
    {view.status === 'loading' && <Notice state="loading" title="Đang mở tài liệu">Đang đọc ảnh từ kho riêng tư…</Notice>}
    {view.status === 'success' && <img className="application-document-image" src={view.url} alt={title}
      onError={() => setView({ status: 'error' })} />}
    {view.status === 'error' && <Notice state="error" title="Chưa mở được tài liệu">
      <p>{view.code === 'RATE_LIMITED' ? 'Bạn đã đạt giới hạn xem tài liệu. Vui lòng thử lại sau.'
        : view.code === 'FORBIDDEN' || view.code === 'UNAUTHENTICATED' ? 'Phiên đăng nhập hoặc quyền xem đã thay đổi. Vui lòng đăng nhập lại.'
          : 'Kho giấy tờ chưa trả về ảnh hợp lệ. Tài liệu vẫn được giữ riêng tư; vui lòng thử lại.'}</p>
      <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Thử mở lại</Button>
    </Notice>}
  </Dialog>;
}
