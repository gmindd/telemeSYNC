# Landing page (site/) for Coolify or any Docker host: nginx serves the static files and the
# Buy Me a Coffee supporters list is refreshed at start-up and every hour.
# Set BMC_TOKEN as an environment variable of the container (in Coolify: Environment Variables).
FROM nginx:1.27-alpine
RUN apk add --no-cache nodejs
COPY scripts/nginx-site.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
COPY scripts/fetch-supporters.mjs /opt/telemesync/fetch-supporters.mjs
COPY scripts/supporters-loop.sh /docker-entrypoint.d/90-supporters.sh
RUN chmod +x /docker-entrypoint.d/90-supporters.sh
EXPOSE 80 3000
