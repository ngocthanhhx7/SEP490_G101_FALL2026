# Test evidence and integration status

This directory records checks that were actually run and integration gates that remain open. A fixture or fake provider proves only the tested adapter contract; it does not prove delivery to a customer or production readiness.

Keep evidence tied to a work item, branch/head, command, result, and date. Use synthetic identities and data. Do not include OTP values, phone numbers, provider credentials, `.env` contents, or customer data.

Feature owners maintain domain test scenarios. P34 integration status documents which routes and providers are wired and which end-to-end dependencies remain pending.

P37-C records the current [UC/EXT traceability and test evidence](p37-traceability-evidence-v1.md). Its local test totals do not prove provider, staging, UAT or production integration.

[AI local demo accounts and scenarios](ai-demo-accounts.md) describes the isolated persistent database, OTP demo inbox and interactive shortlist/quote checks.
