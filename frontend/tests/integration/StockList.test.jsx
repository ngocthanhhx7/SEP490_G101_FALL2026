import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StockListPage } from '../../src/pages/admin/StockListPage.jsx';

const products = [
  { id: 'p1', code: 'SP-0001', name: 'Hạt cho chó', stockOnHand: 12, quantityHeld: 2, available: 10, status: 'IN_STOCK' },
  { id: 'p2', code: 'SP-0002', name: 'Áo mưa', stockOnHand: 8, quantityHeld: 8, available: 0, status: 'OUT_OF_STOCK' },
  { id: 'p3', code: 'SP-0003', name: 'Bát ăn', stockOnHand: 4, quantityHeld: 0, available: 4, status: 'LOW_STOCK' }
];
const item = (n, over = {}) => ({ id: `r${n}`, kind: 'GOODS_RECEIPT', referenceCode: `PN-000${n}`, occurredAt: '2026-11-08T00:00:00Z',
  receivedOn: '2026-11-01', supplierName: 'Nhà cung cấp tổng hợp', quantityChange: n, ...over });
const pageOf = (data, query) => ({ data, meta: { page: { page: query.page, limit: 20, total: 21 }, counts: { ALL: 21, LOW_STOCK: 2 } } });
function fakeApi(over = {}) {
  return { listStock: jest.fn(async query => pageOf(query.search ? [] : query.tab === 'LOW_STOCK' ? products.slice(1) : products, query)),
    readHistory: jest.fn(async id => ({ product: products.find(p => p.id === id), items: [item(2, { quantityChange: 0 }), item(1)], nextCursor: 'next' })), ...over };
}
const select = async name => fireEvent.click(await screen.findByRole('button', { name: `Xem lịch sử ${name}` }));

test('AC-32 shows server statuses, global tab counts, receipt order/+0 and receivedOn, then loads more', async () => {
  const api = fakeApi(); render(<StockListPage api={api} />);
  expect(await screen.findByText('Hết hàng')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Tất cả (21)' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Còn hàng')).toBeVisible(); expect(screen.getByText('Sắp hết hàng')).toBeVisible();
  await select('Hạt cho chó');
  const history = await screen.findByRole('region', { name: 'Lịch sử nhập và điều chỉnh' });
  expect(await within(history).findByText('+0')).toBeVisible();
  expect(within(history).getAllByText('01/11/2026')).toHaveLength(2);
  expect(within(history).queryByText('08/11/2026')).not.toBeInTheDocument();
  api.readHistory.mockResolvedValueOnce({ product: products[0], items: [item(0)], nextCursor: null });
  fireEvent.click(within(history).getByRole('button', { name: 'Xem thêm' }));
  expect(await within(history).findByText('PN-0000')).toBeVisible();
  expect(within(history).getAllByText(/PN-000/).map(el => el.textContent)).toEqual(['PN-0002', 'PN-0001', 'PN-0000']);
  expect(api.readHistory.mock.calls.at(-1)[1].cursor).toBe('next');
});

test('AC-32 changes page/tab/search, resets page and clears selection outside results; MSG97 is reused', async () => {
  const api = fakeApi(); render(<StockListPage api={api} />);
  await select('Hạt cho chó'); await screen.findByText('PN-0002');
  fireEvent.click(screen.getByRole('button', { name: 'Sắp hết hàng (2)' }));
  await waitFor(() => expect(api.listStock.mock.calls.at(-1)[0]).toMatchObject({ tab: 'LOW_STOCK', page: 1 }));
  await waitFor(() => expect(screen.queryByText('PN-0002')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
  await waitFor(() => expect(api.listStock.mock.calls.at(-1)[0].page).toBe(2));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'không thấy' } });
  expect(await screen.findByText('Không tìm thấy sản phẩm nào.')).toBeVisible();
  expect(api.listStock.mock.calls.at(-1)[0]).toMatchObject({ search: 'không thấy', page: 1 });
  expect(screen.getByRole('searchbox')).toHaveAttribute('maxlength', '100');
});

test('ignores a late history response when another product is selected', async () => {
  let resolveOld;
  const api = fakeApi({ readHistory: jest.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValue({ product: products[1], items: [item(3)], nextCursor: null }) });
  render(<StockListPage api={api} />); await select('Hạt cho chó');
  await waitFor(() => expect(api.readHistory).toHaveBeenCalledTimes(1));
  await select('Áo mưa'); expect(await screen.findByText('PN-0003')).toBeVisible();
  resolveOld({ product: products[0], items: [item(9)], nextCursor: null });
  await waitFor(() => expect(screen.queryByText('PN-0009')).not.toBeInTheDocument());
});

test('shows the common failure and can retry list and history', async () => {
  const api = fakeApi({ listStock: jest.fn().mockRejectedValueOnce(new Error('network')).mockImplementation(query => Promise.resolve(pageOf(products, query))) });
  render(<StockListPage api={api} />);
  expect(await screen.findByText('Chưa thể hoàn tất. Vui lòng thử lại sau.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  api.readHistory.mockRejectedValueOnce(new Error('network'));
  await select('Hạt cho chó');
  expect(await screen.findByText('Chưa thể hoàn tất. Vui lòng thử lại sau.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('PN-0002')).toBeVisible();
});
