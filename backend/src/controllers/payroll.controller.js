import { controllerAction } from './controller-action.js';
export function createPayrollController(service) {
  return {
    own: controllerAction(200, req => service.own(req.auth)),
    contracts: controllerAction(201, req => service.recordContract(req.auth, req.body, req.get('Idempotency-Key'))),
    submit: controllerAction(201, req => service.submitAdvance(req.auth, req.body, req.get('Idempotency-Key'))),
    decision: controllerAction(200, req => service.decideAdvance(req.auth, req.params.id, req.body, req.get('Idempotency-Key'))),
    list: controllerAction(200, req => service.listAdvances(req.auth)),
    prepare: controllerAction(201, req => service.prepareStatement(req.auth, req.body, req.get('Idempotency-Key'))),
    statements: controllerAction(200, req => service.listStatements(req.auth)),
    statementDecision: controllerAction(200, req => service.decideStatement(req.auth, req.params.id, req.body, req.get('Idempotency-Key')))
  };
}
