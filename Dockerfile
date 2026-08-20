# Bot Barokah — Railway deploy
# Multi-stage: hasil image kecil, publish lebih cepat dari Nixpacks.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
CMD ["node", "--expose-gc", "index.js"]
