import { controllerAction } from './controller-action.js';

export function createProductCustomerPriceController(service) {
  return controllerAction(200, req => service.read(req.auth, req.params.productId));
}
