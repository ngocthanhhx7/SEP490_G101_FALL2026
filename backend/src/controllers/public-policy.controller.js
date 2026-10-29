import { metadata } from '../utils/app-error.js';
export function createPublicPolicyController({ service }) {
  return {
    getPublicPolicies: async (req, res) =>
      res.json({ data: await service.list(), meta: metadata(req) })
  };
}
