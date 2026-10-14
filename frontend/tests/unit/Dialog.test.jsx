// jsdom stubs native API only; browser checks validate real focus containment.
import { StrictMode, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from '../../src/components/ui/index.js';

const { HTMLDialogElement, Event } = window;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});

test('modal opens and closes via native API, labels connect', () => {
  const onClose = jest.fn(); const { rerender } = render(<Dialog open onClose={onClose} title="Hướng dẫn" description="Mẫu">Nội dung</Dialog>);
  const dialog = screen.getByRole('dialog', { name: 'Hướng dẫn' }); expect(dialog).toHaveAccessibleDescription('Mẫu');
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Đóng' })); expect(onClose).toHaveBeenCalledWith('button');
  rerender(<Dialog open={false} onClose={onClose} title="Hướng dẫn" />); expect(dialog).not.toHaveAttribute('open');
});

test('Escape requests close; dismissible=false blocks cancel', () => {
  const onClose = jest.fn(); const { rerender } = render(<Dialog open onClose={onClose} title="Xác nhận" intent="destructive" />);
  const dialog = screen.getByRole('alertdialog');
  expect(fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }))).toBe(false);
  expect(onClose).toHaveBeenCalledWith('escape'); onClose.mockClear();
  rerender(<Dialog open onClose={onClose} title="Xác nhận" dismissible={false} />);
  fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true })); expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('StrictMode stale close event must not dismiss reopened modal', () => {
  const onClose = jest.fn(); render(<StrictMode><Dialog open onClose={onClose} title="Mẫu" /></StrictMode>);
  const dialog = screen.getByRole('dialog'); fireEvent(dialog, new Event('close', { bubbles: true }));
  expect(dialog).toHaveAttribute('open'); expect(onClose).not.toHaveBeenCalled();
});

test('controlled dismissal has no duplicate native callback', () => {
  const close = jest.fn(); function Fixture() {
    const [open, setOpen] = useState(true);
    return <Dialog open={open} title="Mẫu" onClose={(reason) => { close(reason); setOpen(false); }} />;
  }
  render(<Fixture />); const dialog = screen.getByRole('dialog'); fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
  fireEvent(dialog, new Event('close', { bubbles: true })); expect(close).toHaveBeenCalledTimes(1);
  expect(dialog).not.toHaveAttribute('open');
});
