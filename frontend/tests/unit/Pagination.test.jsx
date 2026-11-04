import { fireEvent, render, screen } from '@testing-library/react';
import { Pagination } from '../../src/components/ui/index.js';

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
