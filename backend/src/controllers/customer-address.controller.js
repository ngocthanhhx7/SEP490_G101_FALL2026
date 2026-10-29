import { metadata } from '../utils/app-error.js';
function respond(res, req, status, data) {
  res.status(status).json({ data, meta: metadata(req) });
}

export function createCustomerAddressController({ service } = {}) {
  return {
    getRoot: async (req, res) => {
      respond(res, req, 200, await service.list(req.auth, req.query));
    },
    createRoot: async (req, res) => {
      respond(
        res,
        req,
        201,
        await service.create(req.auth, req.body, req.get('Idempotency-Key'))
      );
    },
    updateByAddressId: async (req, res) => {
      respond(
        res,
        req,
        200,
        await service.update(
          req.auth,
          req.params.addressId,
          req.body,
          req.get('Idempotency-Key')
        )
      );
    },
    createByAddressIdArchives: async (req, res) => {
      respond(
        res,
        req,
        200,
        await service.archive(
          req.auth,
          req.params.addressId,
          req.body,
          req.get('Idempotency-Key')
        )
      );
    },
    getByVisitIdAccessNotes: async (req, res) => {
      respond(
        res,
        req,
        200,
        await service.accessNotes(req.auth, req.params.visitId)
      );
    }
  };
}
