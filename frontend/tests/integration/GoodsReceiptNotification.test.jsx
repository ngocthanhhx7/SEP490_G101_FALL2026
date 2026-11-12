import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NotificationsPage } from '../../src/pages/notifications/NotificationsPage.jsx';
import { GoodsReceiptPage } from '../../src/pages/admin/GoodsReceiptPage.jsx';
import { notificationTarget } from '../../src/utils/notifications.js';

// MSG122 reaches the Admin through the notification screen that already exists (the list at /account/notifications and the
// bell). The link it carries opens the Goods Receipt page on that receipt.
const LINK = '/admin/goods-receipts?receipt=PN-0011';
const NOTICE = { id: 'n1', title: 'Hàng nhập bị từ chối', message: 'Phiếu nhập PN-0011: từ chối 2 Thức ăn hạt cho mèo. Lý do: Bao bì rách.',
  deepLink: LINK, readAt: null, createdAt: '2026-11-04T03:00:00.000Z' };
const receipt = { id: 'r11', code: 'PN-0011', supplierName: 'Công ty Minh An', receivedOn: '2026-11-04', recordedAt: '2026-11-04T03:00:00.000Z',
  totalReceived: 12, totalAccepted: 10, totalRejected: 2, supplierId: 's1', recorderName: 'Ngô Thu Hằng',
  lines: [{ productId: 'p14', productCode: 'SP-0014', productName: 'Thức ăn hạt cho mèo', quantityReceived: 12, quantityAccepted: 10, quantityRejected: 2, rejectReason: 'Bao bì rách' }] };

test('the link of a MSG122 notice is accepted as it is by the notification bell and list', () => {
  expect(notificationTarget(NOTICE)).toBe(LINK);
});

test('an Admin sees the notice in the list, and opening it shows that receipt on the Goods Receipt page and marks the notice read', async () => {
  const notifications = {
    list: jest.fn().mockResolvedValue({ data: { items: [NOTICE], unreadCount: 1 } }),
    markRead: jest.fn().mockResolvedValue({ data: { readAt: '2026-11-04T04:00:00.000Z' } })
  };
  const goodsReceipt = {
    listSuppliers: jest.fn().mockResolvedValue({ data: [] }),
    listProducts: jest.fn().mockResolvedValue({ data: [] }),
    listRecent: jest.fn().mockResolvedValue({ data: [receipt] }),
    readReceipt: jest.fn().mockResolvedValue(receipt),
    createReceipt: jest.fn()
  };
  render(<MemoryRouter initialEntries={['/account/notifications']}><Routes>
    <Route path="account/notifications" element={<NotificationsPage api={notifications} />} />
    <Route path="admin/goods-receipts" element={<GoodsReceiptPage api={goodsReceipt} recorderName="Ngô Thu Hằng" />} />
  </Routes></MemoryRouter>);

  expect(await screen.findByText('Hàng nhập bị từ chối')).toBeVisible();
  expect(screen.getByText(NOTICE.message)).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: /Hàng nhập bị từ chối/ }));

  expect(await screen.findByRole('heading', { level: 2, name: 'Phiếu nhập PN-0011' })).toBeVisible();
  expect(goodsReceipt.readReceipt).toHaveBeenCalledWith('PN-0011', expect.any(Object));
  expect(screen.getByText('Bao bì rách')).toBeVisible();
  await waitFor(() => expect(notifications.markRead).toHaveBeenCalledWith('n1', expect.any(String)));
});
