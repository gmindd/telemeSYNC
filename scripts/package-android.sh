#!/usr/bin/env bash
# Builds the Android app (apps/android): the web panel packaged in a WebView that renders on the phone.
# Signed release APK when apps/android/keystore.properties exists, otherwise a debug APK (fine for testing).
#   usage: scripts/package-android.sh [out-dir]
# Needs JDK 17 (JAVA_HOME) and the Android SDK (ANDROID_HOME or apps/android/local.properties).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && (pwd -W 2>/dev/null || pwd))"
OUT="${1:-$ROOT/dist-release}"
VERSION="$(node -p "require('$ROOT/package.json').version")"

echo "› A compilar o painel web"
(cd "$ROOT" && npm run build -w @telemesync/web >/dev/null)

# JDK 17 on Windows may fail to create its internal sockets under AppData ("Unable to establish loopback
# connection"): give them a folder in the project.
if command -v cygpath >/dev/null; then
  SOCKETS="$ROOT/apps/android/.gradle/sockets"
  mkdir -p "$SOCKETS"
  export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djdk.net.unixdomain.tmpdir=$SOCKETS"
fi

cd "$ROOT/apps/android"
if [ -f keystore.properties ]; then
  TASK=assembleRelease
  APK=app/build/outputs/apk/release/app-release.apk
  NAME="telemeSYNC-$VERSION-android.apk"
else
  echo "› Sem keystore.properties: APK de debug (só para testes)"
  TASK=assembleDebug
  APK=app/build/outputs/apk/debug/app-debug.apk
  NAME="telemeSYNC-$VERSION-android-debug.apk"
fi

echo "› A compilar o APK ($TASK)"
./gradlew --no-daemon -q "$TASK"

mkdir -p "$OUT"
cp "$APK" "$OUT/$NAME"
echo "✓ $OUT/$NAME"
