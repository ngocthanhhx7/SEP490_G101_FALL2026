import { controllerAction } from './controller-action.js';

export function createMapsController({ service, renderService }) {
  return { search: controllerAction(200, req => service.search(req.body)), resolve: controllerAction(200, req => service.resolve(req.body)),
    render: async (req, res) => {
      const result = await renderService.resource('/' + req.params.resource.join('/'), req.query);
      res.type(result.type).send(result.body);
    } };
}
