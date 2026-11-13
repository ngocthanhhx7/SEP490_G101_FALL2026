import { metadata } from '../utils/app-error.js';
import { id } from '../validators/pet-care.validator.js';

// HTTP translation for "Call": the phone number is returned only for this request and is never cached.
export function createVisitContactController(service) {
  return {
    read: async (req, res) => {
      res.set('Cache-Control', 'private, no-store');
      res.json({ data: await service.read(req.auth, id(req.params.id), req.query), meta: metadata(req) });
    }
  };
}
