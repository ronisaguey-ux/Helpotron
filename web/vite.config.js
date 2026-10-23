import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// http→https 308 for the public hostname (audit 08-28): the cloudflared edge
// also serves plain HTTP, and WebKit drops Secure cookies set from HTTP
// pages — a phone landing on http://helpotron.dpdns.org bounced at login.
// configurePreviewServer runs BEFORE vite's internal middlewares (incl. the
// /api proxy + static serving), so the whole app is HTTPS-only for public
// visitors. Local requests without the public Host/XFP pass straight through.
function httpsRedirect() {
  return {
    name: 'https-redirect',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host || '';
        if (host.includes('helpotron.dpdns.org') && req.headers['x-forwarded-proto'] === 'http') {
          res.writeHead(308, { Location: `https://${host}${req.url}` });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

// Security headers for the static app (09-02, independent QA pass): /api
// responses are hardened by SecurityHeadersMiddleware, but the HTML document
// was served bare — no CSP/XFO/HSTS, so the app page could be iframed
// (clickjacking) and skipped HSTS. Same middleware slot as httpsRedirect:
// preview-server only; /api + /uploads pass through untouched (uvicorn owns
// those headers). Assets carry dots; SPA routes are extensionless.
function appSecurityHeaders() {
  return {
    name: 'app-security-headers',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '/').split('?')[0];
        if (path.startsWith('/api/') || path.startsWith('/uploads/')) return next();
        const isHtml = !/\.[a-z0-9]+$/i.test(path);
        if (isHtml) {
          res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
              "font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; " +
              "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; " +
              "frame-ancestors 'none'; form-action 'self'",
          );
          res.setHeader('X-Frame-Options', 'DENY');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
          res.setHeader(
            'Permissions-Policy',
            'camera=(), microphone=(), geolocation=()',
          );
        }
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), httpsRedirect(), appSecurityHeaders()],
  // Visible build stamp (09-01, Logan loop): the user-facing menu shows the
  // build timestamp, so "which build is the device on?" is a one-look check
  // instead of guessing from behavior.
  define: {
    // Local-time stamp so the menu reads like wall clock on the device
    // (toISOString is UTC — a 9 PM build showed as 01:00+ "tomorrow").
    __BUILD_ID__: JSON.stringify(
      new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19),
    ),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@hanken-latin.woff2': fileURLToPath(
        new URL('./node_modules/@fontsource-variable/hanken-grotes' + 'k/files/hanken-grotes' + 'k-latin-wght-normal.woff2', import.meta.url),
      ),
      '@hanken-latin-ext.woff2': fileURLToPath(
        new URL('./node_modules/@fontsource-variable/hanken-grotes' + 'k/files/hanken-grotes' + 'k-latin-ext-wght-normal.woff2', import.meta.url),
      ),
    },
  },
  // Chunk-splitting (08-28): the single monolithic index chunk (~1.04 MB)
  // is split by vendor family so browsers cache/parallelize per-library
  // updates and later route-level lazy() only reloads the app shell.
  // Pure rollupOptions.output — no plugins, works with plain `vite build`.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Editor + markdown families are declared in package.json but not
          // yet imported in src; reserving chunks now means a future
          // lazy-loaded editor/rich-view never ships in the entry chunk.
          if (id.includes('/node_modules/@tiptap/')) return 'editor';
          if (
            id.includes('/node_modules/react-markdown/') ||
            id.includes('/node_modules/rehype-') ||
            id.includes('/node_modules/remark-') ||
            id.includes('/node_modules/katex/')
          ) return 'markdown';
          // react-dom must be matched before react (id path contains "react").
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/') ||
            id.includes('/node_modules/react-is/') ||
            id.includes('/node_modules/object-assign/')
          ) return 'react-vendor';
          // "motion" is aliased to framer-motion 13; the monorepo pulls
          // its own motion-dom / motion-utils packages alongside.
          if (
            id.includes('/node_modules/motion/') ||
            id.includes('/node_modules/motion-dom/') ||
            id.includes('/node_modules/motion-utils/')
          ) return 'motion';
          if (
            id.includes('/node_modules/radix-ui/') ||
            id.includes('/node_modules/@radix-ui/')
          ) return 'radix';
          if (id.includes('/node_modules/lucide-react/')) return 'icons';
          // @visx chart stack + its d3-* dependencies.
          if (
            id.includes('/node_modules/@visx/') ||
            id.includes('/node_modules/d3-')
          ) return 'charts';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
      // Public markdown pages served by the FastAPI public_router (no auth):
      // /privacy-policy and /extension-guide must reach :5000 even when the
      // site itself is static dist served by vite preview.
      '/privacy-policy': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
      '/extension-guide': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // Production mode (08-27): the public site serves the BUILT dist via
  // `vite preview` on the same port the tunnel points at — never raw /src/
  // from the dev server. Mirror the /api + /uploads proxy so the built
  // client can still reach the FastAPI backend on :5000.
  preview: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
      '/privacy-policy': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
      '/extension-guide': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
