# Landing page (site/) for Coolify or any Docker host: nginx serves the static files, a small Node
# service receives the Buy Me a Coffee webhook (new supporters) at /api/bmc-webhook and another one
# refreshes the numbers of the /stats page every hour.
# Environment (in Coolify: Environment Variables):
#   BMC_WEBHOOK_SECRET = the webhook's Signing Secret
# Persistent storage: mount a volume at /var/lib/telemesync, or received supporters and the visit
# counts of /stats are lost on redeploy.
FROM nginx:1.27-alpine
RUN apk add --no-cache nodejs
COPY scripts/nginx-site.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
COPY scripts/bmc-webhook.mjs scripts/stats-collector.mjs scripts/visits.mjs scripts/build-langs.mjs /opt/telemesync/
# The site in English, French, Spanish and German (/en/, /fr/…), from the Portuguese pages and site/i18n
RUN node /opt/telemesync/build-langs.mjs /usr/share/nginx/html
COPY scripts/bmc-webhook.sh /docker-entrypoint.d/90-bmc-webhook.sh
COPY scripts/stats-collector.sh /docker-entrypoint.d/91-stats-collector.sh
RUN chmod +x /docker-entrypoint.d/90-bmc-webhook.sh /docker-entrypoint.d/91-stats-collector.sh && mkdir -p /var/lib/telemesync
EXPOSE 80 3000
