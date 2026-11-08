import { controllerAction } from './controller-action.js';

export function createCounterSaleController(service, catalog) {
  return {
    products: controllerAction(200, req => catalog.products(req.auth, req.query)),
    preview: controllerAction(200, req => catalog.preview(req.auth, req.body)),
    lookup: controllerAction(200, req => catalog.lookup(req.auth, req.body)),
    list: controllerAction(200, req => service.list(req.auth, req.query)),
    create: controllerAction(201, req => service.create(req.auth, req.body, req.get('Idempotency-Key'))),
    read: controllerAction(200, req => service.read(req.auth, req.params.orderId)),
    recordCash: controllerAction(200, req => service.recordCash(req.auth, req.params.orderId, req.body)),
    complete: controllerAction(200, req => service.complete(req.auth, req.params.orderId, req.body)),
    cancel: controllerAction(200, req => service.cancel(req.auth, req.params.orderId, req.body))
  };
}
