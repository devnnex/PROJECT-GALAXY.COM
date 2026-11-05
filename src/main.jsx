import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startPwaUpdates } from './services/pwa-updates';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import './styles.css';
import './crop.css';
import './meeting-live.css';
import './calendar.css';
import './profit-calendar.css';
import './profit-review.css';
import './membership.css';
import './registration.css';
import './galaxy-store.css';
import './community-tools.css';
import './browser-compat.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  startPwaUpdates({ baseUrl: import.meta.env.BASE_URL, buildId: __GALAXY_BUILD_ID__ });
}
