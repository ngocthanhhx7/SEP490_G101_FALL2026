import { controllerAction } from './controller-action.js';

export function createStockListController(service) {
  return {
    list: controllerAction(200, req => service.list(req.auth, req.query)),
    history: controllerAction(200, req => service.history(req.auth, req.params.productId, req.query))
  };
}
