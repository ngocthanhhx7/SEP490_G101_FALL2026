import { controllerAction } from './controller-action.js';

export function createSupplierManagementController(service) {
  return {
    list: controllerAction(200, (req) => service.list(req.auth, req.query)),
    read: controllerAction(200, (req) => service.read(req.auth, req.params.supplierId)),
    create: controllerAction(201, (req) => service.create(req.auth, req.body)),
    update: controllerAction(200, (req) => service.update(req.auth, req.params.supplierId, req.body)),
    stop: controllerAction(200, (req) => service.stop(req.auth, req.params.supplierId, req.body)),
    resume: controllerAction(200, (req) => service.resume(req.auth, req.params.supplierId, req.body))
  };
}
