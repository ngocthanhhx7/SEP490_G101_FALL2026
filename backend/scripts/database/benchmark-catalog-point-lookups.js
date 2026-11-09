import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
const replica=await MongoMemoryReplSet.create({binary:{version:'8.0.34'},replSet:{count:1}});let connection;
try{connection=await mongoose.createConnection(replica.getUri(),{dbName:'synthetic_point_lookup',autoCreate:false,autoIndex:false}).asPromise();const c=connection.db.collection('serviceversions');
await c.createIndexes([{key:{serviceId:1,version:1},unique:true},{key:{serviceId:1,effectiveAt:1},unique:true},{key:{state:1,effectiveAt:1,serviceId:1}}]);
const ids=Array.from({length:100},()=>new mongoose.Types.ObjectId()),origin=Date.parse('2026-01-01T00:00:00Z'),results=[];
for(const count of[1000,10000,100000]){
 await c.deleteMany({});for(let start=0;start<count;start+=1000){const rows=[];for(let i=start;i<Math.min(start+1000,count);i++)rows.push({serviceId:ids[i%100],version:Math.floor(i/100)+1,effectiveAt:new Date(origin+Math.floor(i/100)*1000),state:i%3?'ACTIVE':'INACTIVE',payload:'Synthetic catalog payload'});await c.insertMany(rows);}
 const at=new Date(origin+Math.floor(count/200)*1000),measures={};
 for(const[name,sort]of Object.entries({existing:{effectiveAt:-1,version:-1},uniqueEffective:{effectiveAt:-1}})){
  const samples=[];for(let run=0;run<45;run++){const index=run%100,filter={serviceId:ids[index],effectiveAt:{$lte:at}},begin=performance.now();const row=await c.find(filter,{maxTimeMS:5000}).sort(sort).limit(1).next();if(run>=5)samples.push(performance.now()-begin);const reference=await c.find(filter,{maxTimeMS:5000}).sort({effectiveAt:-1,version:-1}).limit(1).next();assert.equal(String(row?._id),String(reference?._id));}
  const e=await c.find({serviceId:ids[0],effectiveAt:{$lte:at}},{maxTimeMS:5000}).sort(sort).limit(1).explain('executionStats');const sorted=[...samples].sort((a,b)=>a-b);measures[name]={p50Ms:sorted[19],p95Ms:sorted[37],keys:e.executionStats.totalKeysExamined,docs:e.executionStats.totalDocsExamined,returned:e.executionStats.nReturned};
 }
 for(const timestamp of[origin-1,origin,origin+1000,origin+count*1000]){const filter={serviceId:ids[0],effectiveAt:{$lte:new Date(timestamp)}};const a=await c.find(filter).sort({effectiveAt:-1,version:-1}).limit(1).next(),b=await c.find(filter).sort({effectiveAt:-1}).limit(1).next();assert.equal(String(a?._id),String(b?._id));}
 results.push({documents:count,services:100,samples:40,identicalSelections:true,...measures});}
console.log(JSON.stringify({synthetic:true,mongoVersion:'8.0.34',results,note:'Existing unique serviceId/effectiveAt invariant; no added/removed index. Old then new, one client; warm-cache timings not production capacity.'},null,2));
}finally{await connection?.close();await replica.stop();}
