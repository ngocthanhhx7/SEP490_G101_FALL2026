import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SitterVisitCarePage } from '../../src/pages/sitter/SitterVisitCarePage.jsx';

const visitId = '507f1f77bcf86cd799439011';
const care = {
  visitId,
  version: 2,
  instructions: { allergies: 'Không dùng cá', accessNotes: 'Cổng bên hông' },
  accessWindow: { open: false },
  acknowledged: false,
};

function renderAt(element) {
  return render(<MemoryRouter initialEntries={[`/visits/${visitId}/care`]}>
    <Routes><Route path="/visits/:visitId/care" element={element} /></Routes>
  </MemoryRouter>);
}

test('requires acknowledgement and keeps private access notes unavailable before the window', async () => {
  const api = {
    getInstructions: jest.fn().mockResolvedValue({ data: care, status: 200 }),
    acknowledgeInstructions: jest.fn(),
    getAccessNotes: jest.fn(),
  };
  renderAt(<SitterVisitCarePage api={api} />);
  expect(await screen.findByRole('button', { name: 'Xem ghi chú khi được phép' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Xác nhận đã đọc' })).toBeEnabled();
  expect(screen.queryByText('Cổng bên hông')).not.toBeInTheDocument();
});
