# Layouts

FoundationLayout.jsx owns the public foundation page landmarks and route focus. RoleDashboardLayout.jsx supplies shared dashboard chrome for Customer, Pet Sitter, Staff, and Admin routes.

The role layouts read the existing session context, fail closed for a missing role, and render explicit loading, pending, error, and forbidden states. They do not authenticate a user or grant API access. Admin may use the Staff UX shell where a Staff route allows Admin, matching RequireSession.

P34 owns root/router registration. Consumers should pass real navigationItems ({ key?, label, to, end? }) and a notifications route only after those destinations exist. The layout shows an honest empty state until routes are provided instead of rendering dead links. P08 owns session/logout integration; the avatar logout action stays pending until the session exposes its real logout callback.

Both layouts use the P04 brand logo, fonts, tokens, and Notice component. No shared P04 token/component files are changed here.

Operational roles now use one compact workspace shell with a mobile drawer.
Customer routes use PublicHeader/PublicFooter and horizontal account navigation.
The common account/notifications route selects the highest authorized shell.
