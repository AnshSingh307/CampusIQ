# Deploying CampusIQ to Railway

This guide keeps the existing vanilla frontend and Node.js backend in one Railway web service and persists the existing `node:sqlite` database on one Railway volume. Do not create a separate frontend service or add another database.

## Before deploying

1. Commit this project to a private GitHub repository. Do not commit `.env`, SQLite files, passwords, or exported student data.
2. Keep the service at **one replica in one region**. A single SQLite file must not be shared by horizontally scaled application replicas.
3. Continue using synthetic data until institutional privacy, retention, access, and incident-response requirements are approved.

Railway detects the repository `Dockerfile` automatically. The image uses the official `node:24-bookworm-slim` runtime and starts with the existing `npm start` command, which remains `node server.js`.

## Create the Railway service from GitHub

1. In Railway, create a new project and choose **Deploy from GitHub repo**.
2. Select the private CampusIQ repository and the branch intended for deployment.
3. Keep the frontend and backend in this one service. Do not add a separate static-site service.
4. Before generating a public domain, configure the volume and variables below.

Connecting a GitHub repository enables automatic builds for future commits on the selected branch. Review staged Railway changes before applying them.

## Attach persistent SQLite storage

1. Add a Railway volume to the CampusIQ service.
2. Set its mount path to exactly `/data`.
3. Set `CAMPUSIQ_DATA_DIR=/data` in the service variables.
4. Set `RAILWAY_RUN_UID=0`. Railway volumes are mounted as `root`; this setting makes the mounted directory writable at runtime even though the image normally declares the unprivileged `node` user.

Railway mounts volumes only when the service container starts. Do not put database initialization in a Docker build command or Railway pre-deploy command. CampusIQ creates `/data/campusiq.sqlite`, its tables, demo seed, and initial administrator during normal server startup after the volume is available.

## Configure variables and secrets

Add these service variables in Railway:

| Variable | Value | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `production` | Enables the production bind address and secure cookies. |
| `CAMPUSIQ_DATA_DIR` | `/data` | Stores SQLite on the mounted volume. |
| `CAMPUSIQ_TRUST_PROXY` | `railway` | Trusts Railway's documented forwarding headers only inside a Railway runtime and only on requests carrying Railway's edge marker. |
| `RAILWAY_RUN_UID` | `0` | Allows runtime writes to the root-owned Railway volume. |
| `CAMPUSIQ_ADMIN_USERNAME` | Initial administrator username | Used only if the database has no administrator. |
| `CAMPUSIQ_ADMIN_DISPLAY_NAME` | Initial administrator display name | Optional; defaults to `Campus Administrator`. |
| `CAMPUSIQ_ADMIN_PASSWORD` | A unique password of at least 12 characters | One-time bootstrap secret. Seal this variable in Railway. |

Do not manually set `PORT`; Railway injects it. Never place the administrator password in GitHub, the Dockerfile, `railway.json`, build arguments, or command-line arguments.

On first startup, CampusIQ creates an administrator only when none exists. It hashes the password with scrypt, removes the password from the Node process environment, and logs only that initialization succeeded. Later starts do not modify the existing administrator, even if bootstrap variables are still present.

After the first healthy deployment and successful administrator login, remove the three `CAMPUSIQ_ADMIN_*` variables from Railway. An existing administrator does not need them. If the volume is ever empty or missing, production startup then fails instead of silently creating an unknown account.

## Health check and networking

`railway.json` configures `/health` as the deployment healthcheck with a 60-second timeout. The endpoint returns HTTP 200 only when SQLite answers a readiness query. Railway uses the injected `PORT`, and `server.js` binds to `0.0.0.0` in production.

Railway terminates public TLS and forwards the original scheme and host. In Railway mode, CampusIQ accepts `X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Real-IP` only when Railway runtime variables are present and the request carries a valid-looking `X-Railway-Edge` marker, a Railway request ID, and the documented HTTPS forwarded scheme. Production session cookies are always `Secure`, `HttpOnly`, and `SameSite=Strict`; mutation requests also enforce same-origin scheme and host checks.

After the volume, variables, and health check are ready, generate a Railway public domain from the service Networking settings. Do not add a TCP proxy for this HTTP service.

## Backups

Open the service volume's **Backups** tab and enable scheduled backups. A practical starting policy is daily plus weekly backups; add monthly retention if required by the institution. Also create a manual backup before schema changes or large CSV imports.

Test restoration into a separate non-production environment. A backup policy is incomplete until a restore has been verified. Railway health checks gate deployments but are not continuous uptime monitoring.

## Required pre-launch checks

- Confirm the volume is mounted at `/data` and the service has exactly one replica.
- Confirm `/health` is green before generating or using the public domain.
- Confirm the initial administrator can sign in, then remove the bootstrap variables.
- Confirm disabling a test account invalidates its existing browser session.
- Confirm a restart preserves accounts, courses, attendance, assignments, submissions, and grades.
- Confirm Railway volume backups are scheduled and a restore procedure is documented.
- Confirm no real student information appears in Git history, build logs, deployment logs, or demo exports.

## Startup failures

CampusIQ intentionally exits with a clear error when Railway production configuration is unsafe or incomplete, including a missing volume, a data directory that does not match the mounted volume, missing Railway proxy mode, or missing initial-administrator secrets on an empty database. Fix the configuration rather than bypassing these checks.
