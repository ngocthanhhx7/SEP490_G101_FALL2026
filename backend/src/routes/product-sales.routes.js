import { Router } from 'express';
import { createProductCatalogController } from '../controllers/product-catalog.controller.js';
import { createProductCartController } from '../controllers/product-cart.controller.js';
import { createProductOrderController } from '../controllers/product-order.controller.js';
import { createProductCatalogService } from '../services/product-sales/product-catalog.service.js';
import { createProductCartService } from '../services/product-sales/product-cart.service.js';
import { createProductOrderService } from '../services/product-sales/product-order.service.js';
import { createSessionService } from '../services/session.service.js';
import { requireSession, requireRoles, requireCsrf } from '../middlewares/session.js';
import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';

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
  const catalogRouter = Router();
  catalogRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  catalogRouter.get('/', catalog.list);
  catalogRouter.get('/:productId', catalog.read);

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

  return [
    { name: 'products', mount: '/api/v1/products', router: catalogRouter },
    { name: 'product-cart', mount: '/api/v1/product-cart', router: cartRouter },
    { name: 'product-orders', mount: '/api/v1/product-orders', router: orderRouter }
  ];
}
