import { Types } from 'mongoose';
import { serviceModel } from '../models/service.model.js';
import { servicePresentationFields } from '../models/service-presentation.model.js';

const fields = Object.keys(servicePresentationFields());
export function presentationValue(row) {
  return Object.fromEntries(fields.filter(field => row[field] !== undefined).map(field => [field, row[field]]));
}

export async function readServicePresentation(connection, serviceId, session = null) {
  const id = new Types.ObjectId(String(serviceId));
  const service = await serviceModel(connection).findById(id).select('presentation').session(session).lean();
  return service?.presentation ?? null;
}

// The parent is authoritative after the verified copy. Legacy restoration is
// explicit operator work; runtime provisioning never mirrors/recreates it.
export async function provisionServicePresentation({ connection, serviceId, details, session, fillMissing = [], fillOwnerId }) {
  const Service = serviceModel(connection);
  const service = await Service.findById(serviceId).select('presentation').session(session).lean();
  if (!service) throw new Error('Service presentation requires its parent');
  const presentation = presentationValue(service.presentation ?? details);
  for (const field of String(presentation.provisioningRunId) === String(fillOwnerId) ? fillMissing : []) {
    if (presentation[field] === undefined || (Array.isArray(presentation[field]) && !presentation[field].length)) {
      if (details[field] !== undefined) presentation[field] = details[field];
    }
  }
  await Service.updateOne({ _id: serviceId }, { $set: { presentation } }, { session, runValidators: true });
}
