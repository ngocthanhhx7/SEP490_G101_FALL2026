import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../src/services/api-client.js';
import { PetListPage } from '../../src/pages/customer/PetListPage.jsx';

const activePet = {
  id: '507f1f77bcf86cd799439011', name: 'Milo', species: 'DOG', state: 'ACTIVE', version: 3,
};
const archivedPet = { ...activePet, state: 'ARCHIVED', version: 4 };

function renderPage(api) {
  return render(<MemoryRouter><PetListPage api={api} /></MemoryRouter>);
}

function listResult(data, extra = {}) {
  return { data, meta: { schemaVersion: 1, nextCursor: null }, pending: false, ...extra };
}

beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  window.HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true, value: jest.fn(() => 'synthetic-operation-id'),
  });
});

test('shows loading state until the server responds', () => {
  const api = { listPets: () => new Promise(() => {}) };
  renderPage(api);
  expect(screen.getByRole('status', { name: 'Đang tải hồ sơ' })).toBeVisible();
  expect(screen.queryByText('Bạn chưa có hồ sơ thú cưng')).not.toBeInTheDocument();
});

test('renders customer-owned list items, details links and the unknown-data safety note', async () => {
  const api = { listPets: jest.fn().mockResolvedValue(listResult([activePet])) };
  renderPage(api);

  expect(await screen.findByRole('heading', { name: 'Milo' })).toBeVisible();
  expect(screen.getByText('Chó')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Xem hồ sơ' })).toHaveAttribute('href', `/account/pets/${activePet.id}`);
  expect(screen.getByText(/chưa biết\/chưa cung cấp không có nghĩa là không có dị ứng/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeEnabled();
});

test('shows a real empty state and validates the minimum name and species form', async () => {
  const api = { listPets: jest.fn().mockResolvedValue(listResult([])), createPet: jest.fn() };
  renderPage(api);

  expect(await screen.findByRole('status', { name: 'Bạn chưa có hồ sơ thú cưng' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Thêm thú cưng đầu tiên' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
  expect(await screen.findByText('Nhập tên thú cưng.')).toBeVisible();
  expect(screen.getByText('Chọn chó hoặc mèo.')).toBeVisible();
  expect(screen.getByRole('textbox', { name: /Tên thú cưng/ })).toHaveFocus();
  expect(api.createPet).not.toHaveBeenCalled();
});

test('creates using only trimmed name and species, then reloads the server list', async () => {
  const api = {
    listPets: jest.fn().mockResolvedValue(listResult([])),
    createPet: jest.fn().mockResolvedValue({ data: { ...activePet, name: 'Bông', species: 'CAT' }, status: 201 }),
  };
  renderPage(api);
  fireEvent.click(await screen.findByRole('button', { name: 'Thêm thú cưng đầu tiên' }));
  fireEvent.change(screen.getByRole('textbox', { name: /Tên thú cưng/ }), { target: { value: '  Bông  ' } });
  fireEvent.change(screen.getByRole('combobox', { name: /Loài/ }), { target: { value: 'CAT' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));

  expect(await screen.findByRole('status', { name: 'Đã tạo hồ sơ' })).toBeVisible();
  expect(api.createPet).toHaveBeenCalledWith({ name: 'Bông', species: 'CAT', idempotencyKey: 'synthetic-operation-id' });
  await waitFor(() => expect(api.listPets).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('textbox', { name: /Tên thú cưng/ })).not.toBeInTheDocument();
});

test('keeps a 202 create pending and retries the same command key and payload', async () => {
  const api = {
    listPets: jest.fn().mockResolvedValue(listResult([])),
    createPet: jest.fn()
      .mockResolvedValueOnce({ data: { operationId: 'synthetic' }, status: 202, pending: true })
      .mockResolvedValueOnce({ data: activePet, status: 201, pending: false }),
  };
  renderPage(api);
  fireEvent.click(await screen.findByRole('button', { name: 'Thêm thú cưng đầu tiên' }));
  fireEvent.change(screen.getByRole('textbox', { name: /Tên thú cưng/ }), { target: { value: 'Milo' } });
  fireEvent.change(screen.getByRole('combobox', { name: /Loài/ }), { target: { value: 'DOG' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));

  expect(await screen.findByText(/Hồ sơ chưa được xác nhận/)).toBeVisible();
  expect(screen.queryByRole('status', { name: 'Đã tạo hồ sơ' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra bằng cùng yêu cầu' }));
  await waitFor(() => expect(api.createPet).toHaveBeenCalledTimes(2));
  expect(api.createPet.mock.calls[0][0]).toEqual(api.createPet.mock.calls[1][0]);
  expect(await screen.findByRole('status', { name: 'Đã tạo hồ sơ' })).toBeVisible();
});

test('asks for confirmation and uses the soft-archive route only after confirmation', async () => {
  const api = {
    listPets: jest.fn()
      .mockResolvedValueOnce(listResult([activePet]))
      .mockResolvedValueOnce(listResult([archivedPet])),
    archivePet: jest.fn().mockResolvedValue({ data: null, status: 204, pending: false }),
  };
  renderPage(api);
  fireEvent.click(await screen.findByRole('button', { name: 'Lưu trữ' }));
  expect(screen.getByRole('alertdialog', { name: 'Lưu trữ hồ sơ thú cưng?' })).toBeVisible();
  expect(screen.getByText(/snapshot đã xác nhận được giữ nguyên/)).toBeVisible();
  expect(api.archivePet).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu trữ' }));

  expect(await screen.findByRole('status', { name: 'Đã lưu trữ hồ sơ' })).toBeVisible();
  expect(api.archivePet).toHaveBeenCalledWith({
    idempotencyKey: 'synthetic-operation-id', expectedVersion: activePet.version, petId: activePet.id,
  });
  expect(await screen.findByText('Đã lưu trữ')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Lưu trữ' })).not.toBeInTheDocument();
});

test.each([
  [new ApiError('FORBIDDEN', 403), 'Không có quyền xem danh sách này'],
  [new ApiError('NETWORK_ERROR'), 'Chưa tải được danh sách'],
])('renders the error state without substituting empty data', async (error, heading) => {
  const api = { listPets: jest.fn().mockRejectedValue(error) };
  renderPage(api);
  expect(await screen.findByRole('alert', { name: heading })).toBeVisible();
  expect(screen.queryByText('Bạn chưa có hồ sơ thú cưng')).not.toBeInTheDocument();
});

test('renders an accepted list request as pending rather than an empty list', async () => {
  const api = { listPets: jest.fn().mockResolvedValue(listResult([], { status: 202, pending: true })) };
  renderPage(api);
  expect(await screen.findByRole('status', { name: 'Máy chủ chưa xác nhận danh sách' })).toBeVisible();
  expect(screen.queryByText('Bạn chưa có hồ sơ thú cưng')).not.toBeInTheDocument();
});

test('loads the next opaque cursor page without duplicating pet cards', async () => {
  const secondPet = { ...activePet, id: '507f1f77bcf86cd799439012', name: 'Mèo Mướp', species: 'CAT' };
  const api = {
    listPets: jest.fn()
      .mockResolvedValueOnce(listResult([activePet], { meta: { nextCursor: 'next-page' } }))
      .mockResolvedValueOnce(listResult([activePet, secondPet])),
  };
  renderPage(api);
  expect(await screen.findByRole('heading', { name: 'Milo' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Tải thêm hồ sơ' }));
  expect(await screen.findByRole('heading', { name: 'Mèo Mướp' })).toBeVisible();
  expect(screen.getAllByRole('heading', { name: 'Milo' })).toHaveLength(1);
  expect(api.listPets.mock.calls[1][0]).toMatchObject({ cursor: 'next-page' });
});
