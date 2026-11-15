import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const devFixtures = fileURLToPath(new URL('./.dev-fixtures/', import.meta.url));

/**
 * Dev server only: serves apps/mobile/.dev-fixtures/<file> at /__fixtures/<file>, so the app can open a test clip
 * and ride with ?demo (no file picker needed when testing in the browser). Never part of the build.
 */
function devFixturesPlugin(): Plugin {
  return {
    name: 'telemesync-dev-fixtures',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__fixtures/', (req, res, next) => {
        const file = join(devFixtures, basename(decodeURIComponent((req.url ?? '').split('?')[0])));
        if (!existsSync(file)) return next();
        res.setHeader('Content-Length', String(statSync(file).size));
        res.setHeader('Content-Type', file.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devFixturesPlugin()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  // host: reachable from a phone on the same Wi-Fi (http://<pc-ip>:5175) for quick tests
  server: { port: 5175, host: true },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 3000 },
});
