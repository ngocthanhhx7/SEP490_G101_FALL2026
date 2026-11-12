import { controllerAction } from './controller-action.js';

export function createStockAdjustmentController(service) {
  return {
    searchProducts: controllerAction(200, req => service.searchProducts(req.auth, req.query)),
    readProduct: controllerAction(200, req => service.readProduct(req.auth, req.params.productId)),
    list: controllerAction(200, req => service.list(req.auth, req.query)),
    create: controllerAction(201, req => service.create(req.auth, req.body, req.get('Idempotency-Key')))
  };
}
