import { PRODUCT_PERMISSIONS } from '../../constants/product-permissions.js';
import { productSalesModels } from '../../models/product.model.js';
import { AppError } from '../../utils/app-error.js';
import { hasRole } from '../../utils/roles.js';
import { productSalesErrors } from './product-sales-errors.js';
import { readProductOrderTabCounts } from './product-order-tab-counts.js';
import { countLowStockProducts } from './stock-low-filter.js';

export function createSaleStaffDashboardService({ connection }) {
  const { Product, ProductOrder, FaultyProductClaim } = productSalesModels(connection);

  return Object.freeze({
    async read(actor) {
      if (actor?.state !== 'ACTIVE') throw productSalesErrors.unauthenticated();
      if (!PRODUCT_PERMISSIONS.VIEW_SALE_STAFF_DASHBOARD.some((role) => hasRole(actor.roles, role))) {
        throw productSalesErrors.forbidden();
      }

      try {
        const [{ PREPARE, AWAITING_PICKUP, RETURNING }, LOW_STOCK, CLAIMS_TO_CHECK] = await Promise.all([
          readProductOrderTabCounts(ProductOrder),
          countLowStockProducts(Product),
          FaultyProductClaim.countDocuments({ status: 'WAITING_CHECK' })
        ]);
        return { counts: { PREPARE, AWAITING_PICKUP, RETURNING, LOW_STOCK, CLAIMS_TO_CHECK } };
      } catch {
        throw new AppError(503, 'SALES_DASHBOARD_SOURCE_UNAVAILABLE', 'Could not read sale staff dashboard counts');
      }
    }
  });
}
