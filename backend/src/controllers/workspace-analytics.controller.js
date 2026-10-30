import { controllerAction } from './controller-action.js';

export const createWorkspaceAnalyticsController = service => controllerAction(200,
  req => service.read({ actor: req.auth, kind: req.params.kind, query: req.query }));
