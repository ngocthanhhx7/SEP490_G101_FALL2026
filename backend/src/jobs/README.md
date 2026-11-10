# Visit reminder job

This directory contains bounded background jobs. `visit-reminder.job.js` sweeps server-authoritative visit snapshots, evaluates reminder deadlines using timezone-aware instants and emits stable idempotency keys. The job does not mutate visit state; repository integration owns durable schedule-version invalidation and delivery records.

`application-mail.job.js` runs the application mail queue only when runtime
EMAIL_ENABLED is true. It bounds each batch, avoids overlapping ticks and awaits
the current batch on shutdown. The service owns claims/retries and never sends
SMTP inside the application transaction.

`customer-tier.job.js` schedules JOB-05 at 02:00 Vietnam time when
`CUSTOMER_TIER_JOB_ENABLED=true`. Runtime waits for any active run at shutdown.
The customer tier service owns the cutoff, snapshot, lease and retry rules.
