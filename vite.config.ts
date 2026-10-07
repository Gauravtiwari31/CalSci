/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// §10: CSP. Injected only into production builds, because Vite's dev server
// relies on inline scripts (React refresh preamble) that this policy blocks.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' https://api.frankfurter.dev",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
].join('; ');

const cspMeta = (): Plugin => ({
  name: 'calsci-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig(({ mode }) => {
  const native = mode === 'native';
  return {
    define: { __NATIVE__: JSON.stringify(native) },
    worker: { format: 'es' },
    build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
    plugins: [
      react(),
      cspMeta(),
      // §9: service worker for the web build only. Native assets are already local.
      !native &&
        VitePWA({
          registerType: 'autoUpdate',
          injectRegister: false,
          includeAssets: ['icon.svg'],
          manifest: {
            name: 'CalSci : Scientific Calculator',
            short_name: 'CalSci',
            description:
              'Offline scientific calculator with symbolic math, matrices, statistics, units and finance.',
            theme_color: '#1B2B48',
            background_color: '#E8ECEF',
            display: 'standalone',
            orientation: 'any',
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
            globIgnores: ['pyodide/**'],
            maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
            runtimeCaching: [
              {
                // §5.3: Pyodide + wheels are cached on first use, not precached.
                urlPattern: ({ url }) => url.pathname.includes('/pyodide/'),
                handler: 'CacheFirst',
                options: { cacheName: 'pyodide', expiration: { maxEntries: 20 } },
              },
            ],
          },
        }),
    ],
    test: {
      include: ['tests/{unit,property,golden}/**/*.test.ts'],
      environment: 'node',
      testTimeout: 120_000,
    },
  };
});
