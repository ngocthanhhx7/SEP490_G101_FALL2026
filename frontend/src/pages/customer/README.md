# Customer pages

Customer-only screens live here and use shared P04 controls plus domain adapters from `src/services`; API ownership and role authorization remain server responsibilities.

`CustomerUnpaidBookingsPage` renders the server-projected unpaid-booking list and starts a payment-intent command for multi-visit prepayment through an injected API adapter. Single-visit postpay bills need a separate P01/P34 command. The page does not infer payment success from query parameters or browser return URLs, and fails closed when server clock metadata is unavailable.

P14 adds `CustomerProfilePage` for the Customer's display name and masked verified contact channels. Route and API/DTO wiring remain owned by P01/P34; until those contracts are integrated, callers must inject adapters and pages show integration-pending states. Synthetic adapter tests do not verify authentication, ownership checks, provider behavior, or route registration.