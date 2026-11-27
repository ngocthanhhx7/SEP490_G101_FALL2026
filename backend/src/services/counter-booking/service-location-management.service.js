import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { createCatalogChange } from '../../models/catalog-change-provenance.model.js';
import { serviceModel } from '../../models/service.model.js';
import { serviceVersionModel } from '../../models/service-version.model.js';

const ALLOWED = new Set(['HOME', 'FACILITY', 'OUTDOOR']);
export function validateServiceLocations(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !['locations', 'expectedVersion', 'reason'].includes(key))
    || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0
    || !Array.isArray(body.locations) || body.locations.length === 0 || body.locations.length > 3
    || body.locations.some(value => !ALLOWED.has(value))
    || new Set(body.locations).size !== body.locations.length
    || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.trim().length > 500) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Select at least one unique supported service location and give a reason');
  }
  return { expectedVersion: body.expectedVersion, locations: [...body.locations], reason: body.reason.trim() };
}

export function createServiceLocationManagement({ connection, clock = Date.now }) {
  const Service = serviceModel(connection), Version = serviceVersionModel(connection);
  return Object.freeze({
    async update(actor, serviceId, body) {
      if (actor?.state !== 'ACTIVE' || !actor.roles?.includes('ADMIN') || !Types.ObjectId.isValid(actor.userId))
        throw new AppError(403, 'FORBIDDEN', 'Admin required');
      if (!Types.ObjectId.isValid(serviceId)) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Service unavailable');
      const input = validateServiceLocations(body), id = new Types.ObjectId(serviceId);
      try {
        return await connection.transaction(async session => {
          const parent = await Service.findById(id).session(session).lean();
          if (!parent?.presentation) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Service presentation unavailable');
          const latest = await Version.findOne({ serviceId: id })
            .sort({ version: -1 }).session(session).lean();
          if (!latest || latest.version !== input.expectedVersion)
            throw new AppError(409, 'VERSION_CONFLICT', 'Service changed before this update');
          const time = new Date(clock());
          // The version tracks the admin modification and expires any in-flight
          // quotes, while already saved visits keep their embedded location.
          const [newVersion] = await Version.create([{
            changeAudit: createCatalogChange('SERVICE_VERSIONED', ['presentation.locations']),
            serviceId: id, version: latest.version + 1, name: latest.name,
            description: latest.description, scope: latest.scope,
            species: latest.species, state: latest.state,
            effectiveAt: time, changedBy: new Types.ObjectId(actor.userId),
            reason: input.reason, recordedAt: time
          }], { session });
          const result = await Service.updateOne({ _id: id, 'presentation.updatedAt': parent.presentation.updatedAt },
            { $set: { 'presentation.locations': input.locations, 'presentation.updatedAt': time } },
            { session, runValidators: true });
          if (result.matchedCount !== 1) throw new AppError(409, 'VERSION_CONFLICT', 'Service presentation changed before this update');
          return {
            serviceId: String(id), version: newVersion.version,
            locations: input.locations, updatedAt: time.toISOString()
          };
        }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } catch (error) {
        if (error?.code === 11000) throw new AppError(409, 'VERSION_CONFLICT', 'Concurrent service update');
        throw error;
      }
    }
  });
}
