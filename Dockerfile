# Bot Barokah — Railway deploy
# Multi-stage: hasil image kecil, publish lebih cepat dari Nixpacks.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
ENV NODE_ENV=production
# su-exec: drop privilege root→node di entrypoint (bawaan alpine, ~10KB)
RUN apk add --no-cache su-exec
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
# Entry: root chown DATA_DIR (volume Railway root-owned) lalu drop ke node.
# Dipanggil via `sh` agar tidak bergantung pada executable bit.
CMD ["sh", "docker-entrypoint.sh", "node", "--expose-gc", "index.js"]
