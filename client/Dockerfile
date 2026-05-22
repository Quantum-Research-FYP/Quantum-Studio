FROM node:22-slim AS builder

WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Copy workspace manifests
COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm ci

COPY client/ ./client/
RUN npm run build --workspace=client

# ---- Nginx image ----
FROM nginx:1.27-alpine

COPY --from=builder /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
