import { buildApp } from './app.ts';
import { openPath } from './openPath.ts';

const port = Number(process.env.PORT ?? 5174);
const host = process.env.HOST ?? '127.0.0.1';
const noOpen = process.argv.includes('--no-open') || process.env.TELEMESYNC_NO_OPEN === '1';

const app = await buildApp({ logger: false });
try {
  await app.listen({ port, host });
} catch (e) {
  console.error(`Could not start the server on port ${port}: ${(e as Error).message}`);
  process.exit(1);
}
const url = `http://localhost:${port}`;
console.log(`telemeSYNC running at ${url}  (Ctrl+C to stop)`);
if (!noOpen) openPath(url);
