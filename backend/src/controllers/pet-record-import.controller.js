import { metadata } from '../utils/app-error.js';
export function createPetRecordImportController({ service }) {
  return {
    metadata: (_req, res) => res.json({ data: service.metadata(), meta: metadata(_req) }),
    extract: async (req, res) => res.json({ data: await service.extract({ bytes: req.body, contentType: req.get('Content-Type')?.split(';')[0], consent: req.get('X-Pet-Record-Consent') === 'google-gemini' }), meta: metadata(req) })
  };
}
