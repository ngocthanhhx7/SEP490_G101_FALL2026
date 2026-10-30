import { metadata } from '../utils/app-error.js';

export function createSitterManagementController(service) {
  const respond = (req, res, data) => res.status(200).json({ data, meta: metadata(req) });
  const args = req => ({ actor: req.auth, query: req.query, userId: req.params.userId });
  return {
    list: async (req, res) => respond(req, res, await service.list(args(req))),
    reports: async (req, res) => respond(req, res, await service.reports(args(req))),
    get: async (req, res) => respond(req, res, await service.get(args(req))),
    activity: async (req, res) => respond(req, res, await service.activity(args(req)))
  };
}
