# Common components

This folder contains reusable application components that are not part of the P04 design-system controls.

`AddressSearch.jsx` renders configured Google/Vietmap address search and selection with stale-response
protection. It calls the supplied API adapter, does not save/confirm addresses and leaves the
existing manual coordinate form available when the provider is disabled. External Google
navigation links are constructed by `utils/maps.js`, never from provider-controlled URLs.

`VisitTravel.jsx` renders scoped foreground location sharing and manual travel/arrival status.
GPS starts on explicit employee action and stops on panel cleanup. Customer and employee
pages share the component and `services/visit-travel-api.js`. Travel cannot complete care/payment.

## AvatarMenu

AvatarMenu.jsx renders the authenticated user's account trigger and role-aware account options. It derives initials from the real session display name and does not invent an avatar image or identity.

The menu opens on mouse/pen hover and keyboard focus. Its click trigger pins or unpins the menu; touch uses the same click toggle. Leaving the trigger and panel closes an unpinned menu. Escape, outside pointer input, and route changes close it; Escape returns focus to the trigger. The trigger and panel share a pointer boundary, including a transparent bridge so the panel has no hover gap.

The consumer passes the user, the current shell role, and the session's onLogout callback. Until P08 supplies that callback, logout remains visibly disabled and marked pending. A notifications destination is optional; no fake notification count or route is supplied. The menu links to the existing /account route and deliberately has no change-password action.

This component is presentation and navigation only. Server-side authorization remains authoritative.
