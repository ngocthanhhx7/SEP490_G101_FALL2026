import { controllerAction } from './controller-action.js';

export function createGoodsReceiptController(service) {
  return {
    listSuppliers: controllerAction(200, (req) => service.listSuppliers(req.auth)),
    searchProducts: controllerAction(200, (req) => service.searchProducts(req.auth, req.query)),
    listRecent: controllerAction(200, (req) => service.listRecent(req.auth, req.query)),
    read: controllerAction(200, (req) => service.read(req.auth, req.params.code)),
    create: controllerAction(201, (req) => service.create(req.auth, req.body, req.get('Idempotency-Key')))
  };
}
