import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Base path: '/' locally, '/<repo>/' on GitHub Pages (set by the workflow via VITE_BASE)
const base = process.env.VITE_BASE ?? '/';

// Content Security Policy for the web build (GitHub Pages cannot send headers, so it goes in a <meta> tag).
// No network access: every resource is bundled, PDFs are made in the page. The Tauri apps get their own CSP
// from tauri.conf.json (a meta CSP there would block the IPC), so the tag is left out when Tauri builds.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "connect-src 'self'", "worker-src 'self'", "manifest-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'none'",
].join('; ');
const cspPlugin = {
  name: 'csp-meta',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => process.env.TAURI_ENV_PLATFORM ? html
    : html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`),
};

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base,
  plugins: [
    cspPlugin,
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'BTT Dive Planner',
        short_name: 'BTT Planner',
        description: 'Decompression and gas planner with GUE standard gases (Bühlmann ZH-L16C + gradient factors).',
        lang: 'hu',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f2f2f7',
        theme_color: '#f2f2f7',
        categories: ['utilities', 'sports'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-512-transparent.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: { environment: 'node' },
} as any);
