import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxyTarget = process.env.VITE_API_URL || 'http://backend:8000';
console.log('🔧 Vite proxy target:', proxyTarget);
console.log('🔧 VITE_API_URL env:', process.env.VITE_API_URL);

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: ['32496b8ijgqkk.tail349c6b.ts.net'],
    proxy: {
      '/auth/callback': {
        target: 'http://external-apis:8003',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/auth\/callback/, '/schwab/oauth/callback'),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('🔄 OAuth callback proxying:', req.method, req.url, '→', options.target + req.url);
          });
        }
      },
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('🔄 Proxying:', req.method, req.url, '→', options.target);
          });
          proxy.on('error', (err, req, res) => {
            console.error('❌ Proxy error:', err.message, 'for', req.url);
          });
        }
      }
    }
  },
  build: {
    outDir: 'dist',
  },
})
