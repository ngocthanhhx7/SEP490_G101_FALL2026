# Notification pages

The notification page consumes an injected API adapter and renders server-confirmed notifications for the current session. It owns loading, empty, error, forbidden and pending states and uses Vietnam time for display. Route registration and the real API adapter are integration responsibilities.


The notification centre has an optional device-scoped Web Push control when
supported and configured. It subscribes from a direct user gesture and opens
the same authenticated centre when a lock-screen alert is tapped.
