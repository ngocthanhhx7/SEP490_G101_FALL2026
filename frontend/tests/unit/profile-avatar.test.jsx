import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AvatarEditor, ProfileAvatar } from '../../src/components/common/ProfileAvatar.jsx';
let mockSession = { user: { id: 'a'.repeat(24) } };
jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: () => mockSession }));
afterEach(() => { mockSession = { user: { id: 'a'.repeat(24) } }; });
test('uncertain avatar upload locks selection and retries identical bytes/key/version before delete', async () => {
  const api = { get: jest.fn().mockResolvedValue({data:{version:0,present:false}}),
    save: jest.fn().mockRejectedValueOnce({code:'TIMEOUT'}).mockResolvedValueOnce({data:{version:1,present:true}}).mockResolvedValueOnce({data:{version:2,present:false}}) };
  render(<AvatarEditor api={api} />);
  const input=screen.getByLabelText('Chọn hoặc thay ảnh');
  await waitFor(()=>expect(input).not.toBeDisabled());
  const file=new globalThis.File(['synthetic-image'],'pet.png',{type:'image/png'});
  fireEvent.change(input,{target:{files:[file]}});
  const retry=await screen.findByRole('button',{name:'Thử lại cùng yêu cầu'});
  await waitFor(()=>expect(retry).not.toBeDisabled());fireEvent.click(retry);
  await screen.findByText('Đã lưu ảnh đại diện.');
  expect(api.save).toHaveBeenCalledTimes(2);
  expect(api.save.mock.calls[0][1]).toBe(api.save.mock.calls[1][1]);
  expect(api.save.mock.calls[0][1]).toMatchObject({file,version:0,remove:false});
  fireEvent.click(screen.getByRole('button',{name:'Xóa ảnh'}));await screen.findByText('Đã xóa ảnh đại diện.');
  expect(api.save.mock.calls[2][1]).toMatchObject({version:1,remove:true});
});
test('invalid file is rejected before upload and failed image falls back; changing identity clears old image',async()=>{
  const api={get:jest.fn().mockResolvedValue({data:{version:0,present:false}}),save:jest.fn()};
  const view=render(<><AvatarEditor api={api}/><ProfileAvatar label="Avatar kiểm thử" fallback="AB" /></>);
  const input=screen.getByLabelText('Chọn hoặc thay ảnh');await waitFor(()=>expect(input).not.toBeDisabled());
  fireEvent.change(input,{target:{files:[new globalThis.File(['bad'],'bad.pdf',{type:'application/pdf'})]}});
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.error(screen.getByRole('img',{name:'Avatar kiểm thử'}));expect(screen.getByText('AB')).toBeVisible();
  mockSession={user:{id:'b'.repeat(24)}};view.rerender(<ProfileAvatar label="Avatar kiểm thử" fallback="CD"/>);
  expect(screen.getByRole('img',{name:'Avatar kiểm thử'})).toHaveAttribute('src',expect.stringContaining('owner='+mockSession.user.id));
});
