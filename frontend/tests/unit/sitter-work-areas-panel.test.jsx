import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SitterWorkAreasPanel, MAX_SITTER_WORK_AREA_CODES } from '../../src/pages/sitter/SitterWorkAreasPanel.jsx';

const areaData = {
  options: [
    { code: 'CITY_HCM', label: 'Thành phố Hồ Chí Minh', level: 'CITY', coordinates: [10.7, 106.6] },
    { code: 'DISTRICT_Q1', label: 'Quận 1', level: 'DISTRICT', customerAddress: 'private address' },
  ],
  selectedCodes: ['DISTRICT_Q1'],
  expectedVersion: 3,
};

function renderPanel(api) {
  return render(<SitterWorkAreasPanel api={api} />);
}

test('loads safe city/district labels and hides non-catalog private fields', async () => {
  const api = { load: jest.fn(async () => ({ data: areaData })), save: jest.fn() };
  renderPanel(api);

  expect(await screen.findByRole('heading', { name: 'Khu vực phục vụ' })).toBeVisible();
  expect(await screen.findByLabelText('Thành phố Hồ Chí Minh')).not.toBeChecked();
  expect(screen.getByLabelText('Quận 1')).toBeChecked();
  expect(screen.queryByText('CITY_HCM')).not.toBeInTheDocument();
  expect(screen.queryByText('private address')).not.toBeInTheDocument();
  expect(screen.queryByText('10.7')).not.toBeInTheDocument();
  expect(api.load).toHaveBeenCalledWith({ signal: expect.anything() });
});

test('shows loading while the injected catalog request is unresolved', () => {
  const api = { load: () => new Promise(() => {}), save: jest.fn() };
  renderPanel(api);
  expect(screen.getByRole('status', { name: 'Đang tải khu vực phục vụ' })).toBeVisible();
});

