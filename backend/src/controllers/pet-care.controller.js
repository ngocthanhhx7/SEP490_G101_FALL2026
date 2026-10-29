import { controllerAction } from './controller-action.js';

export function createPetCareController({ management }) {
  return {
    catalog: controllerAction(200, () => management.catalog()),
    pets: controllerAction(200, (req) => management.listPets(req.auth.userId)),
    addresses: controllerAction(200, (req) =>
      management.listAddresses(req.auth.userId)
    ),
    pet: controllerAction(201, (req) =>
      management.createPet(req.auth.userId, req.body)
    ),
    address: controllerAction(201, (req) =>
      management.createAddress(req.auth.userId, req.body)
    )
  };
}
