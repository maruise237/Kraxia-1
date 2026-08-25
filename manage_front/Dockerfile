FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# 改成淘宝的镜像源（新域名）
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000
RUN --mount=type=cache,target=/root/.npm npm install --prefer-offline --no-audit
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
# Next standalone uses HOSTNAME when binding its HTTP server. Docker injects
# the container hostname automatically, which can bind outside Traefik's
# network. Force an all-interface bind for reliable reverse-proxy routing.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
