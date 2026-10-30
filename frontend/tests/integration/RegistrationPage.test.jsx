import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { PublicPolicyProvider } from '../../src/contexts/PublicPolicyContext.jsx';
import { RegistrationPage } from '../../src/pages/public/RegistrationPage.jsx';
import { loadPublicCatalog } from '../../src/services/public-catalog-api.js';

jest.mock('../../src/services/public-catalog-api.js', () => ({ loadPublicCatalog: jest.fn() }));
const policies = ['terms', 'privacy'].map(slug => ({ slug, versionId: `synthetic-${slug}`, status: 'APPROVED', approvedAt: '2020-01-01', effectiveAt: '2020-01-01' }));
const user = { id: 'synthetic-user', displayName: 'Nguyễn Văn A', roles: ['CUSTOMER'] };
function applicationApi(overrides = {}) {
  return { uploadsAvailable: true, loadIntake: jest.fn(async () => ({ data: { contactValue: 'sitter@example.test', uploadsAvailable: true, application: null } })),
    uploadDocument: jest.fn(async () => ({ documentId: 'synthetic-doc-id', storageRef: 'synthetic-storage-ref' })),
    createIdempotencyKey: () => 'synthetic-application-key', submit: jest.fn(async () => ({ id: 'app-1', state: 'PENDING', applicationCode: 'synthetic-secret-receipt-code' })), ...overrides };
}
function view({ adapter = { resolve: async () => ({ status: 'authenticated', user }) }, api = applicationApi(), registrationApi, route = '/register?role=sitter', currentPolicies = policies } = {}) {
  render(<MemoryRouter initialEntries={[route]}><SessionProvider adapter={adapter}><PublicPolicyProvider policies={currentPolicies}>
    <RegistrationPage applicationApi={api} registrationApi={registrationApi} />
  </PublicPolicyProvider></SessionProvider></MemoryRouter>);
  return api;
}
async function fillApplication() {
  const region = await screen.findByRole('region', { name: 'Kể chúng mình nghe về bạn' });
  const page = within(region);
  fireEvent.change(page.getByLabelText(/^Ngày sinh/), { target: { value: '1998-04-12' } });
  fireEvent.change(page.getByLabelText(/^Số CCCD/), { target: { value: 'TEST12345678' } });
  fireEvent.click(await page.findByRole('checkbox', { name: 'Dắt chó đi dạo' }));
  fireEvent.change(page.getByLabelText(/^Khu vực mong muốn/), { target: { value: 'Khu vực thử nghiệm, Hà Nội' } });
  fireEvent.change(page.getByLabelText(/^Kinh nghiệm/), { target: { value: 'Có kinh nghiệm chăm sóc chó mèo tại nhà.' } });
  fireEvent.change(page.getByLabelText(/^Ảnh giấy tờ định danh/), { target: { files: [new globalThis.File(['synthetic-image'], 'identity.png', { type: 'image/png' })] } });
  fireEvent.click(page.getByRole('checkbox', { name: /Tôi đồng ý/ }));
  return page;
}
beforeEach(() => loadPublicCatalog.mockResolvedValue({ data: { available: true, services: [{ id: 'walk', name: 'Dắt chó đi dạo' }, { id: 'visit', name: 'Ghé thăm và chơi cùng bé' }] } }));

test('guest sitter registers and verifies email before opening the private application form', async () => {
  const adapter = { resolve: jest.fn().mockResolvedValueOnce({ status: 'guest' }).mockResolvedValue({ status: 'authenticated', user }) };
  const registrationApi = { requestOtp: jest.fn(async () => ({ challengeId: 'synthetic-challenge', resendAfterSeconds: 60, expiresInSeconds: 300 })),
    verifyAndRegister: jest.fn(async () => ({ authenticated: true, user })) };
  const api = view({ adapter, registrationApi });
  await screen.findByRole('heading', { name: 'Đăng ký tài khoản mới' });
  expect(api.loadIntake).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Họ và tên của bạn'), { target: { value: user.displayName } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'sitter@example.test' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Đăng ký', exact: true }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' }), { target: { value: '004201' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác thực & hoàn tất đăng ký' }));
  expect(await screen.findByRole('heading', { name: 'Kể chúng mình nghe về bạn' })).toBeVisible();
  expect(screen.getByLabelText(/^Email/)).toHaveAttribute('readonly');
  expect(api.loadIntake).toHaveBeenCalled();
});

