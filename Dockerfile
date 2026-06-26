FROM oven/bun:1.2

WORKDIR /app/apps/api

COPY apps/api/package.json ./
RUN bun install --production

COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src

ENV NODE_ENV=production

CMD ["bun", "run", "src/index.ts"]
