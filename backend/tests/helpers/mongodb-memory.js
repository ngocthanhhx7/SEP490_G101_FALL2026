import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replicaSet;

export async function startMongoMemoryReplicaSet(databaseName = 'paw_world_care_test') {
  if (replicaSet) return replicaSet.getUri(databaseName);

  replicaSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger',
    },
  });

  return replicaSet.getUri(databaseName);
}

export async function stopMongoMemoryReplicaSet() {
  if (!replicaSet) return;
  await replicaSet.stop();
  replicaSet = undefined;
}
