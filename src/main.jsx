import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './crop.css';
import './meeting-live.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`));
}
