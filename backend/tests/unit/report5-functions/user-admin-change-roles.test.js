import { test, expect, jest } from '@jest/globals';
import { createUserAdminService } from '../../../src/services/user-admin.service.js';
const ADMIN = { userId: '111111111111111111111111', roles: ['ADMIN'], state: 'ACTIVE' };
const STAFF = { userId: '333333333333333333333333', roles: ['STAFF'], state: 'ACTIVE' };
const TARGET = '222222222222222222222222';
const NOW = new Date('2026-11-14T03:00:00.000Z');
function fixture({ targetRole='CUSTOMER', targetState='ACTIVE', extra=0, openBooking=false, openOrder=false }={}) {
 let committed={ users: [
  { _id: ADMIN.userId,displayName:'Quản trị tổng hợp',roles:['ADMIN'],state:'ACTIVE',version:0,authEpoch:0,createdAt:NOW,updatedAt:NOW },
  { _id: TARGET,displayName:'Nguyễn Lan',roles:[targetRole],state:targetState,version:0,authEpoch:0,createdAt:NOW,updatedAt:NOW },
  { _id: STAFF.userId,displayName:'Nhân viên tổng hợp',roles:['STAFF'],state:'ACTIVE',version:0,authEpoch:0,createdAt:NOW,updatedAt:NOW }
 ], contacts:[{ _id:'444444444444444444444444',userId:TARGET,channel:'EMAIL',state:'VERIFIED',canonicalCiphertext:'lan@example.test' },
  { _id:'555555555555555555555555',userId:TARGET,channel:'PHONE',state:'VERIFIED',canonicalCiphertext:'+84912345678' }], audits:[],revoked:[],
  bookings:openBooking?[{_id:'synthetic-booking',customerId:TARGET,state:'CONFIRMED'}]:[],
  productorders:openOrder?[{_id:'synthetic-order',customerId:TARGET,status:'PLACED'}]:[] };
 for(let i=0;i<extra;i++)committed.users.push({ _id:(100+i).toString(16).padStart(24,'0'),displayName:'Khách tổng hợp '+i,
  roles:['CUSTOMER'],state:'ACTIVE',version:0,authEpoch:0,createdAt:new Date(NOW.getTime()-i-1),updatedAt:NOW });
 function matches(row,filter) {
  return Boolean(row)&&Object.entries(filter).every(([key,value])=>{
   if(key==='$and')return value.every(c=>matches(row,c));
   if(key==='$or')return value.some(c=>matches(row,c));
   if(typeof value?.test==='function')return value.test(row[key]??'');
   if(value&&typeof value==='object') {
    if('$ne' in value)return row[key]!==value.$ne;
    if('$in' in value)return value.$in.some(v=>String(v)===String(row[key]));
    if('$lt' in value)return row[key]<value.$lt;
   }
   return Array.isArray(row[key])?row[key].includes(value):String(row[key])===String(value);
  });
 }
 function document(row,session) {
  if(!row)return null;
  const value=globalThis.structuredClone(row);
  const plain=()=>Object.fromEntries(Object.entries(value).filter(([,v])=>typeof v!=='function'));
  value.toObject=()=>globalThis.structuredClone(plain());
  value.save=async()=>{ const s=session?.state??committed;const at=s.users.findIndex(u=>u._id===value._id);s.users[at]=value.toObject(); };
  return value;
 }
 function query(read,initial,asDocument=false) {
  let session=initial,limit=Infinity,sorting;
  const q={session:s=>{session=s;return q;},select:()=>q,sort:s=>{sorting=s;return q;},limit:n=>{limit=n;return q;},
   lean:async()=>{let result=read(session?.state??committed);if(Array.isArray(result)) {
    result=[...result];if(sorting)result.sort((a,b)=>{for(const [field,direction] of Object.entries(sorting)) {
     if(a[field]<b[field])return -direction;if(a[field]>b[field])return direction;
    }return 0;});result=result.slice(0,limit);
   }return globalThis.structuredClone(result);},
   then:(resolve,reject)=>q.lean().then(v=>asDocument?document(v,session):v).then(resolve,reject)};
  return q;
 }
 const User={
  find:filter=>query(s=>s.users.filter(row=>matches(row,filter))),
  findOne:filter=>query(s=>s.users.find(row=>matches(row,filter))??null,undefined,true),
  exists:filter=>query(s=>s.users.some(row=>matches(row,filter))),
  findOneAndUpdate:jest.fn((filter,update,options)=>query(s=>{
   const row=s.users.find(u=>matches(u,filter));if(!row)return null;
   Object.assign(row,update.$set??{});for(const [key,value] of Object.entries(update.$inc??{}))row[key]=(row[key]??0)+value;
   return row;
  },options?.session,true))
 };
 const Contact={find:filter=>query(s=>s.contacts.filter(row=>matches(row,filter)))};
 const Audit={create:jest.fn(async(rows,{session})=>{session.state.audits.push(...rows);return rows;})};
 const connection={transaction:async callback=>{const session={state:globalThis.structuredClone(committed)};
  const result=await callback(session);committed=session.state;return result;},
  db:{collection:name=>({findOne:async(filter,{session}={})=>(session?.state??committed)[name]?.find(r=>matches(r,filter))??null,
   countDocuments:async filter=>(committed[name]??[]).filter(r=>matches(r,filter)).length})}};
 const sessionService={revokeUserSessions:jest.fn(async(userId,{session})=>{session.state.revoked.push(userId);})};
 const target=createUserAdminService({connection,User,Contact,Audit,sessionService,
  contactCrypto:{decrypt:v=>v},cursorSecret:'synthetic-report5-cursor-secret-at-least-32',clock:()=>NOW.getTime()}).changeRoles;
 return { changeRoles:target,state:()=>committed,User,Audit,sessionService };
}

