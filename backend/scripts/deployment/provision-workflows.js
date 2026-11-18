import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { serviceWorkflowVersionModel } from '../../src/models/service-workflow-version.model.js';
import { planCatalogWorkflows, applyCatalogWorkflows } from '../../src/services/care/catalog-workflows.service.js';

// Dry-run by default. Production invocation is gated by the release operator's
// reviewed SHA, fresh backup, isolated restore, metadata rehearsal and plan hash.
let connection;
try {
  connection = await connectDatabase(loadConfig());
  const existing = await connection.db.listCollections({ name: 'serviceworkflowversions' }).toArray();
  const indexes = existing.length
    ? await connection.db.collection('serviceworkflowversions').listIndexes().toArray()
    : [];
  if (existing.length && (existing[0].type !== 'collection' || Object.keys(existing[0].options ?? {}).length))
    throw new Error('Incompatible history collection');
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
    throw new Error('Incompatible history index');
  const plan = await planCatalogWorkflows(connection);
  if (!process.argv.includes('--apply'))
    console.log(JSON.stringify({ state: 'DRY_RUN', historyExists: !!existing.length, plan }));
  else {
    if (
      plan.hash !== process.env.WORKFLOW_PLAN_HASH ||
      !process.env.WORKFLOW_ADMIN_ID ||
      process.env.WORKFLOW_RELEASE_APPROVED !== '2026-11-18'
    )
      throw new Error('Explicit reviewed plan and actor required');
    if (plan.entries.some((item) => item.state === 'CONFLICT')) throw new Error('Existing Admin content conflict');
    const model = serviceWorkflowVersionModel(connection);
    await model.createCollection();
    await model.createIndexes();
    const after = await applyCatalogWorkflows(connection, {
      adminId: process.env.WORKFLOW_ADMIN_ID,
      expectedPlanHash: plan.hash
    });
    console.log(JSON.stringify({ state: 'APPLIED', plan: after }));
  }
} catch {
  console.error('Workflow operator failed; private details omitted');
  process.exitCode = 1;
} finally {
  await connection?.close();
}
