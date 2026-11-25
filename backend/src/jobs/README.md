# Visit reminder job

This directory contains bounded background jobs. `visit-reminder.job.js` sweeps server-authoritative visit snapshots, evaluates reminder deadlines using timezone-aware instants and emits stable idempotency keys. The job does not mutate visit state; repository integration owns durable schedule-version invalidation and delivery records.

`booking-payment-expiry.job.js` schedules JOB-03 every 30 seconds when
authenticated checkout has a configured payOS status provider. The backend
service performs bounded signed-provider reconciliation for attempted links.
If the customer never requested a payOS link, the service can expire the
unpaid booking transactionally after rechecking that no intent was sent and no
verified payment exists. Attempted links still require confirmed terminal
unpaid status from payOS; uncertain status is deferred.

`application-mail.job.js` runs the application mail queue only when runtime
EMAIL_ENABLED is true. It bounds each batch, avoids overlapping ticks and awaits
the current batch on shutdown. The service owns claims/retries and never sends
SMTP inside the application transaction.

`customer-tier.job.js` schedules JOB-05 at 02:00 Vietnam time when
`CUSTOMER_TIER_JOB_ENABLED=true`. Runtime waits for any active run at shutdown.
The customer tier service owns the cutoff, snapshot, lease and retry rules.

`product-pickup-expiry.job.js` runs JOB-04 every five minutes: pick-up orders not
collected in time and, from the same run, prepaid orders not paid in time. An
unpaid prepaid order is cancelled only after payOS (the signed status lookup) says
it holds no payment; a payment found there is recorded through the webhook path
and the order is kept, and a payOS error leaves the order for the next run. A
late payment is no refusal. It runs
when `PRODUCT_PICKUP_EXPIRY_JOB_ENABLED=true` and the authenticated product shop
is enabled. The flag defaults to false. Provision the product order index with
the existing deployment index command before enabling the worker. It processes
up to 100 orders per run, skips overlapping ticks and awaits an active run on
shutdown. The order management service owns the guarded cancellation,
transactional refusal and notification. `PRODUCT_PICKUP_DEADLINE_HOURS` defaults
temporarily to 72 hours and is applied at mark ready even with the worker off.
`PRODUCT_PAYMENT_DEADLINE_HOURS` (default 1) is applied when a prepaid order is placed.

Customer tiers remain disabled by default. Provisioning inserts an unapproved DRAFT sample, not an approved spending/discount policy. Before enabling, the owner must approve exact versioned values and spend-source acceptance (including refund and additional sales-source behavior). Record `state: APPROVED`, BSON Date `approvedAt`, `approvedBy` and `approvalReference` only for that actual reviewed decision; never manufacture approval metadata. Reads/runs refuse DRAFT or unmarked policies. Staged-result application also requires the same current approved version within its fenced transaction, so changing/revoking a policy blocks stale resumed writes. Existing unmarked policies are not implicitly approved or backfilled. This PR does not enable the job or approve any real discount.
