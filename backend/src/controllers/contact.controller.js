import { metadata } from '../utils/app-error.js';
import { validateContactInput } from '../validators/contact.validator.js';
export function createContactController({ service }) {
  return {
    createMessages: async (req, res) =>
      res
        .status(202)
        .json({
          data: await service.send(validateContactInput(req.body)),
          meta: metadata(req)
        })
  };
}
