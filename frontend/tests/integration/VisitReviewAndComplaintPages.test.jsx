import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VisitReviewPage } from '../../src/pages/customer/VisitReviewPage.jsx';
import { ComplaintSubmitPage } from '../../src/pages/customer/ComplaintSubmitPage.jsx';
import { ComplaintDetailsPage } from '../../src/pages/customer/ComplaintDetailsPage.jsx';

const visitId = 'visit-1';
function at(path, element) { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/visits/:visitId/review" element={element} /><Route path="/visits/:visitId/complaint" element={element} /><Route path="/complaints/:complaintId" element={element} /></Routes></MemoryRouter>); }

test('Customer can choose an accessible rating and sees pending without success claim', async () => {
  const api = { rateVisit: jest.fn().mockResolvedValue({ pending: true, status: 202 }) };
  at(`/visits/${visitId}/review`, <VisitReviewPage api={api} />);
  fireEvent.click(screen.getByRole('button', { name: '5 sao' }));
  fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
  await waitFor(() => expect(api.rateVisit).toHaveBeenCalledWith({ visitId, expectedVersion: undefined, rating: 5, comment: undefined }));
  expect(await screen.findByRole('heading', { name: 'Đang chờ máy chủ' })).toBeVisible();
});

test('Customer complaint form handles the seven-day and duplicate errors', async () => {
  const api = { submit: jest.fn().mockRejectedValue(Object.assign(new Error(), { code: 'COMPLAINT_ALREADY_OPEN', status: 409 })) };
  at(`/visits/${visitId}/complaint`, <ComplaintSubmitPage api={api} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Tiêu đề' }), { target: { value: 'Cần xác minh' } });
  fireEvent.change(screen.getByRole('textbox', { name: /Nội dung complaint/ }), { target: { value: 'Mô tả' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi complaint' }));
  expect(await screen.findByRole('heading', { name: 'Không thể gửi complaint' })).toBeVisible();
  expect(screen.getByText('Visit này đã có complaint đang mở.')).toBeVisible();
});

test('Complaint details shows private evidence and permits one objection', async () => {
  const api = { get: jest.fn().mockResolvedValue({ data: { id: 'case-1', kind: 'COMPLAINT', visitId, state: 'RESOLVED', version: 2, summary: 'Đã xử lý', description: 'Nội dung', evidenceRefs: [{ mediaId: 'media-1' }], objection: { allowed: true, count: 0 }, settlement: { state: 'ON_HOLD' } } }), disagree: jest.fn().mockResolvedValue({ data: { id: 'case-1', kind: 'COMPLAINT', visitId, state: 'UNDER_REVIEW', version: 3, objection: { allowed: false, count: 1 } } }) };
  at('/complaints/case-1', <ComplaintDetailsPage api={api} />);
  expect(await screen.findByText('media-1')).toBeVisible();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: /Lý do/ }), { target: { value: 'Tôi chưa đồng ý' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi ý kiến' }));
  await waitFor(() => expect(api.disagree).toHaveBeenCalledWith({ complaintId: 'case-1', expectedVersion: 2, reason: 'Tôi chưa đồng ý' }));
});
