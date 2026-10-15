import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { PublicHeader } from '../../src/components/public/PublicHeader.jsx';
import { PublicFooter } from '../../src/components/public/PublicFooter.jsx';
const guest = { resolve: async () => ({ status: 'guest' }) };
function Destination() { const location = useLocation(); return <p>{location.pathname + location.search}</p>; }
function show(element, adapter = guest) {
  return render(<MemoryRouter><SessionProvider adapter={adapter}><Routes>
    <Route path="/" element={element} /><Route path="/services" element={<Destination />} />
  </Routes></SessionProvider></MemoryRouter>);
}
test('guest header follows the five Figma links and offers login/register without an avatar', async () => {
  show(<PublicHeader />);
  expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/sign-in');
  expect(screen.getByRole('link', { name: 'Đăng ký' })).toHaveAttribute('href', '/register');
  expect(screen.getByRole('link', { name: 'Dịch vụ', exact: true })).toHaveAttribute('href', '/services');
  expect(screen.queryByRole('link', { name: 'Sản phẩm', exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Câu truyện' })).toHaveAttribute('href', '/#stories');
  expect(screen.getByRole('link', { name: 'Về chúng tôi' })).toHaveAttribute('href', '/about');
  expect(screen.queryByRole('button', { name: 'Tài khoản' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mở menu' }));
  expect(screen.getByRole('button', { name: 'Đóng menu' })).toHaveAttribute('aria-expanded', 'true');
});
test('search submits the visitor query to the service catalog URL', () => {
  show(<PublicHeader />);
  fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm dịch vụ' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'dắt chó' } });
  fireEvent.submit(screen.getByRole('search'));
  expect(screen.getByText('/services?q=' + encodeURIComponent('dắt chó'))).toBeVisible();
});
test('signed-in header reuses the hover/pinned account menu and hides guest actions', async () => {
  const logout = jest.fn(async () => {});
  show(<PublicHeader />, { resolve: async () => ({ status: 'authenticated', user: { displayName: 'Synthetic Customer', roles: ['CUSTOMER'] } }), logout });
  const trigger = await screen.findByRole('button', { name: 'Tài khoản của Synthetic Customer' });
  expect(screen.queryByRole('link', { name: 'Đăng nhập', exact: true })).not.toBeInTheDocument();
  fireEvent.pointerEnter(trigger.closest('.pwc-avatar-menu'), { pointerType: 'mouse' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(trigger); fireEvent.pointerLeave(trigger.closest('.pwc-avatar-menu'), { pointerType: 'mouse' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
  expect(logout).toHaveBeenCalledTimes(1);
});
test('footer replaces newsletter signup with real policy page links', () => {
  show(<PublicFooter />);
  expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/policies/privacy');
  expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/policies/terms');
  expect(screen.getByRole('link', { name: 'Tất cả chính sách dịch vụ' })).toHaveAttribute('href', '/policies');
  expect(screen.getByRole('link', { name: 'Điều khoản sử dụng' })).toHaveAttribute('href', '/policies/terms');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
