import { controllerAction } from './controller-action.js';

export function createProductOrderManagementController(service) {
  return {
    list: controllerAction(200, (req) => service.list(req.auth, req.query)),
    read: controllerAction(200, (req) => service.read(req.auth, req.params.orderId)),
    handToCarrier: controllerAction(200, (req) => service.handToCarrier(req.auth, req.params.orderId, req.body)),
    markReady: controllerAction(200, (req) => service.markReady(req.auth, req.params.orderId, req.body)),
    markDelivered: controllerAction(200, (req) => service.markDelivered(req.auth, req.params.orderId, req.body)),
    markReturning: controllerAction(200, (req) => service.markReturning(req.auth, req.params.orderId, req.body)),
    confirmReturned: controllerAction(200, (req) => service.confirmReturned(req.auth, req.params.orderId, req.body)),
    handToCustomer: controllerAction(200, (req) => service.handToCustomer(req.auth, req.params.orderId, req.body)),
    recordPayment: controllerAction(200, (req) => service.recordPayment(req.auth, req.params.orderId, req.body)),
    cancel: controllerAction(200, (req) => service.cancel(req.auth, req.params.orderId, req.body))
  };
}
