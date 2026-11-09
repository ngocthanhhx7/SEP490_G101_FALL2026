import { beforeAll } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AvatarEditor, ProfileAvatar } from '../../src/components/common/ProfileAvatar.jsx';
let mockSession = { user: { id: 'a'.repeat(24) } };
jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: () => mockSession }));
beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => { let number = 0; URL.createObjectURL = jest.fn(() => `blob:synthetic-${++number}`); URL.revokeObjectURL = jest.fn(); });
afterEach(() => { mockSession = { user: { id: 'a'.repeat(24) } }; });
const content = () => new globalThis.Blob(['synthetic-normalized-image'], { type: 'image/jpeg' });
test('preview requires Save, uncertain upload retains identical bytes/key/version, removal requires confirmation', async () => {
  const api = { get: jest.fn().mockResolvedValue({data:{version:0,present:false}}), content: jest.fn().mockResolvedValue(content()),
    save: jest.fn().mockRejectedValueOnce({code:'TIMEOUT'}).mockResolvedValueOnce({data:{version:1,present:true}}).mockResolvedValueOnce({data:{version:2,present:false}}) };
  const prepareImage = jest.fn(async file => file);
  render(<AvatarEditor api={api} prepareImage={prepareImage} />);
  const input=screen.getByLabelText('Chọn hoặc thay ảnh'); await waitFor(()=>expect(input).not.toBeDisabled());
  const file=new globalThis.File(['synthetic-image'],'pet.png',{type:'image/png'}); fireEvent.change(input,{target:{files:[file]}});
  await screen.findByRole('img', { name: 'Xem trước ảnh đại diện' }); expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu ảnh' }));
  const retry=await screen.findByRole('button',{name:'Thử lại cùng yêu cầu'});
  await waitFor(()=>expect(retry).not.toBeDisabled()); expect(input).toBeDisabled(); fireEvent.click(retry);
  await screen.findByText('Đã lưu ảnh đại diện.'); expect(prepareImage).toHaveBeenCalledTimes(1);
  expect(api.save).toHaveBeenCalledTimes(2); expect(api.save.mock.calls[0][1]).toBe(api.save.mock.calls[1][1]);
  expect(api.save.mock.calls[0][1]).toMatchObject({file,version:0,remove:false});
  fireEvent.click(screen.getByRole('button',{name:'Xóa ảnh'})); expect(api.save).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button',{name:'Xác nhận xóa ảnh'})); await screen.findByText('Đã xóa ảnh đại diện.');
  expect(api.save.mock.calls[2][1]).toMatchObject({version:1,remove:true});
});
test('invalid file is rejected before upload; changing identity revokes the previous private URL',async()=>{
  const api={get:jest.fn().mockResolvedValue({data:{version:0,present:false}}),content:jest.fn().mockResolvedValue(content()),save:jest.fn()};
  const view=render(<AvatarEditor api={api}/>);
  const input=screen.getByLabelText('Chọn hoặc thay ảnh');await waitFor(()=>expect(input).not.toBeDisabled());
  fireEvent.change(input,{target:{files:[new globalThis.File(['bad'],'bad.pdf',{type:'application/pdf'})]}});
  await screen.findByText(/Chưa đọc được ảnh/); expect(api.save).not.toHaveBeenCalled();
  view.rerender(<ProfileAvatar label="Avatar kiểm thử" fallback="AB" api={api}/>);
  const image=await screen.findByRole('img',{name:'Avatar kiểm thử'}), oldUrl=image.getAttribute('src');
  mockSession={user:{id:'b'.repeat(24)}};view.rerender(<ProfileAvatar label="Avatar kiểm thử" fallback="CD" api={api}/>);
  expect(screen.queryByRole('img',{name:'Avatar kiểm thử'})).not.toBeInTheDocument();
  await screen.findByRole('img',{name:'Avatar kiểm thử'}); expect(URL.revokeObjectURL).toHaveBeenCalledWith(oldUrl);
});
test('late photo response from an earlier owner is discarded and cancel preview sends no mutation', async () => {
  let resolveOld; const api={content:jest.fn().mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValue(content())};
  const view=render(<ProfileAvatar api={api} label="Riêng tư"/>); await waitFor(()=>expect(api.content).toHaveBeenCalledTimes(1));
  mockSession={user:{id:'b'.repeat(24)}}; view.rerender(<ProfileAvatar api={api} label="Riêng tư"/>); await screen.findByRole('img',{name:'Riêng tư'});
  const count=URL.createObjectURL.mock.calls.length; await act(async()=>resolveOld(content())); expect(URL.createObjectURL).toHaveBeenCalledTimes(count);
});
test('canceling the chosen image keeps the stored photo and never saves', async()=>{
  const api={get:jest.fn().mockResolvedValue({data:{version:2,present:true}}),content:jest.fn().mockResolvedValue(content()),save:jest.fn()};
  render(<AvatarEditor api={api} prepareImage={async file=>file}/>); const input=screen.getByLabelText('Chọn hoặc thay ảnh'); await waitFor(()=>expect(input).not.toBeDisabled());
  fireEvent.change(input,{target:{files:[new globalThis.File(['image'],'selected.png',{type:'image/png'})]}}); await screen.findByRole('button',{name:'Lưu ảnh'});
  fireEvent.click(screen.getByRole('button',{name:'Hủy chọn'})); expect(screen.queryByRole('button',{name:'Lưu ảnh'})).not.toBeInTheDocument(); expect(api.save).not.toHaveBeenCalled();
});


test('successful HTTP with an invalid acknowledgement remains uncertain and retries the same photo command',async()=>{
  const api={get:jest.fn().mockResolvedValue({data:{version:0,present:false}}),content:jest.fn().mockRejectedValue({status:404}),
    save:jest.fn().mockRejectedValueOnce({code:'INVALID_RESPONSE',status:200}).mockResolvedValue({data:{version:1,present:true}})};
  render(<AvatarEditor api={api} prepareImage={async file=>file}/>);const input=screen.getByLabelText('Chọn hoặc thay ảnh');await waitFor(()=>expect(input).not.toBeDisabled());
  fireEvent.change(input,{target:{files:[new globalThis.File(['image'],'sample.png',{type:'image/png'})]}});fireEvent.click(await screen.findByRole('button',{name:'Lưu ảnh'}));
  fireEvent.click(await screen.findByRole('button',{name:'Thử lại cùng yêu cầu'}));await screen.findByText('Đã lưu ảnh đại diện.');
  expect(api.save.mock.calls[1][1]).toBe(api.save.mock.calls[0][1]);
});
