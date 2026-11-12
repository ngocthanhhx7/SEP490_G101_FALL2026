import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StockAdjustmentPage } from '../../src/pages/admin/StockAdjustmentPage.jsx';
import { ApiError } from '../../src/services/api-client.js';

const P = { id: 'p1', code: 'SP-0001', name: 'Dây dắt chó', visible: false, stockOnHand: 9, quantityHeld: 1, available: 8 };
const receipt = (over = {}) => ({ id: 'a1', code: 'DC-0001', productId: P.id, productCode: P.code, productName: P.name,
  type: 'DECREASE', quantity: 2, quantityChange: -2, reason: 'DAMAGED', recorderId: 'u1', recorderName: 'Nhật kiểm tra', recordedAt: '2026-11-08T03:00:00Z', ...over });
function fakeApi(over = {}) {
  return { listProducts: jest.fn().mockResolvedValue({ data: [P] }), readProduct: jest.fn().mockResolvedValue(P),
    listAdjustments: jest.fn(async query => ({ data: [receipt()], meta: { page: { page: query.page, limit: 20, total: 21 } } })),
    createAdjustment: jest.fn().mockResolvedValue(receipt()), ...over };
}
const show = (api = fakeApi()) => { render(<MemoryRouter><StockAdjustmentPage api={api} /></MemoryRouter>); return api; };
const quantity = () => screen.getByLabelText('Số lượng');
const reason = () => screen.getByLabelText('Lý do');
const save = () => fireEvent.click(screen.getByRole('button', { name: /^(Lưu phiếu điều chỉnh|Kiểm tra lại phiếu điều chỉnh)$/ }));
async function pick() {
  fireEvent.click(screen.getByRole('button', { name: 'Chọn sản phẩm' }));
  fireEvent.click(await screen.findByRole('button', { name: `Thêm ${P.code} ${P.name}` }));
  await waitFor(() => expect(screen.getByLabelText('Tồn thực tế')).toHaveTextContent('9'));
}
function fill(q = '2', r = 'DAMAGED') {
  fireEvent.change(quantity(), { target: { value: q } });
  fireEvent.change(reason(), { target: { value: r } });
}

test('AC-33 starts with Decrease only; blank quantity/reason cannot save and show errors at their fields', async () => {
  const api = show(); await screen.findByText('DC-0001');
  expect(screen.getByRole('radio', { name: 'Giảm tồn' })).toBeChecked();
  expect(quantity()).toHaveValue(''); expect(reason()).toHaveValue('');
  expect(within(reason()).getByRole('option', { name: 'Chọn lý do' })).toBeVisible();
  await pick(); save();
  expect(screen.getByText('Vui lòng nhập số nguyên lớn hơn 0.')).toBeVisible();
  expect(within(reason().closest('.pwc-sa-field')).getByText('Vui lòng nhập thông tin này.')).toBeVisible();
  expect(reason()).toHaveAttribute('aria-invalid', 'true');
  expect(api.createAdjustment).not.toHaveBeenCalled();
  fireEvent.change(quantity(), { target: { value: '2' } }); save();
  expect(within(reason().closest('.pwc-sa-field')).getByText('Vui lòng nhập thông tin này.')).toBeVisible();
  expect(api.createAdjustment).not.toHaveBeenCalled();
});

test('AC-33 D-266 shows authoritative stock, previews both directions, permits every reason, and links to Stock List', async () => {
  show(); await pick();
  expect(screen.getByLabelText('Đang giữ')).toHaveTextContent('1');
  expect(screen.getByLabelText('Có thể bán')).toHaveTextContent('8');
  fill('2'); expect(screen.getByLabelText('Tồn thực tế sau khi lưu')).toHaveTextContent('7');
  fireEvent.click(screen.getByRole('radio', { name: 'Tăng tồn' }));
  expect(screen.getByLabelText('Tồn thực tế sau khi lưu')).toHaveTextContent('11');
  expect(within(reason()).getAllByRole('option').map(o => o.textContent)).toEqual(['Chọn lý do','Hàng hỏng','Mất','Dùng nội bộ','Phiếu nhập ghi sai']);
  expect(screen.getByRole('link', { name: 'Xem tồn kho' })).toHaveAttribute('href', '/admin/stock');
});

test('AC-33 blocks a stale decrease locally, maps MSG113, and applies the latest server available to MSG123', async () => {
  const api = show(); await pick(); fill('9'); save();
  expect(screen.getByText('Số giảm không được lớn hơn số có thể bán (8).')).toBeVisible();
  expect(api.createAdjustment).not.toHaveBeenCalled();
  fill('0'); save(); expect(screen.getByText('Vui lòng nhập số nguyên lớn hơn 0.')).toBeVisible();
  fill('4'); api.createAdjustment.mockRejectedValueOnce(new ApiError('STOCK_ADJUSTMENT_EXCEEDS_AVAILABLE', 409, { available: 3 }));
  api.readProduct.mockResolvedValue({ ...P, stockOnHand: 4, available: 3 }); save();
  expect(await screen.findByText('Số giảm không được lớn hơn số có thể bán (3).')).toBeVisible();
  await waitFor(() => expect(screen.getByLabelText('Tồn thực tế')).toHaveTextContent('4'));
});

