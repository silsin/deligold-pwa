# syntax=docker/dockerfile:1

###############################################################################
# delly-pwa — production image
#
# Stage 1 builds the static bundle with Vite; stage 2 serves it with nginx.
# The result is a single image with no Node runtime in it, serving the PWA
# exactly as it would be served from any static host.
#
#   docker build -t delly-pwa .
#   docker run --rm -p 9741:9741 delly-pwa
#
# Optional knobs (see DOCKER.md):
#   --build-arg VITE_API_URL=https://api.example.com   bake the API origin into
#                                                       the bundle (build time)
#   -e API_UPSTREAM=http://host.docker.internal:7456  reverse-proxy the NestJS
#                                                       routes at runtime (no rebuild)
###############################################################################

# ── Stage 1: build ───────────────────────────────────────────────────────────
# Vite 5 requires Node >= 18; 22 matches the project's local toolchain.
FROM node:22-alpine AS build

WORKDIR /app

# Dependencies first: this layer is cached until package*.json actually change,
# so ordinary source edits never re-download the whole tree.
COPY package.json package-lock.json ./
# `npm ci`, not `npm install`: reproducible, and it fails loudly if the lockfile
# has drifted from package.json instead of silently resolving new versions.
# Every dependency here is a runtime dep in package.json (Vite included), so
# there is no separate dev-install step.
RUN npm ci

# Source only. `dist/` and `node_modules/` are produced inside the image and
# never copied from the host (see .dockerignore), so a stale or Windows-built
# tree — including Windows-only esbuild binaries — cannot leak into the build.
COPY index.html vite.config.js tsconfig.json ./
COPY public ./public
COPY src ./src

# VITE_API_URL must be a build ARG, not a runtime ENV: Vite inlines
# import.meta.env into the bundle, so a runtime variable can never reach it.
# Left empty by default, which keeps the same-origin relative base ('/') that
# src/utils/api.js falls back to — the right choice when this container proxies
# /api itself, and equally correct behind an existing reverse proxy.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# vite-plugin-pwa emits dist/sw.js and the workbox runtime in this same step.
# There is no typecheck stage: the project ships a minimal tsconfig and the
# build is plain `vite build`.
RUN npm run build

# ── Stage 2: serve ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# envsubst renders the site config from /etc/nginx/templates at container start;
# the nginx image's own entrypoint does that for us (20-envsubst-on-templates.sh).
# Installed defensively: without it the template would silently stay unrendered
# and nginx would fail on a literal `${PORT}`.
RUN apk add --no-cache gettext-envsubst

# 9741 rather than 80: unprivileged, so the image also runs on Kubernetes and
# any other runtime that forbids root-owned containers from binding low ports.
ENV PORT=9741

# Empty by default = the NestJS routes are not proxied, and the bundle talks to
# whatever origin VITE_API_URL was built with. Set it to reverse-proxy instead,
# e.g. http://host.docker.internal:7456 on Docker Desktop, or a compose service name.
ENV API_UPSTREAM=""

# Docker's embedded DNS. Required because the proxy target is a runtime
# variable, so nginx must resolve it per-request rather than at startup.
ENV DNS_RESOLVER=127.0.0.11

COPY docker/nginx/templates/default.conf.template /etc/nginx/templates/default.conf.template
# Runs after envsubst (40 > 20) and writes the optional NestJS-routes location block.
COPY docker/entrypoint.sh /docker-entrypoint.d/40-delly-pwa.sh
RUN chmod +x /docker-entrypoint.d/40-delly-pwa.sh

COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

EXPOSE 9741

# Liveness via the /healthz route defined in the site config. The port is
# hardcoded rather than using ${PORT}: Docker expands ENV in HEALTHCHECK only in
# the exec form's environment, not reliably in the shell form, so a literal is
# the safe choice. If you change PORT, change this too.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:9741/healthz || exit 1

# Runs as root, exactly like the stock nginx image, and drops to the `nginx`
# user for the worker processes (see `user nginx;` in the image's nginx.conf).
# That is deliberate: the official entrypoint must render /etc/nginx/conf.d
# before nginx starts, which a non-root PID 1 cannot do. DOCKER.md documents the
# fully-unprivileged variant if you need one.
CMD ["nginx", "-g", "daemon off;"]
