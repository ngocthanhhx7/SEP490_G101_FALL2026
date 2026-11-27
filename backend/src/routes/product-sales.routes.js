import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createProductPhotoController } from '../controllers/product-photo.controller.js';
import { createProductPhotoService } from '../services/product-sales/product-photo.service.js';
import { PRODUCT_PHOTO_LIMITS, PRODUCT_PHOTO_TYPES } from '../constants/product-photos.js';
import { createMediaAdmission, createAdmissionMiddleware, parseBody } from './private-image.routes.js';
import { createProductCatalogController } from '../controllers/product-catalog.controller.js';
import { createProductCartController } from '../controllers/product-cart.controller.js';
import { createProductOrderController, createProductOrderPaymentController } from '../controllers/product-order.controller.js';
import { createProductOrderManagementController } from '../controllers/product-order-management.controller.js';
import { createSaleStaffDashboardController } from '../controllers/sale-staff-dashboard.controller.js';
import { createProductManagementController } from '../controllers/product-management.controller.js';
import { createSupplierManagementController } from '../controllers/supplier-management.controller.js';
import { createGoodsReceiptController } from '../controllers/goods-receipt.controller.js';
import { createStockListController } from '../controllers/stock-list.controller.js';
import { createStockAdjustmentController } from '../controllers/stock-adjustment.controller.js';
import { createStockAdjustmentService } from '../services/product-sales/stock-adjustment.service.js';
import { createStockListService } from '../services/product-sales/stock-list.service.js';
import { createProductCatalogService } from '../services/product-sales/product-catalog.service.js';
import { createProductCartService } from '../services/product-sales/product-cart.service.js';
import { createProductOrderService } from '../services/product-sales/product-order.service.js';
import { createProductOrderPaymentService, createProductOrderPaymentSettler } from '../services/product-sales/product-order-payment.service.js';
import { loadPayosConfig, createPayosProvider } from '../services/providers/payos/payos.provider.js';
import { createPayosPaymentWebhookService } from '../services/providers/payos/payment-webhook.service.js';
import { createMongoPaymentWebhookRepository } from '../services/providers/payos/mongo-payment-webhook.repository.js';
import { parseWebOrigin } from '../config/web-origin.js';
import { createProductOrderManagementService } from '../services/product-sales/product-order-management.service.js';
import { createSaleStaffDashboardService } from '../services/product-sales/sale-staff-dashboard.service.js';
import { createProductManagementService } from '../services/product-sales/product-management.service.js';
import { createSupplierManagementService } from '../services/product-sales/supplier-management.service.js';
import { createGoodsReceiptService } from '../services/product-sales/goods-receipt.service.js';
import { createCustomerPhoneDirectory } from '../services/product-sales/customer-phone-directory.service.js';
import { createContactCrypto } from '../services/contact-crypto.service.js';
import { createSessionService } from '../services/session.service.js';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';
import { PRODUCT_PERMISSIONS } from '../constants/product-permissions.js';
import { createCounterSaleController } from '../controllers/counter-sale.controller.js';
import { createCounterSaleService } from '../services/product-sales/counter-sale.service.js';
import { createCounterCatalogService } from '../services/product-sales/counter-catalog.service.js';
import { createProductPricingEligibility } from '../services/product-sales/product-pricing-eligibility.service.js';
import { createProductCustomerPriceController } from '../controllers/product-customer-price.controller.js';
import { createProductCustomerPriceService } from '../services/product-sales/product-customer-price.service.js';
import { createFaultyProductClaimController } from '../controllers/faulty-product-claim.controller.js';
import { createFaultyProductClaimService } from '../services/product-sales/faulty-product-claim.service.js';
import { loadR2Config } from '../config/r2.js';
import { createPrivateImageService } from '../services/private-image.service.js';

const noStore = (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };

