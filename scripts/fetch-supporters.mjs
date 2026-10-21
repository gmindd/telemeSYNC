// Writes site/data/supporters.json with the latest Buy Me a Coffee supporters, for the landing page.
// Run inside the site container (Dockerfile, scripts/supporters-loop.sh) with the BMC_TOKEN environment variable (personal access token from
// https://developers.buymeacoffee.com). Only the public name, number of coffees and date are kept:
// no e-mails, notes or amounts. Without a token it writes an empty list.
//   BMC_TOKEN=… node scripts/fetch-supporters.mjs [out.json]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const OUT = process.argv[2] ?? 'site/data/supporters.json';
const MAX = 20;
const token = process.env.BMC_TOKEN?.trim();

async function fetchSupporters() {
  if (!token) {
    console.warn('BMC_TOKEN not set: writing an empty supporters list.');
    return [];
  }
  const res = await fetch('https://developers.buymeacoffee.com/api/v1/supporters?page=1', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  // The API answers 404 while the page has no supporters yet: that is an empty list, not an error.
  if (res.status === 404) {
    console.log(`Buy Me a Coffee: no supporters yet (HTTP 404 ${text.slice(0, 120)})`);
    return [];
  }
  // 401 = token wrong or expired (create a new one at developers.buymeacoffee.com).
  if (!res.ok) throw new Error(`Buy Me a Coffee API: HTTP ${res.status} ${text.slice(0, 200)}`);
  const body = JSON.parse(text);
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows
    .filter((r) => !r.is_refunded && r.refunded !== true)
    .map((r) => {
      // Key names changed over time in the API; private supports are shown without a name.
      const isPrivate = r.support_visibility === 0 || r.is_private === true;
      const name = isPrivate ? '' : String(r.supporter_name ?? r.payer_name ?? '').trim();
      return {
        name: name && !/@/.test(name) ? name.slice(0, 40) : '',
        coffees: Number(r.support_coffees ?? r.coffees ?? 1) || 1,
        date: r.support_created_on ?? r.created_on ?? null,
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, MAX);
}

const supporters = await fetchSupporters();
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), supporters }, null, 2) + '\n');
console.log(`${supporters.length} supporters → ${OUT}`);
