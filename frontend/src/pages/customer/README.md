# Customer pages

Customer-only screens live here. `CustomerUnpaidBookingsPage` renders the server-projected unpaid-booking list and starts a payment-intent command for multi-visit prepayment through an injected API adapter. Single-visit postpay bills need a separate P01/P34 command. The page does not infer payment success from query parameters or browser return URLs, and fails closed when server clock metadata is unavailable.

The route and API/DTO wiring remain owned by P01/P34. Until those contracts are integrated, callers must inject the adapter; the page shows an integration-pending state when it is absent. Synthetic adapter tests do not verify authentication, ownership checks, provider behavior, or route registration.
