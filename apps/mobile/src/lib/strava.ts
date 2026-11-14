// Strava: sign-in through the site's small service (it holds the API application's secret, see
// scripts/strava-auth.mjs), the athlete's recent activities, and an activity's streams turned into a ride by the
// core. Tokens stay on the phone; requests to Strava go straight from the phone (native HTTP in the app).
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { buildRide, STRAVA_STREAM_KEYS, stravaToRaw, type RideData, type StravaActivity, type StravaStreams } from '@telemesync/core';

export const STRAVA_CLIENT_ID = '291951';
const SITE = 'https://telemesync.pereiragabriel.com';
const API = 'https://www.strava.com/api/v3';
const TOKENS_KEY = 'telemesync-strava';
const PENDING_KEY = 'telemesync-strava-pending';
/** read: profile name; activity:read_all: the athlete's activities, including those only they can see. */
const SCOPE = 'read,activity:read_all';

export interface StravaSession {
  access_token: string;
  refresh_token: string;
  /** Seconds since the epoch. */
  expires_at: number;
  athlete?: { id: number; firstname: string; lastname: string };
}

/** An activity in the list, with what the picker shows. */
export interface ActivityItem extends StravaActivity {
  sport_type?: string;
  distance?: number;
  elapsed_time: number;
  startMs: number;
  elapsedMs: number;
}

const native = Capacitor.isNativePlatform();

async function http(method: 'GET' | 'POST', url: string, opts: { token?: string; json?: unknown } = {}): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
  if (native) {
    const r = await CapacitorHttp.request({ method, url, headers, data: opts.json, responseType: 'json' });
    return { status: r.status, data: r.data };
  }
  const r = await fetch(url, { method, headers, body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

export function loadSession(): StravaSession | null {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? 'null') as StravaSession | null;
  } catch {
    return null;
  }
}

function saveSession(s: StravaSession | null) {
  try {
    if (s) localStorage.setItem(TOKENS_KEY, JSON.stringify(s));
    else localStorage.removeItem(TOKENS_KEY);
  } catch {
    /* storage unavailable: signed in until the app closes */
  }
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));
async function challengeOf(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

/** Opens Strava's authorization (its app when installed). The answer comes back through finishSignIn. */
export async function startSignIn(): Promise<void> {
  const id = random(18);
  const verifier = random(32);
  localStorage.setItem(PENDING_KEY, JSON.stringify({ id, verifier }));
  const state = `${native ? 'app' : 'dev'}.${id}.${await challengeOf(verifier)}`;
  const url = new URL(native ? 'https://www.strava.com/oauth/mobile/authorize' : 'https://www.strava.com/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: `${SITE}/api/strava/callback`,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: SCOPE,
    state,
  }).toString();
  if (native) await Browser.open({ url: url.toString() });
  else location.href = url.toString();
}

/** Claims the tokens for a finished sign-in (id from the link back into the app). */
export async function finishSignIn(id: string): Promise<StravaSession> {
  const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as { id: string; verifier: string } | null;
  if (!pending || pending.id !== id) throw new Error('sign-in not started here');
  localStorage.removeItem(PENDING_KEY);
  const r = await http('POST', `${SITE}/api/strava/claim`, { json: { id, verifier: pending.verifier } });
  if (r.status !== 200) throw new Error(r.data?.error ?? `HTTP ${r.status}`);
  const s = r.data as StravaSession & { scope?: string };
  if (s.scope !== undefined && !s.scope.includes('activity:read')) throw new Error('scope');
  const session: StravaSession = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, athlete: s.athlete };
  saveSession(session);
  return session;
}

/** Listens for the link back into the app (telemesync://strava?id=…) and, in development, the ?strava= address. */
export function onSignInReturn(cb: (id: string) => void): () => void {
  if (!native) {
    const id = new URLSearchParams(location.search).get('strava');
    if (id) {
      history.replaceState(null, '', location.pathname);
      cb(id);
    }
    return () => {};
  }
  const seen = new Set<string>();
  const open = (url: string | undefined) => {
    if (!url) return;
    const u = new URL(url);
    if (u.protocol !== 'telemesync:' || u.host !== 'strava') return;
    void Browser.close().catch(() => {});
    const id = u.searchParams.get('id');
    if (id && !seen.has(id)) {
      seen.add(id);
      cb(id);
    }
  };
  const handle = App.addListener('appUrlOpen', ({ url }) => open(url));
  // Android may have closed the app while the athlete was on Strava: then the link starts it instead
  void App.getLaunchUrl().then((r) => open(r?.url));
  return () => void handle.then((h) => h.remove());
}

export function signOut() {
  const s = loadSession();
  saveSession(null);
  // Also revoke the app's access on Strava (best effort)
  if (s) void http('POST', 'https://www.strava.com/oauth/deauthorize', { token: s.access_token }).catch(() => {});
}

/** A valid access token, refreshed through the site's service when it is about to expire. */
async function token(): Promise<string> {
  const s = loadSession();
  if (!s) throw new Error('not signed in');
  if (s.expires_at - 120 > Date.now() / 1000) return s.access_token;
  const r = await http('POST', `${SITE}/api/strava/refresh`, { json: { refresh_token: s.refresh_token } });
  if (r.status === 401) {
    saveSession(null);
    throw new Error('signed out');
  }
  if (r.status !== 200) throw new Error(r.data?.error ?? `HTTP ${r.status}`);
  const next: StravaSession = { ...s, ...r.data, athlete: r.data.athlete ?? s.athlete };
  saveSession(next);
  return next.access_token;
}

async function api(path: string): Promise<any> {
  const r = await http('GET', `${API}${path}`, { token: await token() });
  if (r.status === 401) {
    saveSession(null);
    throw new Error('signed out');
  }
  if (r.status === 429) throw new Error('rate');
  if (r.status !== 200) throw new Error(`Strava ${r.status}`);
  return r.data;
}

/**
 * The athlete's activities, newest first: around a moment (a clip's start, ± 1 day) or the latest 30.
 */
export async function listActivities(around?: number): Promise<ActivityItem[]> {
  const q = new URLSearchParams({ per_page: '30' });
  if (around) {
    q.set('after', String(Math.floor(around / 1000 - 86400)));
    q.set('before', String(Math.floor(around / 1000 + 86400)));
  }
  const list = (await api(`/athlete/activities?${q}`)) as (StravaActivity & { elapsed_time: number; sport_type?: string; distance?: number })[];
  return list
    .map((a) => ({ ...a, startMs: Date.parse(a.start_date), elapsedMs: a.elapsed_time * 1000 }))
    .sort((a, b) => b.startMs - a.startMs);
}

/** An activity's streams as a ride (the same as loading its FIT file). */
export async function loadActivityRide(a: ActivityItem): Promise<RideData> {
  const streams = (await api(`/activities/${a.id}/streams?keys=${STRAVA_STREAM_KEYS.join(',')}&key_by_type=true`)) as StravaStreams;
  return buildRide(stravaToRaw(a, streams));
}
