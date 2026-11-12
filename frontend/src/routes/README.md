# Route composition

Admin's Cửa hàng group exposes Tồn kho after Nhập hàng. `/admin/stock` composes a
per-account page with the read-only stock transport under the existing Admin guard.
Điều chỉnh tồn kho follows Tồn kho and composes `/admin/stock-adjustments` with
an account-scoped adjustment API using the existing CSRF source and Admin guard.

Route manifests and role/session guards belong here. `PublicPolicyRoutes.jsx` exports the public policy route fragment; pages export presentation components. `AppRoutes.jsx` keys the private layout by account ID so a same-role account switch resets child state. Do not move HTTP transport or domain calculations into route components.

Operational menu entries include explicit group labels, independent of Customer's
account menu. Admin keeps the Admin navigation when opening authorized Staff
dispatch/profile-review routes. This shell choice does not grant server permissions.

Booking and Customer account routes require the single CUSTOMER role.
Operational accounts enter their own workspace; malformed multi-role sessions
fail closed. Login return paths are validated by utils/role-access.js. Operational
sessions opening the public storefront return to their workspace; anonymous
visitors retain public browsing and must sign in before booking.

The shop catalog (`/products`, `/products/:productId`) is public inside the public layout. Cart, checkout and product orders (`/customer/cart`, `/customer/product-checkout`, `/customer/product-orders`) require a Customer. `ProductCartProvider` (in `contexts/`) loads the signed-in Customer's cart for the header badge; guests and operational roles never load it. `loginDestination` lets a Customer return to `/products/:id` after signing in.

`/admin/counter-sale` nằm trong Admin guard, menu Bán tại quầy ngay sau Đơn hàng sản phẩm trong nhóm Bán hàng. Wrapper key theo account, ghép transport bằng CSRF session hiện có; không cấp quyền Staff/Customer qua shell.

Customer navigation exposes product history under Mua sắm. `/customer/product-orders` stays Customer-protected and uses the account workspace, preserving checkout and notification deep links.

`/account/bookings/:bookingId` is Customer-only, uses the account workspace and keeps the service-order navigation active. It loads the owner-checked checkout read API by route ID; the legacy checkout confirmation query remains compatible.

Admin and Sale Staff share the order management route at `/admin/product-orders`.
Sale Staff uses its own menu and lands on this route after sign-in.
`/staff/bookings/:bookingId` uses the existing Staff/Admin account workspace and opens read-only booking details.

Admin and Sale Staff also share `/admin/counter-sale`, `/admin/goods-receipts` and `/admin/stock`; product/supplier management and stock adjustments remain Admin-only.
