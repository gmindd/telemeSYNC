#!/bin/sh
# Run by the nginx image before it starts (Dockerfile): refreshes data/supporters.json in the
# background, now and every hour. A failed refresh keeps the previous list and logs why.
(
  while true; do
    node /opt/telemesync/fetch-supporters.mjs /usr/share/nginx/html/data/supporters.json 2>&1 \
      || echo "supporters: refresh failed, keeping the previous list"
    sleep 3600
  done
) &
