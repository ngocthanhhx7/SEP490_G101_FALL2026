# EC2 production — pawworldvn.shop

This deploys a reviewed `main` SHA. It does not publish unfinished feature work,
seed demo accounts, or claim unconfigured providers are working.

## Host and access

- EC2: `54.79.81.209`, Sydney `ap-southeast-2`, Amazon Linux 2023 / ARM64.
- SSH key remains on the operator's machine, outside this repository.
- Application releases: `/opt/pawworldcare/releases/<full-git-sha>/`.
- Current metadata: `/opt/pawworldcare/shared/current-release.json`.
- Production secrets: `/opt/pawworldcare/shared/.env`, root only (`0600`).
- Mongo bootstrap credentials: `/opt/pawworldcare/shared/mongo.env`, root only.
- Mongo database: `paw_world_care`, single-node replica set `rs0`, port 27017
  bound **only to 127.0.0.1**. This enables transactions; it is not high availability.

Windows PowerShell:

```powershell
ssh -i "$env:USERPROFILE/.ssh/pawworldcare-ec2.pem" ec2-user@ec2-54-79-81-209.ap-southeast-2.compute.amazonaws.com
```

The local restricted copy is used because an Everyone-readable PEM is rejected
by OpenSSH. Do not paste keys or environment contents into chat/issues/PRs.
Security group: SSH 22 from the operator IP; HTTP 80 and HTTPS 443 public;
27017, 3000, 3001, 8080 and 2019 must not be public.

## Cloudflare DNS cutover

Export existing DNS records first so the original Render/Vercel targets remain
available for rollback. Nameservers already delegated to Cloudflare do not need
to change. Replace the three existing web CNAME records as follows; there must
not be a conflicting CNAME or old AAAA for the same name.

| Type | Name | Content | Initial proxy |
| --- | --- | --- | --- |
| A | `@` | `54.79.81.209` | DNS only (grey) |
| A | `www` | `54.79.81.209` | DNS only (grey) |
| A | `api` | `54.79.81.209` | DNS only (grey) |

