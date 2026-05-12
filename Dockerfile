# Stage 1: Build React Frontend
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app
ARG VITE_DISCORD_URL=
ARG VITE_TELEGRAM_URL=
ARG VITE_WALLETCONNECT_PROJECT_ID=
ARG VITE_PUBLIC_WALLET_APP_URL=https://blockminer.space
ARG VITE_POLYGON_RPC_URL=
ARG VITE_YOUTUBE_URL=
ARG VITE_LIVE_SERVER_YOUTUBE_ID=
ARG VITE_TURNSTILE_SITE_KEY=
ARG VITE_TURNSTILE_SITE_KEY_LOGIN=
ARG VITE_TURNSTILE_SITE_KEY_REGISTER=
ARG VITE_TURNSTILE_DUMMY_FALLBACK=
ENV VITE_DISCORD_URL=$VITE_DISCORD_URL
ENV VITE_TELEGRAM_URL=$VITE_TELEGRAM_URL
ENV VITE_WALLETCONNECT_PROJECT_ID=$VITE_WALLETCONNECT_PROJECT_ID
ENV VITE_PUBLIC_WALLET_APP_URL=$VITE_PUBLIC_WALLET_APP_URL
ENV VITE_POLYGON_RPC_URL=$VITE_POLYGON_RPC_URL
ENV VITE_YOUTUBE_URL=$VITE_YOUTUBE_URL
ENV VITE_LIVE_SERVER_YOUTUBE_ID=$VITE_LIVE_SERVER_YOUTUBE_ID
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
ENV VITE_TURNSTILE_SITE_KEY_LOGIN=$VITE_TURNSTILE_SITE_KEY_LOGIN
ENV VITE_TURNSTILE_SITE_KEY_REGISTER=$VITE_TURNSTILE_SITE_KEY_REGISTER
ENV VITE_TURNSTILE_DUMMY_FALLBACK=$VITE_TURNSTILE_DUMMY_FALLBACK
COPY client/package*.json ./
RUN npm install --no-audit --no-fund
COPY client/ ./
# Vite resolves `@game2048/engine` to this copy (client-only context in this stage).
COPY server/services/game2048Engine.js ./engine/game2048Engine.js
RUN npm run build

# Stage 2: Serve Backend
FROM node:20-bookworm-slim
WORKDIR /app
LABEL maintainer="blockminer"

# OpenSSL is required by Prisma. Xvfb + ffmpeg are required for admin RTMP capture (Playwright + x11grab).
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openssl rclone ca-certificates netcat-openbsd postgresql-client \
      xvfb ffmpeg \
    && update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy Prisma schema and config, then generate client
COPY server/prisma ./server/prisma/
COPY prisma.config.js ./
RUN npx prisma generate --schema=server/prisma/schema.prisma

# Copy the rest of the application
COPY . .

# Controllers authored in TypeScript (check-in, shortlinks, YouTube, auto mining); emit JS for Node.
RUN npx --yes esbuild@0.25.4 server/controllers/checkinController.ts server/controllers/shortlinkController.ts server/controllers/youtubeController.ts server/controllers/autoMiningGpuController.ts server/controllers/autoMiningV2Controller.ts --outdir=server/controllers --format=esm --platform=node

# Copy compiled React SPA into the backend container
COPY --from=frontend-builder /app/dist ./client/dist

# Create necessary directories
RUN mkdir -p data backups logs uploads

ENV NODE_ENV=production

EXPOSE 3000

# Use an entrypoint script to run migrations automatically before starting
COPY docker-entrypoint.sh /usr/local/bin/
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/server.js"]
