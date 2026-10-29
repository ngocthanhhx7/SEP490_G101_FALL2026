import { metadata } from '../utils/app-error.js';
function respond(res, req, status, data) {
  return res.status(status).json({ data, meta: metadata(req) });
}

export function createSystemSettingsController({ service } = {}) {
  return {
    getServiceCatalog: async (req, res) =>
      respond(res, req, 200, await service.overview()),
    createServiceCatalogVisibility: async (req, res) =>
      respond(
        res,
        req,
        201,
        await service.updateCatalogVisibility({
          body: req.body,
          actor: req.auth
        })
      )
  };
}
