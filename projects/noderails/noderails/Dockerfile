# ── Stage 1: Install + Build ──
FROM node:20-alpine AS builder

# Install build deps for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# ── Layer 1: Lockfile + manifests (most cacheable) ──
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./

COPY packages/common/package.json             packages/common/package.json
COPY packages/database/package.json           packages/database/package.json
COPY packages/database/prisma.config.ts       packages/database/prisma.config.ts
COPY packages/indexer-client/package.json     packages/indexer-client/package.json
COPY packages/mtxm-client/package.json        packages/mtxm-client/package.json
COPY packages/queue/package.json              packages/queue/package.json
COPY packages/redis/package.json              packages/redis/package.json
COPY packages/service-base/package.json       packages/service-base/package.json
COPY packages/solana/package.json             packages/solana/package.json
COPY packages/sui/package.json                packages/sui/package.json
COPY packages/storage/package.json            packages/storage/package.json
COPY packages/web3/package.json               packages/web3/package.json
COPY noderails-solana/package.json            noderails-solana/package.json
COPY services/noderails-server/package.json   services/noderails-server/package.json

RUN pnpm install --frozen-lockfile

# ── Layer 2: Prisma schema → generate client ──
COPY packages/database/prisma packages/database/prisma
RUN pnpm --filter @noderails/database generate

# ── Layer 3: Source code → build ──
COPY packages packages
COPY services/noderails-server services/noderails-server

# Small EC2 builders OOM on parallel `tsc` + default ~512MB Node heap.
# Build deps serially, then compile the server with a larger heap budget.
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN pnpm turbo run build --filter=@noderails/server^... --concurrency=1
RUN pnpm turbo run build --filter=@noderails/server --concurrency=1

# Prune dev dependencies after build
RUN pnpm prune --prod

# ── Stage 2: Production runtime ──
FROM node:20-alpine AS runner

# Only install runtime native deps (no build tools)
RUN apk add --no-cache wget

# Non-root user
RUN addgroup --system --gid 1001 noderails && \
    adduser --system --uid 1001 noderails

WORKDIR /app

# Copy pruned node_modules from builder (already prod-only)
COPY --from=builder /app/node_modules              node_modules
COPY --from=builder /app/package.json               package.json
COPY --from=builder /app/pnpm-workspace.yaml        pnpm-workspace.yaml

# Copy package node_modules (workspace symlinks + runtime deps)
COPY --from=builder /app/packages/common/node_modules             packages/common/node_modules
COPY --from=builder /app/packages/database/node_modules           packages/database/node_modules
COPY --from=builder /app/packages/queue/node_modules              packages/queue/node_modules
COPY --from=builder /app/packages/redis/node_modules              packages/redis/node_modules
COPY --from=builder /app/packages/service-base/node_modules       packages/service-base/node_modules
COPY --from=builder /app/packages/solana/node_modules             packages/solana/node_modules
COPY --from=builder /app/packages/sui/node_modules                packages/sui/node_modules
COPY --from=builder /app/packages/storage/node_modules            packages/storage/node_modules
COPY --from=builder /app/packages/web3/node_modules               packages/web3/node_modules
COPY --from=builder /app/services/noderails-server/node_modules   services/noderails-server/node_modules

# Copy package manifests (needed for module resolution)
COPY --from=builder /app/packages/common/package.json             packages/common/package.json
COPY --from=builder /app/packages/database/package.json           packages/database/package.json
COPY --from=builder /app/packages/indexer-client/package.json     packages/indexer-client/package.json
COPY --from=builder /app/packages/mtxm-client/package.json        packages/mtxm-client/package.json
COPY --from=builder /app/packages/queue/package.json              packages/queue/package.json
COPY --from=builder /app/packages/redis/package.json              packages/redis/package.json
COPY --from=builder /app/packages/service-base/package.json       packages/service-base/package.json
COPY --from=builder /app/packages/solana/package.json             packages/solana/package.json
COPY --from=builder /app/packages/sui/package.json                packages/sui/package.json
COPY --from=builder /app/packages/storage/package.json            packages/storage/package.json
COPY --from=builder /app/packages/web3/package.json               packages/web3/package.json
COPY --from=builder /app/services/noderails-server/package.json   services/noderails-server/package.json

# Copy Prisma schema + generated client
COPY --from=builder /app/packages/database/prisma                 packages/database/prisma
COPY --from=builder /app/packages/database/src/generated          packages/database/src/generated

# Copy built dist outputs
COPY --from=builder /app/packages/common/dist             packages/common/dist
COPY --from=builder /app/packages/database/dist           packages/database/dist
COPY --from=builder /app/packages/indexer-client/dist     packages/indexer-client/dist
COPY --from=builder /app/packages/mtxm-client/dist        packages/mtxm-client/dist
COPY --from=builder /app/packages/queue/dist              packages/queue/dist
COPY --from=builder /app/packages/redis/dist              packages/redis/dist
COPY --from=builder /app/packages/service-base/dist       packages/service-base/dist
COPY --from=builder /app/packages/solana/dist           packages/solana/dist
COPY --from=builder /app/packages/sui/dist                packages/sui/dist
COPY --from=builder /app/packages/storage/dist            packages/storage/dist
COPY --from=builder /app/packages/web3/dist               packages/web3/dist
COPY --from=builder /app/services/noderails-server/dist   services/noderails-server/dist

# Own all files by noderails user
RUN chown -R noderails:noderails /app

USER noderails

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "services/noderails-server/dist/index.js"]
