# Product sales pricing

`product-order-pricing.js` calculates totals in integer VND. It floors the
discount for each unit before applying quantity. Shipping is added after the
discount. Public catalog reads continue to expose the selling price.

`product-pricing-eligibility.service.js` reads the stored tier, current approved
policy, refusal count and stored booking overdue state. A missing or unapproved
policy gives a zero discount. `PRODUCT_REFUSAL_LIMIT` defaults to 2. Counts
above the limit require prepayment online and suppress the tier discount at the
cash counter. This module reads overdue state and does not generate it.

`product-customer-price.service.js` projects an authenticated customer's price
for a public catalog item. Cart and counter previews share the pricing rules.
Order creation recomputes pricing in the transaction and stores the tier,
policy version and unit discounts. Later reads and cash collection use the
stored totals.

## Prepaid orders (payOS)

A delivery is paid through payOS in advance (`PREPAID`) or on delivery (`COD`); a
pick-up in advance or at the shop (`PAY_AT_SHOP`). A customer over the refusal
limit may only pay in advance. A prepaid order is placed unpaid, holds its
quantities and is due `PRODUCT_PAYMENT_DEADLINE_HOURS` (default 1) after it was
placed. `product-order-payment.service.js` makes the payOS link; every link has
its own payOS order code, kept in `payment.providerReferences` of the order. The
payOS webhook finds the order by that code, and `product-order-receipt.service.js`
marks it paid once, keeping the receipt in `payment.receipts`; money that cannot
be placed (a cancelled order, a wrong amount) is kept there as a reconciliation
receipt and never reopens the order. Dedupe uses the shared finance command and
event collections; no collection was added. An unpaid prepaid order cannot be
prepared, handed to the carrier or marked ready. A paid prepaid order that is
cancelled or returned gets `refundMarked` and `refundAmountVnd` (GBR-37): the
whole amount, or the price of the goods when the customer refused them without a
reason. PWC does not call payOS to refund; accounting pays outside the system.

## Counter VietQR (payOS)

Counter orders (`channel: 'COUNTER'`, `status: 'AWAITING_PAYMENT'`) reuse the same
payOS payment-link and webhook path. `createCounterLink` reserves a payOS order code
in `payment.providerReferences` with a 15-minute `payment.linkExpiresAt` (separate
from online `paymentDeadlineAt`). A verified webhook transitions the order to `PAID`
with `paymentMethod: 'COUNTER_VIETQR'` and records the receipt once in
`payment.receipts` without sending an online-order notification. Before recording
cash on an order with a provider reference, the service verifies the provider
state. Confirmed unpaid orders can switch to cash. A partial payment, unavailable
lookup or unresolved receipt pauses cash collection. Late transfers after cash
collection remain available for reconciliation.

Unpaid `PAY_AT_SHOP` pick-up orders in `READY` (UC-67 branch 4.1) reuse the same
link creation (`createPickupShopLink`), webhook receipt and settler flow while
keeping `paymentMethod: 'PAY_AT_SHOP'` and storing VietQR receipts in
`payment.receipts`.
