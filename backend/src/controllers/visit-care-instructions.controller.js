import { controllerAction } from './controller-action.js';

export function createVisitCareInstructionsController(service) {
  return Object.freeze({
    read: controllerAction(200, req => service.getBookingCareInstructions(req.auth, req.params.id)),
    confirm: controllerAction(200, req =>
      service.confirmVisitCareInstructions(req.auth, req.params.id, req.params.visitId, req.body)
    )
  });
}
