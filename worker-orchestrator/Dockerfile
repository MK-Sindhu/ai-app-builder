# Build from this folder: docker build -t worker-orchestrator .
FROM oven/bun:1

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY index.ts tsconfig.json ./

USER bun
EXPOSE 9092
CMD ["bun", "index.ts"]
