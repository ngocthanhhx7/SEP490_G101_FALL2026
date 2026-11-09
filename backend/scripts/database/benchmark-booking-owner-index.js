import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
const replica=await MongoMemoryReplSet.create({binary:{version:'8.0.34'},replSet:{count:1}});let connection;
try{connection=await mongoose.createConnection(replica.getUri(),{dbName:'synthetic_booking_owner_index',autoIndex:false,autoCreate:false}).asPromise();const c=connection.db.collection('bookings');await c.createIndex({carePlanState:1,createdAt:1,_id:1});const owners=Array.from({length:100},()=>new mongoose.Types.ObjectId()),absent=new mongoose.Types.ObjectId(),results=[];
for(const count of[1000,10000,100000]){
 await c.deleteMany({});if((await c.listIndexes().toArray()).some(x=>x.name==='customer_owner_cursor'))await c.dropIndex('customer_owner_cursor');
 const began=performance.now();for(let start=0;start<count;start+=1000){const rows=[];for(let i=start;i<Math.min(start+1000,count);i++)rows.push({_id:new mongoose.Types.ObjectId(),customerId:owners[i%100],state:'AWAITING_PAYMENT',carePlanState:'PENDING',createdAt:new Date('2026-11-08T00:00:00Z'),checkoutSnapshot:{customerVisits:[{snapshots:{serviceName:'Synthetic care'}}]}});await c.insertMany(rows);}const initialBulkMs=performance.now()-began;
 const midpoint=await c.find({customerId:owners[0]}).sort({_id:-1}).skip(Math.floor(count/200)).limit(1).next();
 const shapes=[{name:'owner-first',filter:{customerId:owners[0]}},{name:'owner-cursor',filter:{customerId:owners[0],_id:{$lt:midpoint._id}}},{name:'owner-empty',filter:{customerId:absent}}];
 const measured={},ids={};let beforeBytes,afterBytes,indexBuildMs;
 for(const mode of['existing','ownerIndex']){
  if(mode==='ownerIndex'){const time=performance.now();await c.createIndex({customerId:1,_id:-1},{name:'customer_owner_cursor'});indexBuildMs=performance.now()-time;}
  await connection.db.admin().command({fsync:1});const stats=await connection.db.command({collStats:'bookings'});if(mode==='existing')beforeBytes=stats.totalIndexSize;else afterBytes=stats.totalIndexSize;
  measured[mode]=[];for(const shape of shapes){const samples=[];let rows;for(let run=0;run<25;run++){const time=performance.now();rows=await c.find(shape.filter,{projection:{_id:1,state:1,paymentDeadlineAt:1,'checkoutSnapshot.customerVisits.snapshots.serviceName':1},maxTimeMS:5000}).sort({_id:-1}).limit(21).toArray();if(run>=5)samples.push(performance.now()-time);}const values=rows.map(row=>String(row._id));if(mode==='existing')ids[shape.name]=values;else assert.deepEqual(values,ids[shape.name]);const e=await c.find(shape.filter,{maxTimeMS:5000}).sort({_id:-1}).limit(21).explain('executionStats');samples.sort((a,b)=>a-b);measured[mode].push({shape:shape.name,returned:e.executionStats.nReturned,keys:e.executionStats.totalKeysExamined,docs:e.executionStats.totalDocsExamined,p50Ms:samples[9],p95Ms:samples[18]});}
 }
 results.push({documents:count,syntheticOwners:100,samples:20,identicalPageIds:true,initialBulkMs,indexBuildMs,indexBytesBefore:beforeBytes,indexBytesAfter:afterBytes,indexDeltaBytes:afterBytes-beforeBytes,...measured});
}
console.log(JSON.stringify({synthetic:true,mongoVersion:'8.0.34',results,note:'Current cursor filter and projection; no unique/TTL change. Index creation only in isolated synthetic database. Sample20/5warmup; not production workload/capacity; both representations checkpointed before storage measurement; one extra index entry/write per booking. Not a write-throughput benchmark.'},null,2));
}finally{await connection?.close();await replica.stop();}
