import { createSessionService } from '../services/session.service.js';
import { createUnitOfWork } from '../services/unit-of-work.service.js';
import { createMongoSettlementRepository } from '../services/settlements/mongo-settlement.repository.js';
import { createAdminSettlementService } from '../services/settlements/admin-settlement.service.js';
import { adminSettlementModule } from './admin-settlements.routes.js';
import { createPrivateTransferEvidenceRepository } from '../services/settlements/private-transfer-evidence.repository.js';

const unresolvedPolicy = Object.freeze({
  resolve: async () => ({ ready: false, decisionIds: ['FIN-07-ELIG', 'FIN-07-POSTPAY', 'FIN-08-EDIT'] })
});

// P34 supplies the same authenticated session and approved P51 policy resolver
// used by the sitter request module. The default policy intentionally blocks all
// money mutations until those decisions are actually available.
export function adminSettlementRuntimeModule({ config, connection, sessionService, policy,
  clock = Date.now } = {}) {
  if (!config?.auth?.enabled || !connection) return null;
  const session = sessionService ?? createSessionService({ connection, clock,
    tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const repository = createMongoSettlementRepository({ connection,
    cursorSecret: config.auth.tokenSecret,
    privateEvidence: createPrivateTransferEvidenceRepository({ connection }) });
  const service = createAdminSettlementService({ unitOfWork: createUnitOfWork(connection),
    repository, policy: policy ?? unresolvedPolicy, clock: () => new Date(clock()) });
  return adminSettlementModule({ service, sessionService: session });
}
