import { prepareAvatarImage } from '../../src/services/avatar-image.js';
import { createAvatarApi } from '../../src/services/avatar-api.js';
afterEach(()=>jest.restoreAllMocks());
test('large phone photo is center-cropped into a small JPEG before transport; decoded bitmap is released',async()=>{
  const close=jest.fn(), drawImage=jest.fn(), fillRect=jest.fn();
  globalThis.createImageBitmap=jest.fn().mockResolvedValue({width:4000,height:3000,close});
  const canvas={getContext:()=>({drawImage,fillRect}),toBlob:fn=>fn(new globalThis.Blob(['normalized'],{type:'image/jpeg'}))};
  jest.spyOn(document,'createElement').mockReturnValue(canvas);
  const file=new globalThis.File(['original-source'],'phone.png',{type:'image/png'}), normalized=await prepareAvatarImage(file);
  expect(normalized.type).toBe('image/jpeg'); expect(normalized).not.toBe(file); expect(canvas.width).toBe(512);expect(canvas.height).toBe(512);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(),500,0,3000,3000,0,0,512,512);expect(close).toHaveBeenCalledTimes(1);
});
test('unsupported files never decode; corrupt and oversized decoded images fail without upload',async()=>{
  globalThis.createImageBitmap=jest.fn();
  await expect(prepareAvatarImage(new globalThis.File(['bad'],'bad.pdf',{type:'application/pdf'}))).rejects.toMatchObject({code:'INVALID_AVATAR_IMAGE'});
  expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  const close=jest.fn();globalThis.createImageBitmap.mockResolvedValue({width:10000,height:10000,close});
  await expect(prepareAvatarImage(new globalThis.File(['pixels'],'large.png',{type:'image/png'}))).rejects.toMatchObject({code:'INVALID_AVATAR_IMAGE'});expect(close).toHaveBeenCalled();
});
test('private content uses cookies, rejects wrong MIME and foreign paths, and JSON upload uses current supplied CSRF',async()=>{
  const blob=new globalThis.Blob(['jpeg'],{type:'image/jpeg'}), fetchImpl=jest.fn().mockResolvedValue({ok:true,status:200,headers:{get:()=> 'image/jpeg'},blob:async()=>blob});
  const api=createAvatarApi({fetchImpl,getCsrfToken:()=> 'context-session-csrf'});
  expect(await api.content('/avatars/me')).toBe(blob);
  expect(fetchImpl).toHaveBeenCalledWith('/api/v1/avatars/me/content',expect.objectContaining({credentials:'same-origin',cache:'no-store',redirect:'error'}));
  await expect(api.content('/avatars/../someone')).rejects.toMatchObject({code:'INVALID_API_PATH'});
  fetchImpl.mockResolvedValue({ok:true,status:200,headers:{get:()=> 'text/html'}});
  await expect(api.content('/avatars/me')).rejects.toMatchObject({code:'INVALID_RESPONSE'});
  fetchImpl.mockResolvedValue({ok:true,status:200,json:async()=>({data:{version:1,present:true},meta:{schemaVersion:1}})});
  const file=new globalThis.File(['jpeg'],'avatar.jpg',{type:'image/jpeg'});
  await api.save('/avatars/me',{version:0,file,key:'stable-avatar-key-001',remove:false});
  const [path,options]=fetchImpl.mock.calls.at(-1);expect(path).toBe('/api/v1/avatars/me?version=0');expect(options.body).toBe(file);expect(options.headers.get('X-CSRF-Token')).toBe('context-session-csrf');
});
