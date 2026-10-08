# CampusIQ backend setup

This backend stores demo/imported student-term rows, courses, attendance, assignments, submissions, grades, and follow-up cases in SQLite, requires sign-in, and enforces role-based access in the API. Development binds to `127.0.0.1`; production (`NODE_ENV=production`) binds to `0.0.0.0` for a hosting platform or reverse proxy.

## Requirements

- Node.js 24 or later (uses the built-in `node:sqlite` module; no package install is needed). The PowerShell scripts also look for the Codex-bundled Node runtime if `node` is not on PATH.
- Windows PowerShell.

The repository pins Node 24 in `.nvmrc`, declares `24.x` in `package.json`, and includes a Node 24 `Dockerfile`.

## First-time setup

1. Extract the dashboard ZIP to a folder you can write to. The SQLite file is created in a `data` folder the first time the server runs; it is intentionally not included in the ZIP.
2. Open PowerShell in the extracted `outputs` folder.
3. Create the first administrator account:

   ```powershell
   .\create-user.ps1 -Username campus-admin -Role admin -DisplayName "Campus Administrator"
   ```

   Enter a unique password of at least 12 characters when prompted. Passwords are stored as scrypt hashes; the password is not saved in the script or database as plain text.

4. Start the server:

   ```powershell
   .\start-campusiq.ps1
   ```

5. Open `http://127.0.0.1:4173` in your browser and sign in. The initial database is seeded from `demo-data.csv` with synthetic records.

## Faculty accounts and student assignment

Create a faculty account using the same secure prompt:

```powershell
.\create-user.ps1 -Username faculty-one -Role faculty -DisplayName "Faculty One"
```

An administrator can assign a student ID to that faculty account from PowerShell:

```powershell
$env:CAMPUSIQ_ASSIGN_STUDENT = "STU-0001"
node .\server.js assign $env:CAMPUSIQ_ASSIGN_STUDENT faculty-one
Remove-Item Env:CAMPUSIQ_ASSIGN_STUDENT
```

Repeat for each student assignment. Faculty accounts see only assigned student records and their follow-up cases. Only administrators can import or export the full cohort, access data-quality/import controls, or manage assignments. The signed-in account controls access; users cannot change their role in the dashboard.

## Student accounts and student portal

Create a student account linked to a student ID in the cohort:

```powershell
.\create-user.ps1 -Username student-0001 -Role student -StudentId STU-0001 -DisplayName "Student One"
```

Student sign-in opens a personal progress page. The student API response contains only that student's term records; it does not return cohort data, other student profiles, staff interventions, data import/export tools, or score settings. Create a separate account for each student and link the correct ID.

## Using teaching features

After the administrator signs in, use **Accounts & access** to create faculty and student accounts and disable accounts when needed. Use **Classes & attendance** to create a class, select its faculty member, and enter the enrolled student IDs. The prototype checks faculty and student timetable overlaps.

Faculty sign in with their own accounts, select **Classes & attendance**, choose the class date, mark each enrolled student Present, Absent, or Late, and save. Student portals refresh campus information every 15 seconds and show their own timetable and attendance report.

Faculty can publish coursework from **Assignments** with instructions, due date, and points. Students can submit a text response or one file up to 5 MB; faculty can grade submissions and return feedback. Assignment submissions and grades are visible only to the student and authorized class staff. Notification categories can be toggled per account in that browser.

These are local prototype workflows. They do not send email, SMS, or operating-system push notifications, and uploaded files are stored in the local SQLite database. Back up `data/campusiq.sqlite`; do not use real student records until the institution approves security, privacy, hosting, retention, and backup arrangements.

## Storage and limitations

- Imported cohorts and cases persist in `data/campusiq.sqlite` on this computer. Imported cohort replacement occurs only after the server accepts valid CSV rows.
- Sessions expire after eight hours and are held in memory; restarting the server signs users out.
- Every protected request rechecks the account in SQLite. Disabling an account immediately removes all of that user's active in-memory sessions; enabling it again does not restore old sessions.
- The API writes audit entries for sign-in/out, imports, student-list access, case updates, and assignment changes.
- This local server is for a controlled prototype only. It uses HTTP on loopback and does not provide TLS, managed backups, institutional identity, a formal security review, or a production deployment. Do not expose it to the network or use real student records until the college approves hosting, privacy, security, access, retention, and incident-response controls.
- The prototype still uses transparent score thresholds, not a trained prediction model. The assistant is local and rule-based, not a connected generative AI service. SIS/LMS integrations need approved APIs and credentials.

## Automated tests

Run:

```bash
npm test
```

The tests create a temporary SQLite directory and use only the bundled synthetic demo records. They exercise login/logout, disabled-account session revocation, role and course isolation, health readiness, reverse-proxy cookie handling, attendance, assignments, submissions, and grading. They do not modify the normal `data/` directory.

## API authorization summary

Authorization is enforced by `server.js`, not by hidden frontend controls. Every protected request reloads the enabled account and its current student link from SQLite.

