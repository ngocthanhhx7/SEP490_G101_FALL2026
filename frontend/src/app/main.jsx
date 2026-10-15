import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.jsx';
import { apiSessionAdapter } from '../services/session-adapter.js';
import { loadPublicPolicies } from '../services/public-policy-api.js';
import '../styles/index.css';
import './foundation.css';
import '../pages/public/public-pages.css';
import '../pages/admin/admin-users.css';

createRoot(document.getElementById('root')).render(
  <StrictMode><BrowserRouter><App sessionAdapter={apiSessionAdapter} loadPublicPolicies={loadPublicPolicies} /></BrowserRouter></StrictMode>,
);
