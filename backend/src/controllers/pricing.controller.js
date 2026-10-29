import { controllerAction } from './controller-action.js';

export function createPricingController({ service, management }) {
  return {
    quote: controllerAction(201, (req) =>
      service.quote(req.auth.userId, req.body)
    ),
    read: controllerAction(200, (req) =>
      service.readDecision(req.auth.userId, req.params.quoteId)
    ),
    policy: controllerAction(201, (req) =>
      management.pricing(req.auth, req.body)
    )
  };
}
