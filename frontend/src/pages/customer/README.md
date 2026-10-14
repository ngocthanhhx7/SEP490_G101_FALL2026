# Customer pages

This folder contains Customer owned profile and service address screens. Each page uses the shared P04 controls and a domain adapter from `src/services`; API ownership and role authorization remain server responsibilities.

P14 adds `CustomerProfilePage` for the Customer's display name and masked verified contact channels. Route registration is owned by P34, so adding a page here does not make it reachable until the integrator mounts it.
