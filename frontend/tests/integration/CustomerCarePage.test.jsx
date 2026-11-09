import { beforeAll } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerCarePage } from '../../src/pages/customer/CustomerCarePage.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

jest.mock('../../src/components/common/VietmapView.jsx', () => ({ VietmapView: ({ onSelect }) => <button type="button" onClick={() => onSelect([105.85, 21.03])}>Synthetic map pin</button> }));
beforeAll(() => { window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); }; });
const session = { resolve: async () => ({ status: 'authenticated', user: { id: 'a'.repeat(24), roles: ['CUSTOMER'] } }) };
const catalog = { items: [], breeds: [{ code: 'dog-test', species: 'DOG', name: 'Synthetic dog' }, { code: 'cat-test', species: 'CAT', name: 'Synthetic cat' }], traits: [], workAreas: [{ code: 'HN-TEST', label: 'Synthetic Hanoi area' }] };
const setup = (kind = 'pets', failure) => {
  const api = { load: jest.fn(async () => ({ data: catalog })), save: jest.fn().mockImplementationOnce(failure ? async () => { throw failure; } : async () => ({ data: { id: 'b'.repeat(24), version: 0 } })).mockResolvedValue({ data: { id: 'b'.repeat(24), version: 0 } }),
    searchAddress: jest.fn(async () => ({ data: { provider: 'VIETMAP', items: [{ label: 'Synthetic address', coordinates: [105.85, 21.03] }] } })), resolveAddress: jest.fn() };
  render(<MemoryRouter><SessionProvider adapter={session}><CustomerCarePage kind={kind} api={api} /></SessionProvider></MemoryRouter>);
  return api;
};

