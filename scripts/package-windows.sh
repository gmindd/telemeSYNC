#!/usr/bin/env bash
# Builds a self-contained Windows package: portable Node + Windows dependencies + prebuilt web panel.
# Testers only extract the ZIP and double-click "Iniciar telemeSYNC.bat".
#   usage: scripts/package-windows.sh [out-dir]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist-release}"
VERSION="$(node -p "require('$ROOT/package.json').version")"
NODE_VERSION="${NODE_VERSION:-22.22.0}"
# PLATFORM=linux builds the same package for Linux x64 (used only to smoke-test the file selection).
PLATFORM="${PLATFORM:-win32}"
WORK="$(mktemp -d)"
APP="$WORK/telemeSYNC"
trap 'rm -rf "$WORK"' EXIT

echo "› A compilar o painel web"
(cd "$ROOT" && npm run build -w @telemesync/web >/dev/null)

echo "› A copiar ficheiros"
mkdir -p "$APP"
cd "$ROOT"
cp package.json package-lock.json tsconfig.base.json "$APP/"
mkdir -p "$APP/packages/core" "$APP/apps/server" "$APP/apps/web"
cp -r packages/core/package.json packages/core/src packages/core/assets "$APP/packages/core/"
rm -rf "$APP/packages/core/src/cli"
cp -r apps/server/package.json apps/server/src "$APP/apps/server/"
cp apps/web/package.json "$APP/apps/web/"
cp -r apps/web/dist "$APP/apps/web/dist"
# Root scripts that only make sense for development are removed from the shipped package.json.
node -e '
const fs=require("fs"); const f=process.argv[1]; const p=JSON.parse(fs.readFileSync(f));
p.scripts={ start: "node --import tsx apps/server/src/main.ts" }; delete p.devDependencies;
fs.writeFileSync(f, JSON.stringify(p,null,2)+"\n");' "$APP/package.json"

echo "› A instalar dependências para Windows x64"
(cd "$APP" && npm_config_platform=$PLATFORM npm_config_arch=x64 npm install --omit=dev --os=$PLATFORM --cpu=x64 --no-audit --no-fund --ignore-scripts >/dev/null)
# ffmpeg-static downloads its binary in a postinstall script: run it for Windows explicitly.
(cd "$APP/node_modules/ffmpeg-static" && npm_config_platform=$PLATFORM npm_config_arch=x64 node install.js)
if [ "$PLATFORM" = linux ]; then
  mkdir -p "$OUT" && (cd "$WORK" && tar czf "$OUT/telemeSYNC-$VERSION-linux-smoke.tgz" telemeSYNC)
  echo "✔ $OUT/telemeSYNC-$VERSION-linux-smoke.tgz"; exit 0
fi
test -f "$APP/node_modules/ffmpeg-static/ffmpeg.exe"
ls "$APP/node_modules/@napi-rs/" | grep -q win32-x64
ls "$APP/node_modules/@esbuild/" | grep -q win32-x64
# Web build tooling and third-party docs are not needed at runtime.
rm -rf "$APP/node_modules/vite" "$APP/node_modules/@vitejs" "$APP/node_modules/@rollup" "$APP/node_modules/rollup"
find "$APP/node_modules" -type d \( -name docs -o -name doc \) -prune -exec rm -rf {} +

echo "› A descarregar Node.js $NODE_VERSION portátil"
curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-win-x64.zip" -o "$WORK/node.zip"
unzip -q -j "$WORK/node.zip" "node-v$NODE_VERSION-win-x64/node.exe" "node-v$NODE_VERSION-win-x64/LICENSE" -d "$APP/runtime"

echo "› Lançador e instruções"
cp "$ROOT/scripts/windows/Iniciar telemeSYNC.bat" "$APP/"
cp "$ROOT/scripts/windows/LEIA-ME.txt" "$ROOT/LICENCA.txt" "$APP/"
node "$ROOT/scripts/third-party-notices.mjs" "$APP" "$APP/LICENCAS-TERCEIROS.txt"
[ -f "$OUT/Instrucoes-telemeSYNC.pdf" ] && cp "$OUT/Instrucoes-telemeSYNC.pdf" "$APP/"
# CRLF line endings for Windows text files
sed -i 's/\r\?$/\r/' "$APP/Iniciar telemeSYNC.bat" "$APP/LEIA-ME.txt" "$APP/LICENCA.txt"

mkdir -p "$OUT"
ZIP="$OUT/telemeSYNC-$VERSION-windows.zip"
rm -f "$ZIP"
(cd "$WORK" && zip -qr -9 "$ZIP" telemeSYNC)
echo "✔ $ZIP ($(du -h "$ZIP" | cut -f1))"
