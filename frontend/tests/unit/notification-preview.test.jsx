import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider, useSession } from '../../src/contexts/SessionContext.jsx';
import { NotificationProvider } from '../../src/contexts/NotificationContext.jsx';
import { NotificationBell } from '../../src/components/common/NotificationBell.jsx';
import { NotificationToast } from '../../src/components/common/NotificationToast.jsx';

const old = { id: 'old', title: 'Lịch chăm sóc', message: 'Lịch đã được xác nhận', createdAt: '2026-10-30T08:00:00Z', readAt: null, deepLink: '/account/bookings' };
const fresh = { ...old, id: 'new', title: 'Lời mời mới', message: 'Bạn có lời mời nhận ca', createdAt: '2026-10-30T09:00:00Z' };
let items, count, originalFetch;
const adapter = { resolve: async () => ({ status: 'authenticated', user: { id: 'user-a', displayName: 'An', roles: ['STAFF'] } }), getCsrfToken: () => 'synthetic-csrf' };
function Logout() { const session = useSession(); return <button onClick={session.invalidate}>Hết phiên</button>; }
function mount(role = 'STAFF') {
 const sessionAdapter = role === 'STAFF' ? adapter : { ...adapter, resolve: async () => ({ status: 'authenticated', user: { id: 'user-a', displayName: 'An', roles: [role] } }) };
 return render(<MemoryRouter><SessionProvider adapter={sessionAdapter}><NotificationProvider>
   <NotificationBell /><NotificationToast /><Logout />
 </NotificationProvider></SessionProvider></MemoryRouter>);
}
const refresh = () => act(() => { window.dispatchEvent(new window.Event('pwc:notifications-changed')); });
beforeEach(() => {
 originalFetch = globalThis.fetch; items = [old]; count = 1;
 globalThis.fetch = jest.fn(async (_url, options) => ({ ok: true, status: 200,
   json: async () => ({ data: options.method === 'POST' ? { readAt: fresh.createdAt } : { items, unreadCount: count, nextCursor: null }, meta: { schemaVersion: 1 } }) }));
});
afterEach(() => { globalThis.fetch = originalFetch; jest.useRealTimers(); });

test.each(['ADMIN', 'STAFF', 'PET_SITTER', 'CUSTOMER'])('hover preview and red unread dot work for %s without initial toast', async role => {
 const { container } = mount(role);
 const bell = await screen.findByRole('button', { name: 'Thông báo, 1 chưa đọc' });
 expect(container.querySelector('.workspace-notification-bell > .pwc-notification-dot')).toBeInTheDocument();
 expect(screen.queryByText('Thông báo mới')).not.toBeInTheDocument();
 fireEvent.pointerEnter(bell, { pointerType: 'mouse' });
 expect(screen.getByRole('region', { name: 'Xem trước thông báo' })).toBeVisible();
 expect(screen.getByRole('link', { name: /Lịch chăm sóc/ })).toHaveAttribute('href', '/account/bookings');
 fireEvent.keyDown(document, { key: 'Escape' });
 expect(bell).toHaveAttribute('aria-expanded', 'false');
 expect(bell).toHaveFocus();
});

test('new unread record announces even when count is unchanged, refresh does not duplicate', async () => {
 mount(); await screen.findByRole('button', { name: 'Thông báo, 1 chưa đọc' });
 items = [fresh, { ...old, readAt: fresh.createdAt }]; refresh();
 expect(await screen.findByText('Thông báo mới')).toBeVisible();
 expect(screen.getByRole('link', { name: /Lời mời mới/ })).toBeVisible();
 fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' })); refresh();
 await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(3));
 expect(screen.queryByText('Thông báo mới')).not.toBeInTheDocument();
});

test('touch click opens, outside closes, ArrowDown focuses preview and receipt uses CSRF', async () => {
 mount(); const bell = await screen.findByRole('button', { name: 'Thông báo, 1 chưa đọc' });
 fireEvent.click(bell); expect(bell).toHaveAttribute('aria-expanded', 'true');
 fireEvent.pointerDown(document.body); expect(bell).toHaveAttribute('aria-expanded', 'false');
 fireEvent.keyDown(bell, { key: 'ArrowDown' });
 const link = await screen.findByRole('link', { name: /Lịch chăm sóc/ });
 await waitFor(() => expect(link).toHaveFocus());
 fireEvent.click(link);
 await waitFor(() => expect(globalThis.fetch.mock.calls.some(([url]) => url.endsWith('/old/read-receipts'))).toBe(true));
 const [, options] = globalThis.fetch.mock.calls.find(([url]) => url.endsWith('/old/read-receipts'));
 expect(options.headers.get('X-CSRF-Token')).toBe('synthetic-csrf');
 expect(options.headers.get('Idempotency-Key')).toBeTruthy();
});

