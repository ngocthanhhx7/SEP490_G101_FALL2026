import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, jest, test } from '@jest/globals';
import { NotificationsPage } from '../../src/pages/notifications/NotificationsPage.jsx';

const item = {
  id: 'notice-1',
  title: 'Lịch sắp tới',
  message: 'Lịch chăm sóc sắp bắt đầu.',
  createdAt: '2026-10-15T00:00:00.000Z',
  readAt: null,
  deepLink: '/account/bookings/booking-1'
};

describe('NotificationsPage', () => {
  test('missing adapter remains pending instead of showing an empty inbox', async () => {
    render(<NotificationsPage />);
    expect(
      await screen.findByText('Đang chờ máy chủ xác nhận')
    ).toBeInTheDocument();
    expect(screen.queryByText('Chưa có thông báo')).not.toBeInTheDocument();
  });

  test.each(['pending', 'error'])(
    'keeps an item unread when markRead is %s',
    async (state) => {
      const markRead = jest.fn(() =>
        state === 'pending'
          ? Promise.resolve({ pending: true, status: 202 })
          : Promise.reject(new Error('Synthetic unavailable'))
      );
      render(
        <NotificationsPage
          api={{ list: async () => ({ data: [item], meta: {} }), markRead }}
        />
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Đánh dấu đã đọc' })
      );
      expect(
        await screen.findByText(
          state === 'pending'
            ? 'Đang chờ xác nhận đã đọc'
            : 'Chưa đánh dấu được thông báo'
        )
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Đánh dấu đã đọc' })
      ).toBeEnabled();
      expect(screen.getByText('Mới')).toBeInTheDocument();
    }
  );

  test('shows loading, safe notification content and marks an item read', async () => {
    let resolve;
    const list = jest.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const markRead = jest.fn(async () => ({ data: { status: 'READ' } }));
    render(<NotificationsPage api={{ list, markRead }} />);
    expect(screen.getByText('Đang tải thông báo')).toBeInTheDocument();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    resolve({ data: [item], meta: {} });
    await waitFor(() =>
      expect(screen.getByText('Lịch sắp tới')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc' }));
    await waitFor(() =>
      expect(markRead).toHaveBeenCalledWith(
        'notice-1',
        'notification-read:notice-1'
      )
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Đánh dấu đã đọc' })
      ).not.toBeInTheDocument()
    );
  });
});
