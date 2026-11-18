import { Types } from 'mongoose';
import { serviceWorkflowDrafts } from '../../constants/service-workflow-drafts.js';
import { validateWorkflow } from '../../validators/service-workflow.validator.js';
import { workflowHash } from './workflow-snapshot.service.js';
import { createServiceWorkflowService } from './service-workflow.service.js';

// Explicit operator call only. Never auto-publish during application startup.
export async function planCatalogWorkflows(connection) {
  const rows = await connection.db
    .collection('services')
    .find(
      { code: { $in: serviceWorkflowDrafts.map((item) => item.code) } },
      { projection: { code: 1, workflowDraft: 1, workflowPublished: 1, workflowRevision: 1 }, maxTimeMS: 2000 }
    )
    .limit(serviceWorkflowDrafts.length + 1)
    .toArray();
  const entries = serviceWorkflowDrafts.map((item) => {
    const matches = rows.filter((row) => row.code === item.code);
    if (matches.length > 1) throw new Error('Duplicate catalog code');
    const row = matches[0],
      definition = validateWorkflow(item.definition),
      hash = workflowHash(definition);
    if (!row) return { code: item.code, state: 'MISSING', hash };
    const revision = row.workflowRevision ?? 0;
    const state =
      row.workflowPublished?.hash === hash && workflowHash(row.workflowPublished.definition) === hash
        ? 'CURRENT'
        : !row.workflowPublished && revision === 1 && row.workflowDraft && workflowHash(row.workflowDraft) === hash
          ? 'RESUME_PUBLICATION'
          : !row.workflowPublished && !row.workflowDraft && revision === 0
            ? 'NEW'
            : 'CONFLICT';
    return { code: item.code, serviceId: String(row._id), revision, hash, state };
  });
  return { entries, hash: workflowHash(entries) };
}

export async function applyCatalogWorkflows(connection, { adminId, expectedPlanHash }) {
  if (!/^[a-f0-9]{24}$/i.test(adminId ?? '')) throw new Error('Explicit existing Admin required');
  const plan = await planCatalogWorkflows(connection);
  if (plan.hash !== expectedPlanHash || plan.entries.some((item) => item.state === 'CONFLICT'))
    throw new Error('Workflow plan changed or conflicts with Admin content');
  const admin = await connection.db.collection('users').findOne(
    {
      _id: new Types.ObjectId(adminId),
      state: 'ACTIVE',
      roles: 'ADMIN',
      synthetic: { $ne: true }
    },
    { projection: { _id: 1 }, maxTimeMS: 2000 }
  );
  if (!admin) throw new Error('Existing eligible Admin required');
  const actor = { userId: adminId, state: 'ACTIVE', roles: ['ADMIN'] };
  const service = createServiceWorkflowService({ connection });
  for (const entry of plan.entries) {
    if (!['NEW', 'RESUME_PUBLICATION'].includes(entry.state)) continue;
    if (entry.state === 'NEW')
      await service.mutate(
        actor,
        entry.serviceId,
        'DRAFT',
        {
          expectedVersion: 0,
          definition: serviceWorkflowDrafts.find((item) => item.code === entry.code).definition
        },
        `sourced-20261118:draft:${entry.code}`
      );
    await service.mutate(
      actor,
      entry.serviceId,
      'PUBLISH',
      { expectedVersion: 1 },
      `sourced-20261118:publish:${entry.code}`
    );
  }
  return planCatalogWorkflows(connection);
}
