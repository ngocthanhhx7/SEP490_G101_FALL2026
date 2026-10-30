import { controllerAction } from './controller-action.js';

export const createCustomerBookingsController = service => ({
  list: controllerAction(200, req => service.list(req.auth, req.query))
});
