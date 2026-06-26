FROM oven/bun:1.2

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production

CMD ["bun", "run", "src/index.ts"]
