import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { WebAppStatus } from '../components/common/WebAppStatus.jsx';
import { captureWebAppInstall } from '../hooks/useWebAppInstall.js';
import { App } from './App.jsx';
import { apiSessionAdapter } from '../services/session-adapter.js';
import { loadPublicPolicies } from '../services/public-policy-api.js';
import '../styles/index.css';
import './foundation.css';
import '../styles/public-pages.css';

captureWebAppInstall();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WebAppStatus enableWorker={import.meta.env.PROD} />
    <BrowserRouter>
      <App
        sessionAdapter={apiSessionAdapter}
        loadPublicPolicies={loadPublicPolicies}
      />
    </BrowserRouter>
  </StrictMode>
);
