#!/bin/sh
# Run by the nginx image before it starts (Dockerfile): starts the Buy Me a Coffee webhook receiver
# in the background and restarts it if it ever stops.
(
  while true; do
    node /opt/telemesync/bmc-webhook.mjs 2>&1
    echo "bmc-webhook: stopped, restarting in 5 s"
    sleep 5
  done
) &
