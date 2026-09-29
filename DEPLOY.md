# Deploying ndstill

## How the pieces talk

```
Browser ──HTTPS──> ndstill.com                    frontend (Vercel)
Browser ──HTTPS──> api.ndstill.com                ┐
Browser ──HTTPS──> code.ndstill.com/<projectId>/  │ control server: Caddy
Browser ──HTTPS──> <projectId>.preview.ndstill.com ┘
                                                     ├──> backend ──> orchestrator ──> auto scaling group
                                                     │       └──> worker on the project's machine (:9091)
                                                     └──> code-server (:8080) or the site preview (:8081) on the
                                                          project's machine, after the backend checks the user owns it
```

Only the control server is reachable from the internet (ports 80 and 443). The worker machines accept
ports 9091, 8080 and 8081 from the control server only. Project files live on the machine and are deleted when
the session ends (`IDLE_TIMEOUT_MINUTES` on the orchestrator).

## 1. Secrets

Generate one value each for `ORCHESTRATOR_SECRET`, `WORKER_SECRET` and `ROUTER_SECRET`:

```bash
openssl rand -hex 32
```

Each service's `.env.example` lists what it needs.

## 2. Database

Apply the migrations once per deploy:

```bash
cd packages/db
DATABASE_URL="$(grep '^DATABASE_URL=' ../../apps/primary-backend/.env | cut -d= -f2-)" bunx prisma migrate deploy
```

## 3. Worker machines

Each machine runs `docker-compose.worker.yml`: the worker and code-server sharing `/tmp/bolty-worker`.
The launch template's user data is [worker-user-data.sh](worker-user-data.sh). It only needs Docker on the
image, and logs to `/var/log/bolty-setup.log` on the machine.

1. **Parameter Store** → create `/bolty/worker-env`, type SecureString, value: the contents of
   `apps/worker/.env`. Update it whenever that file changes.
2. **IAM role `bolty-worker`** (trusted entity: EC2) with this inline policy:
   ```json
   { "Version": "2012-10-17", "Statement": [
     { "Effect": "Allow", "Action": "ssm:GetParameter", "Resource": "arn:aws:ssm:eu-north-1:*:parameter/bolty/worker-env" } ] }
   ```
3. **Launch template** `vscode-base-launch-template` → new version from version 2, with IAM instance
   profile `bolty-worker` and user data = the contents of `worker-user-data.sh`.
4. **Auto scaling group** `vscode-asg` → use that version. `MinSize` 0 (the orchestrator sets the desired
   capacity), `MaxSize` = the most machines you're willing to pay for (users at once + 2 spare).

