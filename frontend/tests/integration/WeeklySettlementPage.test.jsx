import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WeeklySettlementPage from '../../src/pages/sitter/WeeklySettlementPage.jsx';

const data = { requestWeekKey: '2026-10-12', balances: { accrued: 100, available: 50, reserved: 20, paid: 30 },
  earnings: [{ id: 'old', earningPeriodKey: '2026-09-28', availableVnd: 50 }], requests: [], decisionIds: [], quotaUsed: false };

test('pending adapter is honest and never shows a successful payout', async () => {
  render(<WeeklySettlementPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Đang chờ tích hợp');
});

test('displays all ledger balances and blocks quota/decision pending', async () => {
  render(<WeeklySettlementPage api={{ load: async () => ({ ...data, quotaUsed: true, decisionIds: ['FIN-07-ELIG'] }) }} />);
  expect(await screen.findByText(/Tuần bắt đầu/)).toHaveTextContent('2026-10-12');
  expect(screen.getByText('Đang giữ')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Gửi yêu cầu tất toán' })).toBeDisabled();
  expect(screen.getByText(/Chờ quyết định/)).toHaveTextContent('FIN-07-ELIG');
});

test('uncertain timeout retries the same logical command', async () => {
  const calls = [];
  const api = { load: async () => data, submit: async (ids, key) => { calls.push({ ids, key }); throw { code: 'TIMEOUT' }; } };
  render(<WeeklySettlementPage api={api} />);
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu tất toán' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Gửi yêu cầu tất toán' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu tất toán' }));
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[0]).toEqual(calls[1]);
});
