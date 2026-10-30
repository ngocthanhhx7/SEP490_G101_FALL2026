import { controllerAction } from './controller-action.js';

export function createPetCareController({ management }) {
  return {
    catalog: controllerAction(200, () => management.catalog()),
    pets: controllerAction(200, (req) => management.listPets(req.auth.userId)),
    addresses: controllerAction(200, (req) =>
      management.listAddresses(req.auth.userId)
    ),
    managedAddresses: controllerAction(200, req => management.listAddresses(req.auth.userId, true)),
    pet: controllerAction(201, (req) =>
      management.createPet(req.auth.userId, req.body, req.get('Idempotency-Key'))
    ),
    address: controllerAction(201, (req) =>
      management.createAddress(req.auth.userId, req.body, req.get('Idempotency-Key'))
    ),
    updatePet: controllerAction(200, req => management.update(req.auth.userId, 'pet', req.params.id, req.body, req.get('Idempotency-Key'))),
    updateAddress: controllerAction(200, req => management.update(req.auth.userId, 'address', req.params.id, req.body, req.get('Idempotency-Key'))),
    archivePet: controllerAction(200, req => management.archive(req.auth.userId, 'pet', req.params.id, req.body, req.get('Idempotency-Key'))),
    archiveAddress: controllerAction(200, req => management.archive(req.auth.userId, 'address', req.params.id, req.body, req.get('Idempotency-Key')))
  };
}
