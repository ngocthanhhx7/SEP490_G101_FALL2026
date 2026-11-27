import { createPublicPolicyCatalog } from '../services/public-policy-catalog.service.js';
import { createPublicPolicyController } from '../controllers/public-policy.controller.js';
import { Router } from 'express';

import { publicPolicyVersionModel } from '../models/public-policy-version.model.js';

export function publicPolicyModule({ connection, clock = Date.now } = {}) {
  const PolicyVersion =
    connection?.models && typeof connection.model === 'function'
      ? publicPolicyVersionModel(connection)
      : null;
  const service = createPublicPolicyCatalog({ PolicyVersion, clock });
  const router = Router();
  const controller = createPublicPolicyController({ service });
  router.get(
    '/public-policies',
    controller.getPublicPolicies
  );
  router.get('/public-policies/:slug/:version', controller.getPublicPolicyVersion);
  return { name: 'public-policy', mount: '/api/v1/public', router };
}
