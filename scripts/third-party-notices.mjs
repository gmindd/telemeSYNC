// Writes LICENCAS-TERCEIROS.txt for a packaged app: every production dependency with its licence text.
//   node scripts/third-party-notices.mjs <app-dir> <out-file>
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [appDir, outFile] = process.argv.slice(2);
const nm = join(appDir, 'node_modules');
const seen = new Map();

function visit(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    if (name.startsWith('@')) {
      visit(p);
      continue;
    }
    const pkgFile = join(p, 'package.json');
    if (!existsSync(pkgFile)) continue;
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
    if (!pkg.name || pkg.name.startsWith('@telemesync/')) continue;
    const key = `${pkg.name}@${pkg.version}`;
    if (!seen.has(key)) {
      const licFile = readdirSync(p).find((f) => /^(licen[cs]e|copying|notice)/i.test(f) && statSync(join(p, f)).isFile());
      seen.set(key, {
        name: pkg.name,
        version: pkg.version,
        license: typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'ver texto',
        url: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? pkg.homepage ?? '',
        text: licFile ? readFileSync(join(p, licFile), 'utf8').trim() : '',
      });
    }
    visit(join(p, 'node_modules'));
  }
}
visit(nm);

const sep = '\n' + '='.repeat(78) + '\n';
const items = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
let out = `telemeSYNC — Componentes de terceiros e respetivas licenças
O telemeSYNC inclui os componentes abaixo, distribuídos de acordo com as suas licenças.
${sep}
FFmpeg (executável ffmpeg.exe, não modificado) — GPL-3.0
Compilação estática distribuída pelo pacote ffmpeg-static (https://github.com/eugeneware/ffmpeg-static).
Código-fonte do FFmpeg: https://ffmpeg.org/download.html (e https://git.ffmpeg.org/ffmpeg.git).
Oferta escrita: durante pelo menos três anos a contar da distribuição, o autor do telemeSYNC fornece,
mediante pedido para hello@pereiragabriel.com, uma cópia do código-fonte correspondente do
FFmpeg incluído, sem outro custo além do da sua disponibilização.
${sep}
Node.js (runtime\\node.exe) — MIT e outras (ver runtime\\LICENSE)
https://nodejs.org
${sep}
Fonte Inter — SIL Open Font License 1.1 (ver packages/core/assets/fonts/inter/LICENSE.txt)
https://rsms.me/inter/
`;
for (const i of items) {
  out += `${sep}${i.name} ${i.version} — ${i.license}${i.url ? `\n${i.url.replace(/^git\+/, '')}` : ''}\n${i.text ? `\n${i.text}\n` : ''}`;
}
writeFileSync(outFile, out.replace(/\r?\n/g, '\r\n'));
console.log(`${items.length} componentes → ${outFile}`);
