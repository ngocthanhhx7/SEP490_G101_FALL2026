import { metadata, AppError } from '../utils/app-error.js';

export function createSitterPublicProfileController(service) {
  const action = method => async (req, res) => {
    if (Object.keys(req.query).some(key => method !== 'listPending' || key !== 'cursor')) throw new AppError(422, 'VALIDATION_FAILED', 'Unexpected query');
    const data = await service[method]({ actor: req.auth, userId: req.params.userId,
      body: req.body, cursor: req.query.cursor, idempotencyKey: req.get('Idempotency-Key') });
    res.json({ data, meta: metadata(req) });
  };
  return { own: action('readOwn'), list: action('listPending'), submit: action('submit'), review: action('review') };
}
