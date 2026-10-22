#!/usr/bin/env bash
# Builds a self-contained macOS package (one ZIP for Apple Silicon and Intel): portable Node and FFmpeg for
# both architectures, both native builds of @napi-rs/canvas and esbuild, and the prebuilt web panel.
# Testers only extract the ZIP and double-click "Iniciar telemeSYNC.command".
# Runs on macOS, Linux and Git Bash on Windows (the ZIP is written with Unix file modes by scripts/zip-unix.py).
#   usage: scripts/package-mac.sh [out-dir]
set -euo pipefail
# `pwd -W` (Git Bash on Windows) gives F:/… so the path also works inside node -p/-e strings.
ROOT="$(cd "$(dirname "$0")/.." && (pwd -W 2>/dev/null || pwd))"
OUT="${1:-$ROOT/dist-release}"
VERSION="$(node -p "require('$ROOT/package.json').version")"
NODE_VERSION="${NODE_VERSION:-22.22.0}"
PYTHON="$(command -v python3 || command -v python)"
WORK="$(mktemp -d)"
WORK="$(cd "$WORK" && (pwd -W 2>/dev/null || pwd))"
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

echo "› A instalar dependências para macOS (Apple Silicon)"
(cd "$APP" && npm install --omit=dev --os=darwin --cpu=arm64 --no-audit --no-fund --ignore-scripts >/dev/null)
# The Intel builds of the native packages sit next to the Apple Silicon ones; Node loads the one for its own arch.
for pkg in "@napi-rs/canvas:@napi-rs/canvas-darwin-x64" "esbuild:@esbuild/darwin-x64"; do
  base="${pkg%%:*}"; native="${pkg#*:}"
  ver="$(node -p "require('$APP/node_modules/$base/package.json').version")"
  tgz="$(cd "$WORK" && npm pack "$native@$ver" 2>/dev/null | tail -n1)"
  mkdir -p "$APP/node_modules/$native"
  tar xzf - -C "$APP/node_modules/$native" --strip-components=1 <"$WORK/$tgz"
done
test -f "$APP/node_modules/@napi-rs/canvas-darwin-arm64/package.json"
test -f "$APP/node_modules/@napi-rs/canvas-darwin-x64/package.json"
test -f "$APP/node_modules/@esbuild/darwin-arm64/bin/esbuild"
test -f "$APP/node_modules/@esbuild/darwin-x64/bin/esbuild"
# Web build tooling, npm shims and third-party docs are not needed at runtime.
rm -rf "$APP/node_modules/vite" "$APP/node_modules/@vitejs" "$APP/node_modules/@rollup" "$APP/node_modules/rollup" "$APP/node_modules/fsevents"
find "$APP/node_modules" -type d \( -name docs -o -name doc -o -name .bin \) -prune -exec rm -rf {} +

for arch in arm64 x64; do
  RT="$APP/runtime/darwin-$arch"
  mkdir -p "$RT"
  echo "› FFmpeg para macOS $arch"
  # ffmpeg-static downloads the binary for npm_config_platform/arch into FFMPEG_BIN.
  (cd "$APP/node_modules/ffmpeg-static" && CI=1 FFMPEG_BIN="$RT/ffmpeg" npm_config_platform=darwin npm_config_arch=$arch node install.js >/dev/null)
  test -s "$RT/ffmpeg"
  echo "› Node.js $NODE_VERSION portátil para macOS $arch"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-darwin-$arch.tar.gz" -o "$WORK/node-$arch.tgz"
  # Archives are read from stdin: GNU tar on Git Bash takes "C:/…" for a remote host.
  tar xzf - -C "$RT" --strip-components=2 "node-v$NODE_VERSION-darwin-$arch/bin/node" <"$WORK/node-$arch.tgz"
  tar xzf - -C "$APP/runtime" --strip-components=1 "node-v$NODE_VERSION-darwin-$arch/LICENSE" <"$WORK/node-$arch.tgz"
done
mv "$APP/runtime/darwin-arm64/ffmpeg.LICENSE" "$APP/runtime/FFMPEG-LICENSE.txt" 2>/dev/null || true
mv "$APP/runtime/darwin-arm64/ffmpeg.README" "$APP/runtime/FFMPEG-README.txt" 2>/dev/null || true
rm -f "$APP"/runtime/darwin-*/ffmpeg.LICENSE "$APP"/runtime/darwin-*/ffmpeg.README
# The workspace links npm made (junctions on Windows) are written into the ZIP as relative symlinks.
rm -rf "$APP/node_modules/@telemesync"
# Apple Silicon only runs signed code: unsigned binaries get an ad-hoc signature (on macOS; packages built elsewhere
# are signed by the launcher on the tester's Mac). Valid signatures, like Node's, are left alone.
if command -v codesign >/dev/null; then
  for f in "$APP"/runtime/darwin-arm64/* "$APP"/node_modules/@esbuild/darwin-arm64/bin/esbuild "$APP"/node_modules/@napi-rs/canvas-darwin-arm64/*.node; do
    codesign -v "$f" 2>/dev/null || { echo "› Assinatura ad-hoc: ${f#"$APP"/}"; codesign --force --sign - "$f"; }
  done
fi

echo "› Lançador e instruções"
cp "$ROOT/scripts/mac/Iniciar telemeSYNC.command" "$ROOT/scripts/mac/LEIA-ME.txt" "$ROOT/scripts/mac/README.txt" "$ROOT/LICENCA.txt" "$APP/"
node "$ROOT/scripts/third-party-notices.mjs" "$APP" "$APP/LICENCAS-TERCEIROS.txt" --mac
[ -f "$OUT/Instrucoes-telemeSYNC-Mac.pdf" ] && cp "$OUT/Instrucoes-telemeSYNC-Mac.pdf" "$APP/"
# Unix line endings, even when the checkout uses CRLF.
sed -i.bak 's/\r$//' "$APP/Iniciar telemeSYNC.command" "$APP/LEIA-ME.txt" "$APP/README.txt" "$APP/LICENCA.txt" "$APP/LICENCAS-TERCEIROS.txt"
rm -f "$APP"/*.bak

mkdir -p "$OUT"
ZIP="$OUT/telemeSYNC-$VERSION-macos.zip"
"$PYTHON" "$ROOT/scripts/zip-unix.py" "$WORK" telemeSYNC "$ZIP" \
  --link "telemeSYNC/node_modules/@telemesync/core=../../packages/core" \
  --link "telemeSYNC/node_modules/@telemesync/server=../../apps/server" \
  --link "telemeSYNC/node_modules/@telemesync/web=../../apps/web"
echo "✔ $ZIP ($(du -h "$ZIP" | cut -f1))"
