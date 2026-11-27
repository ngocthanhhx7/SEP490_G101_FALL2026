import { controllerAction } from './controller-action.js';

export const createVisitHandoverController = service => ({
  get: controllerAction(200, req => service.get(req.auth, req.params.id)),
  confirm: controllerAction(200, req => service.confirm(req.auth, req.params.id, req.body, req.get('Idempotency-Key')))
});
