import { hasOnlyKeys } from '../validators/refunds.validator.js';

import { metadata } from '../utils/app-error.js';
function respond(res, req, status, data) {
  res.status(status).json({ data, meta: metadata(req) });
}
import { AppError } from '../utils/app-error.js';

export function createRefundsController({ refundService } = {}) {
  return {
    createRoot: async (req, res) => {
      const allowed = new Set([
        'sourceRef',
        'amountVnd',
        'reason',
        'evidenceRefs'
      ]);
      if (
        !hasOnlyKeys(req.body, allowed, ['sourceRef', 'amountVnd', 'reason'])
      ) {
        throw new AppError(
          422,
          'VALIDATION_FAILED',
          'Refund proposal is invalid'
        );
      }
      const result = await refundService.propose({
        actor: req.auth,
        input: req.body,
        idempotencyKey: req.get('idempotency-key')
      });
      return respond(res, req, 201, result);
    },
    createByIdDecisions: async (req, res) => {
      const allowed = new Set(['decision', 'reason', 'expectedVersion']);
      if (
        !hasOnlyKeys(req.body, allowed, [
          'decision',
          'reason',
          'expectedVersion'
        ])
      ) {
        throw new AppError(
          422,
          'VALIDATION_FAILED',
          'Refund decision is invalid'
        );
      }
      const result = await refundService.decide({
        actor: req.auth,
        refundId: req.params.id,
        ...req.body,
        idempotencyKey: req.get('idempotency-key')
      });
      return respond(res, req, 200, result);
    },
    createByIdTransferRecords: async (req, res) => {
      const allowed = new Set([
        'outcome',
        'amountVnd',
        'transferReference',
        'evidenceReference',
        'paidAt',
        'expectedVersion'
      ]);
      if (!hasOnlyKeys(req.body, allowed, ['outcome', 'expectedVersion'])) {
        throw new AppError(
          422,
          'VALIDATION_FAILED',
          'Refund transfer record is invalid'
        );
      }
      const result = await refundService.recordTransfer({
        actor: req.auth,
        refundId: req.params.id,
        ...req.body,
        idempotencyKey: req.get('idempotency-key')
      });
      const status = result.status === 'TRANSFER_PENDING' ? 202 : 200;
      return respond(res, req, status, result);
    }
  };
}
