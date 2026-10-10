import { defineConfig } from 'vite';

const port = parseInt(process.env.PORT || '7789', 10);
const host = '127.0.0.1';

export default defineConfig({
  root: '.',
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'styles.css';
          }
          return 'assets/[name][extname]';
        }
      }
    }
  },
  server: {
    port,
    host,
    strictPort: true
  },
  plugins: [
    {
      name: 'agy-game-studio-sidecar-preload',
      transformIndexHtml(html) {
        return html
          .replace(/\s+crossorigin(?:="[^"]*")?/g, '')
          .replace(/<script\s+type="module"\s+src="\/app\.js"><\/script>\s*/g, '')
          .replace(
            '<link rel="stylesheet" href="/styles.css">',
            '<link rel="stylesheet" href="/styles.css">\n  <!-- Bridge to Antigravity: applies the host theme and defines window.sidecar. -->\n  <script src="/preload.js"></script>'
          )
          .replace('</body>', '  <script src="/app.js"></script>\n</body>');
      },
      async configureServer(server) {
        process.env.VITE_DEV_MODE = '1';
        const { handleRequest } = await import('./server/index.mjs');
        server.middlewares.use(async (req, res, next) => {
          if (req.url && (req.url.startsWith('/api/') || req.url.startsWith('/_sidecar/'))) {
            await handleRequest(req, res);
            return;
          }
          next();
        });
      }
    }
  ]
});
