import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApplicantWorkspacePage } from '../../src/pages/public/application-status/ApplicantWorkspacePage.jsx';
let mockSession={status:'authenticated',user:{id:'a'.repeat(24),roles:['CUSTOMER']}};
jest.mock('../../src/contexts/SessionContext.jsx',()=>({useSession:()=>mockSession}));
const application={id:'b'.repeat(24),state:'PENDING',version:0,canEdit:true,displayName:'Ứng viên tổng hợp',contact:{channel:'EMAIL',value:'synthetic@example.test'},dateOfBirth:'1998-04-12',identityNumber:'012345678901',employmentType:'FULL_TIME',experience:'Kinh nghiệm chăm sóc tổng hợp.',requestedServices:['Dắt chó'],workAreas:['Hà Nội'],documents:[{documentId:'c'.repeat(64),documentType:'IDENTITY'}],submittedAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',timeline:[]};
const wrap=api=>render(<MemoryRouter><ApplicantWorkspacePage api={api}/></MemoryRouter>);
afterEach(()=>{mockSession={status:'authenticated',user:{id:'a'.repeat(24),roles:['CUSTOMER']}};});
test('owned pending application is direct without receipt code or OTP and exposes editable original fields',async()=>{
 const api={getMine:jest.fn().mockResolvedValue({data:{application}}),createIdempotencyKey:()=> 'synthetic-owned-key',updateMine:jest.fn().mockResolvedValue({data:{id:application.id,version:1}})};
 wrap(api);await screen.findByRole('button',{name:'Sửa hồ sơ'});
 expect(screen.queryByLabelText(/Mã hồ sơ/)).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Gửi mã xác minh'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Sửa hồ sơ'}));expect(screen.getByLabelText('Ngày sinh')).toHaveValue('1998-04-12');
 fireEvent.change(screen.getByLabelText('Họ và tên'),{target:{value:'Tên đã sửa'}});fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi hồ sơ'}));
 await waitFor(()=>expect(api.updateMine).toHaveBeenCalledWith(expect.objectContaining({displayName:'Tên đã sửa',applicationId:application.id,expectedVersion:0,documents:[{...application.documents[0],storageRef:application.documents[0].documentId}]}),{key:'synthetic-owned-key'}));
});
test('uncertain update freezes inputs and retries the exact body/key',async()=>{
 const api={getMine:jest.fn().mockResolvedValue({data:{application}}),createIdempotencyKey:()=> 'synthetic-key',updateMine:jest.fn().mockRejectedValueOnce({status:503,code:'PROVIDER_UNAVAILABLE'}).mockResolvedValueOnce({data:{id:application.id,version:1}})};
 wrap(api);fireEvent.click(await screen.findByRole('button',{name:'Sửa hồ sơ'}));fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi hồ sơ'}));
 fireEvent.click(await screen.findByRole('button',{name:'Kiểm tra lại cùng yêu cầu'}));await waitFor(()=>expect(api.updateMine).toHaveBeenCalledTimes(2));
 expect(api.updateMine.mock.calls[0]).toEqual(api.updateMine.mock.calls[1]);
});
test('reviewed applications have no edit action, and guest is prompted to sign in instead of repeating status OTP',async()=>{
 wrap({getMine:jest.fn().mockResolvedValue({data:{application:{...application,state:'INTERVIEW',canEdit:false}}})});await screen.findByText('Phỏng vấn và hợp đồng',{selector:'span'});expect(screen.queryByRole('button',{name:'Sửa hồ sơ'})).not.toBeInTheDocument();
});
test('guest has a direct sign-in link and legacy verification remains collapsed',()=>{
 mockSession={status:'guest'};wrap({});expect(screen.getByRole('link',{name:'Đăng nhập để xem hồ sơ'})).toHaveAttribute('href','/sign-in');expect(screen.getByText('Tra cứu hồ sơ cũ không có tài khoản').closest('details')).not.toHaveAttribute('open');
});
