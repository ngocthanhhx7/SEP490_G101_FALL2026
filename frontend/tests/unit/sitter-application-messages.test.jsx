import { beforeAll } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../src/services/api-client.js';
import { SitterApplicationPage } from '../../src/pages/public/SitterApplicationPage.jsx';

jest.mock('../../src/contexts/PublicPolicyContext.jsx', () => ({
  usePublicPolicyCatalog: () => [],
  useRegistrationPolicies: () => ({
    ready: true,
    status: 'success',
    key: 'policy-v1',
    current: () => ({ ready: true, key: 'policy-v1', versions: [{ slug: 'terms', versionId: 'v1' }] }),
    retry: jest.fn()
  })
}));

jest.mock('../../src/services/public-catalog-api.js', () => ({
  loadPublicCatalog: jest.fn(async () => ({
    data: { available: true, services: [{ id: 'svc-1', name: 'Chăm sóc tại nhà' }] }
  }))
}));

function validImage(name = 'photo.jpg', type = 'image/jpeg', size = 1024) {
  const file = new globalThis.File([new Uint8Array(Math.min(size, 16))], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

async function fillRequiredFields() {
  await screen.findByText('Chăm sóc tại nhà');
  fireEvent.change(screen.getByLabelText(/Họ và tên/), { target: { value: 'Nguyễn An' } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'an@example.test' } });
  fireEvent.change(screen.getByLabelText(/Số điện thoại/), { target: { value: '0912345678' } });
  fireEvent.change(screen.getByLabelText(/Ngày sinh/), { target: { value: '1998-05-10' } });
  fireEvent.change(screen.getByLabelText(/Số CCCD/), { target: { value: '012345678901' } });
  fireEvent.click(screen.getByLabelText(/Toàn thời gian/));
  fireEvent.click(screen.getByLabelText('Chăm sóc tại nhà'));
  fireEvent.change(screen.getByLabelText(/Khu vực mong muốn/), { target: { value: 'Cầu Giấy' } });
  fireEvent.change(screen.getByLabelText(/Kinh nghiệm chăm sóc thú cưng/), {
    target: { value: 'Có hai năm kinh nghiệm chăm sóc chó mèo tại nhà.' }
  });
  fireEvent.change(screen.getByLabelText(/Ảnh mặt trước CCCD/), { target: { files: [validImage('front.jpg')] } });
  fireEvent.change(screen.getByLabelText(/Mặt sau CCCD/), { target: { files: [validImage('back.jpg')] } });
  fireEvent.change(screen.getByLabelText(/Ảnh chân dung/), { target: { files: [validImage('portrait.jpg')] } });
  fireEvent.click(screen.getByLabelText(/Tôi đồng ý với Điều khoản dịch vụ/));
}

function makeApi(submitImpl) {
  return {
    uploadsAvailable: true,
    uploadDocument: jest.fn(async (_file, { documentType }) => ({
      documentId: `doc-${documentType}`,
      storageRef: `ref_${documentType}_1234567890`
    })),
    createIdempotencyKey: () => 'synthetic-key-0001',
    submit: jest.fn(submitImpl)
  };
}

beforeAll(() => {
  globalThis.URL.createObjectURL = jest.fn(() => 'blob:synthetic-preview');
  globalThis.URL.revokeObjectURL = jest.fn();
});

test.each([
  ['phone', 'Hồ sơ dùng số điện thoại này vẫn đang được xét duyệt.'],
  ['email', 'Hồ sơ dùng email này vẫn đang được xét duyệt.'],
  ['identityNumber', 'Hồ sơ dùng số CCCD này vẫn đang được xét duyệt.']
])('ST-ONB-09 shows MSG37 at top of form for duplicate %s', async (conflictField, expectedText) => {
  const api = makeApi(async () => {
    throw new ApiError('APPLICATION_ALREADY_PENDING', 409, { conflictField });
  });
  render(<MemoryRouter><SitterApplicationPage api={api} /></MemoryRouter>);
  await fillRequiredFields();
  fireEvent.click(screen.getByRole('button', { name: /Gửi hồ sơ ứng tuyển/ }));
  const alert = await screen.findByText(expectedText);
  expect(alert).toBeVisible();
  const form = screen.getByRole('button', { name: /Gửi hồ sơ ứng tuyển/ }).closest('form');
  expect(form.firstElementChild.textContent).toContain(expectedText);
});

test('ST-ONB-13 shows MSG38 with Vietnam dd/mm/yyyy date at top of form when reapplying within 30 days', async () => {
  const api = makeApi(async () => {
    throw new ApiError('REAPPLY_NOT_AVAILABLE', 409, { reapplyAt: '2026-12-26T17:30:00.000Z' });
  });
  render(<MemoryRouter><SitterApplicationPage api={api} /></MemoryRouter>);
  await fillRequiredFields();
  fireEvent.click(screen.getByRole('button', { name: /Gửi hồ sơ ứng tuyển/ }));
  const alert = await screen.findByText('Bạn có thể ứng tuyển lại từ ngày 27/12/2026.');
  expect(alert).toBeVisible();
  const form = screen.getByRole('button', { name: /Gửi hồ sơ ứng tuyển/ }).closest('form');
  expect(form.firstElementChild.textContent).toContain('Bạn có thể ứng tuyển lại từ ngày 27/12/2026.');
});

test('ST-ONB-11 rejects oversized image, non-image file and >4MP image with MSG49 under the exact field and clears file', async () => {
  const api = makeApi(async () => ({ id: 'app-1', state: 'PENDING', applicationCode: 'a'.repeat(24) }));
  render(<MemoryRouter><SitterApplicationPage api={api} /></MemoryRouter>);
  await screen.findByText('Chăm sóc tại nhà');

  const portraitInput = screen.getByLabelText(/Ảnh chân dung/);
  fireEvent.change(portraitInput, { target: { files: [validImage('huge.jpg', 'image/jpeg', 6 * 1024 * 1024)] } });
  expect(screen.getByText('Mỗi tệp phải là ảnh JPG hoặc PNG, tối đa 5 MB.')).toBeVisible();
  expect(portraitInput.value).toBe('');
  expect(screen.queryByText('huge.jpg')).not.toBeInTheDocument();

  const docxFile = new globalThis.File(['doc'], 'cv.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  fireEvent.change(portraitInput, { target: { files: [docxFile] } });
  expect(screen.getByText('Mỗi tệp phải là ảnh JPG hoặc PNG, tối đa 5 MB.')).toBeVisible();
  expect(portraitInput.value).toBe('');
  expect(screen.queryByText('cv.docx')).not.toBeInTheDocument();

  const largeDimFile = validImage('wide.png', 'image/png', 1024);
  fireEvent.change(portraitInput, { target: { files: [largeDimFile] } });
  const img = await screen.findByAltText('Ảnh đã chọn: wide.png');
  Object.defineProperty(img, 'naturalWidth', { value: 3000 });
  Object.defineProperty(img, 'naturalHeight', { value: 2000 });
  fireEvent.load(img);
  await waitFor(() => {
    expect(screen.getByText('Mỗi tệp phải là ảnh JPG hoặc PNG, tối đa 5 MB và tối đa 4 megapixel.')).toBeVisible();
  });
  expect(screen.queryByText('wide.png')).not.toBeInTheDocument();
  expect(api.submit).not.toHaveBeenCalled();
});
