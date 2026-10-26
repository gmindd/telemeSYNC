// Stand-in for the Android app's bridge (apps/android WebAppBridge.kt) while developing on a computer:
//   node scripts/android-bridge-mock.mjs [output folder]   then open http://localhost:5173/?androidMock=http://127.0.0.1:5175
// The web panel then renders in the browser exactly as in the app and the files land in the output folder.
import { closeSync, mkdirSync, openSync, rmSync, writeSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'android-mock-output');
const files = new Map();
let nextId = 1;

const target = (relPath) => {
  const p = resolve(root, relPath);
  if (!p.startsWith(root)) throw new Error(`Outside the output folder: ${relPath}`);
  return p;
};

const ops = {
  appVersion: () => 'mock',
  defaultOutputDir: () => 'Documents/telemeSYNC',
  createFile(relPath) {
    try {
      const path = target(relPath);
      mkdirSync(dirname(path), { recursive: true });
      const id = nextId++;
      files.set(id, { path, fd: openSync(path, 'w+'), pos: 0 });
      return JSON.stringify({ id });
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  },
  write(id, b64) {
    const f = files.get(id);
    if (!f) return `File ${id} is not open`;
    const buf = Buffer.from(b64, 'base64');
    writeSync(f.fd, buf, 0, buf.length, f.pos);
    f.pos += buf.length;
    return '';
  },
  writeAt(id, offset, b64) {
    const f = files.get(id);
    if (!f) return `File ${id} is not open`;
    const buf = Buffer.from(b64, 'base64');
    writeSync(f.fd, buf, 0, buf.length, offset);
    return '';
  },
  close(id) {
    const f = files.get(id);
    if (!f) return `File ${id} is not open`;
    closeSync(f.fd);
    files.delete(id);
    return '';
  },
  abort(id) {
    const f = files.get(id);
    if (!f) return;
    closeSync(f.fd);
    rmSync(f.path, { force: true });
    files.delete(id);
  },
  writeText(relPath, text) {
    const { id, error } = JSON.parse(ops.createFile(relPath));
    if (error) return error;
    ops.write(id, Buffer.from(text, 'utf8').toString('base64'));
    return ops.close(id);
  },
  openFolder(relPath) {
    console.log('openFolder', join(root, relPath));
    return true;
  },
  keepAwake(on) {
    console.log('keepAwake', on);
  },
};

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.end();
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    try {
      const { op, args } = JSON.parse(body);
      const result = ops[op](...args);
      res.end(JSON.stringify(result ?? null));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify(String(e)));
    }
  });
}).listen(5175, '127.0.0.1', () => console.log(`Android bridge mock on http://127.0.0.1:5175, files in ${root}`));
