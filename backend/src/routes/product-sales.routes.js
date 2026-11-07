import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createProductPhotoController } from '../controllers/product-photo.controller.js';
import { createProductPhotoService } from '../services/product-sales/product-photo.service.js';
import { PRODUCT_PHOTO_LIMITS, PRODUCT_PHOTO_TYPES } from '../constants/product-photos.js';
import { createMediaAdmission, createAdmissionMiddleware, parseBody } from './private-image.routes.js';
import { createProductCatalogController } from '../controllers/product-catalog.controller.js';
import { createProductCartController } from '../controllers/product-cart.controller.js';
import { createProductOrderController } from '../controllers/product-order.controller.js';
import { createProductOrderManagementController } from '../controllers/product-order-management.controller.js';
import { createProductManagementController } from '../controllers/product-management.controller.js';
import { createSupplierManagementController } from '../controllers/supplier-management.controller.js';
import { createGoodsReceiptController } from '../controllers/goods-receipt.controller.js';
import { createProductCatalogService } from '../services/product-sales/product-catalog.service.js';
import { createProductCartService } from '../services/product-sales/product-cart.service.js';
import { createProductOrderService } from '../services/product-sales/product-order.service.js';
import { createProductOrderManagementService } from '../services/product-sales/product-order-management.service.js';
import { createProductManagementService } from '../services/product-sales/product-management.service.js';
import { createSupplierManagementService } from '../services/product-sales/supplier-management.service.js';
import { createGoodsReceiptService } from '../services/product-sales/goods-receipt.service.js';
import { createCustomerPhoneDirectory } from '../services/product-sales/customer-phone-directory.service.js';
import { createContactCrypto } from '../services/contact-crypto.service.js';
import { createSessionService } from '../services/session.service.js';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';
import { PRODUCT_PERMISSIONS } from '../constants/product-permissions.js';

const noStore = (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };

