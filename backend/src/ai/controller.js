import { AppError } from '../utils/app-error.js';
import { metadata } from '../utils/app-error.js';
export function createAiController({ service, management }) {
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
    catalog: invoke(200, () => management.catalog()),
    pets: invoke(200, (req) => management.listPets(req.auth.userId)),
    addresses: invoke(200, (req) => management.listAddresses(req.auth.userId)),
    quote: invoke(201, (req) => service.quote(req.auth.userId, req.body)),
    recommend: invoke(201, (req) =>
      service.recommend(req.auth.userId, req.body)
    ),
    decision: invoke(200, (req) =>
      service.readDecision(req.auth.userId, req.params.decisionId)
    ),
    pet: invoke(201, (req) => management.createPet(req.auth.userId, req.body)),
    address: invoke(201, (req) =>
      management.createAddress(req.auth.userId, req.body)
    ),
    pricing: invoke(201, (req) => management.pricing(req.auth, req.body)),
    ranking: invoke(201, (req) => management.ranking(req.auth, req.body)),
    sitter: invoke(200, (req) =>
      management.sitter(req.auth, req.params.userId, req.body)
    ),
    block: invoke(201, (req) => management.block(req.auth, req.body)),
    outcome: invoke(201, (req) => management.outcome(req.auth, req.body)),
    model: invoke(201, (req) => management.model(req.auth, req.body)),
  };
}
