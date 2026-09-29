# ndstill

**Websites, from a sentence.** Describe a site in plain words. ndstill writes the React code, installs what
it needs, and shows the site running live while it builds, with a full VS Code editor on the same files.

Live at **[ndstill.com](https://ndstill.com)**. To save AWS costs it's paused between demos, so the page
loads but projects may not open until it's switched on.

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Running locally](#running-locally)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Operating it](#operating-it)
- [Limitations](#limitations)
- [Next steps](#next-steps)

## What it does

- **Build from a description.** Type what you want, or pick a starter idea (portfolio, café, store, blog,
  dashboard…), and ndstill writes a Vite + React 19 + TypeScript + Tailwind CSS v4 project.
- **Watch it build.** Each file written and command run appears in the chat as it happens, along with the
  model's explanation of what it built.
- **Live preview.** Every project has its own address, `https://<projectId>.preview.ndstill.com`, served
  by Vite's dev server. It updates by itself as files change, and can be shown at desktop or phone size or
  opened in a new tab.
- **Edit the code yourself.** A full VS Code (code-server) in the browser, with a terminal, on the same
  folder the model writes to.
- **Keep iterating.** Ask for changes in follow-up messages. Stop a build partway, or retry one that failed.
- **Manage projects.** A list of your projects; close one to free its machine, or delete it.

## How it works

```
Browser ──HTTPS──> ndstill.com                      frontend (Vercel)
Browser ──HTTPS──> api.ndstill.com                  ┐
Browser ──HTTPS──> code.ndstill.com/<projectId>/    │ control server (EC2): Caddy
Browser ──HTTPS──> <projectId>.preview.ndstill.com  ┘
                                                       ├──> backend ──> orchestrator ──> auto scaling group
                                                       │       └──> worker on the project's machine (:9091)
                                                       └──> code-server (:8080) or the site preview (:8081) on
                                                            the project's machine, once the backend checks the
                                                            user owns the project
```

| Piece | Runs on | What it does |
|---|---|---|
| Frontend ([apps/frontend](apps/frontend)) | Vercel | Next.js app: landing page, projects list, and the workspace (chat, preview, editor). Sign-in with Clerk. |
| Backend ([apps/primary-backend](apps/primary-backend)) | Control server | Express API. Stores projects, messages and build steps; gets each project a machine; forwards messages to that machine's worker; decides who may open which editor and preview. |
| Orchestrator ([worker-orchestrator](worker-orchestrator)) | Control server | Manages the AWS Auto Scaling group: keeps spare machines ready, gives one to each project, releases idle ones. |
| Caddy ([deploy/Caddyfile](deploy/Caddyfile)) | Control server | HTTPS for every domain (Let's Encrypt) and the router that sends editor and preview traffic to the right machine. |
| Worker ([apps/worker](apps/worker)) | Each project machine | Talks to the model, writes the files, runs the commands and records each step. Also runs Vite's dev server for the preview. |
| code-server ([apps/code-server](apps/code-server)) | Each project machine | VS Code in the browser, opened on the project's folder. |
| PostgreSQL | Neon | Projects, messages and build steps. |

### What happens when you send a message

1. The frontend sends the message to the backend with the user's Clerk token.
2. The backend checks the user owns the project and asks the orchestrator for the project's machine. The
   first time, the orchestrator hands over one of the spare machines. The backend then forwards the message
   to that machine's worker. If a build is already running there, it answers 409 and the chat says so.
3. The worker saves the message, adds the system prompt and the conversation so far, and streams a reply
   from the model (any OpenAI-compatible chat API).
4. While the reply streams, a parser picks out the `<boltAction type="file">` and `<boltAction type="shell">`
   blocks. Files are written into the project folder, and commands such as `npm install` run one at a time.
   Commands that would start a dev server are skipped, since Vite is already running. Each step is saved.
5. The frontend asks for new messages and steps every 3 seconds and shows them as a timeline. Vite notices
   the changed files, so the preview updates on its own.
6. **Stop** cancels the model's request and skips the remaining steps.

### Machines

- Each open project gets its own EC2 machine from the Auto Scaling group `vscode-asg`. Every machine runs
  [docker-compose.worker.yml](docker-compose.worker.yml): the worker and code-server, sharing the project
  folder through a volume.
- The orchestrator keeps **2 spare machines** on top of the ones in use, up to the group's `MaxSize`. A new
  machine only counts as ready once the worker has installed the website template and code-server answers.
- A machine given to a project is tagged with its project id and protected from scale-in, so the orchestrator
  can pick up where it left off after a restart.
- While a project's page is open and visible, the frontend checks in every minute. After
  `IDLE_TIMEOUT_MINUTES` (10) without a check-in, because the tab was closed or left in the background, the
  machine is terminated. Reopening the project later gets a fresh machine starting from the template; the
  chat history is kept.
- **Close project** releases the machine right away. **Delete** also removes the project and its history.
- When every machine is busy, the backend answers 503. The frontend tries again every 5 seconds while the group
  starts another machine.

### The router and security

- Only the control server is reachable from the internet (ports 80 and 443). Worker machines accept ports 9091,
  8080 and 8081 from the control server only, so code-server needs no password of its own.
- To open an editor or preview, the backend gives the frontend a link with a signed token that expires after 2
  minutes. Caddy asks the backend about every request (`forward_auth`). On the first visit the token is swapped
  for a 12-hour cookie that only works for that project. Caddy then proxies to the machine address the backend
  returns, and any such address sent by the browser is removed first.
- Preview certificates are requested on demand, and only for ids of real projects.
- The backend talks to the orchestrator and the workers with shared secrets, compared in constant time. User
  requests are checked against Clerk's RS256 public key.
- Commands the model runs get only `PATH` and `HOME`, never the worker's secrets. code-server gets no
  environment file at all, since users have a terminal there.

## Tech stack

| Area | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS v4, shadcn/ui, Clerk |
| Backend | Bun, Express 5, Prisma, PostgreSQL on Neon |
| AI | Any OpenAI-compatible chat API through the `openai` SDK. Live: Cerebras `gpt-oss-120b` |
| Generated sites | Vite 6, React 19, TypeScript, Tailwind CSS v4 |
| Editor | code-server 4.96 |
| Infrastructure | AWS EC2 and Auto Scaling, SSM Parameter Store, IAM roles, Caddy, Docker Compose |
| CI/CD | GitHub Actions, GitHub Container Registry (ghcr.io), Vercel |
| Monorepo | Bun workspaces, Turborepo |

## Repository layout

```
apps/
  frontend/              Next.js app (deployed on Vercel)
  primary-backend/       API, plus the router's access checks
  worker/                Runs on each project machine: model, files, commands, Vite preview
  code-server/           Dockerfile for VS Code in the browser
packages/
  db/                    Prisma schema, migrations and client
  common/                Shared Express middleware (Clerk tokens, shared secrets)
  typescript-config/     Shared tsconfig
  eslint-config/         Shared ESLint config
worker-orchestrator/     Machine management (its own package and lockfile)
templates/website/       The starter project every machine begins with
deploy/                  Caddyfile, pause.sh, resume.sh
docker-compose.control.yml   Control server: Caddy, backend, orchestrator
docker-compose.worker.yml    Each worker machine: worker, code-server
worker-user-data.sh      Launch template user data that sets up a worker machine
DEPLOY.md                Step-by-step deployment guide
```

Ports: frontend 3000, backend 9090, worker 9091, orchestrator 9092, code-server 8080, preview 8081.

## Running locally

The frontend, backend and orchestrator run on your laptop. The project machines still run on AWS, since
projects get their machines from the Auto Scaling group.

**You need:** [Bun](https://bun.sh) 1.4 or later, a PostgreSQL database (Neon's free plan works), a Clerk
application (development keys), an API key for an OpenAI-compatible model, and an AWS account with the
Auto Scaling group from [DEPLOY.md](DEPLOY.md).

```bash
# Dependencies (the orchestrator is a separate package)
bun install
(cd worker-orchestrator && bun install)

# Settings: copy each example and fill it in (see Configuration below)
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/primary-backend/.env.example apps/primary-backend/.env
cp apps/worker/.env.example apps/worker/.env
cp worker-orchestrator/.env.example worker-orchestrator/.env

# Database tables and the Prisma client (DATABASE_URL must be set, e.g. in packages/db/.env)
cd packages/db && bun run migrate:deploy && bun run generate && cd ../..

# Each in its own terminal
cd worker-orchestrator && bun index.ts        # http://localhost:9092
cd apps/primary-backend && bun index.ts       # http://localhost:9090
cd apps/frontend && bun run dev               # http://localhost:3000
```

For local development, in the backend and orchestrator `.env` set `WORKER_ADDRESS=public`, and leave
`CODE_URL` and `PREVIEW_DOMAIN` empty. The orchestrator needs AWS access keys. The worker security group must
allow ports 9091, 8080 and 8081 from your IP while you test. Remove those rules afterwards, because
code-server has no login.

**Checks** (the same ones CI runs):

```bash
bun run check-types                          # every workspace
(cd apps/worker && bun test)                 # worker tests
(cd worker-orchestrator && bun run check-types)
```

## Configuration

Each service reads a `.env` file; the `.env.example` next to it lists every setting. Never commit a `.env`.
On AWS, the worker's settings live in SSM Parameter Store as `/bolty/worker-env`, which each machine fetches
when it boots.

**Frontend** ([apps/frontend/.env.example](apps/frontend/.env.example))

| Setting | Purpose |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | The backend, e.g. `https://api.ndstill.com` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk keys |

**Backend** ([apps/primary-backend/.env.example](apps/primary-backend/.env.example))

| Setting | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL. With Neon, add `&connect_timeout=15` so a sleeping database has time to wake |
| `JWT_PUBLIC_KEY` | Clerk's JWT public key (PEM), to check users' tokens |
| `FRONTEND_URL` | Allowed origins for CORS, comma separated |
| `ORCHESTRATOR_URL`, `ORCHESTRATOR_SECRET` | Where the orchestrator is, and the secret shared with it |
| `WORKER_SECRET` | Secret shared with the workers |
| `WORKER_ADDRESS` | `private` on AWS, `public` on your laptop |
| `CODE_URL`, `PREVIEW_DOMAIN`, `ROUTER_SECRET` | Editor and preview addresses, and the key that signs router tokens |

**Worker** ([apps/worker/.env.example](apps/worker/.env.example))

| Setting | Purpose |
|---|---|
| `DATABASE_URL` | Same database as the backend |
| `WORKER_SECRET` | Same value as in the backend |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | The model. Live: `https://api.cerebras.ai/v1` with `gpt-oss-120b` |
| `LLM_MAX_TOKENS` | Longest reply in tokens (default 32000). Too low and replies stop partway |
| `LLM_TIMEOUT_SECONDS` | How long to wait for the model to start answering (default 120) |
| `LLM_FALLBACK_MODEL`, `LLM_FALLBACK_BASE_URL`, `LLM_FALLBACK_API_KEY` | Optional second model for when the first is busy, rate-limited or gone |

**Orchestrator** ([worker-orchestrator/.env.example](worker-orchestrator/.env.example))

| Setting | Purpose |
|---|---|
| `AWS_REGION`, `ASG_NAME` | The Auto Scaling group (defaults `eu-north-1`, `vscode-asg`) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Laptop only. On AWS the server's IAM role is used |
| `ORCHESTRATOR_SECRET` | Same value as in the backend |
| `WORKER_ADDRESS` | `private` on AWS, `public` on your laptop |
| `IDLE_TIMEOUT_MINUTES` | Release a project's machine after this long without a check-in (live: 10). Empty keeps machines |

## Deployment

[DEPLOY.md](DEPLOY.md) is the full step-by-step guide: secrets, database, worker machines, control server,
DNS at GoDaddy, Vercel and Clerk production. In short:

- **Frontend:** Vercel builds `apps/frontend` on every push to `main`.
- **Images:** on every push to `main` that passes the checks, [GitHub Actions](.github/workflows/ci.yml) builds
  four images and pushes them to GitHub's registry, tagged `latest` and with the commit:
  `ghcr.io/mk-sindhu/ndstill-backend`, `ndstill-orchestrator`, `ndstill-worker` and `ndstill-code-server`.
- **Worker machines:** new machines pull the latest worker and code-server images when they boot
  ([worker-user-data.sh](worker-user-data.sh)), so a machine is ready in a couple of minutes. Machines already
  running keep their version until they're released.
- **Control server:** after CI goes green, update it with:

  ```bash
  cd /opt/bolty
  sudo docker run --rm -v /opt/bolty:/git alpine/git pull
  sudo docker compose -f docker-compose.control.yml pull
  sudo docker compose -f docker-compose.control.yml up -d
  ```

## Operating it

### Pause and resume

The deployment is off between demos. From your laptop, in this folder (needs the AWS CLI):

```bash
sh deploy/pause.sh     # stops the control server and removes every worker machine
sh deploy/resume.sh    # starts it all again; run it 5 to 10 minutes before a demo
```

While paused, you only pay for the control server's disk and its Elastic IP, a few dollars a month.
ndstill.com still loads, but projects can't open. Projects and chats stay in the database; code on the
machines is lost.

### Logs

```bash
# Control server
cd /opt/bolty
sudo docker compose -f docker-compose.control.yml logs -f backend orchestrator

# A worker machine
sudo cat /var/log/bolty-setup.log      # what happened when it booted
sudo docker logs -f bolty-worker-1     # the worker: prompts, model, files, commands

# Why machines started or stopped (from your laptop)
aws autoscaling describe-scaling-activities --auto-scaling-group-name vscode-asg --max-items 5 \
  --query 'Activities[].[StartTime,Cause]' --output text
```

### Troubleshooting

| What you see | Likely cause | What to do |
|---|---|---|
| "No machine is free" for a while | Every machine is in use, or new ones are still starting | Wait a couple of minutes, or raise the group's `MaxSize` |
| Error 500 when sending; worker log says `Can't reach database server` | Neon's free database was asleep and took too long to wake | Add `&connect_timeout=15` to `DATABASE_URL` in the backend and in `/bolty/worker-env` |
| A project's machine disappeared | Its tab was closed or in the background for 10 minutes | Reopen the project; raise `IDLE_TIMEOUT_MINUTES` if needed |
| The preview says "Starting" for a long time | The machine is still booting or installing the template | Check `bolty-setup.log` and the worker's logs on the machine |
| Builds fail with the model busy, rate-limited or not found | The provider is overloaded, the free quota ran out, or the model was retired | Change `LLM_MODEL` (or add a fallback) in `/bolty/worker-env`, then start fresh machines |
| A new machine takes about 10 minutes | It couldn't pull the images and built them itself | Make sure the four `ndstill-*` packages on GitHub are public |

## Limitations

- **Project code isn't saved anywhere else.** It lives only on the project's machine, so it's gone when the
  machine is released. The chat history is kept.
- **Releasing doesn't know about running builds.** A build left running in a background tab for more than
  10 minutes can be cut off.
- **One orchestrator at a time.** It keeps its list of machines in memory.
- **The whole conversation is sent to the model each time.** Very long projects can outgrow the model's
  context window.
- **Front-end sites only.** Generated sites keep their data in the browser; there's no backend or database for
  them.

## Next steps

- Back up project files (for example to S3) so a project can continue on a new machine.
- Never release a machine while it's building.
- Trim or summarize long conversations before sending them to the model.
- Collaborative editing of the same project.

## Credits

Started from the "bolty" app builder project by 100xdevs, then
extended into ndstill: machine orchestration on AWS, the HTTPS router, live previews, a model-agnostic worker,
the redesigned interface, CI/CD and pause/resume.