// Disabled unless PRODUCT_SALES_ENABLED=true; needs authentication because cart and orders are Customer-only.
export function productSalesRuntimeModules({ config, connection, env = {}, clock = Date.now, sessionService }) {
  if (env.PRODUCT_SALES_ENABLED !== undefined && !['true', 'false'].includes(env.PRODUCT_SALES_ENABLED)) {
    throw new TypeError('Invalid PRODUCT_SALES_ENABLED');
  }
  if (env.PRODUCT_SALES_ENABLED !== 'true' || !config.auth?.enabled || !connection?.db) return [];
  const session = sessionService ?? createSessionService({ connection, clock,
    tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const csrf = requireCsrf(session), customer = requireRoles('CUSTOMER');

  const catalog = createProductCatalogController(createProductCatalogService({ connection }));
  const photos = createProductPhotoController(createProductPhotoService({ connection }));
  const catalogRouter = Router();
  catalogRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  catalogRouter.get('/', catalog.list);
  catalogRouter.get('/:productId', catalog.read);
  catalogRouter.get('/:productId/photos/:digest', photos.read);

  const cart = createProductCartController(createProductCartService({ connection }));
  const cartRouter = Router();
  cartRouter.use(noStore, requireSession(session, { clock }), customer);
  cartRouter.get('/', cart.read);
  cartRouter.post('/lines', csrf, cart.addLine);
  cartRouter.patch('/lines/:productId', csrf, cart.setLine);
  cartRouter.delete('/lines/:productId', csrf, cart.removeLine);

  const orders = createProductOrderController(createProductOrderService({ connection, serviceAreas: DEMO_WORK_AREAS }));
  const orderRouter = Router();
  orderRouter.use(noStore, requireSession(session, { clock }), customer);
  orderRouter.get('/', orders.list);
  orderRouter.post('/', csrf, orders.place);
  orderRouter.get('/:orderId', orders.read);

  // Who may handle orders comes from PRODUCT_PERMISSIONS (today Admin only; a Sale Staff role is a separate change).
  // Customer phone numbers are read through the same contact keys as sign-in (D-217); only Admin reaches this router.
  const contactCrypto = createContactCrypto({
    lookupSecret: config.auth.contactLookupSecret,
    encryptionKey: config.auth.contactEncryptionKey
  });
  const phones = createCustomerPhoneDirectory({ connection, contactCrypto });
  const management = createProductOrderManagementController(createProductOrderManagementService({ connection, phones, clock }));
  const managementRouter = Router();
  managementRouter.use(noStore, requireSession(session, { clock }), requireRoles(...PRODUCT_PERMISSIONS.HANDLE_ORDERS));
  managementRouter.get('/', management.list);
  managementRouter.get('/:orderId', management.read);
  managementRouter.post('/:orderId/hand-to-carrier', csrf, management.handToCarrier);
  managementRouter.post('/:orderId/mark-delivered', csrf, management.markDelivered);
  managementRouter.post('/:orderId/mark-returning', csrf, management.markReturning);
  managementRouter.post('/:orderId/confirm-returned', csrf, management.confirmReturned);
  managementRouter.post('/:orderId/mark-ready', csrf, management.markReady);
  managementRouter.post('/:orderId/hand-to-customer', csrf, management.handToCustomer);
  managementRouter.post('/:orderId/record-payment', csrf, management.recordPayment);
  managementRouter.post('/:orderId/cancel', csrf, management.cancel);

  // Product Management: who may use it comes from PRODUCT_PERMISSIONS.MANAGE_PRODUCTS.
  const productManagement = createProductManagementController(createProductManagementService({ connection }));
  const productManagementRouter = Router();
  productManagementRouter.use(noStore, requireSession(session, { clock }), requireRoles(...PRODUCT_PERMISSIONS.MANAGE_PRODUCTS));
  productManagementRouter.get('/', productManagement.list);
  productManagementRouter.post('/', csrf, productManagement.create);
  productManagementRouter.get('/:productId', productManagement.read);
  productManagementRouter.patch('/:productId', csrf, productManagement.update);
  productManagementRouter.delete('/:productId', csrf, productManagement.remove);
  const photoRate = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: req => req.auth.userId });
  const photoAdmission = createMediaAdmission({ limit: 2 });
  const parsePhoto = express.raw({ type: PRODUCT_PHOTO_TYPES, limit: PRODUCT_PHOTO_LIMITS.maxBytes });
  const uploadPhoto = createAdmissionMiddleware({ admission: photoAdmission, work: async (req, res) => {
    await parseBody(parsePhoto, req, res);
    return photos.upload(req, res);
  } });
  productManagementRouter.post('/:productId/photos', csrf, photoRate, uploadPhoto);
  productManagementRouter.put('/:productId/photos/:photoIndex', csrf, photoRate, uploadPhoto);
  productManagementRouter.delete('/:productId/photos/:photoIndex', csrf, photoRate, photos.remove);
  productManagementRouter.get('/:productId/photos/:digest', photos.readAdmin);

  // Supplier Management: who may use it comes from PRODUCT_PERMISSIONS.MANAGE_SUPPLIERS.
  const supplierManagement = createSupplierManagementController(createSupplierManagementService({ connection }));
  const supplierRouter = Router();
  supplierRouter.use(noStore, requireSession(session, { clock }), requireRoles(...PRODUCT_PERMISSIONS.MANAGE_SUPPLIERS));
  supplierRouter.get('/', supplierManagement.list);
  supplierRouter.post('/', csrf, supplierManagement.create);
  supplierRouter.get('/:supplierId', supplierManagement.read);
  supplierRouter.patch('/:supplierId', csrf, supplierManagement.update);
  supplierRouter.post('/:supplierId/stop', csrf, supplierManagement.stop);
  supplierRouter.post('/:supplierId/resume', csrf, supplierManagement.resume);

  // Goods Receipt: who may use it comes from PRODUCT_PERMISSIONS.RECORD_GOODS_RECEIPTS. A receipt can be saved and read, never edited or deleted.
  const goodsReceipts = createGoodsReceiptController(createGoodsReceiptService({ connection, clock }));
  const receiptRouter = Router();
  receiptRouter.use(noStore, requireSession(session, { clock }), requireRoles(...PRODUCT_PERMISSIONS.RECORD_GOODS_RECEIPTS));
  receiptRouter.get('/suppliers', goodsReceipts.listSuppliers);
  receiptRouter.get('/products', goodsReceipts.searchProducts);
  receiptRouter.get('/', goodsReceipts.listRecent);
  receiptRouter.post('/', csrf, goodsReceipts.create);
  receiptRouter.get('/:code', goodsReceipts.read);

  return [
    { name: 'products', mount: '/api/v1/products', router: catalogRouter },
    { name: 'product-cart', mount: '/api/v1/product-cart', router: cartRouter },
    { name: 'product-orders', mount: '/api/v1/product-orders', router: orderRouter },
    { name: 'admin-product-orders', mount: '/api/v1/admin/product-orders', router: managementRouter },
    { name: 'admin-products', mount: '/api/v1/admin/products', router: productManagementRouter },
    { name: 'admin-suppliers', mount: '/api/v1/admin/suppliers', router: supplierRouter },
    { name: 'admin-goods-receipts', mount: '/api/v1/admin/goods-receipts', router: receiptRouter }
  ];
}
