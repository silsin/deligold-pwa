#!/bin/sh
# Writes the optional /api reverse-proxy block for delly-pwa, and drops the IPv6
# listen directive when the host has no IPv6 stack.
#
# The nginx image runs /docker-entrypoint.d/*.sh in name order. envsubst
# (20-envsubst-on-templates.sh) has already rendered the site config by the time
# this 40- script runs, so we are fixing up the *rendered* config.
#
# We handle two things envsubst cannot:
#   1. a /api location block that exists only when API_UPSTREAM is set;
#   2. `listen [::]:PORT` — nginx refuses to start without an IPv6 stack, and the
#      stock image only ever adds that line to its own default.conf, never
#      removes it from ours.

CONF=/etc/nginx/conf.d/default.conf
INC=/etc/nginx/api-location.inc

# ── 1. IPv6 safety net ───────────────────────────────────────────────────────
# The official 10-listen-on-ipv6-by-default.sh only patches the packaged
# default.conf (it bails on a checksum mismatch), so our config keeps the
# directive unconditionally. Remove it when IPv6 is missing, otherwise nginx
# dies with "socket() [::]:9741 failed (97: Address family not supported)".
if [ ! -f /proc/net/if_inet6 ] && [ -f "$CONF" ]; then
    sed -i -E '/^[[:space:]]*listen[[:space:]]+\[::\]:/d' "$CONF"
    echo "40-delly-pwa.sh: IPv6 unavailable, removed [::] listen"
fi

# ── 2. Optional /api reverse proxy ───────────────────────────────────────────
# nginx requires the include target to exist, so this file is always written —
# either a real proxy block or a harmless comment.
if [ -n "${API_UPSTREAM:-}" ]; then
    cat > "$INC" <<EOF
    # Reverse proxy to the NestJS delly-api (API_UPSTREAM=$API_UPSTREAM).
    # Keeps the PWA same-origin, so the default relative base URL in
    # src/utils/api.js works with no CORS and no rebuild. NestJS routes carry
    # no /api prefix, so all nine are matched explicitly; '(|\$)' also covers
    # bare '/stores' (no trailing slash).
    location ~ ^/(auth|users|invites|trade|wallet|market|reports|stores|uploads|broker-pricing|store-logos)(|\$) {
        # A variable proxy_pass needs a resolver: nginx must resolve the target
        # per-request, because the API container may not exist yet at boot time
        # and a startup-time lookup failure would be fatal.
        resolver ${DNS_RESOLVER:-127.0.0.11} valid=30s ipv6=off;
        set \$upstream "$API_UPSTREAM";
        proxy_pass \$upstream;

        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Market quotes are polled and must never sit in a buffer.
        proxy_buffering off;
        proxy_read_timeout 60s;

        # API responses are per-user, so they must not be cached anywhere.
        add_header Cache-Control "no-store" always;
    }
EOF
    echo "40-delly-pwa.sh: proxying NestJS routes -> $API_UPSTREAM"
else
    # No API_UPSTREAM: leave the NestJS routes unhandled, so they 404 here and
    # the bundle talks to the origin baked in at build time via VITE_API_URL.
    cat > "$INC" <<'EOF'
    # No API_UPSTREAM set — the NestJS routes are not proxied by this container.
    # Set API_UPSTREAM to reverse-proxy at runtime, or build with
    # --build-arg VITE_API_URL to bake an absolute origin into the bundle.
EOF
    echo "40-delly-pwa.sh: API_UPSTREAM unset, NestJS routes not proxied"
fi
