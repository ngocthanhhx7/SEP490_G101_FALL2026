import { serviceModel } from '../models/service.model.js';
export function createServiceExistence(connection) {
  const Service = serviceModel(connection);
  return async (id) => Boolean(await Service.exists({ _id: id }));
}
