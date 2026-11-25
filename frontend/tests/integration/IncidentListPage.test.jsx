import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IncidentListPage } from '../../src/pages/incidents/IncidentListPage.jsx';
import { createIncidentApi } from '../../src/services/incident-api.js';

test('omits cleared filters, follows the opaque cursor and displays a confirmed empty list', async () => {
  const send = jest.fn()
    .mockResolvedValueOnce({ data: { items: [{ id: 'case-1', state: 'OPEN', description: 'Kiểm tra cửa' }], nextCursor: 'cursor+next' } })
    .mockResolvedValueOnce({ data: { items: [], nextCursor: null } });
  render(<MemoryRouter><IncidentListPage api={createIncidentApi({ request: send })} /></MemoryRouter>);
  expect(await screen.findByText('Kiểm tra cửa')).toBeVisible();
  expect(send).toHaveBeenNthCalledWith(1, '/incidents', expect.any(Object));
  fireEvent.click(screen.getByRole('button', { name: 'Xem trang tiếp' }));
  await waitFor(() => expect(send).toHaveBeenNthCalledWith(2, '/incidents?cursor=cursor%2Bnext', expect.any(Object)));
  expect(await screen.findByText('Chưa có sự cố')).toBeVisible();
});
