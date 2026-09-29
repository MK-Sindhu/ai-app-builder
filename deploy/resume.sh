#!/bin/sh
# Turns ndstill back on after deploy/pause.sh. The site answers within a couple of minutes, and the first
# machines for projects a few minutes later, once they've pulled their images and set up the template.
# Run it from your laptop (needs the AWS CLI).
set -e

REGION=${AWS_REGION:-eu-north-1}
ASG_NAME=${ASG_NAME:-vscode-asg}
CONTROL_IP=${CONTROL_IP:-13.51.99.33}
# The most worker machines you're willing to pay for at once
MAX_MACHINES=${MAX_MACHINES:-6}
# The orchestrator's IDLE_BUFFER: spare machines kept ready for new projects
SPARE_MACHINES=2

CONTROL_ID=$(aws ec2 describe-addresses --region "$REGION" --public-ips "$CONTROL_IP" \
  --query 'Addresses[0].InstanceId' --output text)
if [ -z "$CONTROL_ID" ] || [ "$CONTROL_ID" = "None" ]; then
  echo "No instance has the Elastic IP $CONTROL_IP" >&2
  exit 1
fi

# Start the spare machines right away, since they take the longest
echo "Starting $SPARE_MACHINES worker machines..."
aws autoscaling update-auto-scaling-group --region "$REGION" --auto-scaling-group-name "$ASG_NAME" \
  --min-size 0 --max-size "$MAX_MACHINES" --desired-capacity "$SPARE_MACHINES"

# Docker starts Caddy, the backend and the orchestrator by itself when the server boots
echo "Starting the control server ($CONTROL_ID)..."
aws ec2 start-instances --region "$REGION" --instance-ids "$CONTROL_ID" > /dev/null
aws ec2 wait instance-running --region "$REGION" --instance-ids "$CONTROL_ID"

echo "Waiting for https://api.ndstill.com..."
for _ in $(seq 60); do
  if curl -fsS --max-time 5 https://api.ndstill.com/health > /dev/null 2>&1; then
    echo "ndstill is on. New projects can start once the worker machines are ready, in a few minutes."
    exit 0
  fi
  sleep 5
done

echo "The server is running but the API hasn't answered after 5 minutes. SSH in and check:" >&2
echo "  cd /opt/bolty && sudo docker compose -f docker-compose.control.yml ps" >&2
exit 1