test('uses the verified email, selected services and private upload references to submit once', async () => {
  const api = view();
  const page = await fillApplication();
  fireEvent.click(page.getByRole('checkbox', { name: 'Ghé thăm và chơi cùng bé' }));
  fireEvent.click(page.getByRole('button', { name: 'Gửi hồ sơ ứng tuyển →' }));
  expect(await screen.findByRole('heading', { name: 'Đã tiếp nhận hồ sơ' })).toBeVisible();
  expect(api.submit).toHaveBeenCalledTimes(1);
  expect(api.submit).toHaveBeenCalledWith(expect.objectContaining({ contactChannel: 'EMAIL', contactValue: 'sitter@example.test',
    requestedServices: ['Dắt chó đi dạo', 'Ghé thăm và chơi cùng bé'], documents: [{ documentId: 'synthetic-doc-id', storageRef: 'synthetic-storage-ref', documentType: 'IDENTITY' }] }), { key: 'synthetic-application-key' });
  expect(screen.getByText('synthetic-secret-receipt-code')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Theo dõi hồ sơ →' })).toHaveAttribute('href', '/sitter/application-status');
});

test('an uncertain response retries with the same command and does not re-upload files', async () => {
  const api = view({ api: applicationApi({ submit: jest.fn().mockRejectedValueOnce({ code: 'TIMEOUT' })
    .mockResolvedValueOnce({ id: 'app-1', state: 'PENDING', applicationCode: 'same-key-receipt' }) }) });
  const page = await fillApplication();
  fireEvent.click(page.getByRole('button', { name: 'Gửi hồ sơ ứng tuyển →' }));
  await screen.findByText('Chưa gửi được hồ sơ');
  fireEvent.click(page.getByRole('button', { name: 'Gửi hồ sơ ứng tuyển →' }));
  expect(await screen.findByRole('heading', { name: 'Đã tiếp nhận hồ sơ' })).toBeVisible();
  expect(api.uploadDocument).toHaveBeenCalledTimes(1);
  expect(api.submit.mock.calls[0]).toEqual(api.submit.mock.calls[1]);
});

test('existing pending applications recover their code and prevent duplicate application forms', async () => {
  view({ api: applicationApi({ loadIntake: async () => ({ data: { contactValue: 'sitter@example.test', uploadsAvailable: true,
    application: { state: 'UNDER_REVIEW', applicationCode: 'recovered-private-receipt-code' } } }) }) });
  expect(await screen.findByRole('heading', { name: 'Hồ sơ đang được xét duyệt' })).toBeVisible();
  expect(screen.getByText('recovered-private-receipt-code')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Gửi hồ sơ ứng tuyển →' })).not.toBeInTheDocument();
});

test('missing storage or unapproved policies never report a successful submission', async () => {
  const api = view({ api: applicationApi({ loadIntake: async () => ({ data: { contactValue: 'sitter@example.test', uploadsAvailable: false } }) }), currentPolicies: [] });
  expect(await screen.findByText('Chưa mở tiếp nhận giấy tờ')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Gửi hồ sơ ứng tuyển →' })).toBeDisabled();
  expect(api.submit).not.toHaveBeenCalled();
});

test('file and required-field validation happens before any upload', async () => {
  const api = view();
  const page = await fillApplication();
  fireEvent.change(page.getByLabelText(/^Ảnh giấy tờ định danh/), { target: { files: [new globalThis.File(['fake'], 'not-supported.pdf', { type: 'application/pdf' })] } });
  fireEvent.click(page.getByRole('button', { name: 'Gửi hồ sơ ứng tuyển →' }));
  expect(await screen.findByText('Mỗi tệp phải là JPG hoặc PNG và không quá 5 MB.')).toBeVisible();
  expect(api.uploadDocument).not.toHaveBeenCalled();
});
