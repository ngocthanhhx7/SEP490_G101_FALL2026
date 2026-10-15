import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { ComplaintManagementPage } from '../../src/pages/staff/ComplaintManagementPage.jsx';

const item = { id: 'case-1', kind: 'COMPLAINT', visitId: 'visit-1', state: 'OPEN', version: 0,
  category: 'SERVICE_QUALITY', summary: 'Service issue', description: 'Needs review', evidenceRefs: [],
  objection: { allowed: false, count: 0 }, settlement: { state: 'NOT_HELD' } };
const adapter = { resolve: async () => ({ status: 'authenticated', user: { roles: ['STAFF'] } }) };

function renderPage(api, complaintId = 'case-1') {
  return render(<SessionProvider adapter={adapter}><MemoryRouter><ComplaintManagementPage api={api} complaintId={complaintId} /></MemoryRouter></SessionProvider>);
}

test('Staff sees scoped complaint detail and records a review command', async () => {
  const api = { list: jest.fn().mockResolvedValue({ data: { items: [item] } }), get: jest.fn().mockResolvedValue({ data: item }), review: jest.fn().mockResolvedValue({ data: { ...item, state: 'UNDER_REVIEW', version: 1 } }), resolve: jest.fn() };
  renderPage(api);
  expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
  const fields = screen.getAllByRole('textbox');
  fireEvent.change(fields[0], { target: { value: 'Reviewed evidence' } });
  const submit = screen.getAllByRole('button').find(button => button.type === 'submit');
  fireEvent.click(submit);
  await waitFor(() => expect(api.review).toHaveBeenCalledWith(expect.objectContaining({ complaintId: 'case-1', expectedVersion: 0, summary: 'Reviewed evidence' })));
});

test('Staff list renders empty server state without exposing customer media URLs', async () => {
  const api = { list: jest.fn().mockResolvedValue({ data: { items: [] } }), get: jest.fn() };
  render(<SessionProvider adapter={adapter}><MemoryRouter><ComplaintManagementPage api={api} complaintId={undefined} /></MemoryRouter></SessionProvider>);
  expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
  expect(await screen.findByText(/Ch.*c.*complaint/)).toBeVisible();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
