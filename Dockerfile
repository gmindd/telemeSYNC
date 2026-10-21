# Landing page (site/) for Coolify or any Docker host: nginx serves the static files and a small Node
# service receives the Buy Me a Coffee webhook (new supporters) at /api/bmc-webhook.
# Environment: BMC_WEBHOOK_SECRET = the webhook's Signing Secret (in Coolify: Environment Variables).
# Persistent storage: mount a volume at /var/lib/telemesync, or received supporters are lost on redeploy.
FROM nginx:1.27-alpine
RUN apk add --no-cache nodejs
COPY scripts/nginx-site.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
COPY scripts/bmc-webhook.mjs /opt/telemesync/bmc-webhook.mjs
COPY scripts/bmc-webhook.sh /docker-entrypoint.d/90-bmc-webhook.sh
RUN chmod +x /docker-entrypoint.d/90-bmc-webhook.sh && mkdir -p /var/lib/telemesync
EXPOSE 80 3000
