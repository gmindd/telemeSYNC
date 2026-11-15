// Strava sign-in for the telemeSYNC mobile app. Runs inside the site container, behind nginx
// (/api/strava/* → 127.0.0.1:8082), because exchanging Strava's authorization code needs the API application's
// client secret, which must never ship inside the app.
//
//   1. The app opens https://www.strava.com/oauth/mobile/authorize with
//      redirect_uri = https://<site>/api/strava/callback and state = <mode>.<id>.<challenge>, where challenge is
//      base64url(sha256(verifier)) and the verifier stays on the phone.
//   2. Strava sends the browser to GET /api/strava/callback?code&state&scope. This service exchanges the code,
//      keeps the tokens in memory for two minutes under <id>, and sends the browser back to the app
//      (telemesync://strava?id=<id>; in development http://localhost:5175/?strava=<id>). No token travels in that
//      link, so another app catching it gets nothing.
//   3. The app POSTs /api/strava/claim {id, verifier}: the tokens are handed over once, only when
//      sha256(verifier) matches the challenge.
//   4. Strava's access tokens last six hours: the app POSTs /api/strava/refresh {refresh_token} for a new one.
//
// Environment (in Coolify: Environment Variables): STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET.
// Nothing is written to disk and nothing is logged about athletes: the tokens live on the phone.
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.STRAVA_AUTH_PORT ?? 8082);
const TOKEN_URL = 'https://www.strava.com/oauth/token';
const PENDING_MS = 2 * 60 * 1000;
const MAX_PENDING = 1000;
const MAX_BODY = 4 * 1024;
/** Where the browser goes back to after Strava, by the state's mode. Fixed list: never an address from the request. */
export const RETURN_TO = {
  app: (id) => `telemesync://strava?id=${encodeURIComponent(id)}`,
  dev: (id) => `http://localhost:5175/?strava=${encodeURIComponent(id)}`,
};
/** Origins allowed to call claim/refresh from a WebView or the dev server (the Android app itself uses native HTTP). */
const ORIGINS = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost', 'http://localhost:5175']);
const B64URL = /^[A-Za-z0-9_-]+$/;

export const challengeOf = (verifier) => createHash('sha256').update(verifier).digest('base64url');

/** "<mode>.<id>.<challenge>" → its parts, or null when malformed. */
export function parseState(state) {
  const [mode, id, challenge, ...rest] = String(state ?? '').split('.');
  if (rest.length || !(mode in RETURN_TO)) return null;
  if (!id || id.length < 16 || id.length > 64 || !B64URL.test(id)) return null;
  if (!challenge || challenge.length !== 43 || !B64URL.test(challenge)) return null;
  return { mode, id, challenge };
}

/** What the app keeps: the tokens and the athlete's name (nothing else from Strava's answer). */
export function tokenReply(t) {
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: t.expires_at,
    athlete: t.athlete ? { id: t.athlete.id, firstname: t.athlete.firstname ?? '', lastname: t.athlete.lastname ?? '' } : undefined,
  };
}

/** POSTs to Strava's token endpoint with the client credentials. */
async function stravaToken(params, env) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.clientId, client_secret: env.clientSecret, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw Object.assign(new Error(body.message ?? `Strava ${res.status}`), { status: res.status });
  return body;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Small page that sends the browser back to the app (custom schemes may need a tap, hence the button). */
