import { metadata } from '../utils/app-error.js';

export function createPublicServiceAreasController(service) {
  return { list: (req, res) => res.json({ data: service.list(), meta: metadata(req) }) };
}
