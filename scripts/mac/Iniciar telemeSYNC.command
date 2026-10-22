#!/bin/bash
# telemeSYNC for macOS: double-click opens this script in Terminal, which runs the bundled Node.js.
cd "$(dirname "$0")" || exit 1
clear
echo
echo "  telemeSYNC - telemetry overlays for bike videos"
echo "  ------------------------------------------------"
echo "  The app opens in your browser at http://localhost:5174"
echo "  KEEP THIS WINDOW OPEN while you use the app. To stop, close it (or press Control+C)."
echo
echo "  A aplicação abre no browser em http://localhost:5174"
echo "  MANTENHA ESTA JANELA ABERTA enquanto usa a aplicação. Para terminar, feche-a (ou Control+C)."
echo

# Files downloaded from the internet carry the quarantine flag: once this launcher is allowed, it is removed from
# the rest of the folder so Node.js, FFmpeg and the native modules run without a warning each.
xattr -dr com.apple.quarantine . 2>/dev/null

# Apple Silicon or Intel. A Terminal running under Rosetta still gets the native Apple Silicon build.
arch="$(uname -m)"
[ "$(sysctl -in sysctl.proc_translated 2>/dev/null)" = 1 ] && arch=arm64
case "$arch" in
  arm64) runtime="runtime/darwin-arm64" ;;
  x86_64) runtime="runtime/darwin-x64" ;;
  *) echo "  This Mac ($arch) is not supported. / Este Mac ($arch) não é suportado."; read -r -n 1 -s -p "  Press a key to close. / Carregue numa tecla para fechar."; exit 1 ;;
esac
chmod +x "$runtime/node" "$runtime/ffmpeg" node_modules/@esbuild/*/bin/esbuild 2>/dev/null
# Apple Silicon kills unsigned code ("Killed: 9"): anything left unsigned gets an ad-hoc signature, once.
if [ "$arch" = arm64 ]; then
  for f in "$runtime/node" "$runtime/ffmpeg" node_modules/@esbuild/darwin-arm64/bin/esbuild node_modules/@napi-rs/canvas-darwin-arm64/*.node; do
    codesign -v "$f" 2>/dev/null || codesign --force --sign - "$f" 2>/dev/null
  done
fi
export FFMPEG_PATH="$PWD/$runtime/ffmpeg"

"$runtime/node" --import tsx apps/server/src/main.ts

echo
echo "  The app has stopped. If an error appears above, take a screenshot (Cmd+Shift+4) and send it."
echo "  A aplicação terminou. Se apareceu um erro acima, tire uma captura de ecrã (Cmd+Shift+4) e envie-a."
read -r -n 1 -s -p "  Press a key to close. / Carregue numa tecla para fechar."
echo
