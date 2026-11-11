# Product sales API v1 (Customer shop and order handling)

Customer-facing shop for dog/cat food and accessories (catalog, cart and product orders) plus the order management screen for Admin and Sale Staff that prepares, ships and hands over those orders. Source: R3 FE-21..FE-23, the Order Management screen, GBR-02 and GBR-35. Off unless `PRODUCT_SALES_ENABLED=true`, and it needs `AUTH_ENABLED=true`.

## Scope and limits

Included: public catalog, Customer cart, order placement with stock reservation, order history. Receive methods are `DELIVERY` (paid on delivery, `COD`) and `PICKUP` (paid at the shop, `PAY_AT_SHOP`).

This release covers the order handling steps below. Online payment, tier discounts, the COD refusal limit, automatic expiry, Goods Receipt and Counter Sale are outside this release.

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

## Order handling (Admin and Sale Staff)

`HANDLE_ORDERS` grants Admin and Sale Staff access to list, read and process orders at `/api/v1/admin/product-orders` when `PRODUCT_SALES_ENABLED=true`. `CANCEL_ONLINE_ORDERS` grants cancellation to Admin only. Other signed-in roles receive 403 and unauthenticated requests receive 401. Writes need the session CSRF token and take no `Idempotency-Key`: every step is guarded by the order's current status and version, so repeating a step answers `409 ORDER_STATE_CONFLICT` instead of applying twice.

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/admin/product-orders` | Orders for the Order Management screen. Query: `tab` (`PREPARE` = `PLACED`, `AWAITING_PICKUP` = `READY`, `IN_TRANSIT` = `HANDED_TO_CARRIER`, `RETURNING` = `BEING_RETURNED`, `ALL`), `search` (order code prefix, part of the customer name case-insensitively, or the customer's whole phone number as `0912345678`, `0912 345 678`, `84912345678` or `+84912345678`; a part of a number matches nothing), `limit` (1-50). Response: `{ items, counts }`, `counts` holding the size of every tab. `PREPARE` and `AWAITING_PICKUP` list oldest first, the others newest first. Each item is the Customer order DTO plus `customer: { id, displayName, phone }` (`phone` is the customer's verified number as `0912345678`, or `null`) and `updatedAt`. The order management DTO includes the phone for Admin and Sale Staff. Order management items also carry `deliveredAt`, `carrierReturnReason`, `returnReason`, `returnNote`, `returnedAt` and `refundMarked` (all `null`/`false` until set) and `resellableQuantity` on each line (`null` until the return is confirmed); none of these is in the Customer DTO |
| `GET /api/v1/admin/product-orders/:orderId` | One order, any customer |
| `POST .../:orderId/hand-to-carrier` | Delivery order `PLACED` to `HANDED_TO_CARRIER`. Body `{ trackingCode }` (3-64 of letters, digits, `.`, `_`, `-`; trimmed). Missing or blank is `422 TRACKING_CODE_REQUIRED` (MSG103) |
| `POST .../:orderId/mark-ready` | Pickup order `PLACED` to `READY`. No stock change |
| `POST .../:orderId/record-payment` | Pickup order in `PLACED` or `READY`, not yet paid: sets `paid` (money taken at the shop) |
| `POST .../:orderId/hand-to-customer` | Pickup order `READY` to `PICKED_UP`. An unpaid order is `409 ORDER_NOT_PAID` (MSG105) |
| `POST .../:orderId/mark-delivered` | Delivery order `HANDED_TO_CARRIER` to `DELIVERED`, sets `deliveredAt`. A cash-on-delivery order becomes `paid`; an advance payment (`PREPAID`) is left as it was. No stock change |
| `POST .../:orderId/mark-returning` | Delivery order `HANDED_TO_CARRIER` to `BEING_RETURNED`. Body `{ carrierReason }` (required, trimmed, at most 300 characters, no control characters; missing is `422 VALIDATION_FAILED`, R3 has no message for it). No stock change |
| `POST .../:orderId/confirm-returned` | `BEING_RETURNED` to `RETURNED`, once. Body `{ reason, note?, lines }`: `reason` is `CUSTOMER_REFUSED`, `CARRIER_UNDELIVERABLE` or `SHOP_FAULT`; `note` at most 500 characters; `lines` holds every line of the order exactly once as `{ productId, resellableQuantity }`. A quantity that is not a whole number from 0 to the ordered quantity is `422 RESELLABLE_QUANTITY_INVALID` (MSG104) and nothing changes. Only the resellable quantity is added back to `stockOnHand`. `CUSTOMER_REFUSED` also writes one `ProductCustomerRefusal` record in the same transaction. A paid `PREPAID` order is marked `refundMarked`; accounting pays the refund outside PWC |
| `POST .../:orderId/cancel` | Admin only. Order in `PLACED` or `READY` to `CANCELLED` |

Any other combination of receive method and status is `409 ORDER_STATE_CONFLICT` with the current `status`. The step bodies other than `hand-to-carrier` must be empty. The customer sees the new status and the tracking code through `GET /api/v1/product-orders`.

Phone numbers are stored encrypted with a keyed lookup hash (the same contact keys as sign-in), so the search is an exact match on the whole number and the number is decrypted for the order management response. The backend needs `CONTACT_LOOKUP_SECRET` and `CONTACT_ENCRYPTION_KEY`, which authentication already requires.

Not built: the COD refusal limit (the refusal records it will count already exist), the expiry job, placing an advance-payment order (`PREPAID` exists in the vocabulary only) and refunds themselves.

## Product Management (Admin)

Who may manage products is `MANAGE_PRODUCTS` in `backend/src/constants/product-permissions.js` (today Admin only). Mounted at `/api/v1/admin/products`, behind the same `PRODUCT_SALES_ENABLED` flag. A Customer, a Sitter or anonymous caller gets 403 or 401. Writes need the session CSRF token and take no `Idempotency-Key`: an edit matches the `version` the Admin saw, so a second save of the same screen is `409 VERSION_CONFLICT` instead of applying twice. There is no delete: a product is only shown or hidden.

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/admin/products` | Every product, hidden ones too, by code. Query: `search` (a part of the name or of the code, case-insensitive), `category` (`FOOD`/`ACCESSORY`), `petType` (`DOG`/`CAT`), `page` (from 1), `limit` (1-50, default 20). Response: `{ items, page, limit, total }`; a page past the end is an empty `items` with the real `total` |
| `GET /api/v1/admin/products/:productId` | One product, hidden or shown |
| `POST /api/v1/admin/products` | Creates a product. Body: `name` (1-200), `category`, `petType`, `sellingPrice`, `description` (optional, at most 4000). Answers `201`. The code `SP-0001`..`SP-9999` is given by the system in the same transaction as the insert and never changes; the product is saved **Hidden** with stock 0 |
| `PATCH /api/v1/admin/products/:productId` | Edits the sent fields only: `name`, `category`, `petType`, `sellingPrice`, `description`, `visible`. Body must carry `version` and at least one change. The code and the stock cannot be sent (422) |

