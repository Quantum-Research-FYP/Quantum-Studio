FROM node:22-slim AS builder

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install all workspace deps (server needs devDeps for tsc)
RUN npm ci

# Copy source and compile
COPY server/ ./server/
RUN npm run build --workspace=server

# ---- Runtime image ----
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Production deps only
RUN npm ci --omit=dev

COPY --from=builder /app/server/dist ./server/dist

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
