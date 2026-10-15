# P33 handoff — WBS-052 Visit Reminder Job

## Scope

- Sweep upcoming visits using `Asia/Ho_Chi_Minh` and a source-provided reminder lead time or reminder instant.
- Stable keys include visit, schedule version, start instant and lead time so a changed schedule cannot reuse an old reminder.
- Repository ports must atomically invalidate obsolete schedule versions and deduplicate reminders across processes. Provider responses are treated as unconfirmed unless explicitly `ACCEPTED`/`ALREADY_EXISTS`.
- No visit or payment state is mutated by the job.

## Files

- `backend/src/jobs/visit-reminder.job.js`
- `backend/src/jobs/README.md`

## Integration gates

P01/P34 must map `findUpcomingVisits`, durable reminder reservation/delivery records, scheduling, and the notification outbox/provider. Unit fixtures do not prove a live job or provider delivery. The worktree does not claim an actual email, SMS or push send.
