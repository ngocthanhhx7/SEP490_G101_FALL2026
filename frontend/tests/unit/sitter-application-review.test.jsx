import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SitterApplicationReviewPage } from '../../src/pages/admin/SitterApplicationReviewPage.jsx';

describe('Admin sitter application review', () => {
  test('requires a rejection reason and sends a versioned Admin decision', async () => {
    const application = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Nguyễn Văn A',
      contact: { channel: 'EMAIL', value: 'sitter@example.test' }, ageEligible: true,
      employmentType: 'PART_TIME', experience: 'Có kinh nghiệm chăm sóc chó mèo.', requestedServices: ['Cho mèo ăn'], workAreas: ['Quận 1'],
      documents: [], state: 'INTERVIEW', version: 2, decisionReason: null, rejectedAt: null, reapplyAt: null };
    const api = { get: jest.fn(async () => ({ data: application })),
      startReview: jest.fn(),
      decide: jest.fn(async () => ({ data: { state: 'REJECTED', reapplyAt: '2026-11-13T03:00:00.000Z' } })),
      documentUrl: jest.fn(() => '/api/v1/applications/document') };
    render(<MemoryRouter initialEntries={[`/admin/applications/${application.id}`]}>
      <Routes><Route path="/admin/applications/:applicationId" element={<SitterApplicationReviewPage api={api} />} /></Routes>
    </MemoryRouter>);
    await screen.findByText('sitter@example.test · EMAIL');
    expect(screen.getByText('Bán thời gian')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối hồ sơ' }));
    expect(await screen.findByText('Nhập lý do từ chối, tối thiểu 3 ký tự.')).toBeInTheDocument();
    expect(api.decide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Lý do quyết định'), { target: { value: 'Thiếu kinh nghiệm liên quan.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối hồ sơ' }));
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith({
      applicationId: application.id, action: 'REJECT', reason: 'Thiếu kinh nghiệm liên quan.',
      interviewNote: '', expectedVersion: 2
    }));
  });

  test('requires a reason and sends versioned suspension or reinstatement for an approved Sitter', async () => {
    const application = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Nguyễn Văn A',
      contact: { channel: 'EMAIL', value: 'sitter@example.test' }, ageEligible: true,
      experience: 'Có kinh nghiệm chăm sóc chó mèo.', requestedServices: ['Cho mèo ăn'], workAreas: ['Quận 1'],
      documents: [], state: 'APPROVED', version: 1, decisionReason: 'Hồ sơ đạt yêu cầu.',
      sitterStatus: { status: 'ACTIVE', reason: null, version: 0, changedAt: '2026-10-14T00:00:00.000Z' } };
    const suspendedApplication = { ...application, sitterStatus: { ...application.sitterStatus,
      status: 'SUSPENDED', reason: 'Đang rà soát hồ sơ cập nhật.', version: 1 } };
    const api = { get: jest.fn().mockResolvedValueOnce({ data: application }).mockResolvedValueOnce({ data: suspendedApplication }),
      startReview: jest.fn(), decide: jest.fn(),
      changeSitterStatus: jest.fn(async () => ({ data: { status: 'SUSPENDED', version: 1 } })),
      documentUrl: jest.fn(() => '/api/v1/applications/document') };
    render(<MemoryRouter initialEntries={[`/admin/applications/${application.id}`]}>
      <Routes><Route path="/admin/applications/:applicationId" element={<SitterApplicationReviewPage api={api} />} /></Routes>
    </MemoryRouter>);
    await screen.findByText('Đang hoạt động');
    expect(screen.getByText('Chưa cung cấp (hồ sơ cũ)')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Tạm ngưng Sitter' }));
    expect(await screen.findByText('Nhập lý do trạng thái, tối thiểu 3 ký tự.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Lý do thay đổi trạng thái'), { target: { value: 'Đang rà soát hồ sơ cập nhật.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạm ngưng Sitter' }));
    await waitFor(() => expect(api.changeSitterStatus).toHaveBeenCalledWith({
      applicationId: application.id, action: 'SUSPEND', reason: 'Đang rà soát hồ sơ cập nhật.', expectedVersion: 0
    }));
    expect(await screen.findByRole('button', { name: 'Khôi phục Sitter' })).toBeInTheDocument();
    expect(screen.getByText(/P21 phải kiểm tra trạng thái trước khi phát offer/)).toBeInTheDocument();
  });
});

test('approval requires a decision reason and describes upgrading the verified account', async () => {
  const application = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Ứng viên thử nghiệm',
    contact: { channel: 'EMAIL', value: 'applicant@example.test' }, ageEligible: true,
    experience: 'Có kinh nghiệm chăm sóc.', requestedServices: ['Chăm sóc'], workAreas: ['Hà Nội'],
    documents: [], state: 'INTERVIEW', version: 3 };
  const api = { get: jest.fn(async () => ({ data: application })),
    decide: jest.fn(async () => ({ data: { state: 'APPROVED' } })) };
  render(<MemoryRouter initialEntries={[`/admin/applications/${application.id}`]}>
    <Routes><Route path="/admin/applications/:applicationId" element={<SitterApplicationReviewPage api={api} />} /></Routes>
  </MemoryRouter>);
  await screen.findByText('applicant@example.test · EMAIL');
  fireEvent.click(screen.getByRole('button', { name: 'Duyệt và cấp quyền Pet Sitter' }));
  expect(await screen.findByText('Nhập lý do duyệt, tối thiểu 3 ký tự.')).toBeVisible();
  expect(api.decide).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Lý do quyết định'), { target: { value: 'Đã thẩm định và xác nhận hợp đồng ký.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Duyệt và cấp quyền Pet Sitter' }));
  expect(await screen.findByText(/Ứng viên có tài khoản đã xác minh cần đăng nhập lại/)).toBeVisible();
  expect(api.decide).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE', expectedVersion: 3 }));
});

test('only the current workflow step is actionable before an interview decision', async () => {
  const application = { id: 'a'.repeat(24), displayName: 'Ứng viên tổng hợp', contact: { channel: 'EMAIL', value: 'applicant@example.test' },
    ageEligible: true, experience: 'Tổng hợp', requestedServices: [], workAreas: [], documents: [], state: 'PENDING', version: 0,
    timeline: [{ state: 'PENDING', occurredAt: '2026-10-30T08:00:00Z' }] };
  const api = { get: jest.fn(async () => ({ data: { ...application } })),
    startReview: jest.fn(async () => { application.state = 'UNDER_REVIEW'; application.version = 1; }),
    startInterview: jest.fn(async () => { application.state = 'INTERVIEW'; application.version = 2; }), decide: jest.fn() };
  render(<MemoryRouter initialEntries={[`/admin/applications/${application.id}`]}><Routes>
    <Route path="/admin/applications/:applicationId" element={<SitterApplicationReviewPage api={api} />} />
  </Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Bắt đầu thẩm định' }));
  expect(screen.queryByRole('button', { name: 'Duyệt và cấp quyền Pet Sitter' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Chuyển sang phỏng vấn' }));
  expect(await screen.findByRole('button', { name: 'Duyệt và cấp quyền Pet Sitter' })).toBeVisible();
  expect(api.startReview).toHaveBeenCalledWith({ applicationId: application.id, expectedVersion: 0 });
  expect(api.startInterview).toHaveBeenCalledWith({ applicationId: application.id, expectedVersion: 1 });
  expect(api.decide).not.toHaveBeenCalled();
});
