# Visit reminder job

This directory contains bounded background jobs. `visit-reminder.job.js` sweeps server-authoritative visit snapshots, evaluates reminder deadlines using timezone-aware instants and emits stable idempotency keys. The job does not mutate visit state; repository integration owns durable schedule-version invalidation and delivery records.

`application-mail.job.js` runs the application mail queue only when runtime
EMAIL_ENABLED is true. It bounds each batch, avoids overlapping ticks and awaits
the current batch on shutdown. The service owns claims/retries and never sends
SMTP inside the application transaction.

`customer-tier.job.js` schedules JOB-05 at 02:00 Vietnam time when
`CUSTOMER_TIER_JOB_ENABLED=true`. Runtime waits for any active run at shutdown.
The customer tier service owns the cutoff, snapshot, lease and retry rules.

Customer tiers remain disabled by default. Provisioning inserts an unapproved DRAFT sample, not an approved spending/discount policy. Before enabling, the owner must approve exact versioned values and spend-source acceptance (including refund and additional sales-source behavior). Record `state: APPROVED`, BSON Date `approvedAt`, `approvedBy` and `approvalReference` only for that actual reviewed decision; never manufacture approval metadata. Reads/runs refuse DRAFT or unmarked policies. Staged-result application also requires the same current approved version within its fenced transaction, so changing/revoking a policy blocks stale resumed writes. Existing unmarked policies are not implicitly approved or backfilled. This PR does not enable the job or approve any real discount.
