# Deployment tools

From `backend/`, run `node --env-file-if-exists=.env scripts/deployment/staging-preflight.js`.
Use a private, ignored staging `.env` or the hosting secret store. Output contains field names
and an offline validation status only; exit 1 blocks invalid input. This command does not start
the app, connect to MongoDB, send OTP, enable a scheduler or certify deployment readiness.

The validator reuses runtime configuration and adds the P35 staging policy: production security
mode, IPv4 loopback behind a local proxy or managed-host wildcard bind, separate `*_staging` database, explicit disabled development seed,
enabled email delivery, separate auth keys and TLS without weakened certificate validation.
Registration and login currently require email; SMS alone cannot satisfy that gate. Real email
delivery must still pass the integration gate. `TRUST_PROXY_HOPS` remains a measured topology decision.

See [staging runbook](../../../doc/deployment/p35-staging-runbook.md) and
[verification matrix](../../../doc/deployment/p35-verification.md). P34 owns changes to
runtime registration, manifests and shared auth/proxy configuration.
