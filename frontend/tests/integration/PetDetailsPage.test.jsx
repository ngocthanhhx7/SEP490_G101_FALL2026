import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../src/services/api-client.js';
import { PetDetailsPage } from '../../src/pages/customer/PetDetailsPage.jsx';

const PET_ID = '64b000000000000000000015';

function petView(overrides = {}) {
  return {
    id: PET_ID,
    state: 'ACTIVE',
    version: 7,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    name: 'Mây',
    species: 'DOG',
    careFields: {
      breed: { status: 'UNKNOWN' },
      customer_reported_health_notes: {
        status: 'KNOWN', value: 'Dị ứng được Customer báo', source: 'CUSTOMER_REPORTED',
      },
      vaccination_records: { status: 'NOT_PROVIDED' },
      dog_walk_instructions: { status: 'NEEDS_CONFIRMATION', priorValue: 'Dùng dây màu xanh' },
    },
    ...overrides,
  };
}

function renderPetPage(api, petId = PET_ID) {
  return render(<MemoryRouter initialEntries={[`/customer/pets/${petId}`]}>
    <Routes><Route path="/customer/pets/:petId" element={<PetDetailsPage api={api} />} /></Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = jest.fn(function showModal() { this.setAttribute('open', ''); });
  window.HTMLDialogElement.prototype.close = jest.fn(function close() { this.removeAttribute('open'); });
});

test('renders dog-only information, distinct field states and customer-reported health context', async () => {
  const api = { getPet: jest.fn().mockResolvedValue({ data: petView(), status: 200, pending: false }) };
  renderPetPage(api);

  expect(await screen.findByRole('heading', { name: 'Mây' })).toBeInTheDocument();
  expect(screen.getByText('Dây dắt, tín hiệu và lưu ý khi đi dạo')).toBeInTheDocument();
  expect(screen.queryByText('Khay cát và cách chăm sóc')).not.toBeInTheDocument();
  expect(screen.getByText('Cần xác nhận lại')).toBeInTheDocument();
  expect(screen.queryByText('UNKNOWN')).not.toBeInTheDocument();
  expect(screen.getByText('Customer cung cấp')).toBeInTheDocument();
  expect(screen.getByText(/không phải chẩn đoán hoặc xác nhận chuyên môn/i)).toBeInTheDocument();
  expect(screen.getByText(/không có giá trị vaccine nào là điều kiện/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'PROVISIONAL · INTEGRATION_PENDING' })).toBeInTheDocument();
  expect(screen.getByText(/quy tắc dự kiến theo P01 là sửa hồ sơ không tự đổi/i)).toBeInTheDocument();
  expect(screen.getByText(/màn hình này chưa thể đọc hoặc xác minh snapshot/i)).toBeInTheDocument();
});

test('renders cat-only information and does not expose dog-specific fields', async () => {
  const cat = petView({ species: 'CAT', careFields: {
    cat_litter_instructions: { status: 'KNOWN', value: 'Khay ở ban công', source: 'CUSTOMER_REPORTED' },
    cat_carrier_and_approach: { status: 'NOT_APPLICABLE' },
  } });
  const api = { getPet: jest.fn().mockResolvedValue({ data: cat, status: 200, pending: false }) };
  renderPetPage(api);

  expect(await screen.findByRole('heading', { name: 'Mây' })).toBeInTheDocument();
  expect(screen.getByText('Khay cát và cách chăm sóc')).toBeInTheDocument();
  expect(screen.getByText('Khay ở ban công')).toBeInTheDocument();
  expect(screen.queryByText('Dây dắt, tín hiệu và lưu ý khi đi dạo')).not.toBeInTheDocument();
  expect(screen.getByText('Không áp dụng')).toBeInTheDocument();
});

