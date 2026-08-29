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

export default defineConfig({
  plugins: [react(), tailwindcss(), httpsRedirect()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // Production mode (08-27): the public site serves the BUILT dist via
  // `vite preview` on the same port the tunnel points at — never raw /src/
  // from the dev server. Mirror the /api + /uploads proxy so the built
  // client can still reach the FastAPI backend on :8000.
  preview: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});



