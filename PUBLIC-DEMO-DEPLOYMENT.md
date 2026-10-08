# CampusIQ public demo on Render

This target is an isolated, read-only static demonstration. It does not start `server.js`, open SQLite, create accounts, or expose any `/api/*` route. The original private Node.js application remains available through `npm start` with its existing authentication and database protections.

## Local build

Use Node.js 24 or later:

```powershell
$env:PUBLIC_DEMO_MODE = 'true'
npm run build:public-demo
```

Only deploy the generated `dist/public-demo/` directory. It contains:

- `index.html`
- `prototype.js`
- `premium-demo.css`
- `premium-demo.js`
- `campusiq-config.js`

The build fails unless `PUBLIC_DEMO_MODE=true`. The generated `index.html` has no login form. The generated configuration selects a deterministic in-browser synthetic dataset, blocks private API calls, and keeps private write controls hidden or simulated. The static bundle does not include the project CSV or any SQLite file.

Visitors can switch among three complete demo views without credentials:

- **Administrator** — cohort analytics, risk scoring, charts, student records, recommendations, and interventions.
- **Faculty** — an eight-student synthetic roster, timetable, attendance, assignments, grading examples, and support suggestions.
- **Student** — one synthetic profile with progress, Success Score, timetable, attendance, coursework, submissions, and grades.

Faculty attendance/grading actions and the student submission action are browser-only simulations. They are not permanently saved online.

## Render dashboard settings

Create a **Static Site**, not a Web Service, and connect the CampusIQ GitHub repository.

| Setting | Value |
| --- | --- |
| Branch | `main` (or the branch containing these changes) |
| Root Directory | Leave blank when this folder is the repository root |
| Build Command | `npm run build:public-demo` |
| Publish Directory | `dist/public-demo` |
| Environment variable | `PUBLIC_DEMO_MODE=true` |
| Start Command | None; static sites do not start `server.js` |

`render.yaml` contains the same static-site configuration and security headers. Do not add `CAMPUSIQ_DATA_DIR`, database volumes, administrator usernames, or administrator passwords to this static site; none are used.

## Private mode remains separate

Run the authenticated application with `npm start`. Its checked-in `campusiq-config.js` keeps public demo mode off. `server.js` deliberately refuses to start if `PUBLIC_DEMO_MODE=true`, preventing an accidental combination of the public UI and private APIs.
