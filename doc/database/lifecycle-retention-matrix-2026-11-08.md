# Current lifecycle and retention decision matrix

This is a concrete no-purge proposal for the current82 physical namespaces, based on the aggregate-only native snapshot2026-11-08 12:51UTC (82 collections/585 documents/203 indexes, not one transactional snapshot). Native raw validation later changes six validators, not names/indexes/TTL. No private document values are included. The previous83-store inventory is filtered by actual current names; retired servicepresentations is absent.

## Proposed boundaries and unresolved decisions

- Keep the seven existing TTL contracts unchanged; do not treat asynchronous physical expiry as authorization.
- Keep financial, paid/signed snapshots, audit, source claims and replay keys without a new TTL. Any future archive/purge needs an owner-approved purpose, minimum replay/dispute window, legal-hold rule, reconciliation/restore path and domain tests. No duration is invented here.
- For private documents/images/mail, prepare coordinated metadata/object minimization only after purpose-end, application/contract/dispute status and provider deletion/recovery obligations are specified. Deleting metadata alone does not prove private object erasure or release replay/UNKNOWN guarantees.
- Quota/counter/guard stores are state, not disposable logs: reset requires a proven cap/uniqueness/replay migration.
- Active master data and catalog/policy/history retain existing archive/tombstone/version behavior. Historical references are not duplication defects.
- The only proposed physical drop is the separately prepared empty earningaccrualtasks queue. The old approvals do not authorize it; see the [exact decision scope](empty-accrual-queue-retirement-2026-11-08.md).

No blanket TTL, automatic archival, UNKNOWN resend or private-content purge is proposed. Owner policy is a decision gate; payOS/SMTP/R2/provider receipts and raw refund producer mapping remain integration gates. A future concrete purge cannot be approved by this matrix alone.

## Per-store disposition