test('shows an empty state when no city or district codes are available', async () => {
  const api = { load: async () => ({ data: { options: [], selectedCodes: [], expectedVersion: 0 } }), save: jest.fn() };
  renderPanel(api);
  expect(await screen.findByRole('status', { name: 'Chưa có danh sách khu vực khả dụng' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Lưu khu vực' })).not.toBeInTheDocument();
});

test('shows a safe error for malformed area codes instead of rendering untrusted values', async () => {
  const api = {
    load: async () => ({ data: { options: [
      { code: '10.7769,106.7009', label: 'District', level: 'CITY' },
    ], selectedCodes: [], expectedVersion: 0 } }),
    save: jest.fn(),
  };
  renderPanel(api);
  expect(await screen.findByRole('alert', { name: 'Danh sách khu vực không hợp lệ' })).toBeVisible();
  expect(screen.queryByText('10.7769,106.7009')).not.toBeInTheDocument();
});

test.each([
  ['error', async () => { throw { status: 503 }; }, 'Không tải được khu vực phục vụ'],
  ['forbidden', async () => { throw { status: 403 }; }, 'Bạn không có quyền xem khu vực phục vụ'],
  ['pending', async () => ({ data: areaData, pending: true }), 'Đang chờ dữ liệu khu vực'],
])('renders the %s load state', async (_state, load, title) => {
  renderPanel({ load, save: jest.fn() });
  expect(await screen.findByRole(['forbidden', 'error'].includes(_state) ? 'alert' : 'status', { name: title })).toBeVisible();
});

test('can retry a failed read and then render the recovered catalog', async () => {
  const api = {
    load: jest.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce({ data: areaData }),
    save: jest.fn(),
  };
  renderPanel(api);
  fireEvent.click(await screen.findByRole('button', { name: 'Tải lại trạng thái' }));
  expect(await screen.findByLabelText('Quận 1')).toBeChecked();
  expect(api.load).toHaveBeenCalledTimes(2);
});

test('saves only area codes with expected version and reports confirmed success', async () => {
  const api = {
    load: jest.fn(async () => ({ data: areaData })),
    save: jest.fn(async ({ areas }) => ({
      data: { ...areaData, selectedCodes: areas, expectedVersion: 4 }, status: 200,
    })),
  };
  renderPanel(api);
  const city = await screen.findByLabelText('Thành phố Hồ Chí Minh');
  fireEvent.click(city);
  fireEvent.click(screen.getByRole('button', { name: 'Lưu khu vực' }));

  expect(await screen.findByRole('status', { name: 'Đã lưu khu vực' })).toHaveTextContent('Máy chủ đã xác nhận');
  expect(screen.getByRole('button', { name: 'Lưu khu vực' })).toBeDisabled();
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({
    areas: ['CITY_HCM', 'DISTRICT_Q1'], expectedVersion: 3,
    idempotencyKey: expect.any(String), signal: expect.anything(),
  }));
});

test('locks another mutation while save is pending and reloads before editing again', async () => {
  let current = areaData;
  const api = {
    load: jest.fn(async () => ({ data: current })),
    save: jest.fn(async () => ({ data: { ...areaData, selectedCodes: ['CITY_HCM'], expectedVersion: 4 }, status: 202, pending: true })),
  };
  renderPanel(api);
  fireEvent.click(await screen.findByLabelText('Thành phố Hồ Chí Minh'));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu khu vực' }));

  expect(await screen.findByRole('status', { name: 'Đang chờ xác nhận' })).toBeVisible();
  expect(screen.getByLabelText('Thành phố Hồ Chí Minh')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Lưu khu vực' })).toBeDisabled();
  current = { ...areaData, selectedCodes: ['CITY_HCM'], expectedVersion: 4 };
  fireEvent.click(screen.getByRole('button', { name: 'Tải lại trạng thái' }));
  await waitFor(() => expect(screen.getByLabelText('Thành phố Hồ Chí Minh')).toBeChecked());
  expect(screen.getByRole('button', { name: 'Lưu khu vực' })).toBeDisabled();
  expect(api.load).toHaveBeenCalledTimes(2);
});

test('a timeout requires a read before another save can be sent', async () => {
  const api = {
    load: async () => ({ data: areaData }),
    save: async () => { throw { code: 'TIMEOUT' }; },
  };
  renderPanel(api);
  fireEvent.click(await screen.findByLabelText('Thành phố Hồ Chí Minh'));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu khu vực' }));

  expect(await screen.findByRole('status', { name: 'Cần kiểm tra trạng thái' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Lưu khu vực' })).toBeDisabled();
});

test('treats a confirmed visit conflict as Staff review, not as an unknown pending write', async () => {
  const api = {
    load: async () => ({ data: areaData }),
    save: async () => { throw { status: 409, code: 'CONFIRMED_VISIT_CONFLICT' }; },
  };
  renderPanel(api);
  const checkboxes = await screen.findAllByRole('checkbox');
  fireEvent.click(checkboxes[0]);
  fireEvent.click(screen.getByRole('button', { name: /l.*u khu v.*c/i }));
  const warning = await screen.findByRole('status');
  expect(warning).toHaveTextContent('Khu v\u1ef1c ch\u01b0a \u0111\u01b0\u1ee3c thay \u0111\u1ed5i');
  expect(screen.getByRole('button', { name: /l.*u khu v.*c/i })).toBeEnabled();
});

test('enforces the selection limit in the panel', async () => {
  const options = Array.from({ length: MAX_SITTER_WORK_AREA_CODES + 1 }, (_, index) => ({
    code: `CITY_${String(index + 1).padStart(2, '0')}`, label: `Thành phố ${index + 1}`, level: 'CITY',
  }));
  const api = {
    load: async () => ({ data: { options, selectedCodes: options.slice(0, MAX_SITTER_WORK_AREA_CODES).map(area => area.code), expectedVersion: 1 } }),
    save: jest.fn(),
  };
  renderPanel(api);
  const last = await screen.findByLabelText('Thành phố 21');
  expect(last).toBeDisabled();
  expect(screen.getByText(`Đã chọn ${MAX_SITTER_WORK_AREA_CODES}/${MAX_SITTER_WORK_AREA_CODES} khu vực.`)).toBeVisible();
});

test('explains contract eligibility while retaining the selected areas for correction and retry', async () => {
  const api = { load: async () => ({ data: areaData }), save: jest.fn().mockRejectedValue({ status: 409, code: 'CONTRACT_REQUIRED' }) };
  renderPanel(api);
  fireEvent.click(await screen.findByLabelText('Thành phố Hồ Chí Minh'));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu khu vực' }));
  expect(await screen.findByText('Cần xác minh hợp đồng')).toBeVisible();
  expect(screen.getByText(/Hãy liên hệ Admin để xác minh hợp đồng/)).toBeVisible();
  expect(screen.getByLabelText('Thành phố Hồ Chí Minh')).toBeChecked();
  expect(screen.getByLabelText('Quận 1')).toBeChecked();
  expect(screen.queryByText('Đã lưu khu vực')).not.toBeInTheDocument();
});
