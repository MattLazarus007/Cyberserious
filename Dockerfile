# The lab image holds the two Node apps and the worker. Migrations run in a
# one-shot compose service, so this image stays free of database state.
FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 8100 8200
CMD ["node", "apps/regulator/server/index.ts"]
