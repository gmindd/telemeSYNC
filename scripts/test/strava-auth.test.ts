import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module run by the site container
import { challengeOf, createHandler, parseState, randomToken } from '../strava-auth.mjs';

const ENV = { clientId: '291951', clientSecret: 'test-secret' };
const TOKENS = { access_token: 'acc', refresh_token: 'ref', expires_at: 1_900_000_000, athlete: { id: 7, firstname: 'Ana', lastname: 'R', city: 'Porto', weight: 60 } };

let server: Server | undefined;
afterEach(() => server?.close());

/** Starts the service with Strava's token endpoint replaced; returns its base URL and the calls Strava got. */
async function start(exchange?: (p: Record<string, string>) => Promise<unknown>) {
  const calls: Record<string, string>[] = [];
  const handle = createHandler({
    env: ENV,
    exchange: async (p: Record<string, string>) => {
      calls.push(p);
      return exchange ? exchange(p) : TOKENS;
    },
  });
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  return { base: `http://127.0.0.1:${port}`, calls };
}

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('Strava sign-in service', () => {
  it('reads only well-formed states', () => {
    const id = randomToken(12);
    const ch = challengeOf('v');
    expect(parseState(`app.${id}.${ch}`)).toEqual({ mode: 'app', id, challenge: ch });
    expect(parseState(`evil.${id}.${ch}`)).toBeNull();
    expect(parseState(`app.short.${ch}`)).toBeNull();
    expect(parseState(`app.${id}.${ch}.x`)).toBeNull();
    expect(parseState('')).toBeNull();
  });

  it('exchanges the code, sends the browser back to the app without tokens, and hands them over once with the verifier', async () => {
    const { base, calls } = await start();
    const id = randomToken(12);
    const verifier = randomToken();
    const cb = await fetch(`${base}/api/strava/callback?state=app.${id}.${challengeOf(verifier)}&code=abc&scope=read,activity:read_all`);
    const page = await cb.text();
    expect(cb.status).toBe(200);
    expect(page).toContain(`telemesync://strava?id=${id}`);
    expect(page).not.toContain('acc');
    expect(calls).toEqual([{ code: 'abc', grant_type: 'authorization_code' }]);

    expect((await post(`${base}/api/strava/claim`, { id, verifier: 'wrong' })).status).toBe(404);
    const ok = await post(`${base}/api/strava/claim`, { id, verifier });
    expect(await ok.json()).toEqual({
      access_token: 'acc',
      refresh_token: 'ref',
      expires_at: 1_900_000_000,
      athlete: { id: 7, firstname: 'Ana', lastname: 'R' },
      scope: 'read,activity:read_all',
    });
    // Only once
    expect((await post(`${base}/api/strava/claim`, { id, verifier })).status).toBe(404);
  });

  it('reports a refused authorization to the app', async () => {
    const { base, calls } = await start();
    const id = randomToken(12);
    const verifier = randomToken();
    const cb = await fetch(`${base}/api/strava/callback?state=dev.${id}.${challengeOf(verifier)}&error=access_denied`);
    expect(await cb.text()).toContain(`http://localhost:5175/?strava=${id}`);
    expect(calls).toEqual([]);
    const claim = await post(`${base}/api/strava/claim`, { id, verifier });
    expect(claim.status).toBe(400);
    expect(await claim.json()).toEqual({ error: 'access_denied' });
  });

  it('refreshes a token and turns Strava refusing it into 401', async () => {
    const { base, calls } = await start(async (p) => {
      if (p.refresh_token === 'revoked') throw Object.assign(new Error('Bad Request'), { status: 400 });
      return TOKENS;
    });
    const ok = await post(`${base}/api/strava/refresh`, { refresh_token: 'ref' });
    expect((await ok.json()).access_token).toBe('acc');
    expect(calls[0]).toEqual({ refresh_token: 'ref', grant_type: 'refresh_token' });
    expect((await post(`${base}/api/strava/refresh`, { refresh_token: 'revoked' })).status).toBe(401);
    expect((await post(`${base}/api/strava/refresh`, {})).status).toBe(400);
  });

  it('rejects a bad state and answers CORS only for the app and the dev server', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/strava/callback?state=nope&code=x`)).status).toBe(400);
    const dev = await fetch(`${base}/api/strava/status`, { headers: { Origin: 'http://localhost:5175' } });
    expect(dev.headers.get('access-control-allow-origin')).toBe('http://localhost:5175');
    expect(await dev.json()).toEqual({ configured: true, clientId: '291951' });
    const other = await fetch(`${base}/api/strava/status`, { headers: { Origin: 'https://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});
