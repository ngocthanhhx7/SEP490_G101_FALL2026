FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY scripts/deployment/ensure-indexes.js ./scripts/deployment/ensure-indexes.js
COPY scripts/deployment/provision-demo-catalog.js ./scripts/deployment/provision-demo-catalog.js
USER node
CMD ["node", "src/server.js"]
