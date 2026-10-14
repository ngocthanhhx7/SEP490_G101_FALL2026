import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { publicPolicyRouteElements, PolicyArticlePage, PolicyIndexPage } from '../../src/pages/public/policies/PolicyPages.jsx';
import { PolicyContextLinks } from '../../src/pages/public/policies/PolicyLinks.jsx';
import { findPolicy, publicPolicies } from '../../src/pages/public/policies/policy-catalog.js';
import { draftPolicies } from '../fixtures/policy-draft-catalog.js';

const approvedPolicyFixture = {
  slug: 'approved-example',
  title: 'Chính sách ví dụ đã phê duyệt',
  purpose: 'Fixture chỉ dùng để kiểm tra giao diện.',
  summary: 'Nội dung tổng quan giả lập cho kiểm tra tìm kiếm.',
  keywords: 'từ-khóa-duyệt',
  version: '1.0',
  versionPath: 'v1',
  effectiveDate: '01/11/2026',
  sections: [{ heading: 'Điều khoản ví dụ', paragraphs: ['Nội dung ví dụ từ khóa-duyệt.'] }],
};

function renderPolicyPath(path) {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes>{publicPolicyRouteElements}</Routes>
  </MemoryRouter>);
}

test('guest index omits unapproved draft content and explains publication gate', () => {
  expect(publicPolicies).toEqual([]);
  expect(draftPolicies).toHaveLength(12);
  for (const policy of draftPolicies) {
    expect(findPolicy(policy.slug, policy.versionPath)).toBeNull();
  }

  renderPolicyPath('/policies');
  expect(screen.getByRole('heading', { name: 'Chính sách & hướng dẫn' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent(/chưa có chính sách nào được phê duyệt để công khai/i);
  expect(screen.queryByText(/Bản dự thảo — chưa có hiệu lực/)).not.toBeInTheDocument();
  expect(screen.queryByText(/59 phút 59 giây thì không đủ điều kiện/)).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Điều khoản dịch vụ' })).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
});

test.each([
  ['/policies/terms', 'Chính sách chưa được xuất bản'],
  ['/policies/terms/draft-v1', 'Chính sách chưa được xuất bản'],
  ['/policies/privacy/draft-v1', 'Chính sách chưa được xuất bản'],
])('known unpublished route %s hides its draft copy', path => {
  renderPolicyPath(path);
  expect(screen.getByRole('heading', { name: 'Chính sách chưa được xuất bản' })).toBeVisible();
  expect(screen.getByText(/Chưa có phiên bản được phê duyệt để công khai/)).toBeVisible();
  expect(screen.queryByText(/Thông tin chỉ nên được dùng cho xác minh liên hệ/)).not.toBeInTheDocument();
});

test.each(['/policies/missing', '/policies/terms/v1'])('unknown policy route %s returns an in-app not-found state', path => {
  renderPolicyPath(path);
  expect(screen.getByRole('heading', { name: 'Không tìm thấy phiên bản này' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Xem danh sách chính sách' })).toHaveAttribute('href', '/policies');
});

test('approved catalog entries can be searched and linked to a fixed version', () => {
  render(<MemoryRouter><PolicyIndexPage policies={[approvedPolicyFixture]} /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Chính sách & hướng dẫn' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Chính sách ví dụ đã phê duyệt' })).toHaveAttribute('href', '/policies/approved-example/v1');

  fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm chính sách' }), { target: { value: 'từ-khóa-duyệt' } });
  expect(screen.getByRole('link', { name: 'Chính sách ví dụ đã phê duyệt' })).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm chính sách' }), { target: { value: 'không khớp' } });
  expect(screen.getByText('Không tìm thấy chính sách phù hợp. Hãy thử từ khóa khác.')).toBeVisible();
});

test('approved article displays purpose, version, effective date and matching contents order', () => {
  render(<MemoryRouter initialEntries={['/policies/approved-example/v1']}>
    <Routes>
      <Route path="/policies/:slug/:version" element={<PolicyArticlePage policies={[approvedPolicyFixture]} />} />
    </Routes>
  </MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Chính sách ví dụ đã phê duyệt' })).toBeVisible();
  expect(screen.getByText('Fixture chỉ dùng để kiểm tra giao diện.')).toBeVisible();
  expect(screen.getByText('1.0')).toBeVisible();
  expect(screen.getByText('01/11/2026')).toBeVisible();
  expect(screen.getByRole('link', { name: /mở liên kết phiên bản/i })).toHaveAttribute('href', '/policies/approved-example/v1');
  expect(screen.getByRole('complementary', { name: 'Mục lục bài viết' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Điều khoản ví dụ', level: 2 })).toBeVisible();
});

test('registration context links point to explicit unpublished draft placeholders', () => {
  render(<MemoryRouter><PolicyContextLinks context="registration" /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Điều khoản dịch vụ' })).toHaveAttribute('href', '/policies/terms/draft-v1');
  expect(screen.getByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveAttribute('href', '/policies/privacy/draft-v1');
  expect(screen.getByRole('link', { name: 'Chính sách OTP và liên hệ' })).toHaveAttribute('href', '/policies/contact-verification/draft-v1');
});

test.each([
  ['booking', ['/policies/booking/draft-v1', '/policies/payments/draft-v1', '/policies/cancellations-refunds/draft-v1', '/policies/service-areas/draft-v1']],
  ['account', ['/policies/privacy/draft-v1', '/policies/terms/draft-v1', '/policies/contact-verification/draft-v1']],
  ['sitterApplication', ['/policies/terms/draft-v1', '/policies/privacy/draft-v1', '/policies/sitter-onboarding/draft-v1', '/policies/contact-verification/draft-v1']],
])('%s context preserves intended policy destinations', (context, expectedPaths) => {
  render(<MemoryRouter><PolicyContextLinks context={context} /></MemoryRouter>);
  const paths = screen.getAllByRole('link').map(link => link.getAttribute('href'));
  expect(paths).toEqual([...expectedPaths, '/policies']);
});
