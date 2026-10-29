import mongoose from 'mongoose';
const uri = 'mongodb://127.0.0.1:27018/?directConnection=true';
let c;
try {
  c = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 });
  c.on('error', () => {});
  await c.asPromise();
  const build = await c.db.admin().command({ buildInfo: 1 });
  if (!build.version.startsWith('8.0.'))
    throw new Error('MongoDB 8.0 required');
  let hello = await c.db.admin().command({ hello: 1 });
  if (!hello.setName)
    await c.db
      .admin()
      .command({
        replSetInitiate: {
          _id: 'pwc-local',
          members: [{ _id: 0, host: '127.0.0.1:27018' }],
        },
      });
  for (let attempt = 0; attempt < 30; attempt++) {
    hello = await c.db.admin().command({ hello: 1 });
    if (hello.setName === 'pwc-local' && hello.isWritablePrimary) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (hello.setName !== 'pwc-local' || !hello.isWritablePrimary)
    throw new Error('Local replica set is not writable');
  console.log(
    JSON.stringify({
      version: build.version,
      uri: 'mongodb://127.0.0.1:27018/?replicaSet=pwc-local',
      database: 'paw_world_care_dev',
      state: 'READY',
    })
  );
} catch {
  console.error(
    'Local MongoDB initialization failed; check backend/storage/mongodb-8.0/mongod.log'
  );
  process.exitCode = 1;
} finally {
  await c?.close();
}
