# Frontend

React application for PawWorld, built with Vite. The current public authentication page supports Customer registration and OTP login, with responsive layouts based on the visual assets in `public/assets/` and fonts in `public/fonts/`.

## Run locally

```powershell
cd frontend
npm install
npm run dev
```

Vite proxies `/api` requests to `http://localhost:3000`, so run the backend separately when testing registration and login. An optional `VITE_API_BASE_URL` can be set in a local `.env` when the API is hosted elsewhere. Frontend environment variables are bundled into browser code; never put credentials or server secrets there.

## Available scripts

- `npm run dev` starts the Vite development server.
- `npm run build` creates the production bundle in `dist/`.
- `npm run preview` serves the production bundle locally.

## Structure

| Path | Responsibility |
| --- | --- |
| `src/App.jsx` | Public shell and registration/login OTP screens |
| `src/services/` | HTTP calls to the backend auth API |
| `src/styles.css` | Shared page styles and responsive layouts |
| `public/assets/` | PawWorld logo and pet imagery served as static assets |
| `public/fonts/` | Local Nunito typeface |
