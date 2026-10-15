import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VisitHandoverPage } from '../../src/pages/customer/VisitHandoverPage.jsx';

const visitId = '507f1f77bcf86cd799439011';
const replacementSitterId = '507f1f77bcf86cd799439012';

function renderAt(element) {
  return render(<MemoryRouter initialEntries={[`/visits/${visitId}/handover`]}>
    <Routes><Route path="/visits/:visitId/handover" element={element} /></Routes>
  </MemoryRouter>);
}

test('submits replacement handover with the server-owned version gates', async () => {
  const api = {
    getHandover: jest.fn().mockResolvedValue({ data: { visitId, state: 'REQUIRED', replacementSitterId: null }, status: 200 }),
    confirmHandover: jest.fn().mockResolvedValue({ data: { visitId, state: 'CONFIRMED', replacementSitterId, instructionVersion: 2, accessGranted: true }, status: 200 }),
  };
  renderAt(<VisitHandoverPage api={api} visitVersion={7} instructionVersion={2} />);
  const input = await screen.findByLabelText(/Mã Sitter thay thế/);
  fireEvent.change(input, { target: { value: replacementSitterId } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận bàn giao' }));
  await waitFor(() => expect(api.confirmHandover).toHaveBeenCalledWith(expect.objectContaining({
    visitId, replacementSitterId, expectedVersion: 7, instructionVersion: 2,
  })));
});
