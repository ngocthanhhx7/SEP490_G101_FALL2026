import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VisitCareInstructionsPage } from '../../src/pages/customer/VisitCareInstructionsPage.jsx';

const visitId = '507f1f77bcf86cd799439011';
const care = { visitId, version: 2, updatedAt: '2026-10-14T02:00:00.000Z', instructions: { allergies: 'Không dùng cá', accessNotes: 'Cổng bên hông' }, history: [], accessWindow: { open: false }, acknowledged: false };
function renderAt(element) { return render(<MemoryRouter initialEntries={[`/visits/${visitId}/care`]}><Routes><Route path="/visits/:visitId/care" element={element} /></Routes></MemoryRouter>); }

test('Customer page shows versioned JSON and does not report save before acknowledgement', async () => {
  const api = { getInstructions: jest.fn().mockResolvedValue({ data: care, status: 200 }), updateInstructions: jest.fn().mockResolvedValue({ pending: true, status: 202 }) };
  renderAt(<VisitCareInstructionsPage api={api} />);
  expect(await screen.findByText(/PHIÊN BẢN 2/)).toBeVisible();
  await waitFor(() => expect(screen.getByDisplayValue(/Không dùng cá/)).toBeVisible());
});\n