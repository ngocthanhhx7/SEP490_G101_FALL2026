import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { CustomerProfilePage } from '../../src/pages/customer/CustomerProfilePage.jsx';
jest.mock('../../src/components/common/ProfileAvatar.jsx',()=>({AvatarEditor:({onSaved})=><button type="button" onClick={onSaved}>Synthetic photo saved</button>}));
test('photo-triggered version refresh preserves the typed name and saves using the refreshed version',async()=>{
  let version=0; const id='a'.repeat(24), request=jest.fn(async(_path,options={})=>{
    if(options.method==='PATCH') return {data:{id,displayName:options.body.displayName,version:version+1,contacts:[]}};
    return {data:{id,displayName:'Tên đã lưu',version:version++,contacts:[]}};
  });
  const adapter={resolve:async()=>({status:'authenticated',user:{id,displayName:'Tên đã lưu',roles:['CUSTOMER']}})};
  render(<MemoryRouter><SessionProvider adapter={adapter}><CustomerProfilePage apiRequest={request}/></SessionProvider></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('Họ và tên',{exact:false}),{target:{value:'Tên đang chỉnh sửa'}});
  fireEvent.click(screen.getByRole('button',{name:'Synthetic photo saved'}));
  await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
  expect(await screen.findByLabelText('Họ và tên',{exact:false})).toHaveValue('Tên đang chỉnh sửa');
  fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi'}));
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/me/profile',{method:'PATCH',body:{displayName:'Tên đang chỉnh sửa',expectedVersion:1}}));
});