test('AC-33 successful save refreshes stock/list, keeps product/type and clears quantity/reason', async () => {
  const api = show(); await pick(); fill();
  api.readProduct.mockResolvedValue({ ...P, stockOnHand: 7, available: 6 }); save();
  expect(await screen.findByText('Phiếu điều chỉnh DC-0001 đã được lưu.')).toBeVisible();
  await waitFor(() => expect(screen.getByLabelText('Tồn thực tế')).toHaveTextContent('7'));
  expect(quantity()).toHaveValue(''); expect(reason()).toHaveValue('');
  expect(screen.getByRole('radio', { name: 'Giảm tồn' })).toBeChecked();
  expect(api.listAdjustments.mock.calls.at(-1)[0].page).toBe(1);
  expect(api.createAdjustment.mock.calls[0][0]).toEqual({ productId: 'p1', type: 'DECREASE', quantity: 2, reason: 'DAMAGED' });
});

test('prevents concurrent submissions and reuses the same command key after a lost response', async () => {
  let rejectSave;
  const api = show({ ...fakeApi(), createAdjustment: jest.fn().mockImplementationOnce(() => new Promise((_resolve,reject) => { rejectSave = reject; })).mockResolvedValue(receipt()) });
  await pick(); fill();
  const form = screen.getByRole('button', { name: 'Lưu phiếu điều chỉnh' }).closest('form');
  fireEvent.submit(form); fireEvent.submit(form);
  expect(api.createAdjustment).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Lưu phiếu điều chỉnh' })).toBeDisabled();
  rejectSave(new ApiError('TIMEOUT'));
  expect(await screen.findByText('Chưa thể hoàn tất. Vui lòng thử lại sau.')).toBeVisible();
  save(); await screen.findByText('Phiếu điều chỉnh DC-0001 đã được lưu.');
  expect(api.createAdjustment.mock.calls[1][1]).toBe(api.createAdjustment.mock.calls[0][1]);
});

test('shows immutable recorded receipts with signed quantity and pages them', async () => {
  const api = show(); expect(await screen.findByText('DC-0001')).toBeVisible();
  expect(screen.getByText('−2')).toBeVisible();
  expect(screen.getByText('Lý do: Hàng hỏng · Nhật kiểm tra')).toBeVisible();
  expect(screen.getByText('Phiếu đã ghi không sửa được. Ghi sai thì tạo phiếu điều chỉnh mới.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
  await waitFor(() => expect(api.listAdjustments.mock.calls.at(-1)[0].page).toBe(2));
  expect(screen.queryByRole('button', { name: /Xoá|Sửa phiếu/ })).not.toBeInTheDocument();
});

test('uses the common list failure text and retries without submitting a stock change', async () => {
  const api = fakeApi(); api.listAdjustments.mockRejectedValueOnce(new Error('network')); show(api);
  expect(await screen.findByText('Chưa thể hoàn tất. Vui lòng thử lại sau.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('DC-0001')).toBeVisible();
  expect(api.createAdjustment).not.toHaveBeenCalled();
});

test('ignores a late stock read after the Admin switches products', async () => {
  let resolveOld;
  const second={...P,id:'p2',code:'SP-0002',name:'Bát ăn',stockOnHand:20,quantityHeld:0,available:20};
  const api=fakeApi({listProducts:jest.fn().mockResolvedValue({data:[P,second]}),readProduct:jest.fn()
    .mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValue(second)});
  show(api); fireEvent.click(screen.getByRole('button',{name:'Chọn sản phẩm'}));
  fireEvent.click(await screen.findByRole('button',{name:`Thêm ${P.code} ${P.name}`}));
  await waitFor(()=>expect(api.readProduct).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button',{name:'Chọn sản phẩm'}));
  fireEvent.click(await screen.findByRole('button',{name:`Thêm ${second.code} ${second.name}`}));
  await waitFor(()=>expect(screen.getByLabelText('Tồn thực tế')).toHaveTextContent('20'));
  resolveOld(P);
  await waitFor(()=>expect(screen.getByLabelText('Tồn thực tế')).toHaveTextContent('20'));
});

test('an unknown save freezes edited content until the exact operation is resolved', async () => {
  const api = show(fakeApi({ createAdjustment: jest.fn().mockRejectedValueOnce(new ApiError('TIMEOUT')).mockResolvedValueOnce(receipt()) }));
  await pick(); fill(); save();
  await screen.findByText('Chưa thể hoàn tất. Vui lòng thử lại sau.');
  expect(quantity()).toBeDisabled();
  expect(reason()).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Chọn sản phẩm' })).toBeDisabled();
  save(); await screen.findByText('Phiếu điều chỉnh DC-0001 đã được lưu.');
  expect(api.createAdjustment.mock.calls[1]).toEqual(api.createAdjustment.mock.calls[0]);
  expect(quantity()).toBeEnabled();
});