// Disabled unless PRODUCT_SALES_ENABLED=true; needs authentication because cart and orders are Customer-only.
// `provider` lets tests replace payOS; otherwise it comes from the PAYOS_* settings (null when payOS is off).
export function productSalesRuntimeModules({ config, connection, ports, env = {}, clock = Date.now, sessionService, provider }) {
  if (env.PRODUCT_SALES_ENABLED !== undefined && !['true', 'false'].includes(env.PRODUCT_SALES_ENABLED)) {
    throw new TypeError('Invalid PRODUCT_SALES_ENABLED');
  }
  if (env.PRODUCT_SALES_ENABLED !== 'true' || !config.auth?.enabled || !connection?.db) return [];
  const session = sessionService ?? createSessionService({ connection, clock,
    tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const csrf = requireCsrf(session), customer = requireRoles('CUSTOMER');
  const eligibility = createProductPricingEligibility({ connection, refusalLimit: env.PRODUCT_REFUSAL_LIMIT });

  const catalogService = createProductCatalogService({ connection });
  const catalog = createProductCatalogController(catalogService);
  const photos = createProductPhotoController(createProductPhotoService({ connection }));
  const catalogRouter = Router();
  catalogRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  catalogRouter.get('/', catalog.list);
  catalogRouter.get('/:productId/customer-price', noStore, requireSession(session, { clock }), customer,
    createProductCustomerPriceController(createProductCustomerPriceService({ catalog: catalogService, eligibility })));
  catalogRouter.get('/:productId', catalog.read);
  catalogRouter.get('/:productId/photos/:digest', photos.read);

  const cart = createProductCartController(createProductCartService({ connection, eligibility }));
  const cartRouter = Router();
  cartRouter.use(noStore, requireSession(session, { clock }), customer);
  cartRouter.get('/', cart.read);
  cartRouter.post('/lines', csrf, cart.addLine);
  cartRouter.patch('/lines/:productId', csrf, cart.setLine);
  cartRouter.delete('/lines/:productId', csrf, cart.removeLine);

  const payos = provider ? null : loadPayosConfig(env);
  const payosProvider = provider ?? (payos ? createPayosProvider(payos) : null);
  const orderSettler = payosProvider && typeof payosProvider.getPaymentLink === 'function'
    && typeof payosProvider.verifyWebhook === 'function'
    ? createProductOrderPaymentSettler({
      provider: payosProvider,
      handleVerifiedPayment: createPayosPaymentWebhookService({
        provider: payosProvider,
        clock: () => new Date(clock()),
        repository: createMongoPaymentWebhookRepository({ connection })
      }).handleVerifiedPayment
    })
    : null;
  const orders = createProductOrderController(createProductOrderService({
    connection, serviceAreas: DEMO_WORK_AREAS, eligibility, clock,
    paymentDeadlineHours: config.paymentDeadlineHours, payments: orderSettler
  }));
  const orderPayments = createProductOrderPaymentService({
    connection, clock, provider: payosProvider, webOrigin: parseWebOrigin(env.BOOKING_WEB_ORIGIN) });
  const payments = createProductOrderPaymentController(orderPayments);
  const orderRouter = Router();
  orderRouter.use(noStore, requireSession(session, { clock }), customer);
  orderRouter.get('/', orders.list);
  orderRouter.post('/', csrf, orders.place);
  orderRouter.get('/:orderId', orders.read);
  orderRouter.post('/:orderId/payment-link', csrf, payments.paymentLink);
  orderRouter.post('/:orderId/cancel', csrf, orders.cancel);
  orderRouter.post('/:orderId/confirm-received', csrf, orders.confirmReceived);

  // Order handlers read verified customer phone numbers through the same contact keys as sign-in (D-217).
  const contactCrypto = createContactCrypto({
    lookupSecret: config.auth.contactLookupSecret,
    encryptionKey: config.auth.contactEncryptionKey
  });
  const phones = createCustomerPhoneDirectory({ connection, contactCrypto });
  const r2 = loadR2Config(env);
  const privateImages = r2 && ports?.privateMedia
    ? createPrivateImageService({
      connection,
      media: ports.privateMedia,
      secret: config.auth.tokenSecret,
      maxImagesPerUser: r2.maxImagesPerUser
    })
    : null;
  const faultyClaims = createFaultyProductClaimController(createFaultyProductClaimService({
    connection,
    phones,
    readImage: privateImages?.readScoped,
    clock
  }));
  orderRouter.get('/:orderId/faulty-claim-eligibility', faultyClaims.eligibility);
  orderRouter.post('/:orderId/faulty-claims', csrf, faultyClaims.submit);
  orderRouter.get('/faulty-claims/:claimId/photos/:photoId', faultyClaims.readPhoto);

  const management = createProductOrderManagementController(createProductOrderManagementService({
    connection, phones, clock, pickupDeadlineHours: config.pickupDeadlineHours, payments: orderSettler
  }), orderPayments);
  const managementRouter = Router();
  managementRouter.use(noStore, requireSession(session, { clock }), requireRoles(...PRODUCT_PERMISSIONS.HANDLE_ORDERS));
  managementRouter.get('/', management.list);
  managementRouter.get('/refunds', requireRoles('ADMIN'), management.listOrderRefunds);
  managementRouter.get('/:orderId', management.read);
  managementRouter.post('/:orderId/hand-to-carrier', csrf, management.handToCarrier);
  managementRouter.post('/:orderId/mark-delivered', csrf, management.markDelivered);
  managementRouter.post('/:orderId/mark-returning', csrf, management.markReturning);
  managementRouter.post('/:orderId/confirm-returned', csrf, management.confirmReturned);
  managementRouter.post('/:orderId/mark-ready', csrf, management.markReady);
  managementRouter.post('/:orderId/hand-to-customer', csrf, management.handToCustomer);
  managementRouter.post('/:orderId/payment-link', csrf, management.paymentLink);
  managementRouter.post('/:orderId/record-payment', csrf, management.recordPayment);
  managementRouter.post('/:orderId/cancel', requireRoles(...PRODUCT_PERMISSIONS.CANCEL_ONLINE_ORDERS), csrf, management.cancel);

  const saleStaffDashboardRouter = Router();
  const saleStaffDashboard = createSaleStaffDashboardController(createSaleStaffDashboardService({ connection }));
  saleStaffDashboardRouter.get('/', noStore, requireSession(session, { clock }),
    requireRoles(...PRODUCT_PERMISSIONS.VIEW_SALE_STAFF_DASHBOARD), saleStaffDashboard);

  // Product Management: who may use it comes from PRODUCT_PERMISSIONS.MANAGE_PRODUCTS.
  const productManagement = createProductManagementController(createProductManagementService({ connection }));
  const productManagementRouter = Router();
  productManagementRouter.use(noStore, requireSession(session, { clock }), requireRoles(...PRODUCT_PERMISSIONS.MANAGE_PRODUCTS));
  productManagementRouter.get('/', productManagement.list);
  productManagementRouter.post('/', csrf, productManagement.create);
  productManagementRouter.get('/:productId', productManagement.read);
  productManagementRouter.patch('/:productId', csrf, productManagement.update);
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

  const counter = createCounterSaleController(
    createCounterSaleService({ connection, clock, eligibility, payments: orderSettler }),
    createCounterCatalogService({ connection, contacts: phones, eligibility }),
    orderPayments
  );
  const counterRouter = Router();
  counterRouter.use(noStore, requireSession(session, { clock }), requireRoles(...PRODUCT_PERMISSIONS.SELL_AT_COUNTER));
  counterRouter.get('/products', counter.products);
  counterRouter.post('/previews', csrf, counter.preview);
  counterRouter.post('/customer-lookups', csrf, counter.lookup);
  counterRouter.get('/', counter.list);
  counterRouter.post('/', csrf, counter.create);
  counterRouter.get('/:orderId', counter.read);
  counterRouter.post('/:orderId/payment-link', csrf, counter.paymentLink);
  counterRouter.post('/:orderId/record-cash', csrf, counter.recordCash);
  counterRouter.post('/:orderId/complete', csrf, counter.complete);
  counterRouter.post('/:orderId/cancel', csrf, counter.cancel);
  // Goods Receipt: who may use it comes from PRODUCT_PERMISSIONS.RECORD_GOODS_RECEIPTS. A receipt can be saved and read, never edited or deleted.
  const goodsReceipts = createGoodsReceiptController(createGoodsReceiptService({ connection, clock }));
  const receiptRouter = Router();
  receiptRouter.use(noStore, requireSession(session, { clock }), requireRoles(...PRODUCT_PERMISSIONS.RECORD_GOODS_RECEIPTS));
  receiptRouter.get('/suppliers', goodsReceipts.listSuppliers);
  receiptRouter.get('/products', goodsReceipts.searchProducts);
  receiptRouter.get('/', goodsReceipts.listRecent);
  receiptRouter.post('/', csrf, goodsReceipts.create);
  receiptRouter.get('/:code', goodsReceipts.read);

  const stock = createStockListController(createStockListService({ connection, cursorSecret: config.auth.tokenSecret, clock }));
  const stockRouter = Router();
  stockRouter.use(noStore, requireSession(session, { clock }), requireRoles(...PRODUCT_PERMISSIONS.VIEW_STOCK));
  stockRouter.get('/', stock.list);
  stockRouter.get('/:productId/history', stock.history);

  const adjustments = createStockAdjustmentController(createStockAdjustmentService({ connection, clock }));
  const adjustmentRouter = Router();
  adjustmentRouter.use(noStore, requireSession(session, { clock }), requireRoles(...PRODUCT_PERMISSIONS.ADJUST_STOCK));
  adjustmentRouter.get('/products', adjustments.searchProducts);
  adjustmentRouter.get('/products/:productId', adjustments.readProduct);
  adjustmentRouter.get('/', adjustments.list);
  adjustmentRouter.post('/', csrf, adjustments.create);

  const faultyClaimsRouter = Router();
  faultyClaimsRouter.use(noStore, requireSession(session, { clock }), requireRoles(...PRODUCT_PERMISSIONS.HANDLE_FAULTY_CLAIMS));
  faultyClaimsRouter.get('/', faultyClaims.list);
  faultyClaimsRouter.get('/:claimId', faultyClaims.read);
  faultyClaimsRouter.get('/:claimId/photos/:photoId', faultyClaims.readPhoto);
  faultyClaimsRouter.post('/:claimId/inspect', csrf, faultyClaims.inspect);
  faultyClaimsRouter.post('/:claimId/decide', requireRoles(...PRODUCT_PERMISSIONS.DECIDE_FAULTY_CLAIMS), csrf, faultyClaims.decide);
  faultyClaimsRouter.post('/:claimId/exchange-sent', csrf, faultyClaims.exchangeSent);

  return [
    { name: 'products', mount: '/api/v1/products', router: catalogRouter },
    { name: 'product-cart', mount: '/api/v1/product-cart', router: cartRouter },
    { name: 'product-orders', mount: '/api/v1/product-orders', router: orderRouter },
    { name: 'admin-product-orders', mount: '/api/v1/admin/product-orders', router: managementRouter },
    { name: 'sale-staff-dashboard', mount: '/api/v1/dashboards/sale-staff', router: saleStaffDashboardRouter },
    { name: 'admin-products', mount: '/api/v1/admin/products', router: productManagementRouter },
    { name: 'admin-suppliers', mount: '/api/v1/admin/suppliers', router: supplierRouter },
    { name: 'admin-counter-orders', mount: '/api/v1/admin/counter-orders', router: counterRouter },
    { name: 'admin-goods-receipts', mount: '/api/v1/admin/goods-receipts', router: receiptRouter },
    { name: 'admin-stock-levels', mount: '/api/v1/admin/stock-levels', router: stockRouter },
    { name: 'admin-stock-adjustments', mount: '/api/v1/admin/stock-adjustments', router: adjustmentRouter },
    { name: 'admin-faulty-product-claims', mount: '/api/v1/admin/faulty-product-claims', router: faultyClaimsRouter }
  ];
}
