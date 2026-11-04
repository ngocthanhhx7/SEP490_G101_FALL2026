import { controllerAction } from './controller-action.js';

export function createProductCartController(service) {
  return {
    read: controllerAction(200, (req) => service.read(req.auth)),
    addLine: controllerAction(201, (req) => service.addLine(req.auth, req.body)),
    setLine: controllerAction(200, (req) => service.setLine(req.auth, req.params.productId, req.body)),
    removeLine: controllerAction(200, (req) => service.removeLine(req.auth, req.params.productId))
  };
}