// SRS: UC-10; P34-A-USER-ROLES đã duyệt: Admin được phân lại vai trò giữa CUSTOMER, STAFF và SALE_STAFF kèm thu hồi phiên và ghi audit.
test("USER-ADMIN-04-UTCID01 [N] Admin đổi role STAFF sang SALE_STAFF và thu hồi phiên", async () => {
  const f=fixture({targetRole:'STAFF'});
  const actual = await f.changeRoles({userId:TARGET,actor:ADMIN,body:{roles:["SALE_STAFF"],reason:'Yêu cầu đổi vai trò',expectedVersion:0}});
  expect(actual).toEqual({ userId: TARGET, roles: ['SALE_STAFF'], version: 1 });
  expect(f.state().users.find(u=>u._id===TARGET).roles).toEqual(['SALE_STAFF']);
  expect(f.sessionService.revokeUserSessions).toHaveBeenCalledWith(TARGET, expect.anything());
  expect(f.Audit.create).toHaveBeenCalledTimes(1);
});

// SRS: UC-10; P34-A-USER-ROLES đã duyệt: Admin được nâng cấp role CUSTOMER sang STAFF kèm thu hồi phiên và ghi audit.
test("USER-ADMIN-04-UTCID02 [N] Admin đổi role CUSTOMER sang STAFF và thu hồi phiên", async () => {
  const f=fixture({targetRole:'CUSTOMER'});
  const actual = await f.changeRoles({userId:TARGET,actor:ADMIN,body:{roles:["STAFF"],reason:'Yêu cầu đổi vai trò',expectedVersion:0}});
  expect(actual).toEqual({ userId: TARGET, roles: ['STAFF'], version: 1 });
  expect(f.state().users.find(u=>u._id===TARGET).roles).toEqual(['STAFF']);
  expect(f.sessionService.revokeUserSessions).toHaveBeenCalledWith(TARGET, expect.anything());
  expect(f.Audit.create).toHaveBeenCalledTimes(1);
});

// SRS: UC-10; III User Details Role readonly: role từ cách tạo tài khoản.
test("USER-ADMIN-04-UTCID03 [A] Role PET_SITTER chỉ đọc, không đổi thành STAFF", async () => {
  const f=fixture({targetRole:'PET_SITTER'});
  await expect(f.changeRoles({userId:TARGET,actor:ADMIN,body:{roles:["STAFF"],reason:'Yêu cầu đổi vai trò',expectedVersion:0}})).rejects.toBeDefined();
  expect(f.state().users.find(u=>u._id===TARGET).roles).toEqual(['PET_SITTER']);
});

// SRS: III User Details Role readonly.
test("USER-ADMIN-04-UTCID04 [A] Không cho Admin tự đổi role của mình", async () => {
  const f=fixture();
  await expect(f.changeRoles({userId:ADMIN.userId,actor:ADMIN,body:{roles:['STAFF'],reason:'Yêu cầu đổi vai trò',expectedVersion:0}}))
    .rejects.toMatchObject({code:'SELF_ROLE_CHANGE_FORBIDDEN'});
});

// SRS: I.4.4; GBR-02; UC-10.
test("USER-ADMIN-04-UTCID05 [A] Staff không được gọi lệnh đổi role quản trị", async () => {
  const f=fixture();
  await expect(f.changeRoles({userId:TARGET,actor:STAFF,body:{roles:['STAFF'],reason:'Yêu cầu đổi vai trò',expectedVersion:0}}))
    .rejects.toMatchObject({status:403,code:'FORBIDDEN'});
});
