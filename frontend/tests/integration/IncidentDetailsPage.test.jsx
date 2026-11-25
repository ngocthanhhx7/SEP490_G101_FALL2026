import { beforeAll, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { IncidentDetailsPage } from '../../src/pages/incidents/IncidentDetailsPage.jsx';

beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

const baseIncident = {
  id: 'a'.repeat(24),
  code: 'SC-AAAAAAAAAAAA',
  visitId: 'b'.repeat(24),
  kind: 'INCIDENT',
  state: 'OPEN',
  version: 0,
  category: 'HEALTH_OBSERVATION',
  severity: 'HIGH',
  urgency: 'URGENT',
  description: 'Thú cưng bỏ ăn.',
  immediateAction: 'Đã báo khách.',
  evidenceRefs: [],
  timeline: [],
  createdAt: '2026-11-26T02:00:00.000Z',
  sitter: { id: 'c'.repeat(24), displayName: 'Lê Văn Sitter' },
  booking: { id: 'd'.repeat(24), code: 'BK-001' },
  billing: { status: 'AVAILABLE', basisAmountVnd: 300000, approvedTotalVnd: 100000, remainingVnd: 200000 },
  visitBilling: { paidPriceVnd: 100000, alreadyWaived: false, canWaive: true },
  suspensionProposal: null,
  proposal: null,
  moneyDecision: null
};

const sessionAdapter = role => ({
  getCsrfToken: () => 'synthetic-csrf',
  resolve: async () => ({ status: 'authenticated', user: { id: 'staff-1', roles: [role] } })
});

function renderPage(api, role = 'STAFF') {
  return render(
    <MemoryRouter initialEntries={[`/cases/${baseIncident.id}`]}>
      <SessionProvider adapter={sessionAdapter(role)}>
        <Routes>
          <Route path="/cases/:caseId" element={<IncidentDetailsPage api={api} />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>
  );
}

test('ST-CAS-12 and ST-CAS-04/06: IncidentDetailsPage shows suspension proposal, validates MSG01/MSG44, and sends refund proposal with MSG95', async () => {
  let current = { ...baseIncident };
  const api = {
    get: jest.fn(async () => ({ data: current })),
    readEvidence: jest.fn(),
    addAction: jest.fn(async ({ note }) => {
      current = { ...current, state: 'UNDER_REVIEW', version: current.version + 1, timeline: [{ type: 'STAFF_ACTION', note, occurredAt: '2026-11-26T02:05:00.000Z' }] };
      return { data: { ...current, messageCode: 'MSG51' } };
    }),
    proposeSuspension: jest.fn(async () => {
      current = { ...current, state: 'UNDER_REVIEW', version: current.version + 1, suspensionProposal: { sitterId: baseIncident.sitter.id, sitterName: 'Lê Văn Sitter' } };
      return { data: current };
    }),
    resolve: jest.fn(async () => {
      current = { ...current, state: 'UNDER_REVIEW', version: current.version + 1, proposal: { status: 'PENDING', amountVnd: 200000, reason: 'Chi phí khám', customerResult: 'Hỗ trợ khám' } };
      return { data: { ...current, messageCode: 'MSG95' } };
    })
  };

  renderPage(api);
  expect(await screen.findByRole('heading', { name: 'Chi tiết và xử lý sự cố' })).toBeVisible();
  expect(screen.queryByText(/contract tài chính/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Chuyển trạng thái/)).not.toBeInTheDocument();

  // Propose suspension (Part B)
  fireEvent.click(screen.getByRole('button', { name: 'Đề xuất Admin tạm ngưng người chăm sóc' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận gửi đề xuất' }));
  await waitFor(() => expect(api.proposeSuspension).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/Đã đề xuất tạm ngưng/)).toBeVisible();

  // Over cap -> MSG44, nothing sent
  fireEvent.change(screen.getByLabelText(/Kết quả/), { target: { value: 'Hỗ trợ khám thú y' } });
  fireEvent.change(screen.getByLabelText(/Số tiền đề xuất trả lại/), { target: { value: '250000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xử lý xong' }));
  expect(await screen.findByText(/Số tiền không được vượt quá 200\.000/)).toBeVisible();
  expect(screen.getByText('Trường này là bắt buộc.')).toBeVisible();
  expect(api.resolve).not.toHaveBeenCalled();

  // Valid proposal -> MSG95
  fireEvent.change(screen.getByLabelText(/Số tiền đề xuất trả lại/), { target: { value: '200000' } });
  fireEvent.change(screen.getByLabelText(/Lý do và bằng chứng/), { target: { value: 'Chi phí khám' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xử lý xong' }));
  await waitFor(() => expect(api.resolve).toHaveBeenCalledWith(expect.objectContaining({
    customerResult: 'Hỗ trợ khám thú y',
    chargeVisit: true,
    proposal: { amountVnd: 200000, reason: 'Chi phí khám', evidenceRefs: [] }
  })));
  expect(await screen.findByText(/Số tiền đề xuất đã được gửi cho Admin/)).toBeVisible();
});
