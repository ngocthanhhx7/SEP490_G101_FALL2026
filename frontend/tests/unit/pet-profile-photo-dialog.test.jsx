import { beforeAll } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PetProfileDetails } from '../../src/pages/customer/PetProfileDetails.jsx';
let mockAvatarApi;
jest.mock('../../src/contexts/SessionContext.jsx',()=>({useSession:()=>({user:{id:'a'.repeat(24)},getCsrfToken:()=>null})}));
jest.mock('../../src/services/avatar-api.js',()=>({...jest.requireActual('../../src/services/avatar-api.js'),createAvatarApi:()=>mockAvatarApi,avatarApi:{content:(...args)=>mockAvatarApi.content(...args)}}));
beforeAll(()=>{window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};URL.createObjectURL=()=> 'blob:synthetic';URL.revokeObjectURL=()=>{};});
test('canceling photo deletion keeps photo workspace open',async()=>{
 mockAvatarApi={get:jest.fn().mockResolvedValue({data:{version:0,present:true}}),content:jest.fn().mockResolvedValue(new globalThis.Blob(['synthetic'],{type:'image/jpeg'})),save:jest.fn()};
 render(<PetProfileDetails pet={{id:'b'.repeat(24),name:'Mây',species:'DOG',weightKg:5}} breed="Chó lai" traits={[]} disabled={false} onEdit={()=>{}} onArchive={()=>{}} onPhotoSaved={()=>{}} onPhotoBusyChange={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Đổi ảnh của Mây'}));
 const workspace=screen.getByRole('dialog',{name:'Ảnh của Mây'});
 await waitFor(()=>expect(screen.getByRole('button',{name:'Xóa ảnh'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Xóa ảnh'}));
 fireEvent(screen.getByRole('alertdialog',{name:'Xóa ảnh đại diện?'}),new globalThis.Event('cancel',{cancelable:true,bubbles:false}));
 expect(workspace).toHaveAttribute('open');
 expect(mockAvatarApi.save).not.toHaveBeenCalled();
});
