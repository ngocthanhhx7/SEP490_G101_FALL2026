import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomerProfilePage } from '../../src/pages/customer/CustomerProfilePage.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

jest.mock('../../src/pages/customer/customer-profile.css', () => ({}));

const initialProfile = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  displayName: 'Linh Customer',
  contacts: [{ channel: 'EMAIL', maskedValue: 'l•••@example.test', verifiedAt: '2026-10-14T00:00:00.000Z' }],
  version: 0,
  createdAt: '2026-10-14T00:00:00.000Z',
  updatedAt: '2026-10-14T00:00:00.000Z'
};

function renderProfile(apiRequest, sessionResult = { status: 'authenticated', user: { role: 'CUSTOMER' } }) {
  const sessionAdapter = { resolve: async () => sessionResult, getCsrfToken: () => 'synthetic-csrf' };
  return render(<MemoryRouter><SessionProvider adapter={sessionAdapter}>
    <CustomerProfilePage apiRequest={apiRequest} />
  </SessionProvider></MemoryRouter>);
}

test('shows a loading state before the Customer profile resolves', async () => {
  const apiRequest = () => new Promise(() => {});
  renderProfile(apiRequest);
  expect(await screen.findByRole('status', { name: 'Đang tải hồ sơ' })).toBeVisible();
});

test('loads the self profile with masked contacts and saves using the current version', async () => {
  let current = initialProfile;
  const apiRequest = jest.fn(async (_path, options = {}) => {
    if (options.method === 'PATCH') {
      current = { ...current, displayName: options.body.displayName, version: 1 };
      return { data: current, meta: { schemaVersion: 1 } };
    }
    return { data: current, meta: { schemaVersion: 1 } };
  });
  renderProfile(apiRequest);

  expect(await screen.findByRole('heading', { name: 'Hồ sơ của tôi' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Thay đổi' })).toHaveAttribute('href', '/account/settings');
  expect(screen.getByText('l•••@example.test')).toBeVisible();
  expect(screen.queryByText('linh@example.test')).not.toBeInTheDocument();
  const name = await screen.findByRole('textbox', { name: 'Họ và tên' });
  await waitFor(() => expect(name).toHaveValue('Linh Customer'));
  fireEvent.change(name, { target: { value: 'Lê An' } });
  expect(name).toHaveValue('Lê An');
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/me/profile', {
    method: 'PATCH', body: { displayName: 'Lê An', expectedVersion: 0 }
  }));
  expect(await screen.findByRole('heading', { name: 'Đã gửi yêu cầu cập nhật' })).toBeVisible();
  expect(await screen.findByRole('textbox', { name: 'Họ và tên' })).toHaveValue('Lê An');
});

test('shows forbidden and server-pending states without fake profile data', async () => {
  const forbidden = Object.assign(new Error('denied'), { status: 403, code: 'FORBIDDEN' });
  const view = renderProfile(async () => { throw forbidden; });
  expect(await screen.findByRole('heading', { name: 'Không có quyền xem hồ sơ' })).toBeVisible();
  view.unmount();

  const pending = async () => ({ data: null, pending: true, meta: { schemaVersion: 1 } });
  renderProfile(pending);
  expect(await screen.findByRole('heading', { name: 'Đang chờ máy chủ xác nhận' })).toBeVisible();
  expect(screen.queryByRole('textbox', { name: 'Họ và tên' })).not.toBeInTheDocument();
});

test('shows a retryable load error and keeps server detail out of the interface', async () => {
  const failure = Object.assign(new Error('synthetic internal detail'), { status: 503, code: 'PROFILE_UNAVAILABLE' });
  const apiRequest = jest.fn(async () => { throw failure; });
  renderProfile(apiRequest);
  expect(await screen.findByRole('heading', { name: 'Không tải được hồ sơ' })).toBeVisible();
  expect(screen.queryByText('synthetic internal detail')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('heading', { name: 'Không tải được hồ sơ' })).toBeVisible();
});
