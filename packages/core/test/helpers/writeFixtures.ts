// Writes synthetic FIT/GPX files: npx tsx packages/core/test/helpers/writeFixtures.ts <dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeFit, encodeGpx, syntheticRide } from './synthetic.ts';

const dir = process.argv[2] ?? 'fixtures/synthetic';
mkdirSync(dir, { recursive: true });
const r = syntheticRide();
writeFileSync(join(dir, 'synthetic.fit'), encodeFit(r.samples));
writeFileSync(join(dir, 'synthetic.gpx'), encodeGpx(r.samples));
console.log(`Escrito em ${dir}`);
