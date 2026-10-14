import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { App } from '../../src/app/App.jsx';
import { registrationPolicyReadiness } from '../../src/contexts/PublicPolicyContext.jsx';

const unresolved = { resolve: () => new Promise(() => {}) };
function show(path, props = {}) {
  return render(<MemoryRouter initialEntries={[path]}><App sessionAdapter={unresolved} {...props} /></MemoryRouter>);
}

test.each(['/policies', '/policies/terms', '/policies/privacy/draft-v1'])('public policy deep link %s remains reachable with unresolved session', path => {
  show(path);
  expect(screen.getByText(/Chưa có phiên bản được phê duyệt để công khai|Hiện chưa có chính sách nào được phê duyệt/)).toBeVisible();
  expect(screen.queryByText('Không tìm thấy trang')).not.toBeInTheDocument();
});

test('P45 fragment replaces fallback inside the actual App router and remains public', () => {
  show('/policies/terms/v1', { publicPolicyRouteElements: <>
    <Route path="policies" element={<h1>Synthetic policy index</h1>} />
    <Route path="policies/:slug/:version" element={<h1>Synthetic approved article</h1>} />
  </> });
  expect(screen.getByRole('heading', { name: 'Synthetic approved article' })).toBeVisible();
  expect(screen.queryByText('Chính sách chưa được xuất bản')).not.toBeInTheDocument();
});

test('account uses the merged P48 shell with only registered destinations', async () => {
  show('/account', { sessionAdapter: { resolve: async () => ({ status: 'authenticated',
    user: { id: 'synthetic-admin', displayName: 'Synthetic Admin', roles: ['ADMIN'] } }) } });
  const navigation = await screen.findByRole('navigation', { name: 'Điều hướng quản trị' });
  expect(navigation).toBeVisible();
  expect(screen.getByRole('link', { name: 'Dịch vụ', exact: true })).toHaveAttribute('href', '/admin/services');
  expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).not.toBeInTheDocument();
});

test('default registration cannot accept unpublished policies or send registration', () => {
  show('/register');
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Gửi mã OTP' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Đăng ký tài khoản Khách hàng/ })).toBeDisabled();
  fireEvent.submit(screen.getByRole('button', { name: /Đăng ký tài khoản Khách hàng/ }).closest('form'));
  expect(screen.getByRole('alert')).toHaveTextContent('Chính sách chưa sẵn sàng');
  expect(screen.getByRole('link', { name: 'Điều khoản dịch vụ' })).toHaveAttribute('href', '/policies/terms/draft-v1');
});

test.each(['/admin/services', '/admin/service-prices', '/admin/system-settings', '/admin/sitter-applications',
  '/admin/sitter-applications/id', '/account/profile', '/account/addresses', '/sitter/availability'])('merged page %s is guarded before page API access', async path => {
  show(path, { sessionAdapter: { resolve: async () => ({ status: 'authenticated', user: { role: 'STAFF' } }) } });
  expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
});

test('policy metadata must be approved, effective, unexpired and unambiguous', () => {
  const now = Date.parse('2026-10-14T00:00:00Z');
  const approved = ['terms', 'privacy'].map(slug => ({ slug, versionId: `${slug}-v1`, status: 'APPROVED',
    effectiveAt: '2026-10-01T00:00:00Z', approvedAt: '2026-09-30T00:00:00Z' }));
  expect(registrationPolicyReadiness(approved, now).ready).toBe(true);
  for (const patch of [{ status: 'DRAFT' }, { effectiveAt: '2027-01-01T00:00:00Z' },
    { approvedAt: 'invalid' }, { expiresAt: '2026-10-14T00:00:00Z' }, { versionId: '' }]) {
    expect(registrationPolicyReadiness([{ ...approved[0], ...patch }, approved[1]], now).ready).toBe(false);
  }
  expect(registrationPolicyReadiness([approved[0]], now).ready).toBe(false);
  expect(registrationPolicyReadiness([...approved, { ...approved[0], versionId: 'other' }], now).ready).toBe(false);
});

test('a newly published version requires consent again instead of reusing the old checkbox', () => {
  const policies = ['terms', 'privacy'].map(slug => ({ slug, versionId: `${slug}-v1`, status: 'APPROVED',
    effectiveAt: '2020-01-01T00:00:00Z', approvedAt: '2020-01-01T00:00:00Z' }));
  const view = show('/register', { registrationPolicies: policies });
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('checkbox')).toBeChecked();
  view.rerender(<MemoryRouter initialEntries={['/register']}><App sessionAdapter={unresolved}
    registrationPolicies={[{ ...policies[0], versionId: 'terms-v2' }, policies[1]]} /></MemoryRouter>);
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});

test('policy expiry is checked on forced submit even without a metadata refresh', () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-14T00:00:00Z'));
  try {
    const policies = ['terms', 'privacy'].map(slug => ({ slug, versionId: `${slug}-v1`, status: 'APPROVED',
      effectiveAt: '2020-01-01T00:00:00Z', approvedAt: '2020-01-01T00:00:00Z', expiresAt: '2026-10-14T00:01:00Z' }));
    show('/register', { registrationPolicies: policies });
    expect(screen.getByRole('checkbox')).toBeEnabled();
    clock.mockReturnValue(Date.parse('2026-10-14T00:01:00Z'));
    fireEvent.submit(screen.getByRole('button', { name: /Đăng ký tài khoản Khách hàng/ }).closest('form'));
    expect(screen.getByRole('alert')).toHaveTextContent('Chính sách chưa sẵn sàng');
  } finally { clock.mockRestore(); }
});


test('P46 tracking deep link is reachable without waiting for a session or exposing credentials in URL', () => {
  show('/sitter/application-status');
  expect(screen.getByRole('heading', { name: 'Theo dõi hồ sơ ứng tuyển' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: /Mã hồ sơ/ })).toBeVisible();
  expect(screen.queryByText('Không tìm thấy trang')).not.toBeInTheDocument();
});


test('actual Customer profile route loads its runtime API and appears in role navigation', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({
    meta: { schemaVersion: 1 }, data: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Runtime Customer',
      version: 0, contacts: [], createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z' }
  }) }));
  try {
    show('/account/profile', { sessionAdapter: { resolve: async () => ({ status: 'authenticated',
      user: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Runtime Customer', roles: ['CUSTOMER'] } }),
      getCsrfToken: () => 'synthetic-csrf' } });
    expect(await screen.findByRole('heading', { name: 'Hồ sơ Customer' })).toBeVisible();
    expect(await screen.findByDisplayValue('Runtime Customer')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Hồ sơ', exact: true })).toHaveAttribute('href', '/account/profile');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/me/profile', expect.objectContaining({ credentials: 'same-origin' }));
  } finally { globalThis.fetch = original; }
});
