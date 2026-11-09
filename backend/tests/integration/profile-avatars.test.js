import { createSessionService } from '../../src/services/session.service.js';
import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { userModel } from '../../src/models/user.model.js';
import { petCareModels } from '../../src/models/pet-care.model.js';
import { avatarModel } from '../../src/models/avatar.model.js';
import { avatarModule } from '../../src/routes/avatar.routes.js';
import { requireSession, requireCsrf } from '../../src/middlewares/session.js';
let replica, connection, app, png;
const ids = { owner: 'a'.repeat(24), other: 'b'.repeat(24), admin: 'c'.repeat(24), pet: 'd'.repeat(24) };
const headers = (who = 'owner') => ({ 'X-Test-User': who, Host: '127.0.0.1', Origin: 'http://127.0.0.1', 'X-CSRF-Token': 'synthetic-csrf', 'Idempotency-Key': 'synthetic-avatar-key-001' });
const put = (path = '/avatars/me', version = 0, who = 'owner', body = png, key = 'synthetic-avatar-key-001') => request(app).put('/api/v1'+path+'?version='+version).set({...headers(who),'Idempotency-Key':key,'Content-Type':'image/png'}).send(body);
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: {version:'8.0.34'}, replSet:{count:1} });
  connection = await connectDatabase({ mongoUri:replica.getUri(),database:'pwc_avatar_test',connectTimeoutMs:3000 });
  const config=loadConfig({NODE_ENV:'test',MONGO_URI:replica.getUri(),MONGO_DB:'pwc_avatar_test'});
  const sessions={authenticate:async req=>{const who=req.get('X-Test-User');return ids[who]?{userId:ids[who],state:'ACTIVE',roles:[who==='admin'?'ADMIN':'CUSTOMER'],expiresAt:Date.now()+3600000}:null;},verifyCsrf:async (_actor,token)=>token==='synthetic-csrf'};
  app=createApp({config,connection,lifecycle:{draining:false},moduleFactories:[()=>avatarModule({connection,requireAuthenticated:requireSession(sessions),csrf:requireCsrf(sessions)})]});
  await Promise.all(Object.values(connection.models).map(model=>model.syncIndexes()));
  png=await sharp({create:{width:800,height:600,channels:3,background:'#aabbcc'}}).png().toBuffer();
},600000);
beforeEach(async()=>{
  await Promise.all(Object.values(connection.models).map(model=>model.deleteMany({})));
  await userModel(connection).create(['owner','other','admin'].map(who=>({_id:ids[who],displayName:who,roles:[who==='admin'?'ADMIN':'CUSTOMER'],state:'ACTIVE',version:0})));
  await petCareModels(connection).Pet.create({_id:ids.pet,ownerId:ids.owner,name:'Synthetic pet',species:'DOG',breedCode:'SYNTHETIC',weightKg:5});
});
afterAll(async()=>{await connection?.close();await replica?.stop();});
test('account avatar persists normalized private bytes; exact retry, replacement, delete and stale commands',async()=>{
  const before=await request(app).get('/api/v1/avatars/me').set(headers()).expect(200);expect(before.body.data).toEqual({present:false,version:0});
  await put().expect(200).expect(r=>expect(r.body.data).toMatchObject({version:1,present:true,replayed:false}));
  await put().expect(200).expect(r=>expect(r.body.data.replayed).toBe(true));
  expect((await userModel(connection).findById(ids.owner)).version).toBe(1);
  const image=await request(app).get('/api/v1/avatars/me/content').set(headers()).expect(200);
  expect(image.headers['cache-control']).toBe('private, no-store');expect(image.headers['content-type']).toMatch(/image\/jpeg/);
  expect(await sharp(image.body).metadata()).toMatchObject({format:'jpeg',width:512,height:512});
  await request(app).get('/api/v1/avatars/me/content').set(headers('other')).expect(404);
  await put('/avatars/me',0,'owner',png,'synthetic-stale-key-001').expect(409);
  await put('/avatars/me',1,'owner',png,'synthetic-replace-key-001').expect(200);
  const del=()=>request(app).delete('/api/v1/avatars/me').set({...headers(),'Idempotency-Key':'synthetic-delete-key-001'}).send({expectedVersion:2});
  await del().expect(200).expect(r=>expect(r.body.data).toMatchObject({present:false,version:3}));await del().expect(200);
  await request(app).get('/api/v1/avatars/me/content').set(headers()).expect(404);
  const stored=await avatarModel(connection).findById('user:'+ids.owner).select('+body').lean();expect(stored.body).toBeUndefined();
});
test('pet image requires owner even for Admin; archived pets reject writes and preserve private history',async()=>{
  const path='/avatars/pets/'+ids.pet;
  await put(path,0,'other').expect(404);await put(path,0,'admin').expect(404);
  await put(path).expect(200);
  await request(app).get('/api/v1'+path+'/content').set(headers('admin')).expect(404);
  expect((await petCareModels(connection).Pet.findById(ids.pet)).version).toBe(1);
  await petCareModels(connection).Pet.updateOne({_id:ids.pet},{$set:{state:'ARCHIVED'}});
  await put(path,1,'owner',png,'synthetic-archived-key-001').expect(404);
  await request(app).get('/api/v1'+path+'/content').set(headers()).expect(200);
});
test('rejects guests, missing CSRF, corrupt/spoofed/oversized pixel data and conflicting reuse without changing avatar',async()=>{
  await request(app).get('/api/v1/avatars/me').expect(401);
  await request(app).put('/api/v1/avatars/me?version=0').set({...headers(),'X-CSRF-Token':'wrong','Content-Type':'image/png'}).send(png).expect(403);
  await put('/avatars/me',0,'owner',Buffer.from('invalid')).expect(422);
  const huge=await sharp({create:{width:2100,height:2100,channels:3,background:'#eee'}}).png().toBuffer();await put('/avatars/me',0,'owner',huge).expect(422);
  await put().expect(200);
  const different=await sharp({create:{width:2,height:2,channels:3,background:'#000'}}).png().toBuffer();await put('/avatars/me',0,'owner',different).expect(409);
  expect(await avatarModel(connection).countDocuments()).toBe(1);
});
test('concurrent initial writes have one winner and replay does not increment profile twice',async()=>{
  const responses=await Promise.all([put(),put('/avatars/me',0,'owner',png,'synthetic-competing-key-001')]);
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
  expect((await userModel(connection).findById(ids.owner)).version).toBe(1);
  expect(await avatarModel(connection).countDocuments()).toBe(1);
});


