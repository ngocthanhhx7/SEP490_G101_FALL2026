import { controllerAction } from './controller-action.js';

export function createProductPhotoController(service) {
  const input = req => ({ actor: req.auth, productId: req.params.productId, version: req.get('X-Product-Version'),
    index: req.params.photoIndex, body: req.body, contentType: req.get('Content-Type')?.split(';')[0].toLowerCase() });
  const read = admin => async (req, res) => {
    const body = await service.read({ actor: req.auth, productId: req.params.productId, digest: req.params.digest, admin });
    res.set({ 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="product.webp"' }).status(200).send(body);
  };
  return { upload: controllerAction(200, req => service.upload(input(req))),
    remove: controllerAction(200, req => service.remove(input(req))), read: read(false), readAdmin: read(true) };
}
