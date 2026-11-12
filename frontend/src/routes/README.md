# Route composition

Admin's Cửa hàng group exposes Tồn kho after Nhập hàng. `/admin/stock` composes a
per-account page with the read-only stock transport under the existing Admin guard.

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

Customer navigation exposes product history under Mua sắm. `/customer/product-orders` stays Customer-protected and uses the account workspace, preserving checkout and notification deep links.

`/account/bookings/:bookingId` is Customer-only, uses the account workspace and keeps the service-order navigation active. It loads the owner-checked checkout read API by route ID; the legacy checkout confirmation query remains compatible.