| Collection | Snapshot docs | Existing automatic expiry | Proposed action / exact gate |
| --- | ---: | --- | --- |
| account_contact_audit_events | 2 | None | KEEP security/decision evidence; signed retention + redaction/replay audit gate |
| aidecisions | 0 | expiresAt + 0 s | KEEP existing TTL; retain independent auth/business expiry checks |
| aipricingpolicies | 40 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| airankingpolicies | 1 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| airankmodels | 0 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| airoutingmatrixes | 0 | expiresAt + 0 s | KEEP existing TTL; retain independent auth/business expiry checks |
| aischeduleblocks | 0 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| aisitterprofiles | 0 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| aivisitoutcomes | 0 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| applicantdocumentquotas | 7 | None | KEEP state/replay; domain cap/uniqueness/replay migration before reset/expiry |
| applicantdocuments | 20 | None | KEEP; purpose-end/hold + coordinated private-object/provider erasure and recovery gate |
| application_mails | 23 | None | KEEP; purpose-end/hold + coordinated private-object/provider erasure and recovery gate |
| authsessions | 13 | expiresAt + 0 s | KEEP existing TTL; retain independent auth/business expiry checks |
| bookings | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| caremediabindings | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| cases | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| catalogprovisioningruns | 4 | None | KEEP state/replay; domain cap/uniqueness/replay migration before reset/expiry |
| contacts | 15 | None | KEEP; purpose-end/hold + coordinated private-object/provider erasure and recovery gate |
| customeraddresses | 31 | None | KEEP; purpose-end/hold + coordinated private-object/provider erasure and recovery gate |
| customerreviewcommands | 0 | None | KEEP state/replay; domain cap/uniqueness/replay migration before reset/expiry |
| demopopulationruns | 1 | None | KEEP state/replay; domain cap/uniqueness/replay migration before reset/expiry |
| earningaccrualtasks | 0 | None | New decision: empty queue only; exact metadata/backup/reverse/freeze gate |
| employeeavailabilities | 2 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| employeeavailabilityrevisions | 5 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| employeeschedulecommands | 0 | None | KEEP state/replay; domain cap/uniqueness/replay migration before reset/expiry |
| employeescheduleevents | 0 | None | KEEP state/replay; domain cap/uniqueness/replay migration before reset/expiry |
| employeescheduleproposals | 0 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| employeevisitoffers | 0 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| employeevisittravels | 0 | expiresAt + 0 s | KEEP existing TTL; retain independent auth/business expiry checks |
| employmentcontracts | 3 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| employmentdocumentcommands | 14 | None | KEEP state/replay; domain cap/uniqueness/replay migration before reset/expiry |
| employmentdocumentcounters | 1 | None | KEEP state/replay; domain cap/uniqueness/replay migration before reset/expiry |
| employmentdocuments | 6 | None | KEEP; purpose-end/hold + coordinated private-object/provider erasure and recovery gate |
| financesourcecommands | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| financesourceevents | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| notificationevents | 0 | None | KEEP; purpose-end/hold + coordinated private-object/provider erasure and recovery gate |
| notifications | 0 | None | KEEP; purpose-end/hold + coordinated private-object/provider erasure and recovery gate |
| otpchallenges | 0 | expiresAt + 0 s | KEEP existing TTL; retain independent auth/business expiry checks |
| otpthrottles | 0 | expiresAt + 0 s | KEEP existing TTL; retain independent auth/business expiry checks |
| paymentintents | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| payments | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| payrolladjustments | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| payrollcommands | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| payrollevents | 35 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| payrollmonthguards | 2 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| payrollservicecredits | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| payrollsourceclaims | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| payrollstatements | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| petcarecommands | 18 | None | KEEP state/replay; domain cap/uniqueness/replay migration before reset/expiry |
| pets | 48 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| privateimagequotas | 0 | None | KEEP state/replay; domain cap/uniqueness/replay migration before reset/expiry |
| privateimages | 0 | None | KEEP; purpose-end/hold + coordinated private-object/provider erasure and recovery gate |
| productcarts | 0 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| productcounters | 2 | None | KEEP state/replay; domain cap/uniqueness/replay migration before reset/expiry |
| productcustomerrefusals | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| productorders | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| productphotos | 0 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| products | 30 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| profileavatars | 5 | None | KEEP; purpose-end/hold + coordinated private-object/provider erasure and recovery gate |
| publicpolicyversions | 2 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| reference_catalog | 39 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| refunds | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| reviews | 0 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| salaryadvances | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| servicepolicyversions | 16 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| servicepriceversions | 16 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| services | 15 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| serviceversions | 22 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| sitterapplicationaudits | 86 | None | KEEP security/decision evidence; signed retention + redaction/replay audit gate |
| sitterapplicationdownloadquotas | 0 | windowStart + 90000 s | KEEP existing TTL; retain independent auth/business expiry checks |
| sitterapplications | 7 | None | KEEP; purpose-end/hold + coordinated private-object/provider erasure and recovery gate |
| sitterpublicprofileaudits | 2 | None | KEEP security/decision evidence; signed retention + redaction/replay audit gate |
| sitterpublicprofilecommands | 2 | None | KEEP state/replay; domain cap/uniqueness/replay migration before reset/expiry |
| sitterpublicprofiles | 1 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| sitterrankmodelreviews | 0 | None | KEEP security/decision evidence; signed retention + redaction/replay audit gate |
| sitterstatuses | 4 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| suppliers | 1 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| systemsettingversions | 1 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| taxassessments | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |
| useradminaudits | 8 | None | KEEP security/decision evidence; signed retention + redaction/replay audit gate |
| users | 35 | None | KEEP current owner/archive/version lifecycle; explicit reference-safe migration before removal |
| visits | 0 | None | KEEP; owner retention/replay/dispute/legal-hold + reconciliation contract before any purge |

## Operational evidence and limits

Current source/profile gating and isolated native tests are documented in the [unified backlog](optimization-backlog-2026-11-08.md), [native contracts](raw-operational-validation-2026-11-08.md) and [financial serialization evidence](financial-serialization-evidence-2026-11-08.md). Allocation snapshots do not measure index usage or justify dropping stores. indexStats was not called or obtained through elevated permissions. Backup/restore proves MongoDB recovery in its tested scope; it does not prove private external-object deletion/restore, provider acceptance, legal retention sufficiency or HA.
