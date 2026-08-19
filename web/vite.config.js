import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});


# Description: Implement React.lazy and Suspense for dashboard views (AnalyticsDashboard, AdminAdvancedDashboard, DataLakeView) and configure Vite manualChunks.
# NOTE: Automated placeholder – replace with actual code change.