`sellingPrice` is a whole number of VND above 0 and at most 100,000,000, sent as a number or as text (`250000` or `250.000`). Anything else is `422 VALIDATION_FAILED` with `error.fields.sellingPrice = "WHOLE_NUMBER"` (MSG113); above the limit it is `"TOO_LARGE"`, which is not MSG113. A missing name, category or pet type is `error.fields.<field> = "REQUIRED"` (MSG01); `TOO_LONG` and `INVALID` are the other reasons. Every wrong field is reported in one answer.

The Admin product has no stock fields. `version` there is `detailsVersion`, the version of the details (name, price, description, visibility), which is separate from the product's stock `version` because every order or return moves the stock version; products created before it existed count as 0. Editing a product changes neither stock nor orders already placed (AC-10, AC-12): an order keeps the code, name and price it was placed with.

New errors: `VERSION_CONFLICT` (409, none in R3) and `PRODUCT_CODES_EXHAUSTED` (409, none in R3, after `SP-9999`).

### Paged lists

Admin products additionally return `summary: { total, visible, hidden, outOfStock }`
for all non-deleted products, independently of search/page filters. Out of stock
means `stockOnHand - quantityHeld <= 0`.

### Product deletion

`DELETE /api/v1/admin/products/:productId` takes `{ version, reason }`, with Admin
session/CSRF. Reason must contain 20–1,000 trimmed NFC characters without control
characters. Any order history (all statuses), on-hand stock or held quantity
blocks deletion with `409 PRODUCT_DELETE_BLOCKED` and `hasOrders` / `hasStock`.
Hiding through the existing PATCH remains available. Successful deletion returns
`{ id, deleted: true }`, retains the code and actor/reason/time audit in MongoDB,
and excludes the product from active lists, edits, photo reads/writes and shopping.
It never removes order/supplier references or image blobs. This user-approved
extension supersedes the original hide-only scope; see
[verification and rules](../testing/product-management-lifecycle-2026-11-05.md).

