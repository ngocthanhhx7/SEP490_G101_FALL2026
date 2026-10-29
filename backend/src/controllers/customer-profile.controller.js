import { metadata } from '../utils/app-error.js';

export function createCustomerProfileController({ profile } = {}) {
  return {
    getProfile: async (req, res) => {
      const data = await profile.get(req.auth);
      res.status(200).json({ data, meta: metadata(req) });
    },
    updateProfile: async (req, res) => {
      const data = await profile.update(req.auth, req.body);
      res.status(200).json({ data, meta: metadata(req) });
    }
  };
}
