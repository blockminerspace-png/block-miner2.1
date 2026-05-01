FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
COPY package*.json ./
COPY prisma.config.js ./
COPY server/prisma ./server/prisma
RUN npm ci && npx prisma generate --schema=server/prisma/schema.prisma && npm prune --omit=dev

COPY server ./server
COPY services/telegram-proof-worker ./services/telegram-proof-worker

CMD ["node", "services/telegram-proof-worker/telegramProofWorker.js"]
