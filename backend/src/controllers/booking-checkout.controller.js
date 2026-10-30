import { controllerAction } from './controller-action.js';
export function createBookingCheckoutController(service) {
  return {
    availability: controllerAction(200, req => service.search(req.auth, req.body)),
    options: controllerAction(200, req => service.options(req.auth)),
    confirm: controllerAction(201, req => service.confirm(req.auth, req.body, req.get('Idempotency-Key'))),
    read: controllerAction(200, req => service.read(req.auth, req.params.id)),
    paymentLink: controllerAction(200, req => service.paymentLink(req.auth, req.params.id, req.get('Idempotency-Key')))
  };
}
