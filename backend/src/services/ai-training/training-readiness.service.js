import { createTrainingDatasetExporter } from './dataset-export.service.js';
import { fail } from '../../validators/pet-care.validator.js';

// A bounded source join, not a model-quality evaluation or an export of private rows.
export function createTrainingReadinessService({ connection, clock = Date.now }) {
  const exporter = createTrainingDatasetExporter({ connection, clock });
  return { async read(actor) {
    if (actor?.state !== 'ACTIVE' || !actor.roles?.includes('ADMIN')) fail('FORBIDDEN', 'Admin required', 403);
    const { summary } = await exporter.collect({ limit: 500, budgetMs: 8000 });
    return { ...summary, scanLimit: 500, minimumObservations: 200, minimumBookingGroups: 50,
      missingObservations: Math.max(0, 200 - summary.eligibleRows), missingBookingGroups: Math.max(0, 50 - summary.bookingGroups),
      nextStep: summary.truncated ? 'OFFLINE_FULL_AUDIT' : summary.readyForTraining ? 'EXPORT_AND_TEMPORAL_EVALUATION' : 'COLLECT_VERIFIED_OUTCOMES',
      temporalEvaluationRequired: true, automaticTraining: false, asOf: new Date(clock()) };
  } };
}
