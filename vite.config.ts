import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: false
      },
      plugins: [
        react(), 
        tailwindcss(),
        VitePWA({
          registerType: 'prompt',
          includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
          manifest: {
            name: "Plajah",
            short_name: "Plajah",
            theme_color: "#020202",
            background_color: "#020202",
            display: "standalone",
            orientation: "portrait",
            start_url: "/",
            icons: [
              {
                src: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Circle-icons-dev.svg/192px-Circle-icons-dev.svg.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any maskable"
              },
              {
                src: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Circle-icons-dev.svg/512px-Circle-icons-dev.svg.png",
                sizes: "512x512",
                type: "image/png"
              }
            ]
          },
          workbox: {
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            cleanupOutdatedCaches: true,
            navigateFallback: null,
            runtimeCaching: [
              {
                // HTML documents: always hit network first. Falls back to cache only when offline.
                // Combined with no-cache HTTP headers this guarantees users see new deploys.
                urlPattern: ({ request }: { request: Request }) => request.destination === 'document',
                handler: 'NetworkFirst' as const,
                options: {
                  cacheName: 'plajah-html',
                  networkTimeoutSeconds: 4,
                  expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 }
                }
              },
              {
                // Hashed JS/CSS: content hash changes on every deploy so CacheFirst is safe.
                // Server also sends immutable headers for these.
                urlPattern: ({ request, url }: { request: Request; url: URL }) =>
                  (request.destination === 'script' || request.destination === 'style') &&
                  url.pathname.startsWith('/assets/'),
                handler: 'CacheFirst' as const,
                options: {
                  cacheName: 'plajah-assets',
                  expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 }
                }
              },
              {
                urlPattern: ({ url }: { url: URL }) =>
                  url.origin === 'https://fonts.googleapis.com' ||
                  url.origin === 'https://fonts.gstatic.com',
                handler: 'CacheFirst' as const,
                options: { cacheName: 'plajah-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } }
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