`page` and `limit` are parsed by `validators/pagination.validator.js` and read by `services/pagination.service.js` (`PAGE_LIMITS` in `constants/pagination.js`: 20 by default, 50 at most, D-216). Supplier Management uses it, and Stock List is meant to. The frontend `Pagination` component shows "Hiển thị a–b trên N" with Trước/Sau.

### Product photos

Admin can upload JPEG/PNG/WebP (5 MiB and 4 million pixels at most), replace or
remove photos. Save a new product first. A gallery holds at most five photos;
the first is the cover. All mutations require the usual Admin session/CSRF plus
`X-Product-Version` matching the Admin DTO's `version`.

| Method and path | Purpose |
| --- | --- |
| `POST /api/v1/admin/products/:productId/photos` | Append one image; raw image body with its MIME `Content-Type` |
| `PUT /api/v1/admin/products/:productId/photos/:photoIndex` | Replace one zero-based gallery slot; raw image body |
| `DELETE /api/v1/admin/products/:productId/photos/:photoIndex` | Remove one slot after UI confirmation |
| `GET /api/v1/admin/products/:productId/photos/:digest` | Read a stored photo, including hidden products; Admin only |
| `GET /api/v1/products/:productId/photos/:digest` | Public image bytes only while the product is shown and still references that image |

Writes return the updated Admin product. `409 VERSION_CONFLICT` means reload;
after a lost/uncertain response the UI requires reload before another mutation.
Do not blindly repeat an append with a new version. Invalid bytes, MIME mismatch,
animation, oversized dimensions and duplicate photos are refused. Oversized bodies
return 413. Mutation rate and in-flight parsing/decoding are bounded.

Backend normalizes to metadata-free WebP, at most 1600 px per side/1 MiB stored.
Binary data, hash, dimensions and uploader are stored in MongoDB `productphotos`;
`products.photos` stores same-origin URLs. Upload/reference/version changes and
removal of unused product-owned blobs are transactional. Price, stock, holds,
visibility and placed-order snapshots are untouched. No caller-provided URL,
filesystem path or remote image download is accepted. Static catalog photos stay
on disk when detached. Image readers use `no-store` and `nosniff`; hiding a product
also closes its public image URLs. Product backups include these MongoDB images;
no writable release directory, new provider gate or environment variable is needed.

## Supplier Management (Admin)