function backPage(target, ok) {
  const title = ok ? 'Strava ligado' : 'Ligação cancelada';
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>telemeSYNC · ${title}</title><meta http-equiv="refresh" content="0;url=${esc(target)}">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f14;color:#e8edf2;font:16px system-ui,sans-serif;text-align:center}
a{display:inline-block;margin-top:16px;padding:14px 22px;border-radius:999px;background:linear-gradient(90deg,#ffc400,#ff3d00);color:#140a00;font-weight:700;text-decoration:none}</style></head>
<body><main><p>${title}. A voltar ao telemeSYNC…</p><a href="${esc(target)}">Voltar à app</a></main></body></html>`;
}

/**
 * The service's request handler. `exchange` talks to Strava (replaced in tests); `pending` keeps tokens waiting
 * to be claimed.
 */
export function createHandler({ env, exchange = (p) => stravaToken(p, env), now = () => Date.now() }) {
  const pending = new Map();
  const hits = new Map();
  const tooMany = (ip) => {
    const t = now();
    const recent = (hits.get(ip) ?? []).filter((x) => t - x < 10 * 60 * 1000);
    recent.push(t);
    hits.set(ip, recent);
    if (hits.size > 5000) hits.clear();
    return recent.length > 30;
  };
  const sweep = () => {
    for (const [id, p] of pending) if (now() - p.at > PENDING_MS) pending.delete(id);
  };

  return async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const origin = req.headers.origin;
    const cors = origin && ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors });
      res.end(JSON.stringify(body));
    };
    const configured = !!(env.clientId && env.clientSecret);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/api/strava/status') return json(200, { configured, clientId: env.clientId || null });

    if (req.method === 'GET' && url.pathname === '/api/strava/callback') {
      const state = parseState(url.searchParams.get('state'));
      if (!state) return json(400, { error: 'bad state' });
      const back = RETURN_TO[state.mode](state.id);
      const send = (ok) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(backPage(back, ok));
      };
      const code = url.searchParams.get('code');
      if (url.searchParams.get('error') || !code) {
        pending.set(state.id, { at: now(), challenge: state.challenge, error: url.searchParams.get('error') || 'no code' });
        return send(false);
      }
      if (!configured) return json(503, { error: 'STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET missing' });
      try {
        const tokens = await exchange({ code, grant_type: 'authorization_code' });
        sweep();
        if (pending.size >= MAX_PENDING) pending.clear();
        pending.set(state.id, { at: now(), challenge: state.challenge, tokens: tokenReply(tokens), scope: url.searchParams.get('scope') ?? '' });
        return send(true);
      } catch (e) {
        pending.set(state.id, { at: now(), challenge: state.challenge, error: e.message });
        return send(false);
      }
    }

    if (req.method === 'POST' && (url.pathname === '/api/strava/claim' || url.pathname === '/api/strava/refresh')) {
      const ip = String(req.headers['x-real-ip'] ?? req.socket.remoteAddress ?? '');
      if (tooMany(ip)) return json(429, { error: 'too many requests' });
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > MAX_BODY) return json(413, { error: 'too large' });
      }
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        return json(400, { error: 'bad json' });
      }

      if (url.pathname === '/api/strava/claim') {
        sweep();
        const p = pending.get(String(body.id ?? ''));
        if (!p || typeof body.verifier !== 'string' || challengeOf(body.verifier) !== p.challenge) return json(404, { error: 'not found' });
        pending.delete(String(body.id));
        return p.error ? json(400, { error: p.error }) : json(200, { ...p.tokens, scope: p.scope });
      }

      if (!configured) return json(503, { error: 'not configured' });
      if (typeof body.refresh_token !== 'string' || !body.refresh_token) return json(400, { error: 'refresh_token missing' });
      try {
        return json(200, tokenReply(await exchange({ refresh_token: body.refresh_token, grant_type: 'refresh_token' })));
      } catch (e) {
        return json(e.status === 400 || e.status === 401 ? 401 : 502, { error: e.message });
      }
    }

    json(404, { error: 'not found' });
  };
}

/** Random id and verifier for a sign-in (used by tests; the app makes its own). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

async function main() {
  const env = { clientId: process.env.STRAVA_CLIENT_ID?.trim() ?? '', clientSecret: process.env.STRAVA_CLIENT_SECRET?.trim() ?? '' };
  if (!env.clientId || !env.clientSecret) console.error('strava-auth: STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET missing: set them in Coolify');
  const handle = createHandler({ env });
  createServer((req, res) => void handle(req, res).catch(() => !res.headersSent && (res.writeHead(500), res.end()))).listen(PORT, '127.0.0.1', () =>
    console.log(`strava-auth: listening on 127.0.0.1:${PORT}`),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
