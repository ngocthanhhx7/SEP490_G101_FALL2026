import { metadata } from '../utils/app-error.js';

export function createApplicationStatusController({ service } = {}) {
  return {
    createChallenges: async (req, res) =>
      res.status(202).json({
        data: await service.requestVerification(req.body),
        meta: metadata(req)
      }),
    createVerify: async (req, res) =>
      res.json({
        data: await service.verifyAndReadStatus(req.body),
        meta: metadata(req)
      })
  };
}