test('real signed session cookies keep account and pet photos readable after avatar writes', async()=>{
  const tokenSecret='s'.repeat(48),csrfSecret='c'.repeat(48);
  const sessions=createSessionService({connection,tokenSecret,csrfSecret});
  for(const model of Object.values(connection.models)){await model.createCollection();await model.createIndexes();}
  const owner=await userModel(connection).findById(ids.owner);
  const issued=await connection.transaction(session=>sessions.issueInTransaction(owner,session));
  const config=loadConfig({NODE_ENV:'test',MONGO_URI:replica.getUri(),MONGO_DB:'pwc_avatar_test'});
  const real=createApp({config,connection,lifecycle:{draining:false},moduleFactories:[()=>avatarModule({connection,requireAuthenticated:requireSession(sessions),csrf:requireCsrf(sessions)})]});
  const auth={Host:'127.0.0.1',Origin:'http://127.0.0.1',Cookie:`pwc_session=${issued.token}`,'X-CSRF-Token':issued.csrfToken};
  const jpeg=await sharp(png).jpeg().toBuffer();
  for(const path of ['/avatars/me','/avatars/pets/'+ids.pet]){
    await request(real).put('/api/v1'+path+'?version=0').set({...auth,'Idempotency-Key':'real-cookie-photo-'+(path.endsWith('/me')?'account':'pet'),'Content-Type':'image/jpeg'}).send(jpeg).expect(200);
    const image=await request(real).get('/api/v1'+path+'/content').set({Cookie:auth.Cookie}).expect(200);
    expect(image.headers['cache-control']).toBe('private, no-store');expect(await sharp(image.body).metadata()).toMatchObject({format:'jpeg',width:512,height:512});
    await request(real).get('/api/v1'+path+'/content').expect(401);
  }
});
