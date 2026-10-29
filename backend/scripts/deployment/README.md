# EC2 operations

Root-only host bootstrap and release scripts for the shared backend/frontend EC2
deployment. See [deployment runbook](../../../doc/deployment/ec2-production.md).

- `bootstrap-ec2.py`: retain/generate host secrets and initialise authenticated
  loopback MongoDB replica set; no customer/demo fixtures.
- `Dockerfile`: pinned production Node image and production dependencies only.
- `ensure-indexes.js`: initialise runtime model indexes without opening HTTP.
- `activate-release.py`: validate full-SHA release, prepare inactive API slot,
  verify readiness, switch web frontend/API together and retain rollback metadata.
- `start-web.py`, `Caddyfile`: validated Caddy configuration, trusted Cloudflare
  client addresses and persistent automatic HTTPS certificates.
- `backup-mongo.sh`, service/timer: root-only oplog archives with local retention.

Run scripts only for the user's explicitly selected environment. Live `.env`,
private keys, certificates, volumes and backups never belong in this directory
or Git. A generated secret is not a provider credential; disabled SMTP/R2 must
not be reported as operational.
