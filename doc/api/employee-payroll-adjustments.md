# Employee Payroll Adjustments

All endpoints are relative to `/api/v1/payroll`, require an active session and return
private/no-store responses. Every mutation requires CSRF and an `Idempotency-Key`.
Admin alone can submit, decide, record payment or record agreed reconciliation.

| Endpoint | Input / result |
| --- | --- |
| `POST /adjustments` | `statementId`, original `expectedVersion`, `direction`, positive integer `amountVnd`, `reason`, `assessmentReference` |
| `GET /adjustments` | Admin list; signed `cursor`, `limit` (20 default, 50 maximum); `items`, `nextCursor` |
| `POST /adjustments/:id/decisions` | Adjustment `expectedVersion`, `action` and required evidence fields below |
| `GET /me` | Employee-owned `adjustments`, `adjustmentNextCursor`; optional signed `adjustmentCursor` |

`direction` is SUPPLEMENT or RECOVERY. The original must be APPROVED/PAID for a supplement,
PAID for a recovery. The statement version is retained as source provenance. The amount and
assessment never change after submission. Reusing the same statement/assessment reference is
rejected even with a different operation key; replaying an identical command returns its result.

| Current status | Action | Required fields | New status |
| --- | --- | --- | --- |
| SUBMITTED | APPROVE | `reason` | APPROVED |
| SUBMITTED | REJECT | `reason` | REJECTED |
| APPROVED, SUPPLEMENT | RECORD_PAYMENT | `transferReference`; original salary must be PAID | PAID |
| APPROVED, RECOVERY | RECONCILE | `agreementReference`, `resolutionReference` | RECONCILED |

Payment references share a transactional claim with salary and advance records. Both adjustment
creation and decisions serialize on the employee guard; every transition and idempotent result
commit together. Reads are bounded and paginated. Runtime refuses missing collections/indexes;
the existing payroll storage migration provisions the added collection and its unique index.

Public employee projections omit assessment, bank, agreement and resolution references.
Admin projections include these references to review the supporting records. The workflow
never edits the original salary snapshot, creates a deduction or calls a bank/provider. A recovery
record is not permission to impose a wage penalty. Verify the actual agreement and legal basis
before recording external resolution.

Regression coverage: `backend/tests/integration/employee-payroll.test.js` and
`frontend/tests/unit/employee-payroll.test.jsx` exercise immutable originals, ownership, CSRF,
version conflicts, missing evidence, duplicate references, concurrent retry, rejection and UI commands.
