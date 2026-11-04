# Product sales API v1 (Customer shop and Admin order handling)

Customer-facing shop for dog/cat food and accessories (catalog, cart and product orders) plus the Admin screen that prepares, ships and hands over those orders. Source: R3 FE-21..FE-23, the Order Management screen, GBR-02 and GBR-35. Off unless `PRODUCT_SALES_ENABLED=true`, and it needs `AUTH_ENABLED=true`.

## Scope and limits

Included: public catalog, Customer cart, order placement with stock reservation, order history. Receive methods are `DELIVERY` (paid on delivery, `COD`) and `PICKUP` (paid at the shop, `PAY_AT_SHOP`).

Not included in this release: online payment (payOS), membership-tier discounts (GBR-42), the refusal limit for COD (GBR-36), returns and the expiry/cancellation jobs, a Sale Staff role, Product Management, Goods Receipt, Counter Sale. Order handling by Admin is described under "Order handling (Admin)" below; the return statuses (`BEING_RETURNED`, `RETURNED`) and `DELIVERED` exist in the model but no endpoint sets them yet.

Delivery fee is a flat 25,000 VND for every served area. This is a **demo value** in `constants/product-fields.js`; the per-area fee configured by Admin (R3 D-060) is not built. Money is integer VND.

## Endpoints

All responses use the common `{ data, meta }` envelope; errors use `{ error: { code, message, ... }, meta }`. Writes need the session CSRF token. Cart and order routes need a signed-in **Customer without an operational role**.

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/v1/products` | public | Shown products. Query: `search`, `category` (`FOOD`/`ACCESSORY`), `petType` (`DOG`/`CAT`), `limit` (1-50) |
| `GET /api/v1/products/:productId` | public | One Shown product with `description`; Hidden or unknown ids return 404 |
| `GET /api/v1/product-cart` | Customer | Cart with `available`, `purchasable`, `exceedsAvailable` per line, `subtotal`, `total`, `deliveryFee` |
| `POST /api/v1/product-cart/lines` | Customer | `{ productId, quantity }` adds to the existing quantity |
| `PATCH /api/v1/product-cart/lines/:productId` | Customer | `{ quantity }` sets the quantity |
| `DELETE /api/v1/product-cart/lines/:productId` | Customer | Removes the line; removing an absent line succeeds |
| `POST /api/v1/product-orders` | Customer | Places the order from the cart. Needs `Idempotency-Key`. Body: `{ receiveMethod, paymentMethod, addressId? }` |
| `GET /api/v1/product-orders` | Customer | The caller's orders, newest first (`limit` 1-50) |
| `GET /api/v1/product-orders/:orderId` | Customer | One of the caller's orders; another Customer's id is a 404 |

Delivery needs `addressId` of one of the caller's active addresses inside the served areas (`DEMO_WORK_AREAS`) and `paymentMethod: COD`. Pickup takes no address and `paymentMethod: PAY_AT_SHOP`. Any other pairing is a 422.

`deliveryFee` in the cart is informational for the checkout preview. The placed order carries the authoritative `subtotal`, `shippingFee` and `total`, and the price of each line at the time of ordering.

## Order handling (Admin)

Who may handle orders is the table in `backend/src/constants/product-permissions.js` (`HANDLE_ORDERS`; today Admin only, which covers every Sale Staff task in R3; adding Sale Staff later is a role change plus one line there). Mounted at `/api/v1/admin/product-orders`, behind the same `PRODUCT_SALES_ENABLED` flag. A Customer or anonymous caller gets 403 or 401. Writes need the session CSRF token and take no `Idempotency-Key`: every step is guarded by the order's current status and version, so repeating a step answers `409 ORDER_STATE_CONFLICT` instead of applying twice.

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/admin/product-orders` | Orders for the Order Management screen. Query: `tab` (`PREPARE` = `PLACED`, `AWAITING_PICKUP` = `READY`, `IN_TRANSIT` = `HANDED_TO_CARRIER`, `RETURNING` = `BEING_RETURNED`, `ALL`), `search` (order code prefix, part of the customer name case-insensitively, or the customer's whole phone number as `0912345678`, `0912 345 678`, `84912345678` or `+84912345678`; a part of a number matches nothing), `limit` (1-50). Response: `{ items, counts }`, `counts` holding the size of every tab. `PREPARE` and `AWAITING_PICKUP` list oldest first, the others newest first. Each item is the Customer order DTO plus `customer: { id, displayName, phone }` (`phone` is the customer's verified number as `0912345678`, or `null`) and `updatedAt`. The phone is only in Admin responses, never in the Customer DTO. Admin items also carry `deliveredAt`, `carrierReturnReason`, `returnReason`, `returnNote`, `returnedAt` and `refundMarked` (all `null`/`false` until set) and `resellableQuantity` on each line (`null` until the return is confirmed); none of these is in the Customer DTO |
| `GET /api/v1/admin/product-orders/:orderId` | One order, any customer |
| `POST .../:orderId/hand-to-carrier` | Delivery order `PLACED` to `HANDED_TO_CARRIER`. Body `{ trackingCode }` (3-64 of letters, digits, `.`, `_`, `-`; trimmed). Missing or blank is `422 TRACKING_CODE_REQUIRED` (MSG103) |
| `POST .../:orderId/mark-ready` | Pickup order `PLACED` to `READY`. No stock change |
| `POST .../:orderId/record-payment` | Pickup order in `PLACED` or `READY`, not yet paid: sets `paid` (money taken at the shop) |
| `POST .../:orderId/hand-to-customer` | Pickup order `READY` to `PICKED_UP`. An unpaid order is `409 ORDER_NOT_PAID` (MSG105) |
| `POST .../:orderId/mark-delivered` | Delivery order `HANDED_TO_CARRIER` to `DELIVERED`, sets `deliveredAt`. A cash-on-delivery order becomes `paid`; an advance payment (`PREPAID`) is left as it was. No stock change |
| `POST .../:orderId/mark-returning` | Delivery order `HANDED_TO_CARRIER` to `BEING_RETURNED`. Body `{ carrierReason }` (required, trimmed, at most 300 characters, no control characters; missing is `422 VALIDATION_FAILED`, R3 has no message for it). No stock change |
| `POST .../:orderId/confirm-returned` | `BEING_RETURNED` to `RETURNED`, once. Body `{ reason, note?, lines }`: `reason` is `CUSTOMER_REFUSED`, `CARRIER_UNDELIVERABLE` or `SHOP_FAULT`; `note` at most 500 characters; `lines` holds every line of the order exactly once as `{ productId, resellableQuantity }`. A quantity that is not a whole number from 0 to the ordered quantity is `422 RESELLABLE_QUANTITY_INVALID` (MSG104) and nothing changes. Only the resellable quantity is added back to `stockOnHand`. `CUSTOMER_REFUSED` also writes one `ProductCustomerRefusal` record in the same transaction. A paid `PREPAID` order is marked `refundMarked`; accounting pays the refund outside PWC |
| `POST .../:orderId/cancel` | Order in `PLACED` or `READY` to `CANCELLED`. Not used by the screen yet |

