import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AvatarMenu } from '../../src/components/common/AvatarMenu.jsx';

const user = { id: 'synthetic-user-1', displayName: 'Nguyễn An', roles: ['CUSTOMER'] };

function TestPage({ menuProps = {} }) {
  const location = useLocation();
  return <>
    <AvatarMenu user={user} role="CUSTOMER" {...menuProps} />
    <Link to="/another-page">Mở trang khác</Link>
    <p data-testid="current-path">{location.pathname}</p>
    <button type="button">Bên ngoài</button>
  </>;
}

function renderMenu(menuProps) {
  return render(<MemoryRouter initialEntries={['/customer']}>
    <Routes><Route path="*" element={<TestPage menuProps={menuProps} />} /></Routes>
  </MemoryRouter>);
}

test('hover opens the menu, pointer can enter its panel, and leaving closes it when unpinned', () => {
  const { container } = renderMenu();
  const root = container.querySelector('.pwc-avatar-menu');
  const trigger = screen.getByRole('button', { name: 'Tài khoản của Nguyễn An' });
  fireEvent.pointerEnter(root, { pointerType: 'mouse' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const panel = container.querySelector('.pwc-avatar-menu__panel');
  expect(root.contains(panel)).toBe(true);
  fireEvent.pointerEnter(panel, { pointerType: 'mouse' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('link', { name: 'Hồ sơ khách hàng' })).toBeVisible();
  fireEvent.pointerLeave(root, { pointerType: 'mouse' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('click pins across pointer leave and a second click unpins and closes', () => {
  const { container } = renderMenu();
  const root = container.querySelector('.pwc-avatar-menu');
  const trigger = screen.getByRole('button', { name: 'Tài khoản của Nguyễn An' });
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(root).toHaveAttribute('data-pinned', 'true');
  fireEvent.pointerLeave(root, { pointerType: 'mouse' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(root).toHaveAttribute('data-pinned', 'false');
});

test('keyboard focus opens the menu; Escape closes it and returns focus to the trigger', () => {
  renderMenu();
  const trigger = screen.getByRole('button', { name: 'Tài khoản của Nguyễn An' });
  fireEvent.focus(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
});

test('outside pointer input closes a pinned menu', () => {
  renderMenu();
  const trigger = screen.getByRole('button', { name: 'Tài khoản của Nguyễn An' });
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Bên ngoài' }));
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('route navigation closes the menu and uses the role-specific account label', () => {
  renderMenu();
  const trigger = screen.getByRole('button', { name: 'Tài khoản của Nguyễn An' });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('link', { name: 'Hồ sơ khách hàng' }));
  expect(screen.getByTestId('current-path')).toHaveTextContent('/account');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('touch tap pins the menu and a second tap closes it', () => {
  const { container } = renderMenu();
  const root = container.querySelector('.pwc-avatar-menu');
  const trigger = screen.getByRole('button', { name: 'Tài khoản của Nguyễn An' });
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.pointerLeave(root, { pointerType: 'touch' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('fallback initials come from the real display name and no fake image is rendered', () => {
  renderMenu();
  expect(screen.getByText('NA')).toBeVisible();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('logout closes before calling the session action; unavailable actions stay pending', async () => {
  const onLogout = jest.fn().mockResolvedValue(undefined);
  const { rerender } = render(<MemoryRouter><AvatarMenu user={user} role="ADMIN" onLogout={onLogout} /></MemoryRouter>);
  const trigger = screen.getByRole('button', { name: 'Tài khoản của Nguyễn An' });
  fireEvent.click(trigger);
  expect(screen.getByText('Quản trị viên')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
  expect(onLogout).toHaveBeenCalledTimes(1);
  expect(trigger).toHaveAttribute('aria-expanded', 'false');

  rerender(<MemoryRouter><AvatarMenu user={user} role="CUSTOMER" /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Tài khoản của Nguyễn An' }));
  expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeDisabled();
  expect(screen.getByText('Đăng xuất hiện chưa khả dụng.')).toBeVisible();
});

test('logout failure is reported safely after the menu has closed', async () => {
  const onLogout = jest.fn().mockRejectedValue(new Error('synthetic internal error'));
  render(<MemoryRouter><AvatarMenu user={user} role="CUSTOMER" onLogout={onLogout} /></MemoryRouter>);
  const trigger = screen.getByRole('button', { name: 'Tài khoản của Nguyễn An' });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể đăng xuất lúc này. Hãy thử lại.');
  expect(screen.queryByText('synthetic internal error')).not.toBeInTheDocument();
});
