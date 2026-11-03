import { controllerAction } from './controller-action.js';

export function createProductCatalogController(service) {
  return {
    list: controllerAction(200, (req) => service.list(req.query)),
    read: controllerAction(200, (req) => service.read(req.params.productId))
  };
}
