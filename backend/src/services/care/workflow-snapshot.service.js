import { createHash } from 'node:crypto';
import { workflowFail, WORKFLOW_LIMITS } from '../../validators/service-workflow.validator.js';

export const workflowHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function workflowTasks(snapshot, pets, location) {
  if (!snapshot) return [];
  if (!Array.isArray(pets) || !pets.length || pets.length > 10)
    workflowFail('WORKFLOW_PETS_INVALID', 'Saved pet context required', 409);
  const tasks = snapshot.definition.steps.flatMap((step) => {
    if (step.locations.length && !step.locations.includes(location)) return [];
    const applicable = pets.filter((pet) => !step.species.length || step.species.includes(pet.species));
    if (!applicable.length) return [];
    return (step.scope === 'PER_PET' ? applicable : [null]).map((pet) => ({
      taskKey: `${step.stepId}:${pet?.id ?? 'visit'}`,
      stepId: step.stepId,
      petId: pet?.id ?? null,
      petName: pet?.name ?? null,
      step
    }));
  });
  if (
    tasks.length > WORKFLOW_LIMITS.tasks ||
    tasks.reduce((n, task) => n + task.step.photoSlots.reduce((s, slot) => s + slot.maxPhotos, 0), 0) >
      WORKFLOW_LIMITS.evidence
  )
    workflowFail('WORKFLOW_TOO_LARGE', 'Split this care plan before booking', 409);
  return tasks;
}
export async function captureServiceWorkflow(connection, serviceId, pets, location, session) {
  const service = await connection.db
    .collection('services')
    .findOne({ _id: serviceId }, { session, projection: { workflowPublished: 1 }, maxTimeMS: 2000 });
  if (service && session) {
    // Publish/retire and checkout must serialize on the same Service row.
    const guarded = await connection.db
      .collection('services')
      .updateOne({ _id: serviceId }, { $inc: { workflowCheckoutGuard: 1 } }, { session });
    if (!guarded.matchedCount) workflowFail('VERSION_CONFLICT', 'Reload service workflow', 409);
  }
  if (!service?.workflowPublished) return undefined;
  const snapshot = globalThis.structuredClone(service.workflowPublished);
  if (workflowHash(snapshot.definition) !== snapshot.hash)
    workflowFail('WORKFLOW_SNAPSHOT_INVALID', 'Published workflow requires review', 409);
  const tasks = workflowTasks(snapshot, pets, location);
  for (const phase of ['CHECK_IN', 'EXECUTION', 'CHECK_OUT']) {
    for (const pet of pets)
      if (
        !tasks.some(
          (task) => task.step.phase === phase && task.step.required && (task.petId === null || task.petId === pet.id)
        )
      )
        workflowFail('WORKFLOW_BRANCH_INCOMPLETE', 'Current service context requires an approved workflow branch', 409);
  }
  return snapshot;
}
export function workflowMissing(visit, phases) {
  const snapshot = visit.snapshots?.workflow;
  if (!snapshot) return [];
  if (workflowHash(snapshot.definition) !== snapshot.hash)
    workflowFail('WORKFLOW_SNAPSHOT_INVALID', 'Workflow snapshot requires review', 409);
  return workflowTasks(snapshot, visit.snapshots.pets, visit.location)
    .filter((task) => phases.includes(task.step.phase))
    .flatMap((task) => {
      const result = visit.workflowResults?.find((row) => row.taskKey === task.taskKey);
      const missing = [];
      if (['BLOCKED', 'NEEDS_REVIEW'].includes(result?.status)) missing.push('NEEDS_REVIEW');
      if (task.step.required && !['COMPLETED', ...(task.step.canSkip ? ['SKIPPED'] : [])].includes(result?.status))
        missing.push('TASK_REQUIRED');
      for (const slot of task.step.photoSlots)
        if ((result?.evidence ?? []).filter((row) => row.photoSlotId === slot.photoSlotId).length < slot.minPhotos)
          missing.push(`PHOTO_SLOT:${slot.photoSlotId}`);
      return missing.length
        ? [{ taskKey: task.taskKey, stepId: task.stepId, petId: task.petId, reasons: missing }]
        : [];
    });
}
export function assertWorkflowGate(visit, phases) {
  const missing = workflowMissing(visit, phases);
  if (missing.length)
    workflowFail('WORKFLOW_INCOMPLETE', 'Complete the indicated care tasks', 409, { missingTasks: missing });
}
export function workflowProjection(visit, { customer = false } = {}) {
  const snapshot = visit.snapshots?.workflow;
  if (!snapshot) return { mode: 'LEGACY', tasks: [], completed: 0, total: 0 };
  const tasks = workflowTasks(snapshot, visit.snapshots.pets, visit.location)
    .filter((task) => !customer || task.step.customerVisible)
    .map((task) => {
      const result = visit.workflowResults?.find((row) => row.taskKey === task.taskKey);
      return {
        ...task,
        status: result?.status ?? 'PENDING',
        note: result?.note ?? '',
        skipReason: result?.skipReason ?? '',
        values: result?.values ?? {},
        completedBy: result?.completedBy ?? null,
        updatedAt: result?.updatedAt ?? null,
        evidence: (result?.evidence ?? []).map(({ mediaId, photoSlotId, receivedAt, uploadedBy }) => ({
          mediaId,
          photoSlotId,
          receivedAt,
          uploadedBy
        }))
      };
    });
  return {
    mode: 'VERSIONED',
    title: snapshot.definition.title,
    revision: snapshot.revision,
    hash: snapshot.hash,
    tasks,
    completed: tasks.filter((task) => ['COMPLETED', 'SKIPPED'].includes(task.status)).length,
    total: tasks.length
  };
}
