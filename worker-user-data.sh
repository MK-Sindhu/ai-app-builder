#!/bin/bash
# Launch template user data for the worker machines. Runs as root on first boot.
# Only needs Docker: git and the AWS CLI run in containers, so it works on any Linux image.
# To see what happened on a machine: sudo cat /var/log/bolty-setup.log
set -euo pipefail
exec > /var/log/bolty-setup.log 2>&1

REGION=eu-north-1
REPO=https://github.com/MK-Sindhu/ai-app-builder.git

# Wait for the Docker daemon to start
until docker info >/dev/null 2>&1; do sleep 2; done

# The base image still has the old code-server container and image; free their disk space
docker container prune -f
docker image prune -af

# Docker Compose plugin, if the image doesn't have it
if ! docker compose version >/dev/null 2>&1; then
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

docker run --rm -v /opt:/opt alpine/git clone --depth 1 "$REPO" /opt/bolty
cd /opt/bolty

# The worker's .env, stored in SSM Parameter Store. Needs the bolty-worker instance profile.
docker run --rm --network host amazon/aws-cli ssm get-parameter --name /bolty/worker-env \
  --with-decryption --query Parameter.Value --output text --region "$REGION" > apps/worker/.env

COMPOSE="docker compose --env-file apps/worker/.env -f docker-compose.worker.yml"
$COMPOSE build

# The system prompt assumes an Expo project already exists in the project folder. Create it before
# starting the services, so the orchestrator's health check only passes once the machine is ready.
$COMPOSE run --rm -T --no-deps worker sh -c "cd /tmp/bolty-worker && npx --yes create-expo-app@latest ."

$COMPOSE up -d
