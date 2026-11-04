import { controllerAction } from './controller-action.js';

export function createProductOrderController(service) {
  return {
    place: controllerAction(201, (req) => service.place(req.auth, req.body, req.get('Idempotency-Key'))),
    list: controllerAction(200, (req) => service.list(req.auth, req.query)),
    read: controllerAction(200, (req) => service.read(req.auth, req.params.orderId))
  };
}
