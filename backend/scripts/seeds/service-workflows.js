import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { serviceWorkflowDrafts } from '../../src/constants/service-workflow-drafts.js';
import { validateWorkflow } from '../../src/validators/service-workflow.validator.js';
import { createServiceWorkflowService } from '../../src/services/care/service-workflow.service.js';

for (const item of serviceWorkflowDrafts) validateWorkflow(item.definition);
if (!process.argv.includes('--apply'))
  console.log(
    JSON.stringify({
      state: 'DRY_RUN',
      drafts: serviceWorkflowDrafts.map((item) => item.code),
      count: serviceWorkflowDrafts.length,
      published: false
    })
  );
else {
  let connection;
  try {
    const config = loadConfig();
    if (config.nodeEnv === 'production' || !config.database.endsWith('_dev'))
      throw new Error('Development database required');
    connection = await connectDatabase(config);
    const admin = await connection.db
      .collection('users')
      .findOne({
        _id:
          process.env.WORKFLOW_SEED_ADMIN_ID &&
          new (await import('mongoose')).Types.ObjectId(process.env.WORKFLOW_SEED_ADMIN_ID),
        state: 'ACTIVE',
        roles: 'ADMIN',
        synthetic: { $ne: true }
      });
    if (!admin) throw new Error('Explicit existing Admin required');
    const actor = { userId: String(admin._id), state: 'ACTIVE', roles: ['ADMIN'] },
      service = createServiceWorkflowService({ connection });
    let created = 0,
      skipped = 0;
    for (const item of serviceWorkflowDrafts) {
      const target = await connection.db.collection('services').findOne({ code: item.code });
      if (!target || target.workflowDraft || target.workflowPublished) {
        skipped++;
        continue;
      }
      await service.mutate(
        actor,
        String(target._id),
        'DRAFT',
        { expectedVersion: target.workflowRevision ?? 0, definition: item.definition },
        `workflow-draft:${item.code}`
      );
      created++;
    }
    console.log(JSON.stringify({ state: 'DRAFTS_ONLY', created, skipped }));
  } catch {
    console.error('Workflow draft seed failed; private details omitted');
    process.exitCode = 1;
  } finally {
    await connection?.close();
  }
}