test('click pins a hover-open preview and a second click closes it', async () => {
 mount(); const bell = await screen.findByRole('button', { name: 'Thông báo, 1 chưa đọc' });
 fireEvent.pointerEnter(bell, { pointerType: 'mouse' }); fireEvent.click(bell);
 expect(bell).toHaveAttribute('aria-expanded', 'true');
 expect(bell).toHaveAttribute('aria-pressed', 'true');
 fireEvent.click(bell); expect(bell).toHaveAttribute('aria-expanded', 'false');
});

test('failed polling offers retry and logout clears private preview and toast', async () => {
 mount(); const bell = await screen.findByRole('button', { name: 'Thông báo, 1 chưa đọc' });
 globalThis.fetch.mockRejectedValueOnce(new Error('offline')); refresh(); fireEvent.click(bell);
 expect(await screen.findByText('Không thể cập nhật thông báo.')).toBeVisible();
 fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
 await waitFor(() => expect(screen.queryByText('Không thể cập nhật thông báo.')).not.toBeInTheDocument());
 items = [fresh, old]; refresh(); await screen.findByText('Thông báo mới');
 fireEvent.click(screen.getByRole('button', { name: 'Hết phiên' }));
 expect(screen.queryByText('Thông báo mới')).not.toBeInTheDocument();
 expect(screen.queryByText(old.title)).not.toBeInTheDocument();
});

test('empty inbox and subsequently read entries do not create a toast or unread dot', async () => {
 items = []; count = 0; const { container } = mount();
 await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
 fireEvent.click(screen.getByRole('button', { name: 'Thông báo' }));
 expect(await screen.findByText('Chưa có thông báo.')).toBeVisible();
 items = [{ ...fresh, readAt: fresh.createdAt }]; refresh();
 await screen.findByText(fresh.title);
 expect(screen.queryByText('Thông báo mới')).not.toBeInTheDocument();
 expect(container.querySelector('.workspace-notification-bell > .pwc-notification-dot')).not.toBeInTheDocument();
});

test('failed receipt retry keeps its operation key and does not clear the unread dot', async () => {
 const { container } = mount(); const bell = await screen.findByRole('button', { name: 'Thông báo, 1 chưa đọc' });
 fireEvent.click(bell);
 globalThis.fetch.mockRejectedValueOnce(new Error('ack lost'));
 fireEvent.click(screen.getByRole('link', { name: /Lịch chăm sóc/ }));
 await waitFor(() => expect(globalThis.fetch.mock.calls.filter(([url]) => url.endsWith('/read-receipts'))).toHaveLength(1));
 await act(async () => {});
 fireEvent.click(bell);
 expect(await screen.findByText(/Chưa xác nhận đã đọc/)).toBeVisible();
 expect(container.querySelector('.workspace-notification-bell > .pwc-notification-dot')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('link', { name: /Lịch chăm sóc/ }));
 await waitFor(() => expect(globalThis.fetch.mock.calls.filter(([url]) => url.endsWith('/read-receipts'))).toHaveLength(2));
 const receipts = globalThis.fetch.mock.calls.filter(([url]) => url.endsWith('/read-receipts'));
 expect(receipts[0][1].headers.get('Idempotency-Key')).toBe(receipts[1][1].headers.get('Idempotency-Key'));
});

test('a refresh arriving during an in-flight read queues another snapshot', async () => {
 let resolve;
 const response = { ok: true, status: 200, json: async () => ({ data: { items: [old], unreadCount: 1 }, meta: { schemaVersion: 1 } }) };
 globalThis.fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
 mount(); await waitFor(() => expect(resolve).toBeDefined());
 refresh();
 items = [fresh, old];
 await act(async () => { resolve(response); });
 expect(await screen.findByText('Thông báo mới')).toBeVisible();
 expect(globalThis.fetch).toHaveBeenCalledTimes(2);
});

test('toast expires, pauses while focused, and polling skips a hidden document', async () => {
 jest.useFakeTimers();
 mount(); await screen.findByRole('button', { name: 'Thông báo, 1 chưa đọc' });
 const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(true);
 try {
   await act(async () => { jest.advanceTimersByTime(30001); });
   expect(globalThis.fetch).toHaveBeenCalledTimes(1);
   hidden.mockReturnValue(false); items = [fresh, old]; refresh();
   await act(async () => {});
   expect(screen.getByText('Thông báo mới')).toBeVisible();
   fireEvent.focus(screen.getByRole('button', { name: 'Đóng thông báo' }));
   await act(async () => { jest.advanceTimersByTime(9000); });
   expect(screen.getByText('Thông báo mới')).toBeVisible();
   fireEvent.blur(screen.getByRole('button', { name: 'Đóng thông báo' }), { relatedTarget: document.body });
   await act(async () => { jest.advanceTimersByTime(8001); });
   expect(screen.queryByText('Thông báo mới')).not.toBeInTheDocument();
 } finally { hidden.mockRestore(); }
});
