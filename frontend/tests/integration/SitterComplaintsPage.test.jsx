import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SitterComplaintsPage } from '../../src/pages/sitter/SitterComplaintsPage.jsx';

const item = { id: 'case-1', kind: 'COMPLAINT', visitId: 'visit-1', state: 'UNDER_REVIEW', category: 'PET_SAFETY', summary: 'Theo dõi', description: 'Bối cảnh', evidenceRefs: [], response: { summary: 'Đang xác minh' } };
function renderPage(api, path = '/sitter/complaints') { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/sitter/complaints" element={<SitterComplaintsPage api={api} />} /><Route path="/sitter/complaints/:complaintId" element={<SitterComplaintsPage api={api} />} /></Routes></MemoryRouter>); }
test('shows related complaint progress and response', async () => {
  renderPage({ list: jest.fn().mockResolvedValue({ data: { items: [item] } }) });
  expect(await screen.findByRole('heading', { name: 'Complaint liên quan' })).toBeVisible();
  expect(screen.getByText('Theo dõi')).toBeVisible();
});
test('shows forbidden state without exposing a complaint', async () => {
  renderPage({ list: jest.fn().mockRejectedValue(Object.assign(new Error(), { status: 403 })) });
  expect(await screen.findByRole('heading', { name: 'Không có quyền xem complaint' })).toBeVisible();
});
