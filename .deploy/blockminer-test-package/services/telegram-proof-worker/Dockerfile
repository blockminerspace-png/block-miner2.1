FROM node:22-bookworm-slim

WORKDIR /app

# Install all deps (incl. dev) so `tsc` is available for the server compile step.
COPY package*.json prisma.config.js tsconfig.server.json ./
COPY server ./server

RUN npm ci --no-audit --no-fund && \
    npx prisma generate --schema=server/prisma/schema.prisma && \
    npx tsc -p tsconfig.server.json && \
    npm prune --omit=dev --no-audit --no-fund

ENV NODE_ENV=production

COPY services/telegram-proof-worker ./services/telegram-proof-worker

CMD ["node", "services/telegram-proof-worker/telegramProofWorker.js"]