| API area | Administrator | Faculty | Student |
| --- | --- | --- | --- |
| `/api/students`, `/api/campus` | All authorized campus records | Assigned students and own courses | Own student history, enrollments, attendance, assignments, and submissions only |
| `/api/cases` | Read/write all follow-up cases | Read/write assigned-student cases | Staff cases are not exposed and cannot be changed |
| `/api/users`, `/api/audit`, `/api/assign`, `/api/enroll` | Allowed | Denied | Denied |
| `/api/courses` | Create for active faculty and optionally enroll students | Create only for self; cannot enroll students through creation | Denied |
| `/api/attendance` | Any enabled course | Own courses only | Denied |
| `/api/assignments` | Any enabled course | Own courses only | Denied |
| `/api/submissions` | Grade any authorized submission | Grade own-course submissions | Submit only to assignments in enrolled courses |
| `/api/import` | Allowed | Denied | Denied |

CSV export remains a browser-side transformation of the records returned by `/api/students`; therefore it cannot expand a user's server-authorized record set. The full-cohort export controls remain administrator-only. CSV import is enforced as administrator-only in the API.

## Linux and production hosting

Set `NODE_ENV=production` so the process listens on `0.0.0.0`. `PORT` selects the listening port. Put the service behind an institution-approved HTTPS reverse proxy and mount `CAMPUSIQ_DATA_DIR` on persistent, access-controlled storage. SQLite should be used by one CampusIQ server process at a time; do not run multiple replicas against the same database file.

Create the initial administrator non-interactively before starting a local Linux service:

```bash
export CAMPUSIQ_DATA_DIR=/var/lib/campusiq
export CAMPUSIQ_ADMIN_USERNAME=campus-admin
export CAMPUSIQ_ADMIN_DISPLAY_NAME='Campus Administrator'
export CAMPUSIQ_ADMIN_PASSWORD='set-this-from-the-host-secret-store'
npm run init-admin
unset CAMPUSIQ_ADMIN_PASSWORD
```

Use the hosting platform's secret manager to inject `CAMPUSIQ_ADMIN_PASSWORD`; do not put it in a command argument, image, repository, or shell-history assignment. The command never prints the password. If any administrator already exists, it exits successfully without changing or replacing that account.

The container can be built with `docker build -t campusiq .`. Mount `/data` on persistent storage and inject the same environment variables when running the service. The normal production startup can create the first administrator from `CAMPUSIQ_ADMIN_*` when the database is empty; subsequent starts do not overwrite it. The image normally declares the unprivileged `node` user, so a mounted directory must be writable by the runtime user.

For Railway-specific volume permissions, variables, automatic administrator bootstrap, health checks, backups, and GitHub deployment steps, see [RAILWAY-DEPLOYMENT.md](RAILWAY-DEPLOYMENT.md).

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Production only | Set to `production` to bind on `0.0.0.0`; other values retain the development-only `127.0.0.1` bind. |
| `PORT` | No | HTTP port; defaults to `4173`. |
| `CAMPUSIQ_DATA_DIR` | No | Directory containing `campusiq.sqlite`; defaults to the existing project `data/` folder. Relative values are resolved from the process working directory, so an absolute path is recommended in hosting. |
| `CAMPUSIQ_TRUST_PROXY` | Only behind a TLS proxy | Use `railway` on Railway. Elsewhere, use comma-separated exact IP addresses of trusted direct reverse-proxy peers, for example `127.0.0.1,::1`. Untrusted requests cannot supply effective forwarded scheme, host, or client-IP values. |
| `CAMPUSIQ_ADMIN_USERNAME` | For `npm run init-admin` | Initial administrator username (3–60 allowed characters). |
| `CAMPUSIQ_ADMIN_DISPLAY_NAME` | No | Initial administrator display name; defaults to `Campus Administrator`. |
| `CAMPUSIQ_ADMIN_PASSWORD` | For `npm run init-admin` | Initial administrator password, at least 12 characters. Treat as a secret. |
| `CAMPUSIQ_USER_PASSWORD` | For legacy CLI account creation | Password consumed by `add-user` and `add-student`; the PowerShell helper sets and clears it around the command. |

The server does not automatically load `.env` files. `.env`, `data/`, SQLite files, `node_modules/`, `secrets/`, and common local-secret filenames are ignored by `.gitignore`; `demo-data.csv` remains explicitly allowed.

### Trusted HTTPS reverse proxy

Configure the proxy to terminate TLS, connect directly from an address listed in `CAMPUSIQ_TRUST_PROXY`, and **overwrite** (not append user input to) `X-Forwarded-Proto` and `X-Forwarded-Host`. Do not expose the CampusIQ HTTP port directly to untrusted networks. For a trusted request reporting `X-Forwarded-Proto: https`, authentication and logout cookies include `Secure`, `HttpOnly`, and `SameSite=Strict`. Forwarded headers from every other peer are ignored. Mutation requests with an `Origin` header must match the effective scheme and host.

### Health check

`GET /health` returns HTTP 200 with `status: "ok"` and `database: "ready"` only after the server can execute a SQLite readiness query. It returns HTTP 503 if that check fails. The endpoint contains no account or student data.

## Standalone demo

Opening `index.html` directly with `file://` keeps the original standalone synthetic-data demo. Sign-in, persistent backend data, and server-side role checks require starting the local server and opening its `http://127.0.0.1:4173` address.
