#!/bin/sh
# Run by the nginx image before it starts (Dockerfile): starts the Strava sign-in service for the mobile app
# in the background and restarts it if it ever stops.
(
  while true; do
    node /opt/telemesync/strava-auth.mjs 2>&1
    echo "strava-auth: stopped, restarting in 5 s"
    sleep 5
  done
) &
