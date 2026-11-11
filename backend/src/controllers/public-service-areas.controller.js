import { metadata } from '../utils/app-error.js';

export function createPublicServiceAreasController(service) {
  return { list: async (req, res) => res.json({ data: await service.list(), meta: metadata(req) }) };
}
