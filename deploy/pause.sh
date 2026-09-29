#!/bin/sh
# Turns ndstill off to save AWS costs: stops the control server and removes every worker machine.
# Projects and chats stay in the database, but the code on the machines is lost.
# Run it from your laptop (needs the AWS CLI). Turn ndstill back on with deploy/resume.sh.
set -e

REGION=${AWS_REGION:-eu-north-1}
ASG_NAME=${ASG_NAME:-vscode-asg}
CONTROL_IP=${CONTROL_IP:-13.51.99.33}

CONTROL_ID=$(aws ec2 describe-addresses --region "$REGION" --public-ips "$CONTROL_IP" \
  --query 'Addresses[0].InstanceId' --output text)
if [ -z "$CONTROL_ID" ] || [ "$CONTROL_ID" = "None" ]; then
  echo "No instance has the Elastic IP $CONTROL_IP" >&2
  exit 1
fi

# First, so the orchestrator can't hand out or start machines while we remove them
echo "Stopping the control server ($CONTROL_ID)..."
aws ec2 stop-instances --region "$REGION" --instance-ids "$CONTROL_ID" > /dev/null
aws ec2 wait instance-stopped --region "$REGION" --instance-ids "$CONTROL_ID"

# Machines that belong to a project are protected from scale-in, which would keep them running
WORKER_IDS=$(aws autoscaling describe-auto-scaling-groups --region "$REGION" --auto-scaling-group-names "$ASG_NAME" \
  --query 'AutoScalingGroups[0].Instances[].InstanceId' --output text)
if [ -n "$WORKER_IDS" ] && [ "$WORKER_IDS" != "None" ]; then
  aws autoscaling set-instance-protection --region "$REGION" --auto-scaling-group-name "$ASG_NAME" \
    --instance-ids $WORKER_IDS --no-protected-from-scale-in
fi

echo "Removing the worker machines..."
aws autoscaling update-auto-scaling-group --region "$REGION" --auto-scaling-group-name "$ASG_NAME" \
  --min-size 0 --max-size 0 --desired-capacity 0

echo "ndstill is off. Turn it back on with: sh deploy/resume.sh"
