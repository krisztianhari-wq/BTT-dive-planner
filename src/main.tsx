import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/figtree/800.css';
import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';

// Refuse to run inside a frame (clickjacking); GitHub Pages cannot send a frame-ancestors header.
if (window.top !== window.self) { document.body.textContent = 'BTT Dive Planner cannot run inside a frame.'; throw new Error('framed'); }

const isTauri = '__TAURI_INTERNALS__' in window;
if (location.protocol !== 'file:' && !isTauri) registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
