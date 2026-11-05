import { fireEvent, render, screen } from '@testing-library/react';
import { Pagination, CursorPagination } from '../../src/components/ui/index.js';

const show = (props) => {
  const onPageChange = jest.fn();
  render(<Pagination limit={20} itemLabel="sản phẩm" onPageChange={onPageChange} {...props} />);
  return onPageChange;
};

test('says which rows are shown out of how many, with Trước disabled on the first page', () => {
  const onPageChange = show({ page: 1, total: 57 });
  expect(screen.getByText('Hiển thị 1–20 trên 57 sản phẩm')).toBeVisible();
  expect(screen.getByText('Trang 1/3')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
  expect(onPageChange).toHaveBeenCalledWith(2);
});

test('the last page shows the remaining rows and disables Sau', () => {
  const onPageChange = show({ page: 3, total: 57 });
  expect(screen.getByText('Hiển thị 41–57 trên 57 sản phẩm')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Trước' }));
  expect(onPageChange).toHaveBeenCalledWith(2);
});

test('one page needs neither button, and a disabled list blocks both', () => {
  show({ page: 1, total: 6 });
  expect(screen.getByText('Hiển thị 1–6 trên 6 sản phẩm')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
});

test('disabled blocks both buttons while a page is loading', () => {
  show({ page: 2, total: 57, disabled: true });
  expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
});

test('shows nothing for an empty list or an unusable page', () => {
  const { container } = render(<Pagination page={1} limit={20} total={0} onPageChange={() => {}} />);
  expect(container).toBeEmptyDOMElement();
  const { container: bad } = render(<Pagination page={0} limit={20} total={5} onPageChange={() => {}} />);
  expect(bad).toBeEmptyDOMElement();
});

test('Figma numbered controls jump to first/last and render bounded page choices with an ellipsis', () => {
  const onPageChange = show({ page: 2, total: 120 });
  expect(screen.getByRole('button', { name: 'Trang 2' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('…')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Trang 4' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Trang cuối' }));
  fireEvent.click(screen.getByRole('button', { name: 'Trang đầu' }));
  expect(onPageChange.mock.calls).toEqual([[6], [1]]);
});

test('cursor controls never invent an unknown last page and respect write/loading locks', () => {
  const previous = jest.fn(), next = jest.fn(), first = jest.fn();
  const { rerender } = render(<CursorPagination page={3} hasNext onFirst={first} onPrevious={previous} onNext={next} />);
  expect(screen.queryByRole('button', { name: 'Trang cuối' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Trước' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
  fireEvent.click(screen.getByRole('button', { name: 'Trang đầu' }));
  expect(previous).toHaveBeenCalledTimes(1); expect(next).toHaveBeenCalledTimes(1); expect(first).toHaveBeenCalledTimes(1);
  rerender(<CursorPagination page={3} hasNext previousDisabled nextDisabled onFirst={first} onPrevious={previous} onNext={next} />);
  expect(screen.getByRole('button', { name: 'Trang đầu' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
});

test('a list that shrinks beyond the current page still lets the user return to a valid page', () => {
  const onPageChange = show({ page: 9, total: 27 });
  expect(screen.getByText('Hiển thị 0–0 trên 27 sản phẩm')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Trước' }));
  fireEvent.click(screen.getByRole('button', { name: 'Trang đầu' }));
  expect(onPageChange.mock.calls).toEqual([[2], [1]]);
});
