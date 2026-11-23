# Build a partir da raiz do repositório: docker build -f apps/server/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w @bio/shared && npm run build -w @bio/server \
 && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/migrations apps/server/migrations
USER node
EXPOSE 3001
CMD ["node", "apps/server/dist/index.js"]
