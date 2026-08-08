import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    // ── Inline plugin: inject the GLB preload via Vite’s HTML transform API ────────────
    // A hand-written <link rel="preload"> in the source index.html is silently
    // stripped by Vite’s build because the file isn’t part of Rollup’s asset
    // graph. Injecting via transformIndexHtml is the official, build-safe way.
    // order:’pre’ ensures this runs before Vite’s own HTML processing and
    // before vite-plugin-pwa mutates the <head>.
    {
      name: 'inject-glb-preload',
      transformIndexHtml: {
        order: 'pre',
        handler() {
          /* These four assets total ~1.5MB and are only ever used by the 3D
             scene on the home route. As static <link rel="preload"> tags they
             were fetched on EVERY route — a /store or /admin visit downloaded
             the whole 3D payload at high priority and never used a byte of it.
             (Measured: the store page transferred 2,415KB.)

             index.html is shared by every route in an SPA, so the tags cannot
             be emitted conditionally at build time. A tiny inline script in
             <head> injects them only for the home route; it runs before the
             parser reaches the module scripts, so home keeps its early,
             high-priority fetch. */
          const assets = [
            ['/models/air-jordan-draco.glb', 'fetch'],
            ['/ui/potsdamer_platz_256.exr', 'fetch'],
            ['/basis/basis_transcoder.js', 'script'],
            ['/basis/basis_transcoder.wasm', 'fetch'],
          ];

          return [
            {
              tag: 'script',
              children:
                `if(location.pathname==='/'){` +
                `for(var a of ${JSON.stringify(assets)}){` +
                `var l=document.createElement('link');` +
                `l.rel='preload';l.as=a[1];l.href=a[0];` +
                `if(a[1]==='fetch')l.crossOrigin='';` +
                `document.head.appendChild(l);}}`,
              injectTo: 'head',
            },
          ];
        },
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'pwa-192x192.svg', 'pwa-512x512.svg'],
      manifest: {
        name: 'Air Jordan Drop Site',
        short_name: 'Sneakers',
        description: 'Exclusive limited drops for Air Jordan sneakers.',
        theme_color: '#0A0A0B',
        background_color: '#0A0A0B',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,ico,png,svg}'], // Exclude index.html from precache so it can be handled by NetworkFirst
        runtimeCaching: [
          {
            urlPattern: /.*\.glb$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'glb-models-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }, // 1 year
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
          gsap: ['gsap', '@gsap/react'],
        },
      },
    },
  },
});

