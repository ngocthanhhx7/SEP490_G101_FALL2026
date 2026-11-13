import { controllerAction } from './controller-action.js';

export function createGroomingBookingController(service) {
  return {
    options: controllerAction(200, req => service.options(req.auth)),
    slots: controllerAction(200, req => service.slots(req.auth, req.body)),
    quote: controllerAction(200, req => service.quote(req.auth, req.body))
  };
}
