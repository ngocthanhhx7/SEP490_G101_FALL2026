import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SitterVisitReviewPage } from '../../src/pages/sitter/SitterVisitReviewPage.jsx';

function renderPage(api) { return render(<MemoryRouter initialEntries={['/sitter/visits/visit-1/review']}><Routes><Route path="/sitter/visits/:visitId/review" element={<SitterVisitReviewPage api={api} />} /></Routes></MemoryRouter>); }

test('Sitter sees pending without a success claim', async () => {
  const api = { rateCustomer: jest.fn().mockResolvedValue({ pending: true, status: 202 }) };
  renderPage(api); fireEvent.click(screen.getByRole('button', { name: '5 sao' })); fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
  await waitFor(() => expect(api.rateCustomer).toHaveBeenCalledWith({ visitId: 'visit-1', expectedVersion: undefined, rating: 5, comment: undefined }));
  expect(await screen.findByRole('heading', { name: 'Đang chờ máy chủ' })).toBeVisible();
});

test('Sitter receives the policy decision message', async () => {
  const api = { rateCustomer: jest.fn().mockRejectedValue(Object.assign(new Error(), { code: 'DECISION_REQUIRED', status: 409 })) };
  renderPage(api); fireEvent.click(screen.getByRole('button', { name: '4 sao' })); fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
  expect(await screen.findByText(/thời hạn và moderation/)).toBeVisible();
});
