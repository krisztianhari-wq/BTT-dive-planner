import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';

const isTauri = '__TAURI_INTERNALS__' in window;
if (location.protocol !== 'file:' && !isTauri) registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
