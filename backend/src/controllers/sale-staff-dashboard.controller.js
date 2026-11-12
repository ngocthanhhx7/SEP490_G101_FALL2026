import { controllerAction } from './controller-action.js';

export function createSaleStaffDashboardController(service) {
  return controllerAction(200, (req) => service.read(req.auth));
}
