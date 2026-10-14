import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminRefundsPage } from '../../src/pages/admin/refunds/AdminRefundsPage.jsx';
import { describe, expect, jest, test } from '@jest/globals';

const proposal = {
  id: '0123456789abcdef01234567', sourceRef: { type: 'CANCELLATION', id: 'booking-1' },
  amountVnd: 25000, currency: 'VND', status: 'PROPOSED', version: 0,
  reason: 'Hủy dịch vụ theo yêu cầu', createdAt: '2026-10-14T10:00:00.000Z'
};

describe('AdminRefundsPage', () => {
  test('denies Staff access and presents an empty list distinctly', () => {
    const { rerender } = render(<AdminRefundsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Chỉ Admin');
    rerender(<AdminRefundsPage canReview loadState="success" refunds={[]} api={{}} integrationPending={false} />);
    expect(screen.getByText('Các yêu cầu hoàn tiền sẽ xuất hiện tại đây.')).toBeInTheDocument();
  });

  test('approval reserves funds and does not display Paid until transfer confirmation', async () => {
    const api = { decide: jest.fn(async (_id, command) => ({ data: { ...proposal,
      status: command.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', version: 1 } })) };
    render(<AdminRefundsPage canReview api={api} integrationPending={false} loadState="success" refunds={[proposal]}
      createIdempotencyKey={() => 'admin-key-0001'} />);
    expect(screen.getByText('25.000 ₫')).toBeInTheDocument();
    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Lý do quyết định'), { target: { value: 'Đã đối chiếu hạn mức' } });
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt và giữ khoản hoàn' }));
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith(proposal.id, {
      decision: 'APPROVE', reason: 'Đã đối chiếu hạn mức', expectedVersion: 0
    }, { idempotencyKey: 'admin-key-0001' }));
    expect(await screen.findByText('Đã duyệt · chưa chuyển')).toBeInTheDocument();
    expect(screen.getByText(/Chưa có xác nhận chuyển tiền/)).toBeInTheDocument();
  });

  test('records a manual transfer with Vietnam time and leaves unknown outcomes pending', async () => {
    const api = { recordTransfer: jest.fn(async (_id, command) => ({ data: { ...proposal,
      ...command, status: command.outcome === 'CONFIRMED' ? 'PAID' : 'TRANSFER_PENDING', version: 1 } })) };
    render(<AdminRefundsPage canReview api={api} integrationPending={false} loadState="success"
      refunds={[{ ...proposal, status: 'APPROVED', version: 1 }]}
      createIdempotencyKey={() => 'admin-key-0002'} />);
    fireEvent.change(screen.getByLabelText('Mã giao dịch'), { target: { value: 'bank-ref-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả đối soát' }));
    await waitFor(() => expect(api.recordTransfer).toHaveBeenCalledWith(proposal.id, {
      outcome: 'UNKNOWN', expectedVersion: 1, transferReference: 'bank-ref-1'
    }, { idempotencyKey: 'admin-key-0002' }));
    expect(await screen.findByRole('status', { name: 'Đang chờ đối soát' })).toBeInTheDocument();
    expect(screen.getByText(/Khoản giữ vẫn được bảo toàn/)).toBeInTheDocument();
  });

  test('requires exact transfer evidence fields before recording Paid', async () => {
    const api = { recordTransfer: jest.fn(async (_id, command) => ({ data: { ...proposal,
      ...command, status: 'PAID', version: 2 } })) };
    render(<AdminRefundsPage canReview api={api} integrationPending={false} loadState="success"
      refunds={[{ ...proposal, status: 'APPROVED', version: 1 }]}
      createIdempotencyKey={() => 'admin-key-0003'} />);
    fireEvent.change(screen.getByLabelText('Kết quả đối soát'), { target: { value: 'CONFIRMED' } });
    fireEvent.change(screen.getByLabelText('Số tiền chuyển (VND)'), { target: { value: '25000' } });
    fireEvent.change(screen.getByLabelText('Mã giao dịch'), { target: { value: 'bank-ref-2' } });
    fireEvent.change(screen.getByLabelText('Mã chứng từ'), { target: { value: 'receipt-2' } });
    fireEvent.change(screen.getByLabelText(/Thời điểm chuyển \(giờ Việt Nam\)/), { target: { value: '2026-10-14T17:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả đối soát' }));
    await waitFor(() => expect(api.recordTransfer).toHaveBeenCalledWith(proposal.id, {
      outcome: 'CONFIRMED', expectedVersion: 1, amountVnd: 25000, transferReference: 'bank-ref-2',
      evidenceReference: 'receipt-2', paidAt: '2026-10-14T10:00:00.000Z'
    }, { idempotencyKey: 'admin-key-0003' }));
    expect(await screen.findByText('Đã ghi nhận đã chuyển')).toBeInTheDocument();
  });
});
