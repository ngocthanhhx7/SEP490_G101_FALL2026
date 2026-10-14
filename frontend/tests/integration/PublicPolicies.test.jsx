import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { publicPolicyRouteElements } from '../../src/pages/public/policies/PolicyPages.jsx';
import { PolicyContextLinks } from '../../src/pages/public/policies/PolicyLinks.jsx';
import { publicPolicies } from '../../src/pages/public/policies/policy-catalog.js';

function renderPolicyPath(path) {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes>{publicPolicyRouteElements}</Routes>
  </MemoryRouter>);
}

test('guest can browse and search all public draft policies', () => {
  renderPolicyPath('/policies');
  expect(screen.getByRole('heading', { name: 'Chính sách & hướng dẫn' })).toBeVisible();
  expect(screen.getByText(/Bản dự thảo — chưa có hiệu lực/)).toBeVisible();
  expect(screen.getAllByRole('listitem')).toHaveLength(publicPolicies.length);
  expect(screen.getByRole('link', { name: 'Điều khoản dịch vụ' })).toHaveAttribute('href', '/policies/terms');

  fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm chính sách' }), { target: { value: '30%' } });
  expect(screen.getByRole('link', { name: 'Hủy lịch, đổi lịch và hoàn tiền' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Chính sách quyền riêng tư' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm chính sách' }), { target: { value: '59 phút 59 giây' } });
  expect(screen.getByRole('link', { name: 'Hủy lịch, đổi lịch và hoàn tiền' })).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm chính sách' }), { target: { value: 'không có kết quả' } });
  expect(screen.getByText('Không tìm thấy chính sách phù hợp. Hãy thử từ khóa khác.')).toBeVisible();
});

test.each([
  ['/policies/terms', 'Điều khoản dịch vụ'],
  ['/policies/terms/v1', 'Điều khoản dịch vụ'],
  ['/policies/cancellations-refunds/v1', 'Hủy lịch, đổi lịch và hoàn tiền'],
])('guest deep link %s displays policy metadata and version link', (path, title) => {
  renderPolicyPath(path);
  expect(screen.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  expect(screen.getByText('Chưa có hiệu lực — chờ người có thẩm quyền phê duyệt')).toBeVisible();
  expect(screen.getByRole('link', { name: /mở liên kết phiên bản/i })).toHaveAttribute('href', expect.stringMatching(/\/v1$/));
  expect(screen.getByRole('complementary', { name: 'Mục lục bài viết' })).toBeVisible();
});

test('cancellation page separates the confirmed cutoff and retention from open decisions', () => {
  renderPolicyPath('/policies/cancellations-refunds/v1');
  expect(screen.getByText(/60 phút được phép; còn 59 phút 59 giây thì không đủ điều kiện/)).toBeVisible();
  expect(screen.getByText(/giữ lại 30% phần đủ điều kiện/)).toBeVisible();
  expect(screen.getByText(/Cutoff đổi lịch, thời gian hoàn tiền và một số quy tắc nguyên nhân hủy vẫn đang chờ chốt/)).toBeVisible();
});

test.each(['/policies/missing', '/policies/terms/v2'])('invalid policy route %s returns a not-found state', path => {
  renderPolicyPath(path);
  expect(screen.getByRole('heading', { name: 'Không tìm thấy phiên bản này' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Xem danh sách chính sách' })).toHaveAttribute('href', '/policies');
});

test('all catalog entries carry purpose, version and a non-effective review date', () => {
  for (const policy of publicPolicies) {
    expect(policy.purpose).toBeTruthy();
    expect(policy.version).toMatch(/^\d+\.\d+-draft$/);
    expect(policy.effectiveDate).toMatch(/Chưa có hiệu lực/);
    expect(policy.sources.length).toBeGreaterThan(0);
  }
});

test('registration context links directly to fixed policy versions', () => {
  render(<MemoryRouter><PolicyContextLinks context="registration" /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Điều khoản dịch vụ' })).toHaveAttribute('href', '/policies/terms/v1');
  expect(screen.getByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveAttribute('href', '/policies/privacy/v1');
  expect(screen.getByRole('link', { name: 'Chính sách OTP và liên hệ' })).toHaveAttribute('href', '/policies/contact-verification/v1');
});

test.each([
  ['booking', ['/policies/booking/v1', '/policies/payments/v1', '/policies/cancellations-refunds/v1', '/policies/service-areas/v1']],
  ['account', ['/policies/privacy/v1', '/policies/terms/v1', '/policies/contact-verification/v1']],
  ['sitterApplication', ['/policies/terms/v1', '/policies/privacy/v1', '/policies/sitter-onboarding/v1', '/policies/contact-verification/v1']],
])('%s context exposes version-specific policy destinations', (context, expectedPaths) => {
  render(<MemoryRouter><PolicyContextLinks context={context} /></MemoryRouter>);
  const paths = screen.getAllByRole('link').map(link => link.getAttribute('href'));
  expect(paths).toEqual([...expectedPaths, '/policies']);
});
