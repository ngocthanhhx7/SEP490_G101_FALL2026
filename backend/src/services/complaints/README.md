# Complaints service

P30 owns the Customer complaint lifecycle. The service derives visit ownership
from the server, enforces the seven-day window in server time and one open case
per visit, keeps evidence references private, and uses idempotency plus expected
versions for all commands. Staff can review and resolve; a Customer may dispute
one resolution; only Admin can make the final close decision.

Settlement holds are passed to the injected financial port. This module never
calculates, charges, refunds or marks a settlement complete. P34/P01 must wire
the repository, case projection and media capability provider before calling the
flow integrated.
