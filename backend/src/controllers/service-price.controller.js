import { metadata } from '../utils/app-error.js';
function respond(res, req, status, data) {
  return res.status(status).json({ data, meta: metadata(req) });
}

export function createServicePriceController({ service } = {}) {
  return {
    getByServiceIdActive: async (req, res) =>
      respond(
        res,
        req,
        200,
        await service.getActivePrice(req.params.serviceId)
      ),
    getAdminByServiceId: async (req, res) =>
      respond(res, req, 200, {
        prices: await service.list(req.params.serviceId),
        latestVersion: await service.latestVersion(req.params.serviceId)
      }),
    createAdminByServiceId: async (req, res) =>
      respond(
        res,
        req,
        201,
        await service.createVersion({
          serviceId: req.params.serviceId,
          body: req.body,
          actor: req.auth
        })
      )
  };
}
