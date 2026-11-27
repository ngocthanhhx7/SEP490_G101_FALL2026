import { controllerAction } from './controller-action.js';
import { AppError } from '../utils/app-error.js';

const checkoutUnavailable = () => {
  throw new AppError(503, 'COUNTER_CHECKOUT_UNAVAILABLE',
    'Counter checkout is not ready until pickup, grooming and visit payments are integrated atomically');
};

export function createCounterBookingController({ directory, pickup, checkout }) {
  return Object.freeze({
    catalog: controllerAction(200, () => directory.services()),
    lookup: controllerAction(200, req => directory.lookup(req.auth, req.body)),
    createCustomer: controllerAction(201, req => directory.createCustomer(req.auth, req.body)),
    createPet: controllerAction(201, req => directory.addPet(req.auth, req.params.customerId, req.body, req.get('Idempotency-Key'))),
    createAddress: controllerAction(201, req => directory.addAddress(req.auth, req.params.customerId, req.body, req.get('Idempotency-Key'))),
    petCatalog: controllerAction(200, () => directory.petCatalog()),
    pickupQuote: controllerAction(200, req => pickup.quote(req.auth, req.body)),
    slots: controllerAction(200, req => checkout ? checkout.slots(req.auth, req.body) : checkoutUnavailable()),
    preview: controllerAction(200, req => checkout ? checkout.preview(req.auth, req.body) : checkoutUnavailable()),
    status: controllerAction(200, req => checkout ? checkout.status(req.auth, req.params.receiptId) : checkoutUnavailable()),
    cancel: controllerAction(200, req => checkout ? checkout.cancel(req.auth, req.params.receiptId) : checkoutUnavailable()),
    checkout: controllerAction(201, req => checkout ? checkout.checkout(req.auth, req.body, req.get('Idempotency-Key')) : checkoutUnavailable())
  });
}
