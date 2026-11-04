import { controllerAction } from './controller-action.js';
export function createEmploymentDocumentController(service) {
  return { get: controllerAction(200, req => service.get(req.auth, req.params.applicationId)),
    save: controllerAction(201, req => service.save(req.auth, req.params.applicationId, req.body, req.get('Idempotency-Key'))),
    decide: controllerAction(200, req => service.decide(req.auth, req.params.applicationId, req.params.documentId, req.body, req.get('Idempotency-Key'))) };
}
