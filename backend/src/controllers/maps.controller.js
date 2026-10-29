import { controllerAction } from './controller-action.js';

export function createMapsController({ service }) {
  return { search: controllerAction(200, req => service.search(req.body)) };
}
