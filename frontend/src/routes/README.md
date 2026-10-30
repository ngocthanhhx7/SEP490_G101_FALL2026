# Route composition

Route manifests and role/session guards belong here. `PublicPolicyRoutes.jsx` exports the public policy route fragment; pages export presentation components. `AppRoutes.jsx` keys the private layout by account ID so a same-role account switch resets child state. Do not move HTTP transport or domain calculations into route components.

Operational menu entries include explicit group labels, independent of Customer's
account menu. Admin keeps the Admin navigation when opening authorized Staff
dispatch/profile-review routes. This shell choice does not grant server permissions.

Booking and Customer account routes require Customer without an operational role.
Accounts retaining Customer membership after promotion enter their operational
workspace. Login return paths are validated by utils/role-access.js. Operational
sessions opening the public storefront return to their workspace; anonymous
visitors retain public browsing and must sign in before booking.
