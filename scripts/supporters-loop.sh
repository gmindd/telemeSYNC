#!/bin/sh
# Run by the nginx image before it starts (Dockerfile): refreshes data/supporters.json in the
# background, now and every 6 hours. A failed refresh keeps the previous list.
(
  while true; do
    node /opt/telemesync/fetch-supporters.mjs /usr/share/nginx/html/data/supporters.json \
      || echo "supporters: refresh failed, keeping the previous list"
    sleep 21600
  done
) &
