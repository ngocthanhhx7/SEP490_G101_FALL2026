import { createSessionService } from '../services/session.service.js';
import { createUnitOfWork } from '../services/unit-of-work.service.js';
import { createMongoSettlementRepository } from '../services/settlements/mongo-settlement.repository.js';
import { createSettlementService } from '../services/settlements/settlement.service.js';
import { settlementRequestModule } from './settlement-requests.routes.js';

const unresolvedPolicy = Object.freeze({
  resolve: async () => ({ ready: false, decisionIds: ['FIN-07-ELIG', 'FIN-07-POSTPAY', 'FIN-08-EDIT'] })
});

// P34 can pass the authenticated session and approved P51 policy port when composing
// the app. Without both, the route remains fail-closed instead of using an in-memory
// or client-provided financial decision.
export function settlementRequestRuntimeModule({ config, connection, sessionService, policy,
  clock = Date.now } = {}) {
  if (!config?.auth?.enabled || !connection) return null;
  const session = sessionService ?? createSessionService({ connection, clock,
    tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const repository = createMongoSettlementRepository({ connection,
    cursorSecret: config.auth.tokenSecret });
  const service = createSettlementService({ connection, unitOfWork: createUnitOfWork(connection),
    repository, policy: policy ?? unresolvedPolicy, clock: () => new Date(clock()) });
  return settlementRequestModule({ service, sessionService: session });
}
