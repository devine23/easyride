# ───── Stage 1: Build client (Vite production bundle) ─────
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --no-audit --no-fund
COPY client/ .
RUN npm run build

# ───── Stage 2: Install server deps (production only) ─────
FROM node:20-alpine AS server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ───── Stage 3: Final runtime image ─────
FROM node:20-alpine AS runtime
WORKDIR /app

# Install curl for container healthcheck
RUN apk add --no-cache curl

# Non-root user
RUN addgroup -S app && adduser -S -G app app

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/package*.json ./server/
COPY server/src          ./server/src
COPY --from=client-build /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

USER app
WORKDIR /app/server

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fs http://localhost:5000/health || exit 1

CMD ["node", "src/index.js"]
