// Buy Me a Coffee webhook receiver for the landing page. Runs inside the site container, behind nginx:
// Buy Me a Coffee → POST https://<site>/api/bmc-webhook → 127.0.0.1:8081.
// Every request is checked against the webhook's signing secret (BMC_WEBHOOK_SECRET). donation.created
// adds a supporter, donation.refunded removes it. Only the public name ("" when the supporter hid it),
// the number of coffees and the date are kept: no e-mails, notes or amounts.
//
// Files:
//   $BMC_DATA_DIR/supporters.json   received supporters; keep this folder on a persistent volume,
//                                   or the list starts empty again after every redeploy
//   <site>/data/supporters-manual.json   supporters added by hand (e.g. from before the webhook existed);
//                                   these may also carry a link (https) and a short message, with consent
//   <site>/data/supporters.json     public list read by the page (manual + received, newest first)
//   <site>/data/supporters-status.json   last event and any error, to check the setup from outside
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

const SECRET = process.env.BMC_WEBHOOK_SECRET?.trim() ?? '';
const PORT = Number(process.env.BMC_WEBHOOK_PORT ?? 8081);
const DATA_DIR = process.env.BMC_DATA_DIR ?? '/var/lib/telemesync';
const SITE_DATA = process.env.SITE_DATA_DIR ?? '/usr/share/nginx/html/data';
const STORE = join(DATA_DIR, 'supporters.json');
const PUBLIC = join(SITE_DATA, 'supporters.json');
const MANUAL = join(SITE_DATA, 'supporters-manual.json');
const STATUS = join(SITE_DATA, 'supporters-status.json');
const MAX_BODY = 64 * 1024;
const MAX_PUBLIC = 20;
const MAX_STORED = 500;

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Writes through a temporary file, so the page never reads a half-written list. */
async function writeJson(path, value) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, path);
}

async function setStatus(status) {
  try {
    await writeJson(STATUS, { checkedAt: new Date().toISOString(), ...status });
  } catch (e) {
    console.error('bmc-webhook: cannot write the status file:', e.message);
  }
}

/** Name the supporter chose to show; "" when hidden (the page then shows "Alguém"). */
export function publicName(d) {
  if (d.supporter_name_type && d.supporter_name_type !== 'default') return '';
  const name = String(d.supporter_name ?? '').trim();
  if (!name || /@/.test(name) || /^someone$/i.test(name)) return '';
  return name.slice(0, 40);
}

export function verifySignature(raw, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'));
  const given = Buffer.from(signature.trim().toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function loadStore() {
  const s = await readJson(STORE, { supporters: [] });
  return Array.isArray(s.supporters) ? s.supporters : [];
}

const day = (date) => String(date ?? '').slice(0, 10);

/** Public list: manual entries + received ones, newest first. */
async function publish(stored) {
  const manualFile = await readJson(MANUAL, { supporters: [] });
  const manual = (Array.isArray(manualFile.supporters) ? manualFile.supporters : []).map((s) => {
    const entry = { name: String(s.name ?? '').slice(0, 40), coffees: Number(s.coffees) || 1, date: s.date ?? null };
    if (typeof s.url === 'string' && /^https:\/\/[^\s"<>]{1,200}$/.test(s.url)) entry.url = s.url;
    if (typeof s.message === 'string' && s.message.trim()) entry.message = s.message.trim().slice(0, 160);
    return entry;
  });
  // A support added by hand and also delivered by the webhook (same name, same day) is listed once.
  const received = stored
    .filter((s) => !manual.some((m) => m.name && m.name === s.name && day(m.date) === day(s.date)))
    .map((s) => ({ name: String(s.name ?? '').slice(0, 40), coffees: Number(s.coffees) || 1, date: s.date ?? null }));
  const all = [...manual, ...received]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, MAX_PUBLIC);
  await writeJson(PUBLIC, { updatedAt: new Date().toISOString(), supporters: all });
  return all.length;
}

/** Applies one verified event; returns a short description for the status file. */
async function apply(event) {
  const d = event.data ?? {};
  let stored = await loadStore();
  if (event.type === 'donation.created' && d.refunded !== 'true' && d.status !== 'refunded') {
    const entry = {
      id: d.id ?? event.event_id,
      name: publicName(d),
      coffees: Number(d.coffee_count) || 1,
      date: new Date((Number(d.created_at) || event.created || Date.now() / 1000) * 1000).toISOString(),
    };
    stored = [entry, ...stored.filter((s) => s.id !== entry.id)].slice(0, MAX_STORED);
  } else if (event.type === 'donation.refunded') {
    stored = stored.filter((s) => s.id !== d.id);
  } else {
    return `evento ${event.type} ignorado`;
  }
  await mkdir(DATA_DIR, { recursive: true });
  await writeJson(STORE, { supporters: stored });
  const count = await publish(stored);
  return `${event.type} recebido · ${count} apoiantes na lista`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('pedido demasiado grande'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Events are applied one at a time, so two deliveries never overwrite each other.
let queue = Promise.resolve();

export function createReceiver() {
  return createServer(async (req, res) => {
    const reply = (status, text) => {
      res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(text);
    };
    if (req.method !== 'POST' || !req.url?.startsWith('/api/bmc-webhook')) return reply(404, 'not found');
    let raw;
    try {
      raw = await readBody(req);
    } catch (e) {
      return reply(e.status ?? 400, e.message);
    }
    if (!SECRET) {
      await setStatus({ ok: false, message: 'BMC_WEBHOOK_SECRET em falta: copie o Signing Secret do webhook para o Coolify' });
      return reply(503, 'not configured');
    }
    if (!verifySignature(raw, req.headers['x-signature-sha256'], SECRET)) {
      await setStatus({ ok: false, message: 'assinatura inválida: confirme que o BMC_WEBHOOK_SECRET é o Signing Secret deste webhook' });
      return reply(401, 'invalid signature');
    }
    let event;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return reply(400, 'invalid json');
    }
    if (event.live_mode === false) {
      await setStatus({ ok: true, message: `evento de teste recebido (${event.type}): o webhook está bem configurado` });
      return reply(200, 'test ok');
    }
    const job = queue.then(() => apply(event));
    queue = job.catch(() => {});
    try {
      await setStatus({ ok: true, message: await job });
      reply(200, 'ok');
    } catch (e) {
      await setStatus({ ok: false, message: `erro ao guardar: ${e.message}` });
      reply(500, 'error');
    }
  });
}

async function main() {
  await mkdir(SITE_DATA, { recursive: true });
  try {
    await mkdir(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error(`bmc-webhook: cannot create ${DATA_DIR}:`, e.message);
  }
  const count = await publish(await loadStore());
  await setStatus(
    SECRET
      ? { ok: true, message: `à espera de apoios · ${count} apoiantes na lista` }
      : { ok: false, message: 'BMC_WEBHOOK_SECRET em falta: copie o Signing Secret do webhook para o Coolify' },
  );
  createReceiver().listen(PORT, '127.0.0.1', () => console.log(`bmc-webhook: listening on 127.0.0.1:${PORT}`));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
