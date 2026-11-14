# Visit reminder job

This directory contains bounded background jobs. `visit-reminder.job.js` sweeps server-authoritative visit snapshots, evaluates reminder deadlines using timezone-aware instants and emits stable idempotency keys. The job does not mutate visit state; repository integration owns durable schedule-version invalidation and delivery records.

`application-mail.job.js` runs the application mail queue only when runtime
EMAIL_ENABLED is true. It bounds each batch, avoids overlapping ticks and awaits
the current batch on shutdown. The service owns claims/retries and never sends
SMTP inside the application transaction.

`customer-tier.job.js` schedules JOB-05 at 02:00 Vietnam time when
`CUSTOMER_TIER_JOB_ENABLED=true`. Runtime waits for any active run at shutdown.
The customer tier service owns the cutoff, snapshot, lease and retry rules.

`product-pickup-expiry.job.js` runs the pickup part of JOB-04 every five minutes
when `PRODUCT_PICKUP_EXPIRY_JOB_ENABLED=true` and the authenticated product shop
is enabled. The flag defaults to false. Provision the product order index with
the existing deployment index command before enabling the worker. It processes
up to 100 orders per run, skips overlapping ticks and awaits an active run on
shutdown. The order management service owns the guarded cancellation,
transactional refusal and notification. `PRODUCT_PICKUP_DEADLINE_HOURS` defaults
temporarily to 72 hours and is applied at mark ready even with the worker off.

Customer tiers remain disabled by default. Provisioning inserts an unapproved DRAFT sample, not an approved spending/discount policy. Before enabling, the owner must approve exact versioned values and spend-source acceptance (including refund and additional sales-source behavior). Record `state: APPROVED`, BSON Date `approvedAt`, `approvedBy` and `approvalReference` only for that actual reviewed decision; never manufacture approval metadata. Reads/runs refuse DRAFT or unmarked policies. Staged-result application also requires the same current approved version within its fenced transaction, so changing/revoking a policy blocks stale resumed writes. Existing unmarked policies are not implicitly approved or backfilled. This PR does not enable the job or approve any real discount.
