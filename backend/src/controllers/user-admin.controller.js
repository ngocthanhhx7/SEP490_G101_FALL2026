import { metadata } from '../utils/app-error.js';
function respond(res, req, status, data) {
  res.status(status).json({ data, meta: metadata(req) });
}
import { AppError } from '../utils/app-error.js';

export function createUserAdminController({ service } = {}) {
  return {
    getRoot: async (req, res) => {
      const result = await service.list(req.query);
      return respond(res, req, 200, result);
    },
    getById: async (req, res) => {
      return respond(res, req, 200, await service.getById(req.params.id));
    },
    createByIdLockDecisions: async (req, res) => {
      if (!['LOCK', 'UNLOCK'].includes(req.body?.action)) {
        throw new AppError(
          422,
          'VALIDATION_FAILED',
          'Account decision is invalid'
        );
      }
      const user = await service.decide({
        userId: req.params.id,
        body: req.body,
        actor: req.auth
      });
      return respond(res, req, 200, {
        userId: user._id.toString(),
        state: user.state,
        version: user.version
      });
    }
  };
}
