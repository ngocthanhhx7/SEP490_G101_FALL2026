import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EmployeeInvitationsPage } from '../../src/pages/sitter/EmployeeInvitationsPage.jsx';
import { SitterAssignmentsPage } from '../../src/pages/sitter/SitterAssignmentsPage.jsx';
import { SitterVisitPage } from '../../src/pages/sitter/SitterVisitPage.jsx';
import { AssignedCare } from '../../src/pages/sitter/AssignedCare.jsx';

jest.mock('../../src/pages/sitter/AssignedCare.jsx', () => ({ AssignedCare: jest.fn(() => null) }));
jest.mock('../../src/components/common/VisitTravel.jsx', () => ({ VisitTravel: () => null }));
jest.mock('../../src/pages/sitter/VisitExecution.jsx', () => ({ VisitExecution: () => null }));
jest.mock('../../src/pages/sitter/VisitWithdrawalDialog.jsx', () => ({ VisitWithdrawalDialog: () => null }));

const visitId = '507f1f77bcf86cd799439011';
const handoverPath = `/sitter/visits/${visitId}/handover`;
const startAt = '2026-11-24T01:00:00Z';
const endAt = '2026-11-24T02:00:00Z';
const bannerText = 'Bạn cần xác nhận bàn giao trước khi check-in.';

beforeEach(() => AssignedCare.mockClear());

function visitApi(overrides = {}) {
  return { assignedVisitSummary: jest.fn().mockResolvedValue({ data: { id: visitId, state: 'ASSIGNED', serviceName: 'Dắt chó đi dạo',
    startAt, endAt, location: 'HOME', serviceAddress: 'Địa chỉ thử', handoverPending: false, ...overrides } }) };
}
const showVisit = api => render(<MemoryRouter><SitterVisitPage api={api} visitId={visitId} /></MemoryRouter>);

describe('trang buổi chăm sóc', () => {
  test('hiện dải nhắc và nút mở đúng màn bàn giao khi đang chờ, chưa mở ghi chú vào nhà', async () => {
    showVisit(visitApi({ handoverPending: true }));
    expect(await screen.findByText(bannerText)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Xác nhận bàn giao' })).toHaveAttribute('href', handoverPath);
    expect(AssignedCare).not.toHaveBeenCalled();
  });

  test.each([false, undefined])('ẩn dải nhắc và mở ghi chú vào nhà khi handoverPending là %s', async handoverPending => {
    showVisit(visitApi({ handoverPending }));
    expect(await screen.findByRole('heading', { name: 'Dắt chó đi dạo' })).toBeVisible();
    expect(screen.queryByText(bannerText)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Xác nhận bàn giao' })).not.toBeInTheDocument();
    expect(AssignedCare).toHaveBeenCalled();
  });
});

describe('link "Cần xác nhận bàn giao"', () => {
  const linkName = 'Cần xác nhận bàn giao';
  const assigned = { id: visitId, visitId, state: 'ASSIGNED', version: 2, serviceName: 'Dắt chó đi dạo', areaCode: 'Q1',
    startAt, endAt, pets: [], canWithdraw: false };
  const cases = [
    ['đang chờ bàn giao', { handoverRequired: true, handoverAccepted: false }, true],
    ['chờ bàn giao, chưa có handoverAccepted', { handoverRequired: true }, true],
    ['đã xác nhận bàn giao', { handoverRequired: true, handoverAccepted: true }, false],
    ['không cần bàn giao', { handoverRequired: false, handoverAccepted: false }, false]
  ];

  describe('Ca đã nhận', () => {
    const api = row => ({ offers: jest.fn().mockResolvedValue({ data: { items: [] } }),
      assignments: jest.fn().mockResolvedValue({ data: { items: [{ ...assigned, ...row }] } }) });
    test.each(cases)('%s', async (_name, row, visible) => {
      render(<MemoryRouter><EmployeeInvitationsPage api={api(row)} /></MemoryRouter>);
      expect(await screen.findByRole('table', { name: 'Ca đã nhận' })).toBeVisible();
      if (visible) expect(screen.getByRole('link', { name: linkName })).toHaveAttribute('href', handoverPath);
      else expect(screen.queryByRole('link', { name: linkName })).not.toBeInTheDocument();
    });
  });

  describe('Lịch làm', () => {
    const api = row => ({ listOffers: jest.fn().mockResolvedValue({ data: { items: [], nextCursor: null, limit: 20 } }),
      listAssignments: jest.fn().mockResolvedValue({ data: { items: [{ ...assigned, ...row }], nextCursor: null, limit: 20 } }) });
    test.each(cases)('%s', async (_name, row, visible) => {
      render(<MemoryRouter><SitterAssignmentsPage api={api(row)} createOperationKey={() => 'operation-123'} /></MemoryRouter>);
      expect(await screen.findByRole('heading', { name: 'Dắt chó đi dạo' })).toBeVisible();
      if (visible) expect(screen.getByRole('link', { name: linkName })).toHaveAttribute('href', handoverPath);
      else expect(screen.queryByRole('link', { name: linkName })).not.toBeInTheDocument();
    });
  });
});
