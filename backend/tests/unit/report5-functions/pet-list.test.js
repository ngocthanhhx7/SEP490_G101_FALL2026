import { test, expect, jest } from '@jest/globals';
import { createPetCareManagement } from '../../../src/services/pet-care-management.service.js';
const OWNER='111111111111111111111111';
const OTHER='222222222222222222222222';
const PET='333333333333333333333333';
function input() {return {name:'Milo',species:'DOG',breedCode:'DOG-1',weightKg:5,traits:[],careNeedsConfirmed:false};}
function fixture({visitState,empty=false}={}) {
 let committed={pets:empty?[]:[{_id:PET,ownerId:OWNER,state:'ACTIVE',version:0,...input()},
  {_id:'444444444444444444444444',ownerId:OTHER,state:'ACTIVE',version:0,...input(),name:'Pet khác chủ'},
  {_id:'555555555555555555555555',ownerId:OWNER,state:'ARCHIVED',version:0,...input()}],commands:new Map(),
  visits:visitState?[{_id:'synthetic-visit',petIds:[PET],state:visitState}]:[]};
 function matches(row,filter) {return Boolean(row)&&Object.entries(filter).every(([key,value])=>{
  if(value&&typeof value==='object') {
   if('$in' in value)return (Array.isArray(row[key])?row[key]:[row[key]]).some(v=>value.$in.some(x=>String(v)===String(x)));
   if('$nin' in value)return !value.$nin.includes(row[key]);
  }return String(row[key])===String(value);
 });}
 function query(read,initial) {let session=initial,limit=Infinity;
  const q={session:s=>{session=s;return q;},sort:()=>q,select:()=>q,limit:n=>{limit=n;return q;},
   lean:async()=>{const v=read(session?.state??committed);return globalThis.structuredClone(Array.isArray(v)?v.slice(0,limit):v);},
   then:(resolve,reject)=>q.lean().then(resolve,reject)};return q;
 }
 const models={Pet:{
  find:filter=>query(s=>s.pets.filter(p=>matches(p,filter))),
  create:jest.fn(async(rows,{session}={})=>{const s=session?.state??committed;
   if(Array.isArray(rows)) {const created=rows.map(row=>({_id:'666666666666666666666666',...row}));s.pets.push(...created);return created;}
   const created={_id:'666666666666666666666666',...rows};s.pets.push(created);return created;
  }),
  findOneAndUpdate:jest.fn((filter,update,{session})=>query(s=>{
   const row=s.pets.find(p=>matches(p,filter));if(!row)return null;
   Object.assign(row,update.$set??{});for(const [key,value]of Object.entries(update.$inc??{}))row[key]=(row[key]??0)+value;
   for(const key of Object.keys(update.$unset??{}))delete row[key];return row;
  },session))},
  PetBreed:{exists:async filter=>(filter.code==='DOG-1'&&filter.species==='DOG')||(filter.code==='CAT-1'&&filter.species==='CAT')},
  PetTrait:{countDocuments:async()=>0},
  PetCareCommand:{findById:id=>query(s=>s.commands.get(id)??null),create:async(rows,{session})=>{
   for(const row of rows)session.state.commands.set(row._id,row);
  }}
 };
 const connection={startSession:async()=>{const session={state:null,endSession:async()=>undefined,
  withTransaction:async callback=>{session.state=globalThis.structuredClone(committed);const result=await callback();committed=session.state;return result;}};return session;},
  db:{collection:name=>({findOne:async(filter,{session})=>(session.state[name]??[]).find(row=>matches(row,filter))??null})}};
 const listPets=createPetCareManagement({repository:{models,connection},clock:()=>Date.parse('2026-11-14T03:00:00Z')}).listPets;
 return {listPets,state:()=>committed,models};
}

// SRS: UC-13; III Pet List; GBR-02.
test("PET-02-UTCID01 [N] Chỉ liệt kê pet ACTIVE của chính Customer", async () => {
  const f=fixture();
  const actual=await f.listPets(OWNER);
  expect(actual.map(p=>p.id)).toEqual([PET]);
  expect(actual[0].name).toBe('Milo');
  expect(actual[0].ownerId).toBeUndefined();
});

// SRS: UC-13; III Pet List Add pet.
test("PET-02-UTCID02 [N] Chưa có pet trả danh sách rỗng", async () => {
  const f=fixture({empty:true});
  expect(await f.listPets(OWNER)).toEqual([]);
});
