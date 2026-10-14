// Synthetic manual fixture: no production route or API request.
import { useState } from 'react';
import { Button, Input, Select, Dialog, Notice, BrandLogo, BrandIcon } from '../../src/components/ui/index.js';
import '../../src/styles/index.css';
import './preview.css';

export function BrandPreview() {
  const [open, setOpen] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState('');
  return <main className={`pwc-preview ${fallback ? 'pwc-preview--fallback' : ''}`}>
    <header><BrandLogo /><p>Kiểm chứng P04 · UI PROVISIONAL</p></header>
    <h1>Chăm sóc bằng sự an tâm</h1>
    <p>Fixture thương hiệu và component. Dữ liệu tổng hợp; không gửi API hoặc đặt lịch thật.</p>
    <section className="pwc-preview-panel"><h2>Thao tác</h2><div className="pwc-preview-actions">
      <Button onClick={() => setOpen(true)}>Mở hộp thoại <BrandIcon name="arrowRight" /></Button>
      <Button variant="secondary">Thao tác phụ</Button><Button variant="ghost">Xem thêm</Button>
      <Button variant="danger">Hành động cần xác nhận</Button><Button disabled>Chưa khả dụng</Button>
      <Button loading>Gửi yêu cầu</Button>
      <Button variant="secondary" onClick={() => setFallback((value) => !value)}>Kiểm tra font dự phòng</Button>
    </div></section>
    <section className="pwc-preview-panel"><h2>Trường thông tin</h2>
      <form className="pwc-preview-form" noValidate onSubmit={(event) => {
        event.preventDefault(); setSaved(false); setError(name.trim() ? '' : 'Vui lòng nhập tên thú cưng.');
        if (name.trim()) setSaved(true);
      }}>
        <Input label="Tên thú cưng" required value={name} onChange={(event) => setName(event.target.value)}
          hint="Chỉ dùng tên tổng hợp để kiểm tra." error={error} autoComplete="off" />
        <Select label="Loài thú cưng" defaultValue="DOG" hint="Bàn phím chọn option native.">
          <option value="DOG">Chó</option><option value="CAT">Mèo</option>
        </Select>
        <Input label="Thông tin chưa khả dụng" disabled defaultValue="Đang chờ kết nối" />
        <Input label="Thông tin chỉ đọc" readOnly defaultValue="Mẫu kiểm chứng" />
        <Button type="submit">Kiểm tra thông tin</Button>
      </form>
      {saved && <Notice state="success" title="Thông tin mẫu hợp lệ">Chưa lưu lên máy chủ.</Notice>}
    </section>
    <section className="pwc-preview-panel"><h2>Trạng thái</h2><div className="pwc-preview-grid">
      <Notice state="loading" title="Đang tải">Vui lòng chờ phản hồi.</Notice>
      <Notice state="empty" title="Chưa có dữ liệu" action={<Button variant="secondary" onClick={() => setOpen(true)}>Xem hướng dẫn</Button>}>Chưa có buổi chăm sóc.</Notice>
      <Notice state="error" title="Không thể tải dữ liệu" action={<Button variant="secondary" onClick={() => setOpen(true)}><BrandIcon name="refresh" /> Thử lại (mẫu)</Button>}>Kiểm tra kết nối rồi thử lại.</Notice>
      <Notice state="forbidden" title="Không có quyền truy cập">Máy chủ kiểm tra quyền thật.</Notice>
      <Notice state="pending" title="Đang chờ xác nhận">Chưa có xác nhận máy chủ.</Notice>
      <Notice state="warning" title="Cần kiểm tra lại">Kiểm tra thông tin trước khi tiếp tục.</Notice>
      <Notice state="success" title="Kiểm tra hoàn tất">Chỉ là trạng thái mẫu.</Notice>
      <Notice state="info" title="Thông tin">Không xác nhận giao dịch bằng UI.</Notice>
    </div></section>
    <Dialog open={open} onClose={() => setOpen(false)} title="Hướng dẫn kiểm chứng"
      description="Hộp thoại native không thực hiện thao tác nghiệp vụ."
      footer={<Button onClick={() => setOpen(false)}>Đã hiểu</Button>}>
      <p>Dùng Tab/Shift+Tab trong hộp thoại; Escape hoặc Đóng để quay lại.</p>
      <Input label="Ghi chú mẫu" placeholder="Thử nhập hoặc dán văn bản" />
    </Dialog>
  </main>;
}
