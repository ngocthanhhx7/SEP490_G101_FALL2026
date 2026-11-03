# Product sales API v1 (Customer shop, release 1)

Customer-facing shop for dog/cat food and accessories: catalog, cart and product orders. Source: R3 FE-21..FE-23, GBR-02 and GBR-35. Off unless `PRODUCT_SALES_ENABLED=true`, and it needs `AUTH_ENABLED=true`.

## Scope and limits

Included: public catalog, Customer cart, order placement with stock reservation, order history. Receive methods are `DELIVERY` (paid on delivery, `COD`) and `PICKUP` (paid at the shop, `PAY_AT_SHOP`).

Not included in this release: online payment (payOS), membership-tier discounts (GBR-42), the refusal limit for COD (GBR-36), order handling by staff (carrier hand-over, ready, picked up, returns, cancellation jobs), Product Management, Goods Receipt, Counter Sale. Orders therefore stay in `PLACED`; the later statuses exist in the model for the staff release.

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

## Stock rule (GBR-35)

Sellable = `stockOnHand - quantityHeld`; it is computed, not stored. Adding to the cart reserves nothing. Placing an order runs in one transaction: for each line a conditional update reserves the quantity only if `stockOnHand - quantityHeld >= quantity`. If any line fails, no order is created and nothing stays reserved, so two concurrent orders can never reserve more than is sellable. The cart is emptied in the same transaction. Releasing stock when goods leave the shop or an order is cancelled belongs to the staff release.

Replaying the same `Idempotency-Key` with the same body returns the original order without reserving again; the same key with a different body is `409 IDEMPOTENCY_CONFLICT`. Order codes (`DH-0001`) come from an atomic counter; gaps are possible after failed attempts.

## Error codes and R3 messages

| Code | Status | R3 message |
| --- | --- | --- |
| `PRODUCT_QUANTITY_EXCEEDS_AVAILABLE` (`available`) | 409 | MSG58 |
| `PRODUCT_OUT_OF_STOCK` | 409 | MSG98 |
| `CART_EMPTY` | 409 | MSG100 |
| `ADDRESS_REQUIRED` | 422 | MSG101 |
| `ADDRESS_OUT_OF_SERVICE_AREA` | 422 | MSG18 |
| `PRODUCT_UNAVAILABLE`, `CART_FULL`, `CART_LINE_NOT_FOUND`, `ADDRESS_NOT_FOUND`, `IDEMPOTENCY_CONFLICT` | 409/404 | none |
| `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND` | 422/401/403/404 | common |

The API returns codes and English text; the frontend shows the Vietnamese wording. Success messages (MSG59, MSG99) and empty-state messages (MSG97, MSG102) are frontend-only.

## Demo data

`npm run seed:products` prints the planned products (dry run). `npm run seed:products -- --apply` writes them to a development database only (`*_dev`, not production) and never overwrites an existing product. Nine synthetic products: eight Shown and `SP-0036` Hidden. Stock of `SP-0016`, `SP-0021` and `SP-0037` are sample numbers. Registered models get their collections and indexes from the normal deployment index command.
