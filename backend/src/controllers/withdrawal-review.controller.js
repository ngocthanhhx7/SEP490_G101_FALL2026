import { controllerAction } from './controller-action.js';

export function createWithdrawalReviewController(service) {
  return {
    details: controllerAction(200, req => service.details(req.auth, req.params.id)),
    decide: controllerAction(200, req => service.decide(req.auth, req.params.id, req.body, req.get('idempotency-key')))
  };
}