The repo must be public, or `git clone` needs a token. Machines pull their images from GitHub's registry
(see [Images](#images)); a machine that can't pull them builds them itself, which takes ~10 minutes instead of 1.

## 4. Control server

1. **IAM role `bolty-control`** (trusted entity: EC2) with this inline policy, so the orchestrator needs
   no access keys:
   ```json
   { "Version": "2012-10-17", "Statement": [ { "Effect": "Allow", "Action": [
     "autoscaling:DescribeAutoScalingGroups", "autoscaling:SetDesiredCapacity",
     "autoscaling:SetInstanceProtection", "autoscaling:TerminateInstanceInAutoScalingGroup",
     "ec2:DescribeInstances", "ec2:CreateTags" ], "Resource": "*" } ] }
   ```
2. **Security group `bolty-control`**: inbound 80 and 443 from anywhere, 22 from your IP.
3. **Launch an instance**: image `vscode-base-image` (it has Docker), type `c7i-flex.large`, security group
   `bolty-control`, IAM instance profile `bolty-control`, your key pair. In the same VPC as the workers.
4. **Metadata hop limit 2**: Instance → Actions → Instance settings → Modify instance metadata options →
   hop limit `2`. Without it, the orchestrator inside Docker can't use the instance's role.
5. **Elastic IP**: allocate one and associate it with the instance, so its address never changes.
6. **Worker security group** `sg-038a850a6c9bd0a89`: allow 9091, 8080 and 8081 from security group
   `bolty-control`, and remove every other rule for those ports (8080 from anywhere, 9091 from your IP).
   code-server has no login of its own; this rule is what keeps it private.

## 5. DNS at GoDaddy

Domain → DNS → remove the parking/forwarding records for `@`, then add:

| Type | Name | Value |
|---|---|---|
| A | `api` | the Elastic IP |
| A | `code` | the Elastic IP |
| A | `*.preview` | the Elastic IP (one record covers every project's preview) |
| A | `@` | the IP Vercel shows when you add the domain (step 7) |
| CNAME | `www` | the value Vercel shows |

Plus the records Clerk lists for its production instance (step 8).

## 6. Start the control server

SSH in, get the code and the `.env` files onto it, and start everything. Caddy gets the HTTPS
certificates for `api` and `code` by itself once the DNS records point at the server.

```bash
ssh -i key-pair-1.pem <user>@<elastic-ip>       # user is ubuntu or ec2-user, depending on the image

# Docker Compose, if the image doesn't have it (check with: docker compose version)
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# The code (git runs in a container, so it doesn't need to be installed)
sudo docker run --rm -v /opt:/opt alpine/git clone https://github.com/MK-Sindhu/ai-app-builder.git /opt/bolty
```

To update the server later, once CI has pushed the new images: `sudo docker run --rm -v /opt/bolty:/git alpine/git pull`,
then the `pull` and `up` commands below again.

From your Mac, copy the `.env` files:

```bash
scp -i key-pair-1.pem apps/primary-backend/.env <user>@<elastic-ip>:/tmp/backend.env
scp -i key-pair-1.pem worker-orchestrator/.env <user>@<elastic-ip>:/tmp/orchestrator.env
```

On the server, move them into place (`sudo mv /tmp/backend.env /opt/bolty/apps/primary-backend/.env`,
same for the orchestrator) and set these values:

| File | Setting |
|---|---|
| `apps/primary-backend/.env` | `ORCHESTRATOR_URL=http://orchestrator:9092`, `WORKER_ADDRESS=private`, `CODE_URL=https://code.ndstill.com`, `PREVIEW_DOMAIN=preview.ndstill.com`, `ROUTER_SECRET=...`, `FRONTEND_URL=https://ndstill.com,https://www.ndstill.com`, Clerk production `JWT_PUBLIC_KEY` |
| `worker-orchestrator/.env` | delete `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (the role replaces them), `WORKER_ADDRESS=private`, `IDLE_TIMEOUT_MINUTES=10` |

Then:

```bash
cd /opt/bolty
sudo docker compose -f docker-compose.control.yml pull
sudo docker compose -f docker-compose.control.yml up -d
sudo docker compose -f docker-compose.control.yml logs -f      # Ctrl+C to stop watching
```

Check: `https://api.ndstill.com/health` should answer `{"status":"ok"}`.

## 7. Frontend on Vercel

Import the GitHub repo, set the root directory to `apps/frontend`, and add the variables:
`NEXT_PUBLIC_BACKEND_URL=https://api.ndstill.com` plus the Clerk production keys. Then Settings →
Domains → add `ndstill.com` and `www.ndstill.com`, and put the records it shows into GoDaddy.

## 8. Clerk production

Clerk dashboard → **Go to prod** → create the production instance for `ndstill.com`, add the DNS records
it lists in GoDaddy, then use its keys: `pk_live_...` and `sk_live_...` in Vercel, and its JWKS public
key as `JWT_PUBLIC_KEY` on the control server. Social logins (e.g. Google) need your own OAuth
credentials in production.

## Previews

Each project's preview is `https://<projectId>.preview.ndstill.com`: the site, served by
Vite's dev server on the project's machine. Caddy gets each preview host's certificate the first time it's
opened. Let's Encrypt allows about 50 new certificates a week for the domain, which is plenty for a few users.

## Images

On every push to `main` that passes the checks, CI ([.github/workflows/ci.yml](.github/workflows/ci.yml))
pushes four images to GitHub's registry, tagged `latest` and with the commit:
`ghcr.io/mk-sindhu/ndstill-backend`, `-orchestrator`, `-worker` and `-code-server`. The servers pull
`latest`, so they need no login, but that means the images must be public: after the first push, open each
one under your GitHub profile → **Packages** → **Package settings** → **Change visibility** → Public.
They hold only what's in the public repo; `.env` files are never in them.

## Pausing between demos

From your laptop, `sh deploy/pause.sh` stops the control server and removes every worker machine;
`sh deploy/resume.sh` turns everything back on (a few minutes until new projects can start). While
paused, ndstill.com still loads but can't open projects, and you pay only for the control server's disk
and the Elastic IP. Code on the machines is lost; projects and chats stay in the database.

## Before real users

- A paid LLM key: the free tier's daily limit runs out quickly.
- `MaxSize` on the auto scaling group caps both concurrent users and your bill.
- The orchestrator must run as a single copy (it keeps its list of machines in memory).

## Local development

On your laptop, leave `CODE_URL` empty and set `WORKER_ADDRESS=public` in the backend and orchestrator.
The worker security group then also needs 9091, 8080 and 8081 from your IP while you test; remove those rules
afterwards, since code-server has no login.