test('edits an active pet with an expected version and waits for a PetView acknowledgement', async () => {
  const updatedPet = petView({ name: 'Mây nhỏ', version: 8, careFields: {
    breed: { status: 'KNOWN', value: 'Chó lai', source: 'CUSTOMER_REPORTED' },
    customer_reported_health_notes: { status: 'KNOWN', value: 'Dị ứng được Customer báo', source: 'CUSTOMER_REPORTED' },
    vaccination_records: { status: 'NOT_PROVIDED' },
    dog_walk_instructions: { status: 'NEEDS_CONFIRMATION', priorValue: 'Dùng dây màu xanh' },
  } });
  const api = {
    getPet: jest.fn().mockResolvedValue({ data: petView(), status: 200, pending: false }),
    updatePet: jest.fn().mockResolvedValue({ data: updatedPet, status: 200, pending: false }),
  };
  renderPetPage(api);
  await screen.findByRole('heading', { name: 'Mây' });

  fireEvent.click(screen.getAllByRole('button', { name: 'Chỉnh sửa hồ sơ' })[0]);
  fireEvent.change(screen.getByRole('textbox', { name: 'Tên thú cưng' }), { target: { value: 'Mây nhỏ' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Giống · trạng thái' }), { target: { value: 'KNOWN' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Giống' }), { target: { value: 'Chó lai' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

  await screen.findByRole('heading', { name: 'Hồ sơ đã được cập nhật' });
  expect(api.updatePet).toHaveBeenCalledWith(PET_ID, {
    name: 'Mây nhỏ', species: 'DOG',
    careFields: { breed: { status: 'KNOWN', value: 'Chó lai' } },
  }, { expectedVersion: 7 });
  expect(screen.getByRole('heading', { name: 'Mây nhỏ' })).toBeInTheDocument();
});

test('optional health and vaccine details do not block a profile save', async () => {
  const api = {
    getPet: jest.fn().mockResolvedValue({ data: petView(), status: 200, pending: false }),
    updatePet: jest.fn().mockResolvedValue({ data: petView({ version: 8 }), status: 200, pending: false }),
  };
  renderPetPage(api);
  await screen.findByRole('heading', { name: 'Mây' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Chỉnh sửa hồ sơ' })[0]);
  expect(screen.getByRole('combobox', { name: 'Thông tin vaccine do bạn cung cấp · trạng thái' }))
    .toHaveValue('NOT_PROVIDED');
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
  await screen.findByRole('heading', { name: 'Hồ sơ đã được cập nhật' });
  expect(api.updatePet).toHaveBeenCalledWith(PET_ID, { name: 'Mây', species: 'DOG', careFields: {} }, { expectedVersion: 7 });
});

test('allows an explicit unknown status and sets old species-only fields to not applicable on species change', async () => {
  const catPet = petView({ species: 'CAT', name: 'Mây', version: 8, careFields: {
    breed: { status: 'UNKNOWN' },
    dog_walk_instructions: { status: 'NOT_APPLICABLE' },
    dog_toileting_cues: { status: 'NOT_APPLICABLE' },
    cat_litter_instructions: { status: 'NOT_PROVIDED' },
  } });
  const api = {
    getPet: jest.fn().mockResolvedValue({ data: petView(), status: 200, pending: false }),
    updatePet: jest.fn().mockResolvedValue({ data: catPet, status: 200, pending: false }),
  };
  renderPetPage(api);
  await screen.findByRole('heading', { name: 'Mây' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Chỉnh sửa hồ sơ' })[0]);
  expect(screen.getByRole('combobox', { name: 'Giống · trạng thái' })).toHaveValue('UNKNOWN');
  expect(screen.queryByRole('option', { name: 'Không áp dụng' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Loài' }), { target: { value: 'CAT' } });
  expect(screen.getByText('Khay cát và cách chăm sóc')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

  await screen.findByRole('heading', { name: 'Hồ sơ đã được cập nhật' });
  expect(api.updatePet).toHaveBeenCalledWith(PET_ID, {
    name: 'Mây', species: 'CAT', careFields: {
      dog_walk_instructions: { status: 'NOT_APPLICABLE' },
      dog_toileting_cues: { status: 'NOT_APPLICABLE' },
    },
  }, { expectedVersion: 7 });
});

test('a stale version blocks repeat save until the server profile is reloaded', async () => {
  const currentPet = petView({ name: 'Mây trên máy chủ', version: 8 });
  const api = {
    getPet: jest.fn()
      .mockResolvedValueOnce({ data: petView(), status: 200, pending: false })
      .mockResolvedValueOnce({ data: currentPet, status: 200, pending: false }),
    updatePet: jest.fn().mockRejectedValue(new ApiError('VERSION_CONFLICT', 409)),
  };
  renderPetPage(api);
  await screen.findByRole('heading', { name: 'Mây' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Chỉnh sửa hồ sơ' })[0]);
  fireEvent.change(screen.getByRole('textbox', { name: 'Tên thú cưng' }), { target: { value: 'Mây bản cũ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

  expect(await screen.findByRole('heading', { name: 'Hồ sơ đã thay đổi' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
  expect(screen.queryByRole('heading', { name: 'Hồ sơ đã được cập nhật' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tải lại hồ sơ' }));
  expect(await screen.findByRole('heading', { name: 'Mây trên máy chủ' })).toBeInTheDocument();
  expect(api.updatePet).toHaveBeenCalledTimes(1);
});

test('202 and lost mutation acknowledgements stay pending and require a read before another command', async () => {
  const savedPet = petView({ name: 'Mây đã được ghi nhận', version: 8 });
  const api = {
    getPet: jest.fn()
      .mockResolvedValueOnce({ data: petView(), status: 200, pending: false })
      .mockResolvedValueOnce({ data: savedPet, status: 200, pending: false }),
    updatePet: jest.fn().mockResolvedValue({
      data: { operationId: 'opaque-operation', state: 'PROCESSING' }, status: 202, pending: true,
    }),
  };
  renderPetPage(api);
  await screen.findByRole('heading', { name: 'Mây' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Chỉnh sửa hồ sơ' })[0]);
  fireEvent.change(screen.getByRole('textbox', { name: 'Tên thú cưng' }), { target: { value: 'Mây đã được ghi nhận' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

  expect(await screen.findByRole('heading', { name: 'Đang chờ máy chủ xác nhận' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Hồ sơ đã được cập nhật' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Tên thú cưng' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Tải lại hồ sơ' }));
  expect(await screen.findByRole('heading', { name: 'Mây đã được ghi nhận' })).toBeInTheDocument();
  expect(api.updatePet).toHaveBeenCalledTimes(1);
});

test('invalid IDs, forbidden access and not-found resources have separate safe states', async () => {
  const invalidApi = { getPet: jest.fn() };
  renderPetPage(invalidApi, 'not-an-id');
  expect(screen.getByRole('heading', { name: 'Mã hồ sơ không hợp lệ' })).toBeInTheDocument();
  await waitFor(() => expect(invalidApi.getPet).not.toHaveBeenCalled());
});

test.each([
  [new ApiError('FORBIDDEN', 403), 'Không thể xem hồ sơ'],
  [new ApiError('RESOURCE_NOT_FOUND', 404), 'Không tìm thấy hồ sơ'],
])('renders a safe resource state for %s', async (error, title) => {
  const api = { getPet: jest.fn().mockRejectedValue(error) };
  renderPetPage(api);
  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
});

test('confirms archive explicitly and renders archived only after a PetView acknowledgement', async () => {
  const archivedPet = petView({ state: 'ARCHIVED', version: 8 });
  const api = {
    getPet: jest.fn().mockResolvedValue({ data: petView(), status: 200, pending: false }),
    archivePet: jest.fn().mockResolvedValue({ data: archivedPet, status: 200, pending: false }),
  };
  renderPetPage(api);
  await screen.findByRole('heading', { name: 'Mây' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Lưu trữ hồ sơ' })[0]);
  expect(screen.getByRole('alertdialog', { name: 'Lưu trữ hồ sơ thú cưng?' })).toBeInTheDocument();
  expect(screen.getByText(/snapshot của booking\/visit đã xác nhận vẫn được giữ nguyên/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu trữ' }));

  expect(await screen.findByText('Đã lưu trữ')).toBeInTheDocument();
  expect(api.archivePet).toHaveBeenCalledWith(PET_ID, { expectedVersion: 7 });
  expect(screen.getByRole('heading', { name: 'Đã lưu trữ hồ sơ' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Chỉnh sửa hồ sơ' })).not.toBeInTheDocument();
});

test('a 204 archive response remains pending until a reload confirms archived state', async () => {
  const archivedPet = petView({ state: 'ARCHIVED', version: 8 });
  const api = {
    getPet: jest.fn()
      .mockResolvedValueOnce({ data: petView(), status: 200, pending: false })
      .mockResolvedValueOnce({ data: archivedPet, status: 200, pending: false }),
    archivePet: jest.fn().mockResolvedValue({ data: null, status: 204, pending: true }),
  };
  renderPetPage(api);
  await screen.findByRole('heading', { name: 'Mây' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Lưu trữ hồ sơ' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu trữ' }));

  expect(await screen.findByRole('heading', { name: 'Đang chờ xác nhận lưu trữ' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Đã lưu trữ hồ sơ' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Lưu trữ hồ sơ' }).every((button) => button.disabled)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Tải lại hồ sơ' }));
  expect(await screen.findByText('Đã lưu trữ')).toBeInTheDocument();
  expect(api.archivePet).toHaveBeenCalledTimes(1);
});

test('keeps private photo upload disabled and explains that no file was sent', async () => {
  const api = { getPet: jest.fn().mockResolvedValue({ data: petView(), status: 200, pending: false }) };
  renderPetPage(api);
  await screen.findByRole('heading', { name: 'Mây' });
  expect(screen.getByRole('button', { name: 'Thêm ảnh (chưa khả dụng)' })).toBeDisabled();
  expect(screen.getByText(/kho media và quyền tải\/xem chưa được tích hợp/i)).toBeInTheDocument();
  expect(screen.getByText(/Chưa có nhà cung cấp upload media riêng tư/i)).toBeInTheDocument();
});
