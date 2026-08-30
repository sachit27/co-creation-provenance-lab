import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // The public GitHub Pages build contains no shared provider keys.
  // Development-only environment keys support local testing.
  const isProduction = mode === 'production';
  const clientApiKey = isProduction ? '' : (env.GEMINI_API_KEY || '');
  const groqKey = isProduction ? '' : (env.GROQ_API_KEY || '');

  return {
    // GitHub Pages hosts the application below the academic site's /apps path.
    // Root deployments retain the default `/` base.
    base: env.VITE_BASE_PATH || '/',
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        // Proxy Ollama API through Vite so the browser avoids cross-origin blocks.
        // Requests to /api/ollama/... are forwarded to http://localhost:11434/...
        '/api/ollama': {
          target: 'http://localhost:11434',
          rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
          changeOrigin: true,
        },
        // Proxy for PublicAI / Apertus.
        // Browsers cannot set User-Agent on fetch() — it's a forbidden header.
        // Routing through Vite lets Node.js add it server-side.
        '/api/apertus': {
          target: 'https://api.publicai.co',
          rewrite: (path) => path.replace(/^\/api\/apertus/, '/v1'),
          changeOrigin: true,
          headers: {
            'User-Agent': 'co-creation-provenance-tool/1.0',
          },
        },
      },
    },
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.API_KEY': JSON.stringify(clientApiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(clientApiKey),
      'process.env.GROQ_API_KEY': JSON.stringify(groqKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      rollupOptions: {
        output: {
          // Keep the application entry small and cache slow-changing runtimes
          // independently.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            if (id.includes('@google/genai')) {
              return 'google-ai';
            }
            if (
              id.includes('react-force-graph') ||
              id.includes('/force-graph/') ||
              id.includes('/d3-force-3d/') ||
              id.includes('/kapsule/')
            ) {
              return 'force-graph';
            }
            if (
              id.includes('/recharts/') ||
              id.includes('/victory-vendor/') ||
              /\/node_modules\/d3-[^/]+\//.test(id)
            ) {
              return 'charts';
            }
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'react-vendor';
            }
            return undefined;
          },
        },
      },
    },
  };
});
