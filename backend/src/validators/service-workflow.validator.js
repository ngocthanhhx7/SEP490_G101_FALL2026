import { Buffer } from 'node:buffer';
import { AppError } from '../utils/app-error.js';

export const WORKFLOW_PHASES = ['CHECK_IN', 'EXECUTION', 'CHECK_OUT'];
export const WORKFLOW_LIMITS = Object.freeze({ steps: 24, tasks: 240, evidence: 240 });
export function workflowFail(code, message = code, status = 422, details = {}) {
  throw new AppError(status, code, message, details);
}
export function workflowExact(value, keys, required = keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    workflowFail('VALIDATION_FAILED');
}
export function workflowText(value, max = 1000, min = 0) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) workflowFail('VALIDATION_FAILED');
  return value.trim();
}
export function workflowCode(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(value)) workflowFail('VALIDATION_FAILED');
  return value;
}
export function workflowVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) workflowFail('VALIDATION_FAILED');
  return value;
}
export function workflowKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_:-]{8,128}$/.test(value)) workflowFail('VALIDATION_FAILED');
  return value;
}
const flag = (value) => {
  if (typeof value !== 'boolean') workflowFail('VALIDATION_FAILED');
  return value;
};
function choices(value, allowed) {
  if (
    !Array.isArray(value) ||
    value.length > allowed.length ||
    value.some((item) => !allowed.includes(item)) ||
    new Set(value).size !== value.length
  )
    workflowFail('VALIDATION_FAILED');
  return [...value].sort();
}
export function validateWorkflow(
  value,
  {
    publishing = false,
    supportedSpecies = ['DOG', 'CAT'],
    supportedLocations = ['HOME', 'FACILITY', 'OUTDOOR', 'SHOP', 'TRANSPORT']
  } = {}
) {
  workflowExact(value, ['title', 'steps']);
  const title = workflowText(value.title, 120, 2);
  if (!Array.isArray(value.steps) || value.steps.length > WORKFLOW_LIMITS.steps || (publishing && !value.steps.length))
    workflowFail('WORKFLOW_INVALID');
  const seen = new Set();
  let phase = -1;
  const steps = value.steps.map((step) => {
    workflowExact(step, [
      'stepId',
      'title',
      'instructions',
      'phase',
      'scope',
      'inputType',
      'required',
      'canSkip',
      'safetyCritical',
      'customerVisible',
      'photoSlots',
      'species',
      'locations',
      'fields'
    ]);
    const stepId = workflowCode(step.stepId);
    if (
      seen.has(stepId) ||
      !WORKFLOW_PHASES.includes(step.phase) ||
      WORKFLOW_PHASES.indexOf(step.phase) < phase ||
      !['PER_VISIT', 'PER_PET'].includes(step.scope) ||
      !['CONFIRMATION', 'PHOTO', 'NOTE', 'CHECKLIST', 'STRUCTURED'].includes(step.inputType)
    )
      workflowFail('WORKFLOW_INVALID');
    seen.add(stepId);
    phase = WORKFLOW_PHASES.indexOf(step.phase);
    for (const key of ['required', 'canSkip', 'safetyCritical', 'customerVisible']) flag(step[key]);
    if (step.safetyCritical && !step.required) workflowFail('WORKFLOW_UNSAFE_SKIP');
    if (step.canSkip && (step.safetyCritical || step.phase !== 'EXECUTION')) workflowFail('WORKFLOW_UNSAFE_SKIP');
    if (
      !Array.isArray(step.photoSlots) ||
      step.photoSlots.length > 4 ||
      !Array.isArray(step.fields) ||
      step.fields.length > 8
    )
      workflowFail('WORKFLOW_INVALID');
    const slotIds = new Set(),
      fieldIds = new Set();
    const photoSlots = step.photoSlots.map((slot) => {
      workflowExact(slot, ['photoSlotId', 'title', 'instructions', 'minPhotos', 'maxPhotos']);
      const photoSlotId = workflowCode(slot.photoSlotId);
      if (
        slotIds.has(photoSlotId) ||
        !Number.isInteger(slot.minPhotos) ||
        !Number.isInteger(slot.maxPhotos) ||
        slot.minPhotos < 0 ||
        slot.maxPhotos < 1 ||
        slot.maxPhotos > 3 ||
        slot.minPhotos > slot.maxPhotos
      )
        workflowFail('WORKFLOW_INVALID');
      slotIds.add(photoSlotId);
      return {
        photoSlotId,
        title: workflowText(slot.title, 120, 1),
        instructions: workflowText(slot.instructions, 1000),
        minPhotos: slot.minPhotos,
        maxPhotos: slot.maxPhotos
      };
    });
    if (
      (step.canSkip && photoSlots.some((slot) => slot.minPhotos > 0)) ||
      (publishing && step.inputType === 'PHOTO' && !photoSlots.some((slot) => slot.minPhotos > 0))
    )
      workflowFail('WORKFLOW_INVALID');
    const fields = step.fields.map((field) => {
      workflowExact(field, ['fieldId', 'label', 'type', 'required', 'min', 'max']);
      const fieldId = workflowCode(field.fieldId);
      if (
        fieldIds.has(fieldId) ||
        !['TEXT', 'NUMBER'].includes(field.type) ||
        !Number.isFinite(field.min) ||
        !Number.isFinite(field.max) ||
        field.min > field.max ||
        Math.abs(field.min) > 1e6 ||
        Math.abs(field.max) > 1e6
      )
        workflowFail('WORKFLOW_INVALID');
      fieldIds.add(fieldId);
      return {
        fieldId,
        label: workflowText(field.label, 120, 1),
        type: field.type,
        required: flag(field.required),
        min: field.min,
        max: field.max
      };
    });
    if (publishing && ['CHECKLIST', 'STRUCTURED'].includes(step.inputType) && !fields.length)
      workflowFail('WORKFLOW_INVALID');
    return {
      stepId,
      title: workflowText(step.title, 120, 1),
      instructions: workflowText(step.instructions, 2000),
      phase: step.phase,
      scope: step.scope,
      inputType: step.inputType,
      required: step.required,
      canSkip: step.canSkip,
      safetyCritical: step.safetyCritical,
      customerVisible: step.customerVisible,
      photoSlots,
      fields,
      species: choices(step.species, ['DOG', 'CAT']),
      locations: choices(step.locations, ['HOME', 'FACILITY', 'OUTDOOR', 'SHOP', 'TRANSPORT'])
    };
  });
  const result = { title, steps };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 65536) workflowFail('WORKFLOW_TOO_LARGE');
  if (publishing)
    for (const species of supportedSpecies)
      for (const location of supportedLocations) {
        const applicable = steps.filter(
          (step) =>
            (!step.species.length || step.species.includes(species)) &&
            (!step.locations.length || step.locations.includes(location))
        );
        for (const expected of WORKFLOW_PHASES)
          if (!applicable.some((step) => step.phase === expected && step.required))
            workflowFail('WORKFLOW_BRANCH_INCOMPLETE');
      }
  return result;
}
export function validateWorkflowTask(value) {
  workflowExact(
    value,
    ['expectedVersion', 'taskKey', 'status', 'note', 'skipReason', 'values', 'photoSlotId', 'mediaId'],
    ['expectedVersion', 'taskKey', 'status']
  );
  workflowVersion(value.expectedVersion);
  if (
    typeof value.taskKey !== 'string' ||
    !/^[a-z][a-z0-9-]{0,39}:(visit|[a-f0-9]{24})$/.test(value.taskKey) ||
    !['IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED', 'NEEDS_REVIEW'].includes(value.status)
  )
    workflowFail('VALIDATION_FAILED');
  const result = {
    expectedVersion: value.expectedVersion,
    taskKey: value.taskKey,
    status: value.status,
    note: workflowText(value.note ?? '', 1000),
    skipReason: workflowText(value.skipReason ?? '', 1000),
    values: value.values ?? {}
  };
  if (
    !result.values ||
    typeof result.values !== 'object' ||
    Array.isArray(result.values) ||
    Object.keys(result.values).length > 8
  )
    workflowFail('VALIDATION_FAILED');
  if (value.mediaId !== undefined || value.photoSlotId !== undefined) {
    if (typeof value.mediaId !== 'string' || !/^[a-f0-9]{64}$/.test(value.mediaId)) workflowFail('VALIDATION_FAILED');
    result.mediaId = value.mediaId;
    result.photoSlotId = workflowCode(value.photoSlotId);
  }
  return result;
}
