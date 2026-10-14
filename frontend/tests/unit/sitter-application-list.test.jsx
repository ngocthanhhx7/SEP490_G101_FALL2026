import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MemoryRouter } from 'react-router-dom';
import { SitterApplicationsPage } from '../../src/pages/admin/SitterApplicationsPage.jsx';

describe('Admin sitter application list', () => {
  test('shows loading, empty and populated states without exposing an unmasked contact', async () => {
    const api = { list: jest.fn()
      .mockResolvedValueOnce({ data: { applications: [], nextCursor: null } })
      .mockResolvedValueOnce({ data: { applications: [{ id: 'application-id', displayName: 'Nguyễn Văn A',
        contact: { channel: 'EMAIL', maskedValue: 's•••@example.test' }, workAreas: ['Quận 1'],
        state: 'PENDING', createdAt: '2026-10-14T00:00:00.000Z' }], nextCursor: null } }) };
    const view = render(<MemoryRouter><SitterApplicationsPage api={api} /></MemoryRouter>);
    await screen.findByText('Không tìm thấy hồ sơ phù hợp bộ lọc.');
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới danh sách' }));
    await screen.findByRole('link', { name: 'Nguyễn Văn A' });
    expect(screen.getByText('s•••@example.test · Email')).toBeInTheDocument();
    expect(screen.queryByText('sitter@example.test')).not.toBeInTheDocument();
    view.unmount();
  });
});
