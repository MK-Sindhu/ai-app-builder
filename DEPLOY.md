# Deploying Bolty

## How the pieces talk

```
Browser ──HTTPS──> frontend (Vercel)
Browser ──HTTPS──> primary-backend ──ORCHESTRATOR_SECRET──> worker-orchestrator ──> AWS auto scaling group
                        │
                        └──WORKER_SECRET──> worker on the project's machine (private IP, port 9091)
Browser ──────────> code-server on the project's machine (port 8080, password)
```

Only the backend and code-server are public. The orchestrator and the workers only accept calls
that carry their shared secret, and security groups keep them off the internet as well.

## 1. Secrets

Generate one value each for `ORCHESTRATOR_SECRET`, `WORKER_SECRET` and `CODE_SERVER_PASSWORD`:

```bash
openssl rand -hex 32
```

Each service's `.env.example` lists what it needs. Keep the real values in AWS SSM Parameter Store,
not in launch template user data (anyone who can describe the instance can read user data).

## 2. Database

Create a Postgres database (e.g. RDS), then apply the migrations once per deploy:

```bash
cd packages/db
DATABASE_URL="postgresql://..." bun run migrate:deploy
```

## 3. Security groups

| Group | Inbound rules |
|---|---|
| `backend-sg` | 443 from the internet (through the load balancer) |
| `orchestrator-sg` | 9092 from `backend-sg` |
| `worker-sg` | 9091 from `backend-sg` and `orchestrator-sg`; 8080 from anywhere (code-server, password protected) |
| `db-sg` | 5432 from `backend-sg` and `worker-sg` |

## 4. IAM role for the orchestrator

Attach this to the orchestrator's EC2 instance instead of using access keys:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "autoscaling:DescribeAutoScalingGroups",
        "autoscaling:SetDesiredCapacity",
        "autoscaling:SetInstanceProtection",
        "autoscaling:TerminateInstanceInAutoScalingGroup",
        "ec2:DescribeInstances",
        "ec2:CreateTags"
      ],
      "Resource": "*"
    }
  ]
}
```

The auto scaling group's `MaxSize` caps how many projects can have a machine at once
(machines in use + 2 idle). Set `MinSize` to 0: the orchestrator sets the desired capacity itself,
and AWS refuses to release a machine if that would take the group below `MinSize`.

## 5. Worker machines (launch template user data)

Each machine runs `docker-compose.worker.yml`: the worker and code-server sharing `/tmp/bolty-worker`.
The launch template's user data is [worker-user-data.sh](worker-user-data.sh). It only needs Docker on the
image, and logs to `/var/log/bolty-setup.log` on the machine.

Before machines can boot with it:

```bash
# The worker's .env, which the script reads at boot
aws ssm put-parameter --name /bolty/worker-env --type SecureString --value file://apps/worker/.env --region eu-north-1

# An instance profile that lets the machines read it
aws iam create-role --role-name bolty-worker --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam put-role-policy --role-name bolty-worker --policy-name read-worker-env --policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"ssm:GetParameter","Resource":"arn:aws:ssm:eu-north-1:*:parameter/bolty/worker-env"}]}'
aws iam create-instance-profile --instance-profile-name bolty-worker
aws iam add-role-to-instance-profile --instance-profile-name bolty-worker --role-name bolty-worker
```

The repo must be public, or `git clone` needs a token. After changing `apps/worker/.env`, run the
`put-parameter` command again with `--overwrite`.

Building on every boot is slow. Once this works, push the images to ECR from CI and pull them instead.

## 6. Orchestrator

Run exactly one copy (it keeps its list of machines in memory), on a small EC2 instance in the same VPC:

```bash
docker build -t worker-orchestrator worker-orchestrator
docker run -d --restart unless-stopped --env-file worker-orchestrator/.env -p 9092:9092 worker-orchestrator
```

## 7. Primary backend

Run it behind an Application Load Balancer with an HTTPS certificate (ACM):

```bash
docker build -f apps/primary-backend/Dockerfile -t primary-backend .
docker run -d --restart unless-stopped --env-file apps/primary-backend/.env -p 9090:9090 primary-backend
```

Health check path: `/health`.

## 8. Frontend

Deploy `apps/frontend` on Vercel (set the root directory to `apps/frontend`) with the variables in
`apps/frontend/.env.example`. `NEXT_PUBLIC_BACKEND_URL` must be the backend's HTTPS URL.

## Known gaps

- **code-server over HTTPS.** The iframe loads `http://<machine>:8080`, which browsers block inside an
  HTTPS page. It needs the router from the README: a wildcard domain with TLS in front of code-server.
- **Every opened project keeps a running machine.** Machines are only freed by `POST /destroy`, or
  automatically if you set `IDLE_TIMEOUT_MINUTES` on the orchestrator. Freeing a machine deletes the
  project's files, since they live only on the machine (README: back up to S3).
