# Payroll directory index traversal

The employee directory previously sorted every contract revision globally by
version before grouping employeeId. Sorting employeeId DESC, version DESC lets
MongoDB traverse the existing unique employeeId ASC/version ASC index backwards
and select the latest contract per employee. No hint, index, schema, data,
dependency, policy or HTTP contract change is needed.

Keep the 201-row sentinel and 409 PAYROLL_REVIEW_REQUIRED above 200 distinct
contract employees, before filtering User roles. Keep latest-version semantics
for future/expired contracts, absent users, PET_SITTER filtering and existing DTO
ordering; this query is not the effective-contract authority for payroll amounts.
The 200 cap still requires a separate paged API/UI design for larger populations.

The independent paired synthetic fixture (MongoDB 8.0.34 replica set, 200 employees
and 100k contracts) examined 200 rather than 100k documents, p50 453.49 to 25.03 ms
and p95 675.87 to 38.75 ms. Planner-selected traversal retained those gains without
forcing a hint; a missing index still returns the same result. These timings do
not establish production capacity or a percentile SLO.

Overview remains exact all-time totals: measured projection/covering candidates
did not justify extra write/storage cost. Mail FIFO/due candidates remain rejected
because of skew regressions and unresolved isolated concurrent-claim observations;
no production incident or root cause was established. Keep UNKNOWN/no-blind-resend,
CAS, queue indexes and lease recovery behavior unchanged.

Release gates: compare the final source against reviewed main; architecture,
lint, affected replica-set tests, frontend build and required CI; independent
review and Leader merge. Take a fresh consistent backup and verify an isolated
restore before ordinary code deployment. Compare retained document and index
metadata hashes, readiness and existing auth/HTTP behavior. There is no data
migration or physical cleanup. Rollback selects the previous reviewed code and
leaves all indexes and financial writes intact; never restore an old whole DB.
