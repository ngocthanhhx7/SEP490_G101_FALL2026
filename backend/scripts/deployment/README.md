# Deployment tools

Production operator steps: [EC2 environment guide](../../../doc/deployment/ec2-environment-guide.md).

`ensure-indexes.js` registers runtime models, creates their collections/indexes,
and provisions raw finance/scheduling storage when their feature flags are enabled.
It verifies the required payroll, finance and scheduling indexes before reporting
`INDEXES_READY`. Run it with the release image and the target environment after
backup and before activation (the activation script already does this). This is
additive storage provisioning: no demo users, contracts, catalog edits or business
transactions are inserted. Conflicting indexes, duplicate data and the obsolete
all-history payroll period index stop deployment for a reviewed migration; this
command never drops or replaces an existing index. A failed run may leave additive
collections/indexes in place and is safe to repeat after the conflict is resolved.

`extract-hanoi-routing.py` clips an operator-supplied public OSM PBF using
separately installed osmium 4.3.2, preserving routing tags, complete references
and relevant turn restrictions. It refuses existing output, emits hashes and
counts, and never downloads or deploys data. Generated graph files stay outside Git.
`check-private-media-memory.py` and its adjacent `.mjs` are isolated Linux
diagnostics, not application startup code. The Python runner requires a built
full-SHA application image, root Docker access and spare RAM; it creates a unique
internal network and temporary Mongo/Node containers without production env,
volumes or published ports. It removes only those generated resources afterward.
See the [memory evidence and limits](../../../doc/deployment/aws/r2-private-media.md).
The adjacent `../test-esms.js` is an operator-only, one-request transport smoke test:
from `backend/`, run `node --env-file-if-exists=.env scripts/test-esms.js --sandbox`
with `ESMS_TEST_PHONE` in a private environment. `--live` sends a real SMS and requires
authorization for that recipient. Do not rerun after acceptance/timeout just because
the handset has not received a message; check the provider delivery record first.
Optional `ESMS_TEST_RECEIPT` writes a private, exclusive receipt without OTP/phone;
keep it outside Git. This script does not enable SMS registration/login in the UI.

From `backend/`, run `node --env-file-if-exists=.env scripts/deployment/staging-preflight.js`.
Use a private, ignored staging `.env` or the hosting secret store. Output contains field names
and an offline validation status only; exit 1 blocks invalid input. This command does not start
the app, connect to MongoDB, send OTP, enable a scheduler or certify deployment readiness.

The validator reuses runtime configuration and adds the P35 staging policy: production security
mode, IPv4 loopback behind a local proxy or managed-host wildcard bind, separate `*_staging` database, explicit disabled development seed,
enabled email delivery, separate auth keys and TLS without weakened certificate validation.
Set `STAGING_MONGO_TOPOLOGY=remote` for a TLS-validated remote replica set. The explicit
`local-ec2` option accepts only authenticated `mongodb://` replica-set URIs whose every
host is the literal `127.0.0.1` or `::1`; it does not accept network hosts or mixed URIs.
Registration and login currently require email; SMS alone cannot satisfy that gate. Real email
delivery must still pass the integration gate. `TRUST_PROXY_HOPS` remains a measured topology decision.

See [staging runbook](../../../doc/deployment/p35-staging-runbook.md) and
[verification matrix](../../../doc/deployment/p35-verification.md). P34 owns changes to
runtime registration, manifests and shared auth/proxy configuration.
