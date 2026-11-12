import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DispatchSitterPicker } from '../../src/pages/staff/DispatchSitterPicker.jsx';
const id = 'a'.repeat(24), blocked = 'b'.repeat(24);
const row = { id: 'c'.repeat(24), startAt: '2026-11-10T02:39:00Z', version: 3 };
function fixture(items = [{ sitterId: id, displayName: 'Sitter mới' }]) {
  const api = { candidates: jest.fn().mockResolvedValue({ data: { items, blocked: [{ sitterId: blocked, displayName: 'Cần xác minh', reason: 'SERVICE_CAPABILITY_REQUIRED' }] } }), invite: jest.fn().mockResolvedValue({ data: {} }) };
  const command = { execute: jest.fn(fn => fn('stable-operation-key')) };
  render(<MemoryRouter initialEntries={['/admin/dispatch']}><DispatchSitterPicker row={row} api={api} command={command} /></MemoryRouter>);
  return { api, command };
}
test('shows a newcomer, explains blocked profiles and sends an invitation only after selection', async () => {
  const { api } = fixture();
  const invite = screen.getByRole('button', { name: 'Gửi lời mời cho người đã chọn' }); expect(invite).toBeDisabled();
  fireEvent.click(await screen.findByRole('radio', { name: /Sitter mới/ }));
  expect(api.candidates).toHaveBeenCalledWith(row.id, { startAt: row.startAt, mode: 'MANUAL' });
  expect(screen.getByText('Chưa có năng lực dịch vụ đã xác minh')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Mở hồ sơ để xử lý' })).toHaveAttribute('href', '/admin/sitters/' + blocked + '?tab=capability');
  fireEvent.click(invite); await waitFor(() => expect(api.invite).toHaveBeenCalledWith(row.id, row.version, 'stable-operation-key', id));
});
test('empty eligible pool keeps invitation disabled and offers a management action', async () => {
  fixture([]); await screen.findByText(/Chưa thể gửi lời mời/);
  expect(screen.getByRole('button', { name: 'Gửi lời mời cho người đã chọn' })).toBeDisabled();
});

test('a replacement sends a customer proposal and never directly invites the alternate sitter', async () => {
  const api = { candidates: jest.fn().mockResolvedValue({ data: { items: [{ sitterId: id, displayName: 'Người thay thế' }] } }),
    propose: jest.fn().mockResolvedValue({ data: { id: 'proposal' } }), invite: jest.fn() };
  const command = { execute: jest.fn(fn => fn('replacement-operation-key')) }, onProposed = jest.fn();
  render(<MemoryRouter><DispatchSitterPicker row={{ ...row, requestedSitterId: blocked }} api={api} command={command} onProposed={onProposed} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('radio', { name: /Người thay thế/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất đổi người cho khách' }));
  await waitFor(() => expect(api.propose).toHaveBeenCalledWith(row.id,
    { expectedVersion: row.version, startAt: row.startAt, sitterId: id }, 'replacement-operation-key'));
  expect(api.invite).not.toHaveBeenCalled();
  expect(onProposed).toHaveBeenCalledWith({ id: 'proposal' });
});
