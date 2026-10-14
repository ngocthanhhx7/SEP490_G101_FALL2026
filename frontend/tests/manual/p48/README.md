# P48 manual preview

Run from frontend:

    npm run dev -- --config tests/manual/p48/vite.config.js --host 127.0.0.1 --port 5174 --strictPort

This isolated Vite root renders the Customer role shell with a synthetic in-memory session. It is for visual and interaction review only; it is not a production route, does not call the API, and does not demonstrate authentication, notification, or logout integration.

Append ?menu=open to the local URL to inspect the avatar panel in a screenshot.
