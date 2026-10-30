import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomerCarePage } from '../../src/pages/customer/CustomerCarePage.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

jest.mock('../../src/components/common/VietmapView.jsx', () => ({ VietmapView: ({ onSelect }) => <button type="button" onClick={() => onSelect([105.85, 21.03])}>Synthetic map pin</button> }));
const session = { resolve: async () => ({ status: 'authenticated', user: { id: 'a'.repeat(24), roles: ['CUSTOMER'] } }) };
const catalog = { items: [], breeds: [{ code: 'dog-test', species: 'DOG', name: 'Synthetic dog' }, { code: 'cat-test', species: 'CAT', name: 'Synthetic cat' }], traits: [], workAreas: [{ code: 'HN-TEST', label: 'Synthetic Hanoi area' }] };
const setup = (kind = 'pets', failure) => {
  const api = { load: jest.fn(async () => ({ data: catalog })), save: jest.fn().mockImplementationOnce(failure ? async () => { throw failure; } : async () => ({ data: { id: 'b'.repeat(24) } })).mockResolvedValue({ data: { id: 'b'.repeat(24) } }),
    searchAddress: jest.fn(async () => ({ data: { provider: 'VIETMAP', items: [{ label: 'Synthetic address', coordinates: [105.85, 21.03] }] } })), resolveAddress: jest.fn() };
  render(<MemoryRouter><SessionProvider adapter={session}><CustomerCarePage kind={kind} api={api} /></SessionProvider></MemoryRouter>);
  return api;
};

test('collects breed, weight, explicit unknown health and care information; retries with the same command', async () => {
  const api = setup('pets', { code: 'NETWORK_ERROR' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Thêm thú cưng' })).toBeEnabled());
  fireEvent.click(await screen.findByRole('button', { name: 'Thêm thú cưng' }));
  fireEvent.change(screen.getByLabelText('Tên thú cưng', { exact: false }), { target: { value: 'Synthetic companion' } });
  fireEvent.change(screen.getByLabelText('Giống', { exact: false }), { target: { value: 'dog-test' } });
  fireEvent.change(screen.getByLabelText('Cân nặng gần nhất (kg)', { exact: false }), { target: { value: '4.2' } });
  fireEvent.change(screen.getByLabelText('Tình trạng thông tin: Dị ứng'), { target: { value: 'UNKNOWN' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Lưu thú cưng' }).closest('form'));
  await screen.findByText('Chưa xác định kết quả lưu');
  expect(screen.getByRole('button', { name: 'Lưu thú cưng' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại cùng yêu cầu' }));
  await screen.findByRole('heading', { name: 'Đã lưu thú cưng.' });
  expect(api.save).toHaveBeenCalledTimes(2);
  expect(api.save.mock.calls[0]).toEqual(api.save.mock.calls[1]);
  expect(api.save.mock.calls[0][2]).toMatchObject({ weightKg: 4.2, breedCode: 'dog-test', careNeedsConfirmed: false, careProfile: { allergies: { status: 'UNKNOWN' } } });
});

test('address search and map selection reset confirmation and save one shared confirmed address', async () => {
  const api = setup('addresses');
  fireEvent.click(await screen.findByRole('button', { name: 'Thêm địa chỉ' }));
  fireEvent.change(screen.getByLabelText('Tìm địa chỉ'), { target: { value: 'Synthetic' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tìm địa chỉ' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Synthetic address' }));
  expect(screen.getByLabelText(/Địa chỉ đầy đủ/)).toHaveValue('Synthetic address');
  const confirmation = screen.getByRole('checkbox', { name: /Tôi xác nhận địa chỉ/ });
  fireEvent.click(confirmation); expect(confirmation).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Synthetic map pin' })); expect(confirmation).not.toBeChecked();
  fireEvent.change(screen.getByLabelText(/Tên gợi nhớ/), { target: { value: 'Synthetic home' } });
  fireEvent.change(screen.getByLabelText(/Khu vực phục vụ/), { target: { value: 'HN-TEST' } });
  fireEvent.click(confirmation);
  fireEvent.submit(screen.getByRole('button', { name: 'Lưu địa chỉ' }).closest('form'));
  await waitFor(() => expect(api.save).toHaveBeenCalledWith('addresses', undefined, expect.objectContaining({ coordinates: [105.85, 21.03], pointConfirmed: true, areaCode: 'HN-TEST' }), expect.any(String)));
});

test('unavailable care source does not become an empty list and prevents creation', async () => {
  const api = { load: jest.fn().mockRejectedValue({ code: 'NETWORK_ERROR' }) };
  render(<MemoryRouter><SessionProvider adapter={session}><CustomerCarePage api={api} /></SessionProvider></MemoryRouter>);
  expect(await screen.findByText('Chưa tải được thú cưng')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Thêm thú cưng' })).toBeDisabled();
  expect(screen.queryByText('Chưa có thú cưng')).not.toBeInTheDocument();
});
