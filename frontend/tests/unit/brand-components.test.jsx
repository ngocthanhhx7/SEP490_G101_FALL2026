import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button, Input, Select, Notice, BrandLogo, BrandIcon } from '../../src/components/ui/index.js';

test('button is non-submitting by default and loading/disabled suppress clicks', () => {
  const click = jest.fn(); const { rerender } = render(<Button onClick={click}>Tiếp tục</Button>);
  const button = screen.getByRole('button'); expect(button).toHaveAttribute('type', 'button');
  fireEvent.click(button); expect(click).toHaveBeenCalledTimes(1);
  rerender(<Button onClick={click} loading loadingLabel="Đang gửi…">Tiếp tục</Button>);
  expect(button).toBeDisabled(); expect(button).toHaveAttribute('aria-busy', 'true');
  expect(button).toHaveTextContent('Đang gửi…'); fireEvent.click(button); expect(click).toHaveBeenCalledTimes(1);
  rerender(<Button onClick={click} disabled>Tiếp tục</Button>);
  fireEvent.click(button); expect(click).toHaveBeenCalledTimes(1);
});

test('explicit submit and icon-only accessible name', () => {
  render(<Button type="submit" aria-label="Tải lại"><BrandIcon name="refresh" /></Button>);
  expect(screen.getByRole('button', { name: 'Tải lại' })).toHaveAttribute('type', 'submit');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('input connects label, hint, external description and error; clearing error removes stale IDs', () => {
  const { rerender } = render(<><p id="extra">Mô tả ngoài</p><Input label="Tên" hint="Tên tổng hợp"
    error="Tên là bắt buộc" aria-describedby="extra" required /></>);
  const input = screen.getByLabelText('Tên', { exact: false }); expect(input).toBeRequired(); expect(input).toBeInvalid();
  expect(input).toHaveAccessibleDescription('Mô tả ngoài Tên tổng hợp Tên là bắt buộc');
  rerender(<Input label="Tên" />); expect(screen.getByLabelText('Tên')).not.toHaveAttribute('aria-invalid');
  expect(screen.getByLabelText('Tên')).not.toHaveAttribute('aria-describedby');
});

test('field IDs do not collide and explicit ID is respected', () => {
  render(<><Input label="Tên A" /><Input label="Tên B" /><Select label="Loài" id="species"><option>Chó</option></Select></>);
  expect(screen.getByLabelText('Tên A').id).not.toBe(screen.getByLabelText('Tên B').id);
  expect(screen.getByLabelText('Loài').id).toBe('species');
});

test('native form changes retain values and select required semantics', () => {
  function Form() { const [value, setValue] = useState(''); return <>
    <Input label="Tên" value={value} onChange={(event) => setValue(event.target.value)} />
    <Select label="Loài" defaultValue="" required error="Hãy chọn loài"><option value="">Chọn loài</option><option value="CAT">Mèo</option></Select></>; }
  render(<Form />); fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'Mèo mẫu' } });
  expect(screen.getByLabelText('Tên')).toHaveValue('Mèo mẫu');
  const select = screen.getByRole('combobox'); expect(select).toBeRequired(); expect(select).toBeInvalid();
  fireEvent.change(select, { target: { value: 'CAT' } }); expect(select).toHaveValue('CAT');
});

test('disabled and read-only fields retain native semantics', () => {
  render(<><Input label="Khóa" disabled /><Input label="Chỉ đọc" readOnly defaultValue="Mẫu" />
    <Select label="Chưa sẵn sàng" disabled><option>Chó</option></Select></>);
  expect(screen.getByLabelText('Khóa')).toBeDisabled(); expect(screen.getByLabelText('Chỉ đọc')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Chưa sẵn sàng')).toBeDisabled();
});

test.each(['loading', 'empty', 'pending', 'success', 'info', 'warning', 'error', 'forbidden'])
('notice %s exposes text and correct live-region urgency', (state) => {
  render(<Notice state={state} title="Trạng thái mẫu">Không phải xác nhận máy chủ</Notice>);
  const role = ['error', 'forbidden'].includes(state) ? 'alert' : 'status';
  expect(screen.getByRole(role)).toHaveAccessibleName('Trạng thái mẫu');
  expect(screen.getByRole(role)).toHaveTextContent('Không phải xác nhận máy chủ');
});

test('empty notice action works', () => {
  const action = jest.fn(); render(<Notice state="empty" title="Chưa có dữ liệu" action={<Button onClick={action}>Thử lại</Button>} />);
  fireEvent.click(screen.getByRole('button')); expect(action).toHaveBeenCalledTimes(1);
});

test('logo/icon use current paths and accessible meaning', () => {
  const { rerender } = render(<BrandLogo />); expect(screen.getByRole('img')).toHaveAttribute('src', '/assets/logo/ngang.svg');
  rerender(<BrandLogo orientation="vertical" />); expect(screen.getByRole('img')).toHaveAttribute('src', '/assets/logo/doc.svg');
  rerender(<BrandIcon name="arrowRight" label="Tiếp tục" />);
  expect(screen.getByRole('img', { name: 'Tiếp tục' })).toHaveAttribute('src', '/assets/icon/arrow/arrow-right.svg');
});
