import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SitterProfilePage } from '../../src/pages/sitter/SitterProfilePage.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  globalThis.URL.createObjectURL = jest.fn(() => 'blob:sitter-avatar-preview');
  globalThis.URL.revokeObjectURL = jest.fn();
});

test('ST-ONB-05 sitter opens edit dialog, validates required bio & experience (MSG01), cancels without saving, then saves photo + text with MSG51', async () => {
  let stored = {
    id: 'a'.repeat(24),
    displayName: 'Nguyễn Minh Anh',
    areas: ['Cầu Giấy'],
    startedAt: '2026-11-01T00:00:00Z',
    completedVisitsCount: 4,
    rating: 4.8,
    reviewCount: 3,
    bio: '',
    experience: '',
    state: null,
    version: 0
  };
  const selfApi = {
    selfProfile: jest.fn(async () => ({ profile: { ...stored } })),
    saveSelfProfile: jest.fn(async body => {
      stored = { ...stored, bio: body.bio, experience: body.experience, state: 'APPROVED', version: body.expectedVersion + 1 };
      return { profile: { ...stored }, messageCode: 'MSG51' };
    })
  };
  const avatarApi = {
    get: jest.fn(async () => ({ data: { version: 0, present: false } })),
    content: jest.fn(async () => { throw { status: 404 }; }),
    save: jest.fn(async () => ({ data: { version: 1, present: true } }))
  };
  const prepareImage = jest.fn(async file => file);

  render(
    <MemoryRouter>
      <SessionProvider
        adapter={{
          getCsrfToken: () => 'synthetic-csrf',
          resolve: async () => ({
            status: 'authenticated',
            user: { id: 'a'.repeat(24), displayName: 'Nguyễn Minh Anh', roles: ['PET_SITTER'] },
            csrfToken: 'synthetic-csrf'
          })
        }}
      >
        <SitterProfilePage selfApi={selfApi} avatarApi={avatarApi} prepareImage={prepareImage} />
      </SessionProvider>
    </MemoryRouter>
  );

  expect(await screen.findByText('Nguyễn Minh Anh')).toBeVisible();
  expect(screen.queryByText('Chưa có dữ liệu trong phạm vi đã chọn')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Sửa hồ sơ' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/tên, số điện thoại và khu vực phục vụ không sửa ở đây/i)).toBeVisible();

  // Required validation (MSG01)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu hồ sơ' }));
  expect(within(dialog).getAllByText('Trường này là bắt buộc.')).toHaveLength(2);
  expect(selfApi.saveSelfProfile).not.toHaveBeenCalled();

  // Cancel closes without saving
  fireEvent.change(within(dialog).getByLabelText(/Giới thiệu/), { target: { value: 'Nháp chưa lưu' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText('Nháp chưa lưu')).toBeNull();

  // Reopen, pick avatar + fill bio & experience + save
  fireEvent.click(screen.getByRole('button', { name: 'Sửa hồ sơ' }));
  const reopened = screen.getByRole('dialog');
  const fileInput = within(reopened).getByLabelText('Đổi ảnh');
  const photo = new window.File(['fake-jpeg'], 'avatar.jpg', { type: 'image/jpeg' });
  fireEvent.change(fileInput, { target: { files: [photo] } });
  await waitFor(() => expect(prepareImage).toHaveBeenCalledWith(photo));

  fireEvent.change(within(reopened).getByLabelText(/Giới thiệu/), { target: { value: 'Chăm sóc tận tình mỗi ngày.' } });
  fireEvent.change(within(reopened).getByLabelText(/Kinh nghiệm/), { target: { value: '2 năm chăm sóc chó mèo.' } });
  fireEvent.click(within(reopened).getByRole('button', { name: 'Lưu hồ sơ' }));

  expect(await screen.findByText('Thay đổi của bạn đã được lưu.')).toBeVisible();
  expect(avatarApi.save).toHaveBeenCalledTimes(1);
  expect(selfApi.saveSelfProfile).toHaveBeenCalledWith(
    { bio: 'Chăm sóc tận tình mỗi ngày.', experience: '2 năm chăm sóc chó mèo.', expectedVersion: 0 },
    expect.any(String)
  );
  expect(screen.getByText('Chăm sóc tận tình mỗi ngày.')).toBeVisible();
  expect(screen.getByText('2 năm chăm sóc chó mèo.')).toBeVisible();
});

test('ST-ONB-05 hides public profile review menu items while keeping routes intact', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = jest.fn(async () => ({
    status: 200,
    ok: true,
    json: async () => ({ meta: { schemaVersion: 1 }, data: { profile: { id: 'a'.repeat(24), displayName: 'Sitter 1', areas: [], bio: '', experience: '', completedVisitsCount: 0, rating: null, reviewCount: 0, version: 0 } } })
  }));
  try {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/sitter/profile']}>
        <SessionProvider
          adapter={{
            getCsrfToken: () => 'synthetic-csrf',
            resolve: async () => ({
              status: 'authenticated',
              user: { id: 'a'.repeat(24), displayName: 'Sitter 1', roles: ['PET_SITTER'] },
              csrfToken: 'synthetic-csrf'
            })
          }}
        >
          <AppRoutes />
        </SessionProvider>
      </MemoryRouter>
    );
    await screen.findByRole('heading', { name: 'Hồ sơ người chăm sóc' });
    expect(screen.queryByRole('link', { name: 'Hồ sơ công khai' })).toBeNull();
    unmount();

    render(
      <MemoryRouter initialEntries={['/staff/sitters']}>
        <SessionProvider
          adapter={{
            getCsrfToken: () => 'synthetic-csrf',
            resolve: async () => ({
              status: 'authenticated',
              user: { id: 'b'.repeat(24), displayName: 'Staff 1', roles: ['STAFF'] },
              csrfToken: 'synthetic-csrf'
            })
          }}
        >
          <AppRoutes />
        </SessionProvider>
      </MemoryRouter>
    );
    await screen.findByRole('link', { name: 'Người chăm sóc' });
    expect(screen.queryByRole('link', { name: 'Duyệt hồ sơ công khai' })).toBeNull();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
