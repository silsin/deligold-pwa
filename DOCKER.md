# Running delly-pwa in Docker

Two images, deliberately separate:

| File           | Use         | Serves                                  |
| -------------- | ----------- | --------------------------------------- |
| `Dockerfile`   | production  | the static `dist/` build, via nginx     |
| `Dockerfile.dev` | development | the Vite dev server, with hot reload  |

Docker is **not** required for local work — `npm run dev` is unchanged.

---

## Production

```bash
docker build -t delly-pwa .
docker run --rm -p 9741:9741 delly-pwa
# → http://localhost:9741
```

Or with Compose (interpolates the `.env` file — copy `.env.example` first):

```bash
cp .env.example .env
docker compose up --build -d
```

The build is multi-stage, so the final image contains **no Node.js** — only the
built bundle and nginx.

---

## Telling the PWA where the API is

The API origin is resolved in two independent ways, and which one you need
depends on how you deploy.

**1. Bake it in at build time — `VITE_API_URL`**

Vite inlines `import.meta.env.VITE_API_URL` into the JavaScript bundle. A runtime
variable *cannot* reach it, which is why this is a `--build-arg` and not an `-e`
flag.

```bash
docker build --build-arg VITE_API_URL=https://api.example.com -t delly-pwa .
```

**2. Reverse-proxy the NestJS routes at runtime — `API_UPSTREAM`**

The PWA then stays same-origin: no CORS, no `VITE_API_URL` at all, and you can
repoint the target without rebuilding.

```bash
docker run -e API_UPSTREAM=http://host.docker.internal:7456 -p 9741:9741 delly-pwa
```

> Leave `VITE_API_URL` empty when you use `API_UPSTREAM`. Empty keeps the
> relative `/`-based base URL in `src/utils/api.js`, which is exactly what the
> proxy expects.

| `API_UPSTREAM`    | Effect                                                |
| ----------------- | ----------------------------------------------------- |
| unset *(default)* | NestJS routes are not proxied; bundle uses `VITE_API_URL` |
| set               | nginx proxies the NestJS routes → that target, same-origin |

The upstream is resolved **per request** (via a variable `proxy_pass` plus
Docker's embedded DNS), so the container starts fine even when the API container
does not exist yet.

### Ports

The container listens on **9741**, not 80. That is unprivileged, so the image
also runs on Kubernetes and any other runtime that forbids root-owned containers
from binding low ports. Override the published host port with `PORT=`:

```bash
PORT=3000 docker compose up        # → http://localhost:3000
```

`PORT` also changes the *container's* listen port (it is templated into the nginx
config). If you change it, update the `HEALTHCHECK` in the Dockerfile too — that
one line hardcodes `9741`, because Docker does not reliably expand `ENV` in a
shell-form `HEALTHCHECK`.

---

## Development

```bash
docker compose -f docker-compose.dev.yml up
# → http://localhost:9741
```

Runs `npm run dev` with the working tree bind-mounted, so edits trigger hot
reload. `vite.config.js` already proxies the NestJS routes to `DG_API_TARGET`;
set it if your API is not on `127.0.0.1:7456`:

```bash
DG_API_TARGET=http://172.17.0.1:7456 docker compose -f docker-compose.dev.yml up
```

`node_modules` is an anonymous volume, installed *inside* the container on
purpose: `esbuild` ships a platform-specific binary, so sharing a host
`node_modules` would break the build.

---

## Caching, and why it matters for a PWA

This is the part that most often goes wrong when containerising a PWA, so the
nginx config is explicit about it:

| Path                     | `Cache-Control`                       | Why |
| ------------------------ | ------------------------------------- | --- |
| `index.html`             | `no-cache, no-store, must-revalidate` | It names the current hashed assets; a cached copy pins users to an old build. |
| `sw.js`, `registerSW.js` | `no-cache, no-store, must-revalidate` | `registerType: 'autoUpdate'` needs to revalidate the SW on every load. Cache it and auto-updates silently stop working. |
| `manifest.webmanifest`   | `no-cache, must-revalidate`           | Changes on deploy; also needs an explicit `application/manifest+json` type — stock nginx `mime.types` has no webmanifest entry, and a wrong type stops the PWA installing. |
| `/assets/*`              | `public, max-age=31536000, immutable` | Vite fingerprints the filenames, so long caching is safe. |
| `workbox-*.js`           | `public, max-age=31536000, immutable` | Content-hashed. |
| `/icons/*`, `favicon.png`| `public, max-age=604800`              | Change only on deploy; the manifest pins exact URLs. |

After a deploy, clearing a stuck client is still done from the browser: an old
service worker can keep a cached shell alive until it updates itself.

### Served from a sub-path

`base: './'` in `vite.config.js` makes every asset reference relative, so the
image works behind a path prefix (e.g. `https://example.com/delly/`) with no
rebuild. If you do that, keep `Service-Worker-Allowed: /` as it is in the
template.

---

## Layout

```
Dockerfile                          production: Vite build → nginx
Dockerfile.dev                      development: Vite dev server
docker-compose.yml                  production
docker-compose.dev.yml              development
docker/entrypoint.sh                writes the optional NestJS-routes proxy block
docker/nginx/templates/             nginx config, rendered at container start
.dockerignore                       keeps dist/ and node_modules/ out of the context
```

`docker/nginx/templates/default.conf.template` is rendered by the nginx image's
own `20-envsubst-on-templates.sh`, which substitutes only variables that are
defined in the environment — so nginx's own `$uri` and `$host` survive intact.
Because `envsubst` does not understand bash's `${VAR:-fallback}`, defaults are
declared as `ENV` in the Dockerfile instead.

`docker/entrypoint.sh` runs *after* envsubst (40 > 20) and handles the two things
a template cannot express:

1. the NestJS-routes location block that should exist **only** when `API_UPSTREAM` is set;
2. stripping `listen [::]:PORT` when the host has no IPv6 stack — the stock nginx
   image only ever *adds* that line to its own `default.conf`, never removes it,
   and nginx refuses to start without IPv6 if the directive is present.

---

## Health checks

`GET /healthz` returns `200 ok`. The image's `HEALTHCHECK` polls it, and
`docker compose ps` reports the result. Use it for load balancer probes too.

---

## Verifying

```bash
docker build -t delly-pwa . && docker run --rm -p 9741:9741 delly-pwa

curl -sI http://localhost:9741/ | grep -i cache-control
curl -sI http://localhost:9741/sw.js | grep -i cache-control
curl -sI http://localhost:9741/manifest.webmanifest | grep -i content-type
curl -s  http://localhost:9741/healthz
```

Expected: `no-store` for `/` and `/sw.js`, `application/manifest+json` for the
manifest, and `ok` from the health endpoint.

---

## Notes & limitations

- **Runs as root by default**, like the stock nginx image, dropping to the `nginx`
  user for the worker processes. This is deliberate: the official entrypoint must
  render `/etc/nginx/conf.d` before nginx starts, which a non-root PID 1 cannot
  do. If you need a fully unprivileged container, render the config at build time
  instead and add `USER nginx`.
- **No HTTPS.** Terminate TLS at a reverse proxy or load balancer in front. This
  matters more than usual for a PWA: a service worker requires a secure context
  (or `localhost`).
- **Not built in this environment.** Docker is not installed here, so the image
  was not actually built or run. What *was* verified: `npm run build` succeeds,
  the nginx template renders correctly through a real `envsubst`, and
  `docker/entrypoint.sh` was executed against a sandboxed `/etc/nginx` for both
  the `API_UPSTREAM`-set and unset paths, plus the IPv6-stripping `sed`.
