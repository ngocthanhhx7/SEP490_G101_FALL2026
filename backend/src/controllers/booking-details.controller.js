import { controllerAction } from './controller-action.js';

export function createBookingDetailsController(service, pickup) {
  return {
    readStaff: controllerAction(200, req => service.readStaff(req.auth, req.params.id)),
    recordPickup: controllerAction(200, req => pickup.record(req.auth, req.params.id, req.params.visitId, req.params.action))
  };
}
