import { Types } from 'mongoose';
import { serviceModel } from '../models/service.model.js';
import { provisionServicePresentation } from './service-presentation.service.js';
import { initialServiceDetails } from '../constants/initial-service-details.js';
export async function provisionServiceDetails(connection) {
  const Service = serviceModel(connection);
  const runs = connection.collection('catalogprovisioningruns');
  await runs.createIndex({ key: 1 }, { unique: true });
  return connection.transaction(async session => {
    const key = 'pawworld-service-details-v1';
    if (await runs.findOne({ key }, { session })) return { state: 'ALREADY_APPLIED' };
    const runId = new Types.ObjectId(), now = new Date();
    for (const [code, details] of Object.entries(initialServiceDetails)) {
      const service = await Service.findOne({ code }).session(session).lean();
      if (!service) throw new Error('Initial service must exist before detail provisioning');
      await provisionServicePresentation({ connection, serviceId: service._id,
        details: { ...details, provisioningRunId: runId, updatedAt: now }, session });
    }
    await runs.insertOne({ _id: runId, key, actorKind: 'SYSTEM_MIGRATION', createdAt: now,
      authorization: 'Project owner requested complete details for the three current services' }, { session });
    return { state: 'APPLIED' };
  });
}
