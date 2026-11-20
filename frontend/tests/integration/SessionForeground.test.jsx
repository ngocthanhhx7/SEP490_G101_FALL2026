import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { SessionProvider, useSession } from '../../src/contexts/SessionContext.jsx';

function Draft() {
  const [value, setValue] = useState('');
  const session = useSession();
  if (session.status !== 'authenticated') return <p>Phiên đã kết thúc</p>;
  return <><input aria-label="Bản nháp" value={value} onChange={event => setValue(event.target.value)} />
    <button onClick={session.revalidate}>Kiểm tra phiên</button>
    <output>{session.getCsrfToken() || 'Tạm khóa'}</output></>;
}

test('valid background check keeps a dirty form mounted and expiry removes it', async () => {
  const valid = { status: 'authenticated', user: { id: 'fixture', roles: ['CUSTOMER'] } };
  let finish;
  const adapter = { getCsrfToken: () => 'fixture-token', resolve: jest.fn().mockResolvedValueOnce(valid)
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ status: 'guest' }) };
  render(<SessionProvider adapter={adapter} foreground><Draft /></SessionProvider>);
  const input = await screen.findByRole('textbox', { name: 'Bản nháp' });
  fireEvent.change(input, { target: { value: 'Nội dung thử' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra phiên' }));
  expect(screen.getByText('Tạm khóa')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBe(input);
  await act(async () => finish(valid));
  expect(screen.getByRole('textbox')).toHaveValue('Nội dung thử');
  expect(screen.getByText('fixture-token')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra phiên' }));
  await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
});
