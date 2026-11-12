import { PRODUCT_PERMISSIONS } from '../../constants/product-permissions.js';
import { productSalesModels } from '../../models/product.model.js';
import { AppError } from '../../utils/app-error.js';
import { hasRole } from '../../utils/roles.js';
import { productSalesErrors } from './product-sales-errors.js';
import { readProductOrderTabCounts } from './product-order-tab-counts.js';

export function createSaleStaffDashboardService({ connection }) {
  const { ProductOrder } = productSalesModels(connection);

  return Object.freeze({
    async read(actor) {
      if (actor?.state !== 'ACTIVE') throw productSalesErrors.unauthenticated();
      if (!PRODUCT_PERMISSIONS.VIEW_SALE_STAFF_DASHBOARD.some((role) => hasRole(actor.roles, role))) {
        throw productSalesErrors.forbidden();
      }

      try {
        const { PREPARE, AWAITING_PICKUP, RETURNING } = await readProductOrderTabCounts(ProductOrder);
        return { counts: { PREPARE, AWAITING_PICKUP, RETURNING } };
      } catch {
        throw new AppError(503, 'SALES_DASHBOARD_SOURCE_UNAVAILABLE', 'Could not read product order counts');
      }
    }
  });
}
