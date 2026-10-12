# syntax=docker/dockerfile:1

###############################################################################
# delly-api — production image (NestJS + Prisma, SQLite file on a volume)
#
#   docker compose up --build       (from the repo root — starts api + pwa)
#
# Boot sequence (see CMD): apply the schema with `prisma db push` (the repo
# keeps no migrations folder; db push is idempotent), seed the chart of
# accounts (upserts — re-running is a no-op), then start Nest on PORT.
###############################################################################

FROM node:22-alpine

WORKDIR /app

# Dependencies first: cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

# Source + Prisma schema, then generate the client and compile TypeScript.
COPY nest-cli.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
# prisma generate writes the typed client into node_modules; npm run build
# (nest build) compiles src/ -> dist/main.js.
RUN npx prisma generate && npm run build

# SQLite file and uploaded receipts live OUTSIDE the image, on a mounted volume
# (compose: delly_data -> /data), so data survives rebuilds.
ENV PORT=7456 \
    DATABASE_URL="file:/data/dev.db" \
    UPLOAD_DIR=/data/uploads \
    JWT_SECRET="change-me-in-production"

EXPOSE 7456

# Liveness via the public board route. busybox wget ships with alpine.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:7456/market/board || exit 1

# Boot: apply the schema, seed, then start Nest.
#
# Every binary is invoked through `npx` on purpose. `npm ci` does install the
# devDependencies (prisma and ts-node are both devDeps), but node images do NOT
# put node_modules/.bin on PATH — so a bare `ts-node` exits 127 "not found" and
# the container crash-loops. `npx` resolves the local binary, which is why the
# `npx prisma db push` half of this line has always worked.
CMD ["sh", "-c", "npx prisma db push && npx ts-node src/seed.ts && node dist/main.js"]
