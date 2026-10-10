/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'styles.css';
          }
          return 'assets/[name][extname]';
        }
      }
    }
  },
  plugins: [
    {
      name: 'sidecar-classic-html',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          // Remove Vite's default module/crossorigin script and stylesheet tags
          let cleaned = html
            .replace(/<script\b[^>]*\bsrc=["']\/?(?:assets\/)?app\.js["'][^>]*><\/script>\s*/gi, '')
            .replace(/<link\b[^>]*\bhref=["']\/?(?:assets\/)?(?:styles|index)\.css["'][^>]*>\s*/gi, '');

          // Inject /styles.css and /preload.js in <head>
          cleaned = cleaned.replace(
            '<head>',
            '<head>\n  <link rel="stylesheet" href="/styles.css">\n  <script src="/preload.js"></script>'
          );

          // Inject classic /app.js before </body>
          cleaned = cleaned.replace(
            '</body>',
            '  <script src="/app.js"></script>\n</body>'
          );

          return cleaned;
        }
      }
    }
  ]
});
