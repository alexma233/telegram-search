#!/bin/sh
set -e

# Set default values for backend
BACKEND_HOST=${BACKEND_HOST:-127.0.0.1}
BACKEND_PORT=${BACKEND_PORT:-3000}

echo "Starting with backend at ${BACKEND_HOST}:${BACKEND_PORT}"

# Generate nginx config from template
envsubst '${BACKEND_HOST} ${BACKEND_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Start nginx in the background
nginx

# Start the node server
exec node apps/server/dist/app.mjs
