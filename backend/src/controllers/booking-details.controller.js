import { controllerAction } from './controller-action.js';

export function createBookingDetailsController(service) {
  return {
    readStaff: controllerAction(200, req => service.readStaff(req.auth, req.params.id))
  };
}
