import { Types } from 'mongoose';
import { servicePolicyVersionModel } from '../models/service-policy-version.model.js';
import { systemSettingVersionModel } from '../models/system-setting-version.model.js';
import { serviceVersionModel } from '../models/service-version.model.js';
import { serviceModel } from '../models/service.model.js';
import { petCareModels } from '../models/pet-care.model.js';
import { fail } from '../validators/pet-care.validator.js';
export function createPetCareContext(connection, clock = Date.now) {
  const models = petCareModels(connection),
    Service = serviceModel(connection),
    ServiceVersion = serviceVersionModel(connection),
    ServicePolicy = servicePolicyVersionModel(connection),
    Setting = systemSettingVersionModel(connection);
  return {
    async context(ownerId, input) {
      const now = new Date(clock()),
        serviceId = new Types.ObjectId(input.serviceId);
      const [service, version, pets, address, clinic] = await Promise.all([
        Service.findById(serviceId).lean(),
        ServiceVersion.findOne({ serviceId, effectiveAt: { $lte: now } })
          .sort({ effectiveAt: -1, version: -1 })
          .lean(),
        models.Pet.find({
          _id: { $in: input.petIds },
          ownerId,
          state: 'ACTIVE'
        }).lean(),
        input.addressId
          ? models.CustomerAddress.findOne({
              _id: input.addressId,
              ownerId,
              state: 'ACTIVE'
            })
              .select('+point')
              .lean()
          : null,
        input.clinicAddressId
          ? models.CustomerAddress.findOne({
              _id: input.clinicAddressId,
              ownerId,
              state: 'ACTIVE'
            })
              .select('+point')
              .lean()
          : null
      ]);
      const [servicePolicy, catalog] = await Promise.all([
        ServicePolicy.findOne({ serviceId, effectiveAt: { $lte: now } })
          .sort({ effectiveAt: -1, version: -1 })
          .lean(),
        Setting.findOne({
          key: 'SERVICE_CATALOG_VISIBLE',
          effectiveAt: { $lte: now }
        })
          .sort({ effectiveAt: -1, version: -1 })
          .lean()
      ]);
      if (servicePolicy?.state !== 'PUBLISHED' || catalog?.enabled !== true)
        fail(
          'SERVICE_UNAVAILABLE',
          'Service catalog or published policy unavailable',
          409
        );
      if (!service || version?.state !== 'ACTIVE')
        fail('SERVICE_UNAVAILABLE', 'Service unavailable', 409);
      if (pets.length !== input.petIds.length)
        fail('RESOURCE_NOT_FOUND', 'Owned pet unavailable', 404);
      if (pets.some((p) => !version.species.includes(p.species)))
        fail(
          'SPECIES_NOT_SUPPORTED',
          'Service does not support these pets',
          409
        );
      const breeds = await models.PetBreed.find({
        code: { $in: pets.map((p) => p.breedCode) },
        active: true
      }).lean();
      if (
        pets.some(
          (p) =>
            !breeds.some(
              (b) => b.code === p.breedCode && b.species === p.species
            )
        )
      )
        fail(
          'BREED_DATA_REQUIRED',
          'Choose a supported breed or explicit mixed/unknown breed',
          409
        );
      if (input.addressId && (!address || !address.pointConfirmedAt))
        fail('RESOURCE_NOT_FOUND', 'Confirmed owned address unavailable', 404);
      if (input.clinicAddressId && (!clinic || !clinic.pointConfirmedAt))
        fail('RESOURCE_NOT_FOUND', 'Confirmed clinic address unavailable', 404);
      return { service, version, servicePolicy, pets, address, clinic };
    }
  };
}
