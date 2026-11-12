import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, jest, test } from '@jest/globals';
import { MemoryRouter } from 'react-router-dom';
import { NotificationsPage as NotificationView } from '../../src/pages/notifications/NotificationsPage.jsx';
const NotificationsPage = props => <MemoryRouter><NotificationView {...props} /></MemoryRouter>;

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

describe('NotificationsPage mark all as read (UC-88)', () => {
  const second = { ...item, id: 'notice-2', title: 'Đơn hàng mới', createdAt: '2026-10-16T00:00:00.000Z' };
  const read = (row) => ({ ...row, readAt: '2026-10-17T00:00:00.000Z' });
  const page = (items, unreadCount) => ({ data: { items, unreadCount, nextCursor: null }, meta: {} });
  const link = () => screen.queryByRole('button', { name: 'Đánh dấu đã đọc tất cả' });

  test('UC-88 calls the API once, reloads from the server and clears the unread state', async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce(page([second, item], 2))
      .mockResolvedValue(page([read(second), read(item)], 0));
    const markAllRead = jest.fn(async () => ({ data: { status: 'READ', markedCount: 2 } }));
    const listener = jest.fn();
    window.addEventListener('pwc:notifications-changed', listener);
    render(<NotificationsPage api={{ list, markRead: jest.fn(), markAllRead }} />);
    expect(await screen.findByText('2 chưa đọc')).toBeInTheDocument();
    expect(screen.getAllByText('Mới')).toHaveLength(2);
    fireEvent.click(link());
    await waitFor(() => expect(screen.getByText('0 chưa đọc')).toBeInTheDocument());
    expect(markAllRead).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalled();
    window.removeEventListener('pwc:notifications-changed', listener);
    expect(screen.queryByText('Mới')).not.toBeInTheDocument();
    expect(link()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chưa đọc' }));
    expect(await screen.findByText('Chưa có thông báo')).toBeInTheDocument();
  });

  test('UC-88 shows the unread count the server returns when a notification arrived after the cutoff', async () => {
    const late = { ...second, id: 'notice-late', title: 'Đến sau mốc' };
    const list = jest
      .fn()
      .mockResolvedValueOnce(page([second, item], 2))
      .mockResolvedValue(page([late, read(second), read(item)], 1));
    render(<NotificationsPage api={{ list, markRead: jest.fn(), markAllRead: jest.fn(async () => ({ data: { markedCount: 2 } })) }} />);
    expect(await screen.findByText('2 chưa đọc')).toBeInTheDocument();
    fireEvent.click(link());
    expect(await screen.findByText('Đến sau mốc')).toBeInTheDocument();
    expect(screen.getByText('1 chưa đọc')).toBeInTheDocument();
    expect(screen.getAllByText('Mới')).toHaveLength(1);
    expect(link()).toBeInTheDocument();
  });

  test('UC-88 hides the link when nothing is unread', async () => {
    const markAllRead = jest.fn();
    render(<NotificationsPage api={{ list: async () => page([read(item)], 0), markRead: jest.fn(), markAllRead }} />);
    expect(await screen.findByText('Lịch sắp tới')).toBeInTheDocument();
    expect(link()).not.toBeInTheDocument();
  });

  test('UC-88 keeps the unread count and shows an error when the API fails', async () => {
    const list = jest.fn(async () => page([item], 1));
    render(<NotificationsPage api={{ list, markRead: jest.fn(), markAllRead: jest.fn(() => Promise.reject(new Error('Synthetic unavailable'))) }} />);
    expect(await screen.findByText('1 chưa đọc')).toBeInTheDocument();
    fireEvent.click(link());
    expect(await screen.findByText('Chưa đánh dấu được thông báo')).toBeInTheDocument();
    expect(screen.getByText('1 chưa đọc')).toBeInTheDocument();
    expect(screen.getByText('Mới')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(1);
    expect(link()).toBeEnabled();
  });

  test('uncertain retries keep their operation key and a confirmed new gesture gets a new key', async () => {
    const markAllRead = jest.fn().mockRejectedValueOnce(new Error('Lost response'))
      .mockResolvedValue({ data: { markedCount: 1 } });
    const list = jest.fn(async () => page([item], 1));
    render(<NotificationsPage api={{ list, markRead: jest.fn(), markAllRead }} />);
    await screen.findByText('1 chưa đọc');
    fireEvent.click(link());
    await screen.findByText('Chưa đánh dấu được thông báo');
    const firstKey = markAllRead.mock.calls[0][0];
    fireEvent.click(link());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(link()).toBeEnabled());
    expect(markAllRead.mock.calls[1][0]).toBe(firstKey);
    fireEvent.click(link());
    await waitFor(() => expect(markAllRead).toHaveBeenCalledTimes(3));
    expect(markAllRead.mock.calls[2][0]).not.toBe(firstKey);
  });
});
