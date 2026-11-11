import { beforeAll, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { PetOnboardingWizard } from '../../src/pages/customer/PetOnboardingWizard.jsx';
import { newCustomerPet } from '../../src/utils/customer-pet-profile.js';
const id = 'b'.repeat(24);
const catalog = { breeds: [{code:'dog-test',species:'DOG',name:'Chó mẫu'}], traits: [{code:'SHY',species:['DOG'],label:'Cần làm quen chậm',explanation:'Cho bé thời gian làm quen.'}] };
const session = { resolve: async () => ({status:'authenticated',user:{id:'a'.repeat(24),roles:['CUSTOMER']}}) };
beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open',''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  URL.createObjectURL = jest.fn(() => 'blob:synthetic-photo'); URL.revokeObjectURL = jest.fn();
});
beforeEach(() => { URL.createObjectURL.mockClear(); URL.revokeObjectURL.mockClear(); });
function setup(overrides = {}) {
  const props = { api: {save:jest.fn().mockResolvedValue({data:{id,version:0}})}, photoApi:{get:jest.fn().mockResolvedValue({data:{version:0,present:false}}),save:jest.fn().mockResolvedValue({data:{version:1,present:true}})},
    onClose:jest.fn(),onSaved:jest.fn(),prepareImage:jest.fn(async file => file),...overrides };
  function Host() { const [draft,change] = useState(newCustomerPet()); return <PetOnboardingWizard {...props} draft={draft} change={change} catalog={catalog} />; }
  return { ...props, view:render(<MemoryRouter><SessionProvider adapter={session}><Host /></SessionProvider></MemoryRouter>) };
}
const next = () => fireEvent.click(screen.getByRole('button',{name:'Tiếp theo'}));
function identity() { fireEvent.change(screen.getByLabelText(/Tên thú cưng/),{target:{value:'Mây'}});fireEvent.click(screen.getByRole('button',{name:'Bé gái'}));next(); }
function restToHealth() {
  fireEvent.change(screen.getByLabelText(/Giống/),{target:{value:'dog-test'}}); next();
  fireEvent.change(screen.getByLabelText(/Cân nặng/),{target:{value:'4.5'}});next();
  fireEvent.click(screen.getByRole('button',{name:/Cần làm quen chậm/}));next();next();
}
test('photo is asked after name/sex; review creates pet once and retries uncertain photo with its same key',async()=>{
  const photoApi={get:jest.fn().mockResolvedValue({data:{version:0,present:false}}),save:jest.fn().mockRejectedValueOnce({status:503}).mockResolvedValue({data:{version:1,present:true}})};
  const x=setup({photoApi});identity();
  expect(screen.getByRole('heading',{name:'Cho chúng mình ngắm Mây nhé!'})).toBeVisible();
  const file=new window.File(['synthetic'],'pet.png',{type:'image/png'});
  fireEvent.change(screen.getByLabelText('Ảnh thú cưng'),{target:{files:[file]}});
  await screen.findByAltText('Xem trước ảnh Mây');
  expect(x.api.save).not.toHaveBeenCalled();expect(photoApi.save).not.toHaveBeenCalled();next();restToHealth();
  fireEvent.click(screen.getByRole('button',{name:/Bổ sung sau nhé/}));next();
  fireEvent.click(screen.getByRole('button',{name:'Lưu hồ sơ của bé'}));
  await screen.findByText(/Hồ sơ đã được lưu; ảnh chưa có xác nhận/);
  expect(x.api.save).toHaveBeenCalledTimes(1);expect(x.onSaved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Thử lại cùng yêu cầu'}));
  await waitFor(()=>expect(x.onSaved).toHaveBeenCalledWith({id,version:0},true));
  expect(x.api.save).toHaveBeenCalledTimes(1);expect(photoApi.get).toHaveBeenCalledTimes(1);
  expect(photoApi.save.mock.calls[1]).toEqual(photoApi.save.mock.calls[0]);
  expect(x.api.save.mock.calls[0][2]).toMatchObject({name:'Mây',sex:'FEMALE',traits:['SHY'],careProfile:{health:{status:'NOT_PROVIDED'}}});
  x.view.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-photo');
});
test('manual health supports several vaccine/date rows, unknown date and review without guessing absence of risk',async()=>{
  const x=setup();await screen.findByRole('heading',{name:'Chào bạn nhỏ! Bé tên là gì?'});identity();fireEvent.click(screen.getByRole('button',{name:'Để ảnh sau, tiếp tục'}));restToHealth();
  fireEvent.click(screen.getByRole('button',{name:/Mình sẽ tự điền/}));
  fireEvent.change(screen.getByLabelText('Tình trạng thông tin: Vaccine và ngày tiêm'),{target:{value:'KNOWN'}});
  fireEvent.change(screen.getByLabelText(/Tên vaccine 1/),{target:{value:'Dại'}});
  fireEvent.change(screen.getByLabelText('Ngày tiêm 1'),{target:{value:'2026-10-01'}});
  fireEvent.click(screen.getByRole('button',{name:'Thêm mũi tiêm'}));
  fireEvent.change(screen.getByLabelText(/Tên vaccine 2/),{target:{value:'Mũi trên sổ'}});
  fireEvent.change(screen.getByLabelText('Tình trạng thông tin: Dị ứng'),{target:{value:'UNKNOWN'}});
  next();expect(screen.getByText('Vaccine và ngày tiêm').nextElementSibling).toHaveTextContent('Dại — 2026-10-01');expect(screen.getByText('Vaccine và ngày tiêm').nextElementSibling).toHaveTextContent('Mũi trên sổ — Chưa rõ ngày tiêm');
  fireEvent.click(screen.getByRole('button',{name:'Lưu hồ sơ của bé'}));
  await waitFor(()=>expect(x.onSaved).toHaveBeenCalled());
  expect(x.api.save.mock.calls[0][2].careProfile).toMatchObject({vaccination:{status:'KNOWN',value:'Dại — 2026-10-01\nMũi trên sổ — Chưa rõ ngày tiêm'},allergies:{status:'UNKNOWN'},health:{status:'NOT_PROVIDED'}});
  expect(x.photoApi.save).not.toHaveBeenCalled();
});
test('a known photo failure can finish saved profile and defer its photo without recreating the pet',async()=>{
  const x=setup({photoApi:{get:jest.fn().mockResolvedValue({data:{version:2,present:true}}),save:jest.fn()}});
  identity();fireEvent.change(screen.getByLabelText('Ảnh thú cưng'),{target:{files:[new window.File(['x'],'pet.png',{type:'image/png'})]}});
  await screen.findByAltText('Xem trước ảnh Mây');next();restToHealth();fireEvent.click(screen.getByRole('button',{name:/Bổ sung sau nhé/}));next();
  fireEvent.click(screen.getByRole('button',{name:'Lưu hồ sơ của bé'}));
  await screen.findByText(/Hồ sơ đã được lưu nhưng ảnh chưa hoàn tất/);
  fireEvent.click(screen.getByRole('button',{name:'Cập nhật ảnh sau'}));
  expect(x.onSaved).toHaveBeenCalledWith({id,version:0},false);expect(x.api.save).toHaveBeenCalledTimes(1);expect(x.photoApi.save).not.toHaveBeenCalled();
});
test('upload health is explicit and can switch to manual entry or later without saving a draft',async()=>{
  const x=setup();await screen.findByRole('heading',{name:'Chào bạn nhỏ! Bé tên là gì?'});identity();fireEvent.click(screen.getByRole('button',{name:'Để ảnh sau, tiếp tục'}));restToHealth();
  fireEvent.click(screen.getByRole('button',{name:/Tải sổ sức khỏe/}));
  expect(screen.getByText('Điền nhanh từ ảnh hoặc PDF sổ thú cưng').closest('details')).toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button',{name:/Mình sẽ tự điền/}));
  expect(screen.getByLabelText('Tình trạng thông tin: Vaccine và ngày tiêm')).toBeVisible();
  expect(x.api.save).not.toHaveBeenCalled();
});
