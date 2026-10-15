import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StaffRefundsPage } from '../../src/pages/staff/refunds/StaffRefundsPage.jsx';
import { describe, expect, jest, test } from '@jest/globals';

describe('StaffRefundsPage', () => {
  test('does not allow a customer role to access proposal controls', () => {
    render(<StaffRefundsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Chỉ Staff được phân quyền');
    expect(screen.queryByRole('button', { name: 'Gửi đề xuất' })).not.toBeInTheDocument();
  });

  test('sends an integer VND proposal with an idempotency key and clarifies it is not Paid', async () => {
    const api = { propose: jest.fn(async () => ({ data: { status: 'PROPOSED' } })) };
    render(<StaffRefundsPage canPropose api={api} createIdempotencyKey={() => 'staff-key-0001'} />);
    fireEvent.change(screen.getByLabelText(/^Mã hồ sơ/), { target: { value: 'booking-1' } });
    fireEvent.change(screen.getByLabelText(/^Số tiền đề xuất \(VND\)/), { target: { value: '25000' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Hủy dịch vụ theo yêu cầu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));
    await waitFor(() => expect(api.propose).toHaveBeenCalledWith({
      sourceRef: { type: 'CANCELLATION', id: 'booking-1' }, amountVnd: 25000,
      reason: 'Hủy dịch vụ theo yêu cầu'
    }, { idempotencyKey: 'staff-key-0001' }));
    expect(await screen.findByText(/chưa phải xác nhận đã hoàn tiền/i)).toBeInTheDocument();
  });

  test('surfaces open financial decision IDs returned by the server', async () => {
    const api = { propose: jest.fn(async () => {
      throw { code: 'DECISION_REQUIRED', decisionIds: ['FIN-02-ROUND'] };
    }) };
    render(<StaffRefundsPage canPropose api={api} createIdempotencyKey={() => 'staff-key-0002'} />);
    fireEvent.change(screen.getByLabelText(/^Mã hồ sơ/), { target: { value: 'booking-1' } });
    fireEvent.change(screen.getByLabelText(/^Số tiền đề xuất \(VND\)/), { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Yêu cầu điều chỉnh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));
    expect(await screen.findByText(/FIN-02-ROUND/)).toBeInTheDocument();
  });

  test('fails closed while the API integration is pending', () => {
    render(<StaffRefundsPage canPropose />);
    expect(screen.getByText(/Biểu mẫu chưa nối với API hoàn tiền/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi đề xuất' })).toBeDisabled();
  });
});
