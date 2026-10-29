# Route composition

Route manifests and role/session guards belong here. `PublicPolicyRoutes.jsx` exports the public policy route fragment; pages export presentation components. `AppRoutes.jsx` keys the private layout by account ID so a same-role account switch resets child state. Do not move HTTP transport or domain calculations into route components.
