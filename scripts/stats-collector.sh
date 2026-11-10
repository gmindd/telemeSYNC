#!/bin/sh
# Run by the nginx image before it starts (Dockerfile): starts the statistics collector for /stats in
# the background (it refreshes data/stats.json every hour) and restarts it if it ever stops.
(
  while true; do
    node /opt/telemesync/stats-collector.mjs 2>&1
    echo "stats: stopped, restarting in 60 s"
    sleep 60
  done
) &