test('collects breed, weight, explicit unknown health and care information; retries with the same command', async () => {
  const api = setup('pets', { code: 'NETWORK_ERROR' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Thêm thú cưng' })).toBeEnabled());
  fireEvent.click(await screen.findByRole('button', { name: 'Thêm thú cưng' }));
  fireEvent.change(screen.getByLabelText('Tên thú cưng', { exact: false }), { target: { value: 'Synthetic companion' } });
  fireEvent.change(screen.getByLabelText('Giống', { exact: false }), { target: { value: 'dog-test' } });
  fireEvent.change(screen.getByLabelText('Cân nặng gần nhất (kg)', { exact: false }), { target: { value: '4.2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sức khỏe', exact: true }));
  fireEvent.change(screen.getByLabelText('Tình trạng thông tin: Dị ứng'), { target: { value: 'UNKNOWN' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Lưu thú cưng' }).closest('form'));
  await screen.findByText('Chưa xác định kết quả lưu');
  expect(screen.getByRole('button', { name: 'Lưu thú cưng' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại cùng yêu cầu' }));
  await screen.findByRole('heading', { name: 'Đã lưu thú cưng.' });
  expect(api.save).toHaveBeenCalledTimes(2);
  expect(api.save.mock.calls[0]).toEqual(api.save.mock.calls[1]);
  expect(api.save.mock.calls[0][2]).toMatchObject({ weightKg: 4.2, breedCode: 'dog-test', careNeedsConfirmed: false, careProfile: { allergies: { status: 'UNKNOWN' } } });
});

test('address search and map selection reset confirmation and save one shared confirmed address', async () => {
  const api = setup('addresses');
  fireEvent.click(await screen.findByRole('button', { name: 'Thêm địa chỉ' }));
  fireEvent.change(screen.getByLabelText('Tìm địa chỉ'), { target: { value: 'Synthetic' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tìm địa chỉ' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Synthetic address' }));
  expect(screen.getByLabelText(/Địa chỉ đầy đủ/)).toHaveValue('Synthetic address');
  const confirmation = screen.getByRole('checkbox', { name: /Tôi xác nhận địa chỉ/ });
  fireEvent.click(confirmation); expect(confirmation).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Synthetic map pin' })); expect(confirmation).not.toBeChecked();
  fireEvent.change(screen.getByLabelText(/Tên gợi nhớ/), { target: { value: 'Synthetic home' } });
  fireEvent.change(screen.getByLabelText(/Khu vực phục vụ/), { target: { value: 'HN-TEST' } });
  fireEvent.click(confirmation);
  fireEvent.submit(screen.getByRole('button', { name: 'Lưu địa chỉ' }).closest('form'));
  await waitFor(() => expect(api.save).toHaveBeenCalledWith('addresses', undefined, expect.objectContaining({ coordinates: [105.85, 21.03], pointConfirmed: true, areaCode: 'HN-TEST' }), expect.any(String)));
});

test('unavailable care source does not become an empty list and prevents creation', async () => {
  const api = { load: jest.fn().mockRejectedValue({ code: 'NETWORK_ERROR' }) };
  render(<MemoryRouter><SessionProvider adapter={session}><CustomerCarePage api={api} /></SessionProvider></MemoryRouter>);
  expect(await screen.findByText('Chưa tải được thú cưng')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Thêm thú cưng' })).toBeDisabled();
  expect(screen.queryByText('Chưa có thú cưng')).not.toBeInTheDocument();
});


test('mounted pet list links to the owned avatar workspace',async()=>{
  const pet={id:'b'.repeat(24),name:'Mây',species:'DOG',breedCode:'dog-test',weightKg:5,version:0};
  const api={load:jest.fn().mockResolvedValue({data:{...catalog,items:[pet]}})};
  render(<MemoryRouter><SessionProvider adapter={session}><CustomerCarePage api={api}/></SessionProvider></MemoryRouter>);
  expect(await screen.findByRole('link',{name:/Ảnh và hồ sơ Mây/})).toHaveAttribute('href','/account/pets/'+pet.id);
  expect(screen.queryByRole('form', { name: 'Hồ sơ thú cưng' })).not.toBeInTheDocument();
});


test('editing uses a focused dialog and refuses to discard a changed draft silently', async()=>{
  const api=setup(); await waitFor(()=>expect(screen.getByRole('button',{name:'Thêm thú cưng'})).toBeEnabled()); fireEvent.click(screen.getByRole('button',{name:'Thêm thú cưng'}));
  fireEvent.change(screen.getByLabelText('Tên thú cưng',{exact:false}),{target:{value:'Mây mới'}});
  fireEvent.click(screen.getByRole('button',{name:'Hủy'})); expect(screen.getByRole('dialog',{name:'Bỏ thay đổi chưa lưu?'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Tiếp tục chỉnh sửa'})); expect(screen.getByLabelText('Tên thú cưng',{exact:false})).toHaveValue('Mây mới'); expect(api.save).not.toHaveBeenCalled();
});


test('a malformed successful create acknowledgement keeps the original command to avoid duplicate pets',async()=>{
  const api=setup('pets',{code:'INVALID_RESPONSE',status:200});await waitFor(()=>expect(screen.getByRole('button',{name:'Thêm thú cưng'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Thêm thú cưng'}));
  fireEvent.change(screen.getByLabelText('Tên thú cưng',{exact:false}),{target:{value:'Synthetic companion'}});
  fireEvent.change(screen.getByLabelText('Giống',{exact:false}),{target:{value:'dog-test'}});
  fireEvent.change(screen.getByLabelText('Cân nặng gần nhất (kg)',{exact:false}),{target:{value:'4.2'}});
  fireEvent.submit(screen.getByRole('form',{name:'Hồ sơ thú cưng'}));await screen.findByText('Chưa xác định kết quả lưu');
  fireEvent.click(screen.getByRole('button',{name:'Kiểm tra lại cùng yêu cầu'}));await screen.findByRole('heading',{name:'Đã lưu thú cưng.'});
  expect(api.save.mock.calls[1]).toEqual(api.save.mock.calls[0]);
});


test('stale pet edits offer a confirmed reload instead of trapping the owner on the old version',async()=>{
  const pet={id:'b'.repeat(24),name:'Mây',species:'DOG',breedCode:'dog-test',weightKg:5,version:0};
  const api={load:jest.fn().mockResolvedValue({data:{...catalog,items:[pet]}}),save:jest.fn().mockRejectedValue({code:'VERSION_CONFLICT',status:409})};
  render(<MemoryRouter><SessionProvider adapter={session}><CustomerCarePage api={api}/></SessionProvider></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Sửa hồ sơ'}));
  fireEvent.change(screen.getByLabelText('Tên thú cưng',{exact:false}),{target:{value:'Mây mới'}});
  fireEvent.submit(screen.getByRole('form',{name:'Hồ sơ thú cưng'}));
  fireEvent.click(await screen.findByRole('button',{name:'Tải lại hồ sơ'}));
  expect(api.load).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'Tải lại và bỏ bản sửa'}));
  await waitFor(()=>expect(api.load).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('form',{name:'Hồ sơ thú cưng'})).not.toBeInTheDocument();
});


test('pet groups keep typed values and reveal the group containing an invalid field',async()=>{
  setup();await waitFor(()=>expect(screen.getByRole('button',{name:'Thêm thú cưng'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Thêm thú cưng'}));
  fireEvent.change(screen.getByLabelText('Tên thú cưng',{exact:false}),{target:{value:'Mây'}});
  fireEvent.click(screen.getByRole('button',{name:'Sức khỏe',exact:true}));
  expect(screen.getByLabelText('Tên thú cưng',{exact:false})).not.toBeVisible();
  fireEvent.change(screen.getByLabelText('Tình trạng thông tin: Dị ứng'),{target:{value:'KNOWN'}});
  const note=screen.getByLabelText('Chi tiết dị ứng');fireEvent.change(note,{target:{value:'Ghi chú mẫu'}});
  fireEvent.click(screen.getByRole('button',{name:'Cơ bản',exact:true}));
  expect(screen.getByLabelText('Tên thú cưng',{exact:false})).toHaveValue('Mây');
  fireEvent.invalid(note);
  await waitFor(()=>expect(note).toBeVisible());expect(note).toHaveValue('Ghi chú mẫu');
});


function setupOwnedProfile() {
  const pet={id:'b'.repeat(24),name:'Mây',species:'DOG',breedCode:'dog-test',weightKg:5,version:3,careNeedsConfirmed:true,
    careProfile:{feeding:{status:'KNOWN',value:'Ăn hạt mềm hai bữa; chủ nuôi đã cung cấp.'},allergies:{status:'UNKNOWN'},vaccination:{status:'NOT_PROVIDED'}}};
  const api={load:jest.fn().mockResolvedValue({data:{...catalog,items:[pet]}}),save:jest.fn()};
  render(<MemoryRouter initialEntries={['/account/pets/'+pet.id]}><SessionProvider adapter={session}><Routes><Route path="/account/pets/:petId" element={<CustomerCarePage api={api}/>}/></Routes></SessionProvider></MemoryRouter>);
  return api;
}

test('owned profile preserves customer notes and unknown health; contextual edit opens the health group',async()=>{
  const api=setupOwnedProfile();
  expect(await screen.findByRole('heading',{name:'Mây',level:1})).toBeVisible();
  expect(screen.getByText('Ăn hạt mềm hai bữa; chủ nuôi đã cung cấp.')).toBeVisible();
  expect(screen.getAllByText('Chưa biết').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Chưa cung cấp').length).toBeGreaterThan(0);
  expect(screen.queryByText('Khỏe mạnh')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Sửa sức khỏe và an toàn'}));
  expect(screen.getByLabelText('Tình trạng thông tin: Dị ứng')).toBeVisible();
  expect(screen.getByLabelText('Tình trạng thông tin: Dị ứng')).toHaveValue('UNKNOWN');
  expect(screen.getByLabelText('Tên thú cưng',{exact:false})).not.toBeVisible();
  expect(api.save).not.toHaveBeenCalled();
});

test('profile AI entry opens the existing consent and draft workflow without saving',async()=>{
  const api=setupOwnedProfile();
  fireEvent.click(await screen.findByRole('button',{name:'Đọc sổ bằng AI'}));
  expect(screen.getByText('Điền nhanh từ ảnh hoặc PDF sổ thú cưng').closest('details')).toHaveAttribute('open');
  expect(screen.getByLabelText('Tình trạng thông tin: Vaccine và ngày tiêm')).toBeVisible();
  expect(api.save).not.toHaveBeenCalled();
});
