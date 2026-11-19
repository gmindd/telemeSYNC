#!/usr/bin/env bash
# Checks the site container's domains (scripts/nginx-site.conf, docs/dominio.md) against a running image:
#   bash scripts/test/site-redirects.sh http://localhost:8080
# The old domain's pages and www move to telemesync.app with a 301; the update check (/data/latest.json) and the
# services under /api/ must keep answering on the old domain without a redirect.
set -u
BASE="${1:-http://localhost:8080}"
NEW=https://telemesync.app
fails=0

# check <host> <path> <expected status> [expected Location]
check() {
  local host=$1 path=$2 want=$3 loc=${4:-}
  local out status location
  out=$(curl -s -o /dev/null -D - -H "Host: $host" "$BASE$path")
  status=$(printf '%s' "$out" | head -1 | awk '{print $2}')
  location=$(printf '%s' "$out" | tr -d '\r' | awk -F': ' 'tolower($1)=="location"{print $2}')
  if [[ $want == "!301" ]]; then
    [[ $status != 301 && -n $status ]] && ok=1 || ok=0
  else
    [[ $status == "$want" && ( -z $loc || $location == "$loc" ) ]] && ok=1 || ok=0
  fi
  if ((ok)); then echo "ok   $host$path → $status ${location}"; else echo "FAIL $host$path → $status ${location} (wanted $want $loc)"; fails=$((fails + 1)); fi
}

# check_cors <host>: latest.json answers 200 with CORS, as the program needs
check_cors() {
  local host=$1
  if curl -s -o /dev/null -D - -H "Host: $host" "$BASE/data/latest.json" | tr -d '\r' | grep -qi '^access-control-allow-origin: \*$'; then
    echo "ok   $host/data/latest.json has CORS"
  else
    echo "FAIL $host/data/latest.json without CORS"; fails=$((fails + 1))
  fi
}

OLD=telemesync.pereiragabriel.com
check $OLD / 301 "$NEW/"
check $OLD /en/stats?x=1 301 "$NEW/en/stats?x=1"
check $OLD /legal.html 301 "$NEW/legal.html"
check $OLD /script.js 301 "$NEW/script.js"
check $OLD /data/latest.json 200
check_cors $OLD
check $OLD /data/stats.json '!301'
check $OLD /api/strava/callback '!301'
check $OLD /api/bmc-webhook '!301'

check www.telemesync.app / 301 "$NEW/"
check www.telemesync.app /fr/ 301 "$NEW/fr/"

check telemesync.app / 200
check telemesync.app /en/ 200
check telemesync.app /stats 200
check telemesync.app /en 301 /en/
check telemesync.app /data/latest.json 200
check_cors telemesync.app
check localhost / 200

if ((fails)); then echo "$fails check(s) failed"; exit 1; fi
echo "all checks passed"
