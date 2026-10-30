import { controllerAction } from './controller-action.js';
export const createAssignedCareController = service => ({
  get: controllerAction(200, req => service.get(req.auth, req.params.id)),
  acknowledge: controllerAction(200, req => service.acknowledge(req.auth, req.params.id, req.body, req.get('Idempotency-Key'))),
  accessNotes: controllerAction(200, req => service.accessNotes(req.auth, req.params.id))
});
