import { AppError, metadata } from '../utils/app-error.js';
function respond(res, req, status, data) {
  res.status(status).json({ data, meta: metadata(req) });
}

export function createSitterApplicationController({ service, intake } = {}) {
  return {
    getIntake: async (req, res) => respond(res, req, 200, await intake.getIntake({ actor: req.auth })),
    createRoot: async (req, res) => {
      const result = await service.submit({
        body: req.body,
        idempotencyKey: req.get('idempotency-key'),
        correlationId: req.requestId,
        actor: req.auth
      });
      return respond(res, req, result.replayed ? 200 : 201, result);
    },
    getRoot: async (req, res) =>
      respond(
        res,
        req,
        200,
        await service.list({ query: req.query, actor: req.auth })
      ),
    getByApplicationId: async (req, res) =>
      respond(
        res,
        req,
        200,
        await service.get({
          applicationId: req.params.applicationId,
          actor: req.auth,
          correlationId: req.requestId
        })
      ),
    createByApplicationIdReview: async (req, res) => {
      const result = await service.startReview({
        applicationId: req.params.applicationId,
        expectedVersion: req.body?.expectedVersion,
        idempotencyKey: req.get('idempotency-key'),
        actor: req.auth,
        correlationId: req.requestId
      });
      return respond(res, req, 200, result);
    },
    createByApplicationIdInterview: async (req, res) => {
      if (
        !req.body ||
        Object.keys(req.body).some((key) => key !== 'expectedVersion')
      ) {
        throw new AppError(
          422,
          'VALIDATION_FAILED',
          'Interview request is invalid'
        );
      }
      return respond(
        res,
        req,
        200,
        await service.startInterview({
          applicationId: req.params.applicationId,
          expectedVersion: req.body.expectedVersion,
          idempotencyKey: req.get('idempotency-key'),
          actor: req.auth,
          correlationId: req.requestId
        })
      );
    },
    createByApplicationIdDecisions: async (req, res) => {
      const result = await service.decide({
        applicationId: req.params.applicationId,
        body: req.body,
        idempotencyKey: req.get('idempotency-key'),
        actor: req.auth,
        correlationId: req.requestId
      });
      return respond(res, req, 200, result);
    },
    createByApplicationIdSitterStatus: async (req, res) => {
      const result = await service.changeSitterStatus({
        applicationId: req.params.applicationId,
        body: req.body,
        idempotencyKey: req.get('idempotency-key'),
        actor: req.auth,
        correlationId: req.requestId
      });
      return respond(res, req, 200, result);
    },
    getByApplicationIdDocumentsByDocumentId: async (req, res) => {
      const capability = await service.documentReadCapability({
        applicationId: req.params.applicationId,
        documentId: req.params.documentId,
        actor: req.auth,
        correlationId: req.requestId
      });
      res.set({
        'Cache-Control': 'private, no-store',
        Pragma: 'no-cache',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff'
      });
      return res.redirect(302, capability.url);
    }
  };
}
