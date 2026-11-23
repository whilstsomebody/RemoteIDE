# Multi-stage production build for RemoteIDE API Gateway
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate
WORKDIR /app

FROM base AS builder
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY packages ./packages
COPY apps/gateway ./apps/gateway

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @remote-ide/shared build
RUN pnpm --filter @remote-ide/db build
RUN pnpm --filter @remote-ide/gateway build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate

# Copy necessary workspace packages
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/apps/gateway/dist ./apps/gateway/dist
COPY --from=builder /app/apps/gateway/package.json ./apps/gateway/

RUN pnpm install --prod --frozen-lockfile

EXPOSE 4000
CMD ["node", "apps/gateway/dist/server.js"]
