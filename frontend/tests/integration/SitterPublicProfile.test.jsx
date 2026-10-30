import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SitterPublicProfilePage } from '../../src/pages/sitter/SitterPublicProfilePage.jsx';
import { SitterProfileReviewsPage } from '../../src/pages/staff/SitterProfileReviewsPage.jsx';

test('sitter sends a separate public bio and retries an uncertain submission using its original key', async () => {
  const calls = [];
  const api = { own: async () => ({ profile: null }), submit: async (...args) => {
    calls.push(args);
    if (calls.length === 1) throw { code: 'TIMEOUT' };
    return { ...args[0], state: 'SUBMITTED', version: 1 };
  } };
  render(<SitterPublicProfilePage api={api} />);
  fireEvent.change(await screen.findByLabelText('Giới thiệu'), { target: { value: 'Public synthetic bio' } });
  fireEvent.change(screen.getByLabelText('Khu vực phục vụ'), { target: { value: 'HN-01\nHN-02' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
  await screen.findByText('Đã gửi hồ sơ chờ duyệt.');
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0][0]).toEqual({ bio: 'Public synthetic bio', areas: ['HN-01', 'HN-02'], expectedVersion: 0 });
});

test('review queue has empty/error states and sends versioned reviewer decision', async () => {
  const review = jest.fn(async () => { throw { code: 'VERSION_CONFLICT' }; });
  const api = { list: async () => ({ items: [{ userId: 'a'.repeat(24), bio: 'Synthetic submitted bio', areas: ['HN-01'], version: 3 }], nextCursor: null }), review };
  const { unmount } = render(<SitterProfileReviewsPage api={api} />);
  fireEvent.change(await screen.findByLabelText('Lý do'), { target: { value: 'Reviewed content' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu quyết định' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('VERSION_CONFLICT');
  expect(review).toHaveBeenCalledWith('a'.repeat(24), { reason: 'Reviewed content', decision: 'APPROVE', expectedVersion: 3 }, expect.any(String));
  unmount();
  render(<SitterProfileReviewsPage api={{ list: async () => ({ items: [], nextCursor: null }) }} />);
  await waitFor(() => expect(screen.getByText('Không có hồ sơ chờ duyệt.')).toBeInTheDocument());
});
