import { AppError } from '../utils/app-error.js';
import { metadata } from '../utils/app-error.js';
export function createAiController({ service, management, registry }) {
  const send = (req, res, status, data) =>
    res.status(status).json({ data, meta: metadata(req) });
  const invoke = (status, handler) => async (req, res) => {
    try {
      return send(req, res, status, await handler(req));
    } catch (error) {
      if (error.code === 11000)
        throw new AppError(409, 'VERSION_CONFLICT', 'Record already exists');
      if (error.name === 'ValidationError' || error.name === 'StrictModeError')
        throw new AppError(
          422,
          'VALIDATION_FAILED',
          'Data does not match the schema'
        );
      throw error;
    }
  };
  return {
    recommend: invoke(201, (req) =>
      service.recommend(req.auth.userId, req.body)
    ),
    decision: invoke(200, (req) =>
      service.readDecision(req.auth.userId, req.params.decisionId)
    ),

    ranking: invoke(201, (req) => management.ranking(req.auth, req.body)),
    sitter: invoke(200, (req) =>
      management.sitter(req.auth, req.params.userId, req.body)
    ),
    block: invoke(201, (req) => management.block(req.auth, req.body)),
    outcome: invoke(201, (req) => management.outcome(req.auth, req.body)),
    model: invoke(201, (req) => management.model(req.auth, req.body)),
    status: invoke(200, req => registry.status(req.auth)),
    importModel: invoke(201, req => registry.importArtifact(req.auth, req.body)),
    reviewModel: invoke(200, req => registry.review(req.auth, req.params.modelId, req.body, req.get('idempotency-key')))
  };
}
