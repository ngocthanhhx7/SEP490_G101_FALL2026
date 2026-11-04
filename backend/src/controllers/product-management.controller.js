import { controllerAction } from './controller-action.js';

export function createProductManagementController(service) {
  return {
    list: controllerAction(200, (req) => service.list(req.auth, req.query)),
    read: controllerAction(200, (req) => service.read(req.auth, req.params.productId)),
    create: controllerAction(201, (req) => service.create(req.auth, req.body)),
    update: controllerAction(200, (req) => service.update(req.auth, req.params.productId, req.body))
  };
}
