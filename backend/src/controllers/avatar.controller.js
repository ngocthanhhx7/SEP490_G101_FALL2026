import { metadata } from '../utils/app-error.js';
export function createAvatarController({ service }) {
  const input = req => ({ actor: req.auth, petId: req.params.petId });
  return {
    metadata: async (req, res) => res.json({ data: await service.get(input(req)), meta: metadata(req) }),
    content: async (req, res) => res.type('image/jpeg').send(await service.get({ ...input(req), content: true })),
    change: async (req, res) => {
      const remove = req.method === 'DELETE';
      const rawVersion = remove ? req.body?.expectedVersion : req.query.version;
      const expectedVersion = remove ? rawVersion : /^(0|[1-9]\d*)$/.test(rawVersion ?? '') ? Number(rawVersion) : NaN;
      const data = await service.change({ ...input(req), remove, expectedVersion, body: req.body,
        contentType: req.get('content-type')?.split(';')[0], idempotencyKey: req.get('idempotency-key') });
      res.json({ data, meta: metadata(req) });
    }
  };
}
