import { metadata } from '../utils/app-error.js';

export function createPrivateImageController({ service } = {}) {
  if (!service || typeof service.upload !== 'function' || typeof service.read !== 'function') {
    throw new TypeError('Private image service is required');
  }

  return {
    upload: async (req, res) => {
      const data = await service.upload({
        actor: req.auth,
        body: req.body,
        contentType: req.get('content-type')?.split(';')[0],
        idempotencyKey: req.get('idempotency-key')
      });
      res.status(data.replayed ? 200 : 201).json({ data, meta: metadata(req) });
    },
    read: async (req, res) => {
      const result = await service.read({ actor: req.auth, id: req.params.id });
      res.set({
        'Content-Type': result.contentType,
        'Content-Disposition': 'attachment; filename="private-image"'
      });
      res.send(result.body);
    }
  };
}
