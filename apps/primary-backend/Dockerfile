# Build from the repo root: docker build -f apps/primary-backend/Dockerfile -t primary-backend .
FROM oven/bun:1

# Prisma needs OpenSSL
RUN apt-get update \
    && apt-get install -y openssl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN cd packages/db && bunx prisma generate

USER bun
EXPOSE 9090
CMD ["bun", "apps/primary-backend/index.ts"]
