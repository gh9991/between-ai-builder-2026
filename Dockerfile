FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /src/work-memory
COPY work-memory/package.json work-memory/package-lock.json ./
RUN npm ci
WORKDIR /src
COPY work-memory/ ./work-memory/
COPY docs/results/grace-monthly-contributions/ ./docs/results/grace-monthly-contributions/
COPY deploy/ ./deploy/
ARG APP_COMMIT=local
RUN npm --prefix work-memory run build && node deploy/package.mjs /src/public "$(if [ -f deploy/revision.txt ]; then cat deploy/revision.txt; else echo "$APP_COMMIT"; fi)"

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /src/public ./public
COPY --chown=node:node deploy/server.mjs deploy/firestore.mjs deploy/archive.mjs ./
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
