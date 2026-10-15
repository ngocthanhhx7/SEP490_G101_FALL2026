import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/app/App.jsx';
import { ContactPage } from '../../src/pages/public/ContactPage.jsx';
import { ApiError } from '../../src/services/api-client.js';
import { sendContactMessage } from '../../src/services/contact-api.js';
test('about is a public route with the current project team and service links', async () => {
  render(<MemoryRouter initialEntries={['/about']}><App sessionAdapter={{ resolve: async () => ({ status: 'guest' }) }} /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('PawWorld Care');
  for (const name of ['Nguyễn Ngọc Thành', 'Đoàn Tiến Đạt', 'Phạm Thành Chung', 'Đặng Văn Hải', 'Nguyễn Hữu Anh Nhật']) {
    expect(screen.getByRole('heading', { name })).toBeVisible();
  }
  expect(screen.queryByText(/Meal Kit|người sáng lập|Hà Thành Vị/i)).not.toBeInTheDocument();
  const navigation = screen.getByRole('navigation', { name: 'Điều hướng chính' });
  expect(within(navigation).getByRole('link', { name: 'Về chúng tôi' })).toHaveAttribute('aria-current', 'page');
  expect(within(navigation).getByRole('link', { name: 'Liên hệ' })).toHaveAttribute('href', '/contact');
  await waitFor(() => expect(screen.queryByText('Đang kiểm tra phiên…')).not.toBeInTheDocument());
});
test('contact search and categories filter the actual expandable support answers', () => {
  render(<MemoryRouter><ContactPage /></MemoryRouter>);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'khu vuc' } });
  expect(screen.getByText('Làm sao kiểm tra địa chỉ của tôi có được phục vụ?')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả câu hỏi' }));
  fireEvent.click(screen.getByRole('button', { name: /Chính sách & hỗ trợ/ }));
  expect(screen.queryByText('Paw World Care hỗ trợ chó hay mèo?')).not.toBeInTheDocument();
  expect(screen.getByText('Thông tin cá nhân của tôi được xử lý thế nào?')).toBeVisible();
});
function fillForm() {
  fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'Synthetic Visitor' } });
  fireEvent.change(screen.getByLabelText('Email phản hồi'), { target: { value: 'visitor@example.test' } });
  fireEvent.change(screen.getByLabelText('Nội dung'), { target: { value: 'Please explain the available pet care services.' } });
  fireEvent.click(screen.getByRole('checkbox'));
}
test('contact sends consented details, prevents duplicate in-flight submits, and clears only after acceptance', async () => {
  let accept; const send = jest.fn(() => new Promise(resolve => { accept = resolve; }));
  render(<MemoryRouter><ContactPage send={send} /></MemoryRouter>);
  fillForm(); const form = screen.getByRole('form', { name: 'Gửi lời nhắn' });
  fireEvent.submit(form); fireEvent.submit(form);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ consent: true, phone: '', email: 'visitor@example.test' }));
  expect(screen.getByRole('button', { name: 'Đang gửi…' })).toBeDisabled();
  accept({ status: 'ACCEPTED' });
  expect(await screen.findByRole('status')).toHaveTextContent('Máy chủ email đã tiếp nhận');
  expect(screen.getByLabelText('Nội dung')).toHaveValue('');
});
test('contact retains the message when delivery is uncertain', async () => {
  render(<MemoryRouter><ContactPage send={async () => { throw new ApiError('CONTACT_DELIVERY_UNCERTAIN'); }} /></MemoryRouter>);
  fillForm(); fireEvent.submit(screen.getByRole('form', { name: 'Gửi lời nhắn' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Thư có thể đã được tiếp nhận');
  expect(screen.getByLabelText('Nội dung')).not.toHaveValue('');
});
test('contact adapter never reports success on network loss or malformed provider receipt', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = jest.fn().mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'UNKNOWN' } }) });
    await expect(sendContactMessage({})).rejects.toMatchObject({ code: 'CONTACT_DELIVERY_UNCERTAIN' });
    await expect(sendContactMessage({})).rejects.toMatchObject({ code: 'CONTACT_DELIVERY_UNCERTAIN' });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  } finally { globalThis.fetch = original; }
});
