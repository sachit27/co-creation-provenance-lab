import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // In production (Vercel), API keys are handled server-side by /api/* functions.
  // Only inject them client-side in development for local testing.
  const isProduction = mode === 'production';
  const clientApiKey = isProduction ? '' : (env.GEMINI_API_KEY || '');
  const groqKey = isProduction ? '' : (env.GROQ_API_KEY || '');

  return {
    server: {
      port: 3000,
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
    }
  };
});
