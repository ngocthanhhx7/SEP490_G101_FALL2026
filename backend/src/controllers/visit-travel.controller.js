import { controllerAction } from './controller-action.js';

export function createVisitTravelController({ service }) {
  return {
    list: controllerAction(200, req => service.list(req.auth, req.query)),
    get: controllerAction(200, req => service.get(req.auth, req.params.id)),
    command: controllerAction(200, req => service.command(req.auth, req.params.id, req.body)),
    locate: controllerAction(200, req => service.locate(req.auth, req.params.id, req.body)),
    eta: controllerAction(200, req => service.eta(req.auth, req.params.id, req.body))
  };
}