Use Auto TTL. Wait for the EC2 origin checks below and automatic Caddy
certificate issuance. Then turn all three records to **Proxied** (orange), set
SSL/TLS → Overview → **Full (strict)** and enable Always Use HTTPS. Never use
Flexible: the origin and secure session cookies require HTTPS. Full (strict)
requires an unexpired certificate matching the hostname. See
[Cloudflare requirements](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

Caddy obtains and renews publicly trusted certificates using the domain and
ports 80/443. Its certificate state persists in `pwc-caddy-data`. The application
uses same-origin `/api/v1`; no frontend API key or cross-origin CORS is needed.
The optional `api` hostname proxies the same API. Do not make a proxied SSH record.

EC2's current address is auto-assigned: stop/start can change it. Allocate and
associate an Elastic IP only with the account owner's cost authorization, or
update DNS after an address change. Do not assume the current address is static.

## Environment and providers

```sh
sudoedit /opt/pawworldcare/shared/.env
```

Secrets are generated on EC2 by `bootstrap-ec2.py`; Mongo credentials are already
wired into MONGO_URI. Do not regenerate encryption/session secrets on routine
deploys: this can invalidate sessions or make existing contact data unreadable.
`.env.example` is a placeholder reference only, never the live credential file.
The backend runs with production secure cookies and `TRUST_PROXY_HOPS=1`.
Caddy trusts only the official Cloudflare IP ranges fetched during web
configuration and forwards its resolved client IP. Direct requests cannot
supply a trusted CF-Connecting-IP. See
[Caddy trusted proxy configuration](https://caddyserver.com/docs/caddyfile/options).

Configure `EMAIL_ENABLED`, SMTP_HOST/PORT/USER/PASSWORD and EMAIL_FROM using the
chosen SMTP provider; configure CONTACT_INBOX_EMAIL for contact forms. Email
stays disabled until real credentials exist, so OTP/login/registration cannot
be represented as fully available. SMS and payment remain disabled/unconfigured.
Never use fake OTP delivery or demo credentials on production.

R2 variables are reserved in the server `.env` (`R2_ENABLED=false`, account,
bucket, access key, secret and public media base URL). Merely adding variables
does not implement an adapter: this release does **not** yet upload images to
R2. Keep it disabled until the adapter, authorization, MIME/size limits and
private document access are integrated and tested. Private identity/evidence
objects must not share a public image bucket/domain.

After changing environment values, redeploy the same reviewed SHA using the
activation command below. Docker restart alone retains the old container env.

## Build, deploy and rollback

Install Docker following [AWS Amazon Linux instructions](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-docker.html).
Run bootstrap once as root; reruns retain credentials/volumes and restart a
stopped Mongo container. Never remove `pwc-mongo-data` as part of app deployment.

Prepare an archive from the exact reviewed main SHA containing `backend/src`,
backend package/lock files, `backend/scripts/deployment`, built `frontend/dist`
and a `REVISION` file containing that full SHA. Build frontend with its manifest's
Node/npm versions. Exclude `.env`, keys, `node_modules` and unrelated local work.
Verify the transferred archive SHA-256, then extract into its new SHA directory.

```sh
sudo python3 /opt/pawworldcare/releases/FULL_SHA/backend/scripts/deployment/activate-release.py FULL_SHA
```

Replace FULL_SHA with the actual 40-character SHA. The backend image is built
from a pinned Node 24.21.0 / npm 11.19.0 ARM64-compatible image. Production npm
dependencies exclude dev dependencies. Required indexes must succeed before
activation. The inactive blue/green API slot starts on loopback 3000/3001;
readiness must pass before one graceful Caddy reload changes both the frontend
root and API upstream. The previous API remains running until activation
succeeds. On failure, restore its web configuration and remove the candidate.
The prior release metadata is preserved in `shared/previous-release.json`.

Rollback: read the previous revision from that file and run its activation
command. This preserves Mongo data; it does not undo database migrations.
No destructive migration is included in this release. Revalidate readiness,
frontend assets and authentication/provider status after rollback.

```sh
sudo docker ps --format 'table {{.Names}}\t{{.Status}}'
curl --fail http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8080/ready
curl --fail https://pawworldvn.shop/health
curl --fail https://pawworldvn.shop/ready
sudo ss -lnt
```

Before DNS points to EC2, a successful domain request may still be Render or
Vercel. Verify the origin directly using `curl --resolve` and check the release
metadata on EC2. Never claim cutover from an old host's response. Bare `/api`
must return an API 404 envelope, never SPA HTML.

## Manage MongoDB from your Windows machine

Keep this PowerShell window open:

```powershell
ssh -N -L 127.0.0.1:27018:127.0.0.1:27017 -o ExitOnForwardFailure=yes -i "$env:USERPROFILE/.ssh/pawworldcare-ec2.pem" ec2-user@ec2-54-79-81-209.ap-southeast-2.compute.amazonaws.com
```

Use MongoDB Compass to connect to
`mongodb://127.0.0.1:27018/paw_world_care?directConnection=true`.
In Authentication select Username/Password, username `pwcapp`, authentication
database `paw_world_care`; enter the password privately from the server's
root-only `.env`. `directConnection=true` prevents Compass following the
replica's EC2 loopback address to your local 27017. Do not open port 27017 to the
Internet. Prefer a dedicated read-only management user for routine inspection;
the existing application account can change data and must not be shared.

For remote project editing use VS Code Remote SSH with the SSH host above.
Use sudoedit for the root-only shared `.env`; edit source locally and ship a
reviewed release instead of patching files inside a running container.

## Backups and operational limits

Install the supplied service/timer into `/etc/systemd/system/`, then enable
`pwc-backup.timer`. It runs at 20:10 UTC (03:10 Vietnam) plus up to five minutes
random delay. Archives use mongodump with oplog and gzip, root-only permissions,
and seven-day local retention. Run the backup script once and test restoration
into an isolated database before relying on recovery. Do not restore over live
production to test. Local backups do not survive loss of this EC2 disk; arrange
an encrypted off-host copy and monitor disk space before real customer use.

This host has about 2 GB RAM and a 12 GB root disk. Container memory and log
rotation are bounded, but Mongo data, image layers and backups need monitoring.
This is a single-host deployment, not evidence of a load or availability target.
