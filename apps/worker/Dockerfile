# Build from the repo root: docker build -f apps/worker/Dockerfile -t worker .
FROM oven/bun:1

# The model's shell commands and the preview need node and npm. Prisma needs OpenSSL.
RUN apt-get update \
    && apt-get install -y curl ca-certificates openssl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN cd packages/db && bunx prisma generate

# Shared with code-server. bun has uid 1000, the same as code-server's coder user.
RUN mkdir -p /tmp/bolty-worker && chown bun:bun /tmp/bolty-worker
USER bun

# 9091: the worker. 8081: Vite's dev server, which the router shows as the project's preview.
EXPOSE 9091 8081
CMD ["bun", "apps/worker/index.ts"]
