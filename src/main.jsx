import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from 'app-entry'; // the full site, or the stores-only app (see vite.config.js)
import { storesOnly } from './config/env';
import { takeAuthRedirect } from './lib/authRedirect';

// A confirmation email sends people back with their session after the "#"; move it aside before the router reads it.
if (!storesOnly) takeAuthRedirect();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
