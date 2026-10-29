import { metadata } from '../utils/app-error.js';
function respond(res, req, status, data) {
  return res.status(status).json({ data, meta: metadata(req) });
}

export function createServiceCatalogController({ service } = {}) {
  return {
    getRoot: async (req, res) =>
      respond(res, req, 200, await service.publicList()),
    getAdmin: async (req, res) =>
      respond(
        res,
        req,
        200,
        await service.listAdmin({ includePolicyText: true })
      ),
    createAdmin: async (req, res) =>
      respond(
        res,
        req,
        201,
        await service.create({ body: req.body, actor: req.auth })
      ),
    replaceAdminById: async (req, res) =>
      respond(
        res,
        req,
        200,
        await service.update({
          serviceId: req.params.id,
          body: req.body,
          actor: req.auth
        })
      ),
    createAdminByIdPolicies: async (req, res) =>
      respond(
        res,
        req,
        201,
        await service.setPolicy({
          serviceId: req.params.id,
          body: req.body,
          actor: req.auth
        })
      )
  };
}