Who may manage suppliers is `MANAGE_SUPPLIERS` in `backend/src/constants/product-permissions.js` (today Admin only). Mounted at `/api/v1/admin/suppliers`, behind the same `PRODUCT_SALES_ENABLED` flag. A Customer, Staff, Sitter or anonymous caller gets 403 or 401. Writes need the session CSRF token and take no `Idempotency-Key`: every change matches the `version` the Admin saw, so a second save of the same screen is `409 VERSION_CONFLICT` instead of applying twice. A supplier is never deleted, only stopped.

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/admin/suppliers` | Suppliers by name in Vietnamese letter order (D, then Đ, then E; a, ă, â; MongoDB collation `vi`), then by id. Query: `status` (`ACTIVE` = Đang hợp tác, `STOPPED` = Ngừng hợp tác, `ALL`; default `ALL`), `page`, `limit` (1-50, default 20). Response: `{ items, page, limit, total, counts }`, `counts` holding the size of every tab (`ACTIVE`, `STOPPED`, `ALL`). An item is `{ id, name, contactName, phone, email, status, productCount, version, updatedAt }` |
| `GET /api/v1/admin/suppliers/:supplierId` | One supplier, plus `products`: `{ id, code, name, visible }` of every product it supplies (hidden ones too), in the order the Admin put them |
| `POST /api/v1/admin/suppliers` | Adds a supplier (201, always `ACTIVE`). Body: `name`, `contactName`, `phone`, `email`, `productIds`; only `name` and a phone or an email are needed |
| `PATCH /api/v1/admin/suppliers/:supplierId` | Edits the sent fields only. Body must carry `version` and at least one change. A stopped supplier can be edited too |
| `POST .../:supplierId/stop` | `ACTIVE` to `STOPPED`. Body `{ version }` |
| `POST .../:supplierId/resume` | `STOPPED` to `ACTIVE`. Body `{ version }` |

Rules (R3 AC-30). Every wrong field is reported in one `422 VALIDATION_FAILED` answer, as `error.fields.<field> = <reason>`:

| Field | Rule | Reason, R3 message |
| --- | --- | --- |
| `name` | needed, at most 200 characters; spaces trimmed and collapsed | `REQUIRED` (MSG01), `TOO_LONG`, `INVALID` |
| `name` | not used by another supplier, **stopped ones included**: `409 SUPPLIER_NAME_TAKEN` (MSG116) | see below |
| `phone` | ten digits starting with 0; spaces, dots and hyphens are dropped and the ten digits are saved. `+84` forms, eleven-digit landline numbers and anything else are refused | `INVALID` (MSG03) |
| `email` | a valid address of at most 254 characters | `INVALID` (MSG02) |
| `phone` and `email` | at least one of them. Judged on what would be saved, so an edit may clear one but not both | `CONTACT_REQUIRED` on both fields (MSG125); not reported when the phone or email given was itself wrong |
| `contactName` | optional, at most 100 characters | `TOO_LONG` |
| `productIds` | at most 200 products, repeats saved once; every one must be in the catalog, hidden or not: `422 PRODUCT_NOT_FOUND` with `productIds` of the missing ones | `TOO_MANY`, `INVALID` |

Two names are the same when they match after the **name key** (`utils/supplier-name.js`): spaces trimmed and collapsed, one letter case, and the tone mark in `oa`, `oe`, `uy` written in one place (`Hoà` = `Hòa`, `Hoè` = `Hòe`, `Thuỷ` = `Thủy`). Letters and diacritics otherwise count, so `Mai` and `Mãi` are different names. The key is saved with the supplier under a unique index, so two Admins saving the same name at once cannot both succeed. A supplier keeps its name after it stops.

Stopping and resuming only change `status` and `version`; the supplier, its products and its history stay. A step that does not fit the state (stopping a stopped supplier, resuming an active one) is `409 SUPPLIER_STATE_CONFLICT` with the current `status`.

The products of a supplier are a record only. **Nothing limits a goods receipt to them**: R3 does not say so, and the Goods Receipt screen must not add that rule. That screen will take only suppliers that are `ACTIVE` when a new receipt is made (AC-30, AC-31); receipts already made are not touched by stopping a supplier.

New errors (none has an R3 message except MSG116): `SUPPLIER_NAME_TAKEN` (409, MSG116), `SUPPLIER_STATE_CONFLICT` (409), `PRODUCT_NOT_FOUND` (422), and `VERSION_CONFLICT` (409) as for products.

## Stock rule (GBR-35)

The public `GET /api/v1/products` accepts `page` (starting at 1) and `limit`
(default 20, maximum 50), returning `{ items, page, limit, total }`. Filters remain
applied across pages. Cart additions validate the accumulated quantity against
the 99-per-line ceiling and serialize read/update in a retryable transaction.
Concurrent order retries with one key return the committed winner even when that
winner already emptied the cart. The frontend discards mutation responses from
an invalidated/different session.

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

## Product order pagination and notifications (2026-11-05)

Customer and Admin order lists accept page (default 1) and limit (default 20, max 50), returning items/page/limit/total. Owner/role/search/tab filters apply before paging. Admin status counts remain global. Product placement and status/payment transitions write IN_APP notifications transactionally, deduplicated by order/version/recipient. Customer links select the owned order; active Admins receive new-order alerts. No SMS/email is enabled. See [Figma pagination and shopping verification](../testing/figma-pagination-shopping-2026-11-05.md).
