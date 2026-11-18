import { metadata } from '../utils/app-error.js';
export function createServiceWorkflowController({ templates, execution }) {
  const send = (res, req, data) => res.status(200).json({ data, meta: metadata(req) });
  return {
    read: async (req, res) => send(res, req, await templates.read(req.auth, req.params.id, req.query.before)),
    template: (action) => async (req, res) =>
      send(res, req, await templates.mutate(req.auth, req.params.id, action, req.body, req.get('Idempotency-Key'))),
    execution: async (req, res) => send(res, req, await execution.read(req.auth, req.params.id)),
    task: async (req, res) =>
      send(res, req, await execution.task(req.auth, req.params.id, req.body, req.get('Idempotency-Key'))),
    review: async (req, res) =>
      send(res, req, await execution.review(req.auth, req.params.id, req.body, req.get('Idempotency-Key')))
  };
}
