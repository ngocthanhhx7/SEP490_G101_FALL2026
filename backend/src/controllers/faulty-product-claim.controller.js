import { controllerAction } from './controller-action.js';

export function createFaultyProductClaimController(service) {
  return Object.freeze({
    eligibility: controllerAction(200, req => service.eligibility(req.auth, req.params.orderId)),
    submit: controllerAction(201, req => service.submit(req.auth, req.params.orderId, req.body, req.get('Idempotency-Key'))),
    list: controllerAction(200, req => service.list(req.auth, req.query)),
    read: controllerAction(200, req => service.read(req.auth, req.params.claimId)),
    inspect: controllerAction(200, req => service.inspect(req.auth, req.params.claimId, req.body)),
    decide: controllerAction(200, req => service.decide(req.auth, req.params.claimId, req.body)),
    exchangeSent: controllerAction(200, req => service.markExchangeSent(req.auth, req.params.claimId, req.body)),
    readPhoto: async (req, res) => {
      const image = await service.readPhoto(req.auth, req.params.claimId, req.params.photoId);
      res.set({
        'Content-Type': image.contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      });
      return res.status(200).send(image.body);
    }
  });
}
