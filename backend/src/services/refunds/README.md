# Refund service

This module implements the Staff proposal and Admin decision/manual-transfer state machine. It has no payment-provider call and does not calculate cancellation retention, allocation, rounding, or post-payout debt policy.

P01/P34 must provide transactional repository adapters before production use. The adapter contract must make command idempotency unique by actor/operation/key, reserve/refund/release capacity atomically against verified net collections and earlier adjustments, append immutable refund events and ledger entries, and commit them in one transaction. The capacity port must return `ready: true`, an integer `availableRefundableVnd`, and an empty `decisionIds` array; open P51 decisions fail closed. Source authorization is injected and required for proposal, decision and transfer operations.

Ledger movements represent reservation, confirmed payment, or release after confirmed failure. An unknown transfer or amount mismatch remains `TRANSFER_PENDING` with the reservation held. The service exposes no edit/delete operation for ledger rows. The route modules in `backend/src/routes/refunds.routes.js` are exported for P34 to register; they are not mounted by this package.
