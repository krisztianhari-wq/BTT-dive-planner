import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Portable single-file build: everything (JS, CSS, logo) inlined into one index.html
 * that opens directly from disk (file://). No service worker / PWA in this variant.
 */
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({ disable: true }),
    viteSingleFile({ removeViteModuleLoader: true }),
  ],
  build: {
    outDir: 'dist-single',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
} as any);
