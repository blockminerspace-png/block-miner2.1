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
ARG VITE_DISABLE_ADBLOCK_DETECTION=
ARG VITE_API_TIMEOUT_MS=60000
ENV VITE_DISCORD_URL=$VITE_DISCORD_URL
ENV VITE_API_TIMEOUT_MS=$VITE_API_TIMEOUT_MS
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
ENV VITE_DISABLE_ADBLOCK_DETECTION=$VITE_DISABLE_ADBLOCK_DETECTION
COPY client/package*.json ./
RUN npm install --no-audit --no-fund
COPY client/ ./
# Vite resolves `@game2048/engine` to this copy (client-only context in this stage).
# Engine is TypeScript in-repo; use the server build output (run `npm run build:server` before `docker compose build`).
COPY dist/server/services/game2048Engine.js ./engine/game2048Engine.js
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

# TypeScript HTTP composition layer (`backend/src`) — uses root `package.json` `"imports"` (`#server/*` → `dist/server/*`).
RUN npm install --no-save typescript@5.8.3 @types/node@22.15.3 @types/express@5.0.1 @types/cors@2.8.17 @types/compression@1.7.5 @types/pg@8.20.0 @types/jsonwebtoken@9.0.10 @types/multer@1.4.12 && \
    npx tsc -p tsconfig.server.json && \
    npx tsc -p backend/tsconfig.json && \
    mkdir -p backend/_server_vendor && \
    cp -a dist/server/. backend/_server_vendor/

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
CMD ["node", "dist/server/server.js"]
