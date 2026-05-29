FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:/app/node_modules/.bin:/root/.local/bin:$PATH \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ git curl ca-certificates procps tini \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@9 --activate \
    && npm install -g @anthropic-ai/claude-code

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

FROM deps AS dev
COPY . .
EXPOSE 3010
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "dev"]

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS prod
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/src ./src
EXPOSE 3010
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
