import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SitterApplicationReviewPage } from '../../src/pages/admin/SitterApplicationReviewPage.jsx';

describe('Admin sitter application review', () => {
  test('requires a rejection reason and sends a versioned Admin decision', async () => {
    const application = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Nguyễn Văn A',
      contact: { channel: 'EMAIL', value: 'sitter@example.test' }, ageEligible: true,
      employmentType: 'PART_TIME', experience: 'Có kinh nghiệm chăm sóc chó mèo.', requestedServices: ['Cho mèo ăn'], workAreas: ['Quận 1'],
      documents: [], state: 'UNDER_REVIEW', version: 2, decisionReason: null, rejectedAt: null, reapplyAt: null };
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
