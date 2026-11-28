import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { SitterVisitPage } from '../../src/pages/sitter/SitterVisitPage.jsx';

jest.mock('../../src/pages/sitter/AssignedCare.jsx', () => ({ AssignedCare: () => null }));
jest.mock('../../src/components/common/VisitTravel.jsx', () => ({ VisitTravel: () => null }));
jest.mock('../../src/pages/sitter/VisitExecution.jsx', () => ({ VisitExecution: () => null }));
jest.mock('../../src/pages/sitter/VisitWithdrawalDialog.jsx', () => ({ VisitWithdrawalDialog: () => null }));

const visitId = '507f1f77bcf86cd799439011';
const incidentPath = `/visits/${visitId}/incidents/new`;
const startAt = '2026-11-28T01:00:00Z';
const endAt = '2026-11-28T02:00:00Z';

function IncidentDestination() {
  const params = useParams();
  return <p>Trang báo sự cố: {params.visitId}</p>;
}

function visitApi(overrides = {}) {
  return {
    assignedVisitSummary: jest.fn().mockResolvedValue({
      data: {
        visitId,
        state: 'ASSIGNED',
        serviceName: 'Dắt chó đi dạo',
        startAt,
        endAt,
        location: 'HOME',
        serviceAddress: '12 Bà Triệu',
        handoverPending: false,
        ...overrides
      }
    })
  };
}

function renderVisit(overrides = {}) {
  return render(
    <MemoryRouter initialEntries={[`/sitter/visits/${visitId}`]}>
      <Routes>
        <Route path="/sitter/visits/:visitId" element={<SitterVisitPage api={visitApi(overrides)} visitId={visitId} />} />
        <Route path="/visits/:visitId/incidents/new" element={<IncidentDestination />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('nút "Báo sự cố" trên trang buổi chăm sóc của pet sitter', () => {
  test.each([
    ['ASSIGNED không chờ bàn giao', { state: 'ASSIGNED', handoverPending: false }],
    ['ASSIGNED không có handoverPending', { state: 'ASSIGNED', handoverPending: undefined }],
    ['IN_PROGRESS', { state: 'IN_PROGRESS', handoverPending: false }],
    ['COMPLETED', { state: 'COMPLETED', handoverPending: false }]
  ])('hiện nút "Báo sự cố" và giữ "Hỗ trợ công việc" khi buổi %s', async (_label, overrides) => {
    renderVisit(overrides);
    expect(await screen.findByRole('heading', { name: 'Dắt chó đi dạo' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Báo sự cố' })).toHaveAttribute('href', incidentPath);
    expect(screen.getByRole('link', { name: 'Hỗ trợ công việc' })).toHaveAttribute('href', '/contact');
  });

  test.each([
    ['CANCELLED', { state: 'CANCELLED', handoverPending: false }],
    ['SUPERSEDED', { state: 'SUPERSEDED', handoverPending: false }],
    ['đang chờ xác nhận bàn giao', { state: 'ASSIGNED', handoverPending: true }]
  ])('ẩn nút "Báo sự cố" khi buổi %s', async (_label, overrides) => {
    renderVisit(overrides);
    expect(await screen.findByRole('heading', { name: 'Dắt chó đi dạo' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Báo sự cố' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hỗ trợ công việc' })).toHaveAttribute('href', '/contact');
  });

  test('bấm "Báo sự cố" điều hướng sang trang báo sự cố của đúng buổi', async () => {
    renderVisit({ state: 'IN_PROGRESS' });
    const reportLink = await screen.findByRole('link', { name: 'Báo sự cố' });
    fireEvent.click(reportLink);
    expect(await screen.findByText(`Trang báo sự cố: ${visitId}`)).toBeVisible();
  });
});
