# Running delly in Docker

**One repository, one command, two services.** The PWA (`delly-pwa`) and the
API (`api/`, NestJS + Prisma + SQLite) both live here, and a single
`docker compose up --build -d` starts both.

| File                | Image           | Serves                                      | Port  |
| ------------------- | --------------- | ------------------------------------------- | ----- |
| `Dockerfile`        | `delly-pwa`     | the static `dist/` build, via nginx         | 9741  |
| `Dockerfile.dev`    | `delly-pwa:dev` | the Vite dev server, with hot reload        | 9741  |
| `api/Dockerfile`    | `delly-api`     | the NestJS API (built from `api/src`)       | 7456  |

Docker is **not** required for local work — `npm run dev` and
`cd api && npm run start:dev` are unchanged.

---

## Production

```bash
cp .env.example .env      # then set JWT_SECRET
docker compose up --build -d
#  PWA → http://localhost:9741
#  API → http://localhost:7456
```

Two containers, and nothing else to install, configure, or point at each other:

- `pwa` build arg `VITE_API_URL` is **empty on purpose**. `API_UPSTREAM=http://api:7456`
  makes its nginx reverse-proxy the eight NestJS routes
  (`/auth /users /invites /trade /wallet /market /reports /stores /uploads`) to the `api`
  container, so the browser stays **same-origin** and CORS never comes into play.
- The target is resolved **per request** through Docker's embedded DNS
  (`DNS_RESOLVER=127.0.0.11`), so the order the two containers start in does not
  matter, and a restarting API never takes nginx down with it.
- The SQLite database and the uploaded bank receipts live on the `delly_data`
  volume at `/data` — **outside** both images. Rebuilds, upgrades and
  `docker compose down` do not touch them.

The PWA image is multi-stage and contains **no Node.js** — only the built bundle
and nginx. The API image runs `node dist/main.js` (Nest, not Fastify/Express).

### The API service (`api/`)

On start it runs, in order:

```sh
npx prisma db push      # apply the schema — idempotent, no migrations folder
ts-node src/seed.ts     # upsert the chart of accounts — re-running is a no-op
node dist/main.js       # listen on PORT
```

`node:22-alpine` matches the local toolchain, and devDependencies stay installed
because `db push` and `seed` need the Prisma CLI and `ts-node`.

| Variable          | Default                      | Notes                                             |
| ----------------- | ---------------------------- | ------------------------------------------------- |
| `PORT`            | `7456`                       | Container listen port; host port is `API_PORT`.    |
| `DATABASE_URL`    | `file:/data/dev.db`          | Points at the volume, never the image filesystem.  |
| `UPLOAD_DIR`      | `/data/uploads`              | Bank receipts submitted for order review.          |
| `JWT_SECRET`      | `change-me-in-production`    | **Set a long random value** via `.env`.            |
| `CORS_ORIGINS`    | *(empty)*                    | Only needed if you build with `VITE_API_URL`.      |

Because the receipts and the DB are on a volume, **back up the `delly_data`
volume** — it is the only copy of your ledger and of the receipt images.

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
#  PWA (HMR): http://localhost:9741
#  API:       http://localhost:7456
```

Both source trees are bind-mounted, so edits appear instantly; the API side runs
`npx prisma db push && npm run start:dev`. `vite.config.js` already proxies the
NestJS routes to `DG_API_TARGET`, which the compose file sets to the
`api-dev` service name:

```bash
DG_API_TARGET=http://host.docker.internal:7456 docker compose -f docker-compose.dev.yml up
```

`node_modules` is a **named volume** in both services, installed *inside* the
container on purpose: `esbuild` and Prisma ship platform-specific binaries, so
sharing a Windows/macOS host `node_modules` would break both builds. Dev data
(`delly_data_dev`) is likewise its own volume, so hot-reload work never touches
the production database.

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
api/                             the NestJS API — one place, no second repo
  Dockerfile  .dockerignore      production image
  src/  prisma/  nest-cli.json
Dockerfile                       production: Vite build → nginx
Dockerfile.dev                   development: Vite dev server
docker-compose.yml               production: api + pwa
docker-compose.dev.yml           development: api (watch) + pwa (HMR)
docker/entrypoint.sh             writes the optional NestJS-routes proxy block
docker/nginx/templates/          nginx config, rendered at container start
.dockerignore                    root image context (excludes api/ — own context)
```

`api/` is a **separate build context** with its own `Dockerfile`, so it is listed
in the root `.dockerignore`: copying it into the PWA image would double the build
time and ship a Node tree the image does not need.

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
docker compose up --build -d
docker compose ps                      # both services should report healthy

curl -s  http://localhost:7456/market/board | head -c 200   # API, directly
curl -s  http://localhost:9741/market/board | head -c 200   # same JSON, through the pwa proxy
curl -sI http://localhost:9741/ | grep -i cache-control
curl -sI http://localhost:9741/sw.js | grep -i cache-control
curl -sI http://localhost:9741/manifest.webmanifest | grep -i content-type
curl -s  http://localhost:9741/healthz
```

The two `market/board` calls returning identical JSON is the real proof that the
proxy is wired up. Expected otherwise: `no-store` for `/` and `/sw.js`,
`application/manifest+json` for the manifest, and `ok` from the health endpoint.

```bash
docker compose logs -f api             # schema push, seed, then "Nest application successfully started"
docker compose exec api sh -c 'ls -l /data'   # dev.db + uploads/ on the volume
```

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
- **Not built in this environment.** Docker is not installed here, so the images
  were not actually built or run. What *was* verified: `npm run build` succeeds,
  the nginx template renders correctly through a real `envsubst`, and
  `docker/entrypoint.sh` was executed against a sandboxed `/etc/nginx` for both
  the `API_UPSTREAM`-set and unset paths, plus the IPv6-stripping `sed`.
- **SQLite is the only store.** It is fine for one container on one host, but it
  does not tolerate two writers: run exactly one `api` replica unless you switch
  `datasource db.provider` and scale out.
- **No migrations folder.** `prisma db push` applies the schema directly and will
  not warn you about a destructive column change. Before upgrading, snapshot the
  `delly_data` volume.
