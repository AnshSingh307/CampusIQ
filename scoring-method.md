# CampusIQ: score and intervention notes

## What the prototype demonstrates

CampusIQ combines academic progress, attendance, LMS activity, engagement, and placement readiness in one student view. The light-themed prototype includes cohort overview, risk queues, targeted segments, term trends, student profiles with score contributions, search and filters, CSV import/template/export, configurable weights, and a browser-local follow-up queue with owners, due dates, status, and check-in notes.

The default cohort contains 512 synthetic students across four terms. The matching [`demo-data.csv`](demo-data.csv) file contains all 2,048 student-term rows and can be imported or opened in a spreadsheet. These records are only illustrative. No campus systems are connected, no real student data was provided, and no trained predictive model is used. In standalone `file://` mode the Administrator/Faculty selector is presentation-only and follow-up records are browser-local. The optional local backend adds sign-in, SQLite persistence, and server-side admin/assigned-faculty API scope; it is not an institution-hosted production service.

## Student Success Score

The score is a 0–100 weighted summary of current support indicators. Default weights can be changed from Score settings:

| Component | Weight | Example inputs |
|---|---:|---|
| Academic progress | 35% | CGPA scaled from 0–10 to 0–100 |
| Attendance | 20% | Overall attendance percentage |
| LMS participation | 15% | LMS activity / completion score |
| Engagement | 10% | Events, clubs, hackathons, certifications |
| Placement readiness | 20% | Placement readiness, or mean of aptitude, coding, and interview scores |

The score is the weighted mean of available components. If an indicator is missing, its weight is excluded and the remaining weights are renormalized. Profile details show each available indicator’s weighted point contribution. Higher scores represent stronger current indicators; the score is a support signal, not a probability of success.

## Suggestions and assistant

The overview generates student-specific next-step suggestions from the academic, attendance, placement, and LMS rules above. Selecting a suggestion opens that student’s profile and puts the proposed plan into the editable follow-up field. The floating Campus assistant answers basic cohort and student questions from the currently selected view. Both features run locally from the loaded records using transparent rules; they do not call a generative AI service or replace staff judgment.

## Charts

The overview includes a cohort trend line, risk-band donut, CGPA distribution, attendance-versus-score scatter plot, placement readiness averages by program, and a risk-to-segment-to-follow-up flow diagram. These charts refresh with the selected cohort and use imported CSV data when available. Hovering over scatter points and flow connections reveals the underlying student or count. Flow status is based on locally saved follow-up cases.

## Risk flags and student segments

Composite scores below 50 are **High**, 50–64 are **Watch**, and scores of 65 or more are **Low**. An academic flag is raised when CGPA is below 6.0 or backlogs are at least two. A placement flag is raised when readiness is below 55. Other risk counts include attendance below 75%; these flags can overlap.

Segments help identify students who may benefit from different offers of support: strong academic indicators with low placement readiness; CGPA/backlog concerns; and high engagement alongside lower academic indicators. Segment membership is rule-based and is not a label about a student’s potential.

## Data and local behavior

For the standalone demo, open `index.html` in a current browser. For sign-in and persistent local storage, follow `BACKEND-SETUP.md` and open `http://127.0.0.1:4173`. Download the CSV template for one row per student per term. Required fields are `student_id`, `name`, `term`, and `cgpa`; optional fields include `program`, `year`, `backlogs`, `attendance`, `lms`, `engagement`, `placement_readiness`, `aptitude`, `coding`, `interview`, and `updated_at`. CGPA must be 0–10, backlogs a non-negative integer, year a positive integer, and other score values 0–100. Duplicate student IDs across terms are expected; duplicate student/term pairs and rows with invalid required or numeric fields are skipped with row-level notes. Missing score components are counted and shown in the profile; their weights are renormalized. Data & quality shows missing/invalid update timestamps and the latest supplied timestamp. It does not label data fresh or stale because the college has not set a freshness threshold. Standalone imports last for the page session; backend imports persist in SQLite. Follow-up cases are browser-local in standalone mode and persistent in backend mode.

The term selector filters the cohort view. “All terms · latest per student” presents each student’s latest record. Trajectory compares each student’s latest recorded score with their preceding term. The follow-up queue’s observed score change compares the current score with the score captured when a follow-up was first saved; it is descriptive and does not establish an intervention effect.

## Responsible use and next steps

Staff should verify data freshness and context and speak with a student before taking action. Do not use this score for grading, discipline, admissions, or other consequential decisions. A live system would need governed source integrations, reliable identifier mapping, role-based access, privacy and retention rules, score validation with campus stakeholders, and monitoring for false positives and unequal errors. Any predictive model should be evaluated against transparent baselines and monitored before use.
