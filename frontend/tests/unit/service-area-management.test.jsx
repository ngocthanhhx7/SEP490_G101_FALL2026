import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll } from '@jest/globals';
import { ServiceAreasPage } from '../../src/pages/admin/ServiceAreasPage.jsx';
beforeAll(() => { globalThis.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; globalThis.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); }; });
const province = { code: 'PROVINCE_01', label: 'Hà Nội', level: 'PROVINCE', enabled: false };
const area = { code: 'COMMUNE_00004', label: 'Phường Ba Đình', level: 'COMMUNE', enabled: false };
test('activation requires explicit selection, reason and confirmation; an uncertain retry keeps identical body/key', async () => {
  const api = { list: jest.fn(async query => ({ items: query.level ? [province] : [area], expectedVersion: 4, nextCursor: null, sourceVersion: 'VN_NSO_2025_07_01' })),
    change: jest.fn().mockRejectedValueOnce({ code: 'TIMEOUT' }).mockResolvedValue({ codes: [area.code], enabled: true, expectedVersion: 5 }) };
  render(<ServiceAreasPage api={api} />);
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Mở phục vụ' }));
  const dialog = screen.getByRole('dialog', { name: 'Mở khu vực phục vụ?' });
  expect(within(dialog).getByRole('button', { name: 'Xác nhận cập nhật' })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('Lý do thay đổi'), { target: { value: 'Đã khảo sát và có nhân sự' } });
  expect(api.change).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận cập nhật' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Thử lại cùng yêu cầu' }));
  await waitFor(() => expect(api.change).toHaveBeenCalledTimes(2));
  expect(api.change.mock.calls[1]).toEqual(api.change.mock.calls[0]);
  expect(await screen.findByText('Đã cập nhật phạm vi phục vụ. Các buổi đã xác nhận vẫn được giữ.')).toBeVisible();
});
