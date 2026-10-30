# payOS Configuration

The backend example lists the supported variables. Add them to local
`backend/.env` and VPS `/opt/pawworldcare/shared/.env`; never commit those files.

```dotenv
PAYOS_ENABLED=false
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
PAYOS_TIMEOUT_MS=10000
```

Obtain Client ID, API Key and Checksum Key from the same payment channel in the
payOS merchant dashboard. Fill all three privately, then set `PAYOS_ENABLED=true`
when ready for provider acceptance. Missing enabled credentials stop startup;
leaving the provider disabled preserves unavailable payment-link responses.
Timeout is milliseconds, from 100 to 30000. No frontend `VITE_*` key is needed.

Configure this public webhook URL on that payOS channel:

```text
https://pawworldvn.shop/api/v1/payments/payos/webhook
```

The API hostname serves the same route, but choose one canonical URL. The route
requires `AUTH_ENABLED=true`, `FINANCE_SOURCES_ENABLED=true` and a configured
payOS provider; the webhook itself verifies the provider signature instead of a
browser session/CSRF token. Provision reviewed finance storage first.
Browser checkout also requires `BOOKING_CHECKOUT_ENABLED=true`.

Use `BOOKING_WEB_ORIGIN=https://pawworldvn.shop` on VPS, or the actual Vite origin
locally, such as `http://localhost:5173`. Checkout derives return/cancel URLs as
`/services?booking=<id>` from that origin. Those browser returns do not confirm
payment. There are no separate `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL` or
`PAYOS_WEBHOOK_URL` runtime variables. Local webhooks need a reachable HTTPS tunnel;
the provider cannot call a localhost URL. Use a separate channel for local tests
to avoid replacing the production channel webhook.

Recreate the backend container through the
[reviewed release procedure](ec2-environment-guide.md)
after changing VPS env; Docker restart does not reload `--env-file`. Verify the
public webhook configuration and signed callback behavior before claiming live
payment acceptance. Tests use synthetic signatures; never send a real payment
or change payment state just to confirm that the keys exist.

Reference: [payOS API documentation](https://payos.vn/docs/api/).
