import { controllerAction } from './controller-action.js';

export function createGroomingBookingController(service) {
  return {
    options: controllerAction(200, req => service.options(req.auth)),
    slots: controllerAction(200, req => service.slots(req.auth, req.body)),
    quote: controllerAction(200, req => service.quote(req.auth, req.body)),
    book: controllerAction(201, req => service.book(req.auth, req.body, req.get('Idempotency-Key'))),
    listAppointments: controllerAction(200, req => service.listAppointments(req.auth, req.query)),
    readAppointment: controllerAction(200, req => service.readAppointment(req.auth, req.params.id))
  };
}
