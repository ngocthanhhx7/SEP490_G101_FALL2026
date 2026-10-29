import { expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SitterRecommendationsForm } from '../../src/pages/customer/SitterRecommendationsPage.jsx';
const id = 'a'.repeat(24);
function apiFor(recommend) {
  return { setup: async () => ({ services: [{ id, name: 'Chăm sóc tại nhà', code: 'home-visit' }],
    pets: [{ id, name: 'Miu', confirmed: true }], addresses: [{ id, label: 'Nhà', confirmed: true }], breeds: [] }),
  recommend, createPet: jest.fn(), createAddress: jest.fn() };
}
function fill() {
  fireEvent.change(screen.getByLabelText('Dịch vụ', { exact: false }), { target: { value: id } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Miu' }));
  fireEvent.change(screen.getByLabelText('Địa chỉ chăm sóc', { exact: false, selector: 'select' }), { target: { value: id } });
  fireEvent.change(screen.getByLabelText('Bắt đầu (giờ Việt Nam)', { exact: false }), { target: { value: '2026-11-02T10:00' } });
  fireEvent.change(screen.getByLabelText('Kết thúc (giờ Việt Nam)', { exact: false }), { target: { value: '2026-11-02T10:30' } });
}
test('uses explicit Vietnam times, shows a real shortfall and never claims an offer was sent', async () => {
  const recommend = jest.fn(async () => ({ status: 'INSUFFICIENT_ELIGIBLE_SITTERS', candidates: [],
    shortfall: 5, searchTruncated: false, rankingSource: 'EXPLAINABLE_RULES', expiresAt: new Date(Date.now() + 300000).toISOString() }));
  render(<SitterRecommendationsForm api={apiFor(recommend)} />);
  await screen.findByRole('checkbox', { name: 'Miu' }); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Tìm sitter' }));
  await screen.findByText('Chưa đủ 5 sitter phù hợp');
  expect(recommend.mock.calls[0][0]).toMatchObject({ startAt: '2026-11-02T10:00:00+07:00', endAt: '2026-11-02T10:30:00+07:00', petIds: [id] });
  expect(screen.queryByRole('button', { name: /gửi.*mời/i })).toBeNull();
  fireEvent.change(screen.getByLabelText('Kết thúc (giờ Việt Nam)', { exact: false }), { target: { value: '2026-11-02T11:00' } });
  expect(screen.queryByText('Chưa đủ 5 sitter phù hợp')).toBeNull();
});
test('shows an unavailable state when routing fails', async () => {
  const api = apiFor(jest.fn(async () => { throw { code: 'ROUTING_UNAVAILABLE' }; }));
  render(<SitterRecommendationsForm api={api} />);
  await screen.findByRole('checkbox', { name: 'Miu' }); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Tìm sitter' }));
  await waitFor(() => expect(screen.getByText('Chưa lấy được đường đi. Hãy thử lại sau.')).toBeTruthy());
});

test('an uncertain pet create requires reconciliation before another create', async () => {
  const api = apiFor(jest.fn());
  api.createPet = jest.fn(async () => { throw { code: 'TIMEOUT' }; });
  render(<SitterRecommendationsForm api={api} />);
  await screen.findByText('Thêm thú cưng để tìm sitter');
  const button = screen.getByText('Lưu thú cưng');
  const form = button.closest('form');
  fireEvent.submit(form);
  await screen.findByText('Chưa xác định đã lưu hay chưa. Tải lại danh sách để đối chiếu trước khi tạo lại.');
  expect(button.disabled).toBe(true);
  fireEvent.submit(form);
  expect(api.createPet).toHaveBeenCalledTimes(1);
});

test('vet waiting limits agree with the backend contract', async () => {
  const api = apiFor(jest.fn());
  const setup = api.setup;
  api.setup = async () => ({ ...await setup(), services: [{ id, name: 'Đưa đi khám', code: 'vet-escort' }] });
  render(<SitterRecommendationsForm api={api} />);
  await screen.findByRole('option', { name: 'Đưa đi khám' });
  fireEvent.change(screen.getByLabelText('Dịch vụ', { exact: false }), { target: { value: id } });
  const waiting = screen.getByLabelText('Thời gian chờ dự kiến (phút)', { exact: false });
  expect([waiting.min, waiting.max, waiting.step]).toEqual(['15', '240', '1']);
});
