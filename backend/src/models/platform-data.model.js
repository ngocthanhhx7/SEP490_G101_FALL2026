import { petCareModels } from './pet-care.model.js';
import { pricingModels } from './pricing.model.js';
import { decisionSnapshotModels } from './decision-snapshot.model.js';
import { matchingModels } from './sitter-matching.model.js';
// Explicit seed/test composition; runtime services import only their owned models.
export function platformDataModels(connection) {
  return {
    ...petCareModels(connection),
    ...pricingModels(connection),
    ...decisionSnapshotModels(connection),
    ...matchingModels(connection)
  };
}
