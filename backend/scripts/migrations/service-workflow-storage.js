import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { serviceWorkflowVersionModel } from '../../src/models/service-workflow-version.model.js';

// Explicit development provisioning only; no startup hook or production mutation.
let connection;
try {
  const config = loadConfig();
  connection = await connectDatabase(config);
  const existing = await connection.db.listCollections({ name: 'serviceworkflowversions' }).toArray();
  const indexes = existing.length
    ? await connection.db.collection('serviceworkflowversions').listIndexes().toArray()
    : [];
  if (
    existing.length &&
    (existing[0].type !== 'collection' || existing[0].options?.capped || existing[0].options?.validator)
  )
    throw new Error('Incompatible workflow storage');
  if (
    indexes.some(
      (index) =>
        index.name !== '_id_' &&
        (JSON.stringify(index.key) !== JSON.stringify({ serviceId: 1, revision: -1 }) ||
          !index.unique ||
          index.partialFilterExpression ||
          index.sparse ||
          index.expireAfterSeconds !== undefined)
    )
  )
    throw new Error('Unexpected workflow index');
  if (!process.argv.includes('--apply'))
    console.log(
      JSON.stringify({
        state: 'DRY_RUN',
        exists: !!existing.length,
        indexes,
        additiveCollection: 'serviceworkflowversions',
        backfill: false
      })
    );
  else {
    if (config.nodeEnv === 'production' || !config.database.endsWith('_dev'))
      throw new Error('Development database required');
    const model = serviceWorkflowVersionModel(connection);
    await model.createCollection();
    await model.createIndexes();
    console.log('APPLIED: workflow history storage only; no business rows/backfill');
  }
} catch {
  console.error('Workflow provisioning failed; connection details omitted');
  process.exitCode = 1;
} finally {
  await connection?.close();
}