Any other combination of receive method and status is `409 ORDER_STATE_CONFLICT` with the current `status`. The step bodies other than `hand-to-carrier` must be empty. The customer sees the new status and the tracking code through `GET /api/v1/product-orders`.

Phone numbers are stored encrypted with a keyed lookup hash (the same contact keys as sign-in), so the search is an exact match on the whole number and the number is decrypted only for the Admin response. The backend needs `CONTACT_LOOKUP_SECRET` and `CONTACT_ENCRYPTION_KEY`, which authentication already requires.

Not built: the COD refusal limit (the refusal records it will count already exist), the expiry job, placing an advance-payment order (`PREPAID` exists in the vocabulary only) and refunds themselves.

## Stock rule (GBR-35)

Sellable = `stockOnHand - quantityHeld`; it is computed, not stored. Adding to the cart reserves nothing. Placing an order runs in one transaction: for each line a conditional update reserves the quantity only if `stockOnHand - quantityHeld >= quantity`. If any line fails, no order is created and nothing stays reserved, so two concurrent orders can never reserve more than is sellable. The cart is emptied in the same transaction. Stock is released by Admin order handling, each step in one transaction together with the status change:

- Goods leave the shop (`hand-to-carrier`, `hand-to-customer`): `quantityHeld` and `stockOnHand` both go down by the line quantity.
- Cancelling an order that has not left the shop: only `quantityHeld` goes down; `stockOnHand` is unchanged.
- If a line's held or real stock no longer covers the order (for example it was edited by hand), the step is refused with `409 ORDER_STOCK_MISMATCH` and nothing is changed.

- Confirming a return: only the resellable quantity of each line is added to `stockOnHand` (`quantityHeld` is not touched, the hold was released when the goods left). A line whose product record is gone makes the whole confirmation `409 ORDER_STOCK_MISMATCH` and nothing is saved.

Two Admins acting on the same order cannot both succeed: the status change only matches the status and version that were read.

Replaying the same `Idempotency-Key` with the same body returns the original order without reserving again; the same key with a different body is `409 IDEMPOTENCY_CONFLICT`. Order codes (`DH-0001`) come from an atomic counter; gaps are possible after failed attempts.

## Error codes and R3 messages

| Code | Status | R3 message |
| --- | --- | --- |
| `PRODUCT_QUANTITY_EXCEEDS_AVAILABLE` (`available`) | 409 | MSG58 |
| `PRODUCT_OUT_OF_STOCK` | 409 | MSG98 |
| `CART_EMPTY` | 409 | MSG100 |
| `ADDRESS_REQUIRED` | 422 | MSG101 |
| `ADDRESS_OUT_OF_SERVICE_AREA` | 422 | MSG18 |
| `TRACKING_CODE_REQUIRED` | 422 | MSG103 |
| `ORDER_NOT_PAID` | 409 | MSG105 |
| `ORDER_STATE_CONFLICT` (`status`), `ORDER_STOCK_MISMATCH` | 409 | none |
| `PRODUCT_UNAVAILABLE`, `CART_FULL`, `CART_LINE_NOT_FOUND`, `ADDRESS_NOT_FOUND`, `IDEMPOTENCY_CONFLICT` | 409/404 | none |
| `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND` | 422/401/403/404 | common |

The API returns codes and English text; the frontend shows the Vietnamese wording. Success messages (MSG59, MSG99, MSG106) and empty-state messages (MSG97, MSG102) are frontend-only.

## Demo data

`npm run seed:products` prints the planned products (dry run). `npm run seed:products -- --apply` writes them to a development database only (`*_dev`, not production) and never overwrites an existing product. Nine synthetic products: eight Shown and `SP-0036` Hidden. Stock of `SP-0016`, `SP-0021` and `SP-0037` are sample numbers. Registered models get their collections and indexes from the normal deployment index command.
