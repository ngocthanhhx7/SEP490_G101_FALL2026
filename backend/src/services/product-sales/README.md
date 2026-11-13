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
