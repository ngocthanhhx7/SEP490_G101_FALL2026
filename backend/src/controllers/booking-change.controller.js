import { controllerAction } from './controller-action.js';

export function createBookingChangeController(service) {
  return {
    options: controllerAction(200, req => service.options(req.auth, req.params.bookingId)),
    submit: controllerAction(201, req => service.submit(req.auth, req.params.bookingId, req.body, req.get('Idempotency-Key'))),
    list: controllerAction(200, req => service.list(req.auth, req.query)),
    detail: controllerAction(200, req => service.detail(req.params.id)),
    decide: controllerAction(200, req => service.decide(req.auth, req.params.id, req.body, req.get('Idempotency-Key')))
  };
}
