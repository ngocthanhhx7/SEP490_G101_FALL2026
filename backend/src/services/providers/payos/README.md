# payOS provider adapter

This directory contains the server-only payOS HTTP adapter for P31. `payos.provider.js` loads opt-in configuration, creates signed payment links, verifies signed webhook data, and reads signed payment-link state for reconciliation. It uses Node's built-in `fetch` and `crypto`; credentials must be passed from server configuration and must never be exposed to browser code or logs.

`createPaymentLink` requires a positive safe-integer VND amount, a positive integer order code, a description of at most nine characters (the payOS API notes this limit for some bank accounts), and valid return/cancel URLs. The return URL only tells payOS where to send the browser. It does not confirm payment or change any Paw World Care payment state. `getPaymentLink` returns a signed provider snapshot for reconciliation; WBS-045 owns verified webhook receipt, idempotency, and business-state decisions.

Configuration is opt-in through `PAYOS_ENABLED=true` with `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, and `PAYOS_CHECKSUM_KEY`. Missing/disabled configuration leaves the provider unavailable. P34 owns runtime wiring and `.env.example` updates.

The request fields and API paths follow payOS's [API reference](https://payos.vn/docs/api/), official [Node SDK and sample index](https://payos.vn/docs/sample/), and [Node sample](https://github.com/payOSHQ/payos-demo-nodejs). Signature verification follows payOS's [signature guide](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/): HMAC-SHA256 over data keys sorted alphabetically, with null-like values normalized as documented. Unit tests use synthetic credentials and provider responses; no live payOS account or sandbox credentials are available for this worktree.
