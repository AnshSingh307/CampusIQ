# CampusIQ pilot blueprint

**Status:** Draft for college review. This is a proposed pilot specification, not an approved institutional policy. The standalone dashboard uses synthetic data and browser-local follow-up records. An optional local backend now supports SQLite persistence and server-side admin/assigned-faculty API scope for testing; it is not an institution-hosted production service.

## 1. Pilot goal

Help authorized staff spot students who may benefit from a timely conversation, understand the indicators behind the flag, and record a follow-up. The score and flags are triage aids. They must not determine grades, admissions, discipline, financial aid, or other consequential decisions.

## 2. Minimum student-term data contract

Use one row per student per academic term. Preserve the institution’s source values and timestamps; do not silently substitute missing values with zero.

| Field | Requirement | Type and accepted values | Use |
|---|---|---|---|
| `student_id` | Required | Stable institutional ID; restrict access | Join records and route authorized support |
| `name` | Required for staff view | Text | Display to authorized staff |
| `term` | Required | Institution-approved term code, consistently ordered | Cohort selection and trajectory |
| `program` | Required for pilot analysis | Approved program code/name | Filters and group-level review |
| `year` | Recommended | Integer 1–N, mapped to institution’s year convention | Context and grouping |
| `cgpa` | Required for current academic flag/score | Number 0–10, unless the college approves another scale | Academic score input; normalize to 0–100 |
| `backlogs` | Recommended | Non-negative integer | Separate academic review flag |
| `attendance` | Recommended | 0–100 percent | Score input and low-attendance flag |
| `lms` | Optional | 0–100 normalized activity/completion measure | Score input; define source and time window |
| `engagement` | Optional | 0–100 normalized measure | Score input; document what activities count |
| `aptitude`, `coding`, `interview` | Optional | Each 0–100 | Components used to derive placement readiness if no composite is supplied |
| `placement_readiness` | Optional | 0–100 | Score input; define whether this is assessed or derived |
| `updated_at` | Required for operational data | ISO 8601 date/time | Freshness checks and import audit |

### Import rules proposed for the pilot

- Reject rows without an ID, name, term, or valid CGPA; reject duplicate student/term pairs.
- Accept repeated IDs across different terms. Validate CGPA against the approved scale and percentage measures against 0–100.
- Keep missing values explicitly missing. The current prototype renormalizes the remaining score weights, but the pilot should display a missing-data warning and agree on a minimum completeness rule.
- Record source system, extraction time, and dataset version in the import audit, even if those fields are held in an import manifest rather than every row.
- Agree on a freshness threshold with data owners before showing “current” or “stale” labels. The prototype currently does not enforce a freshness threshold.

## 3. Score and risk definitions currently in the prototype

The current 0–100 score is a configurable weighted mean of available indicators:

| Indicator | Default weight | Current normalization |
|---|---:|---|
| Academic | 35% | CGPA × 10 |
| Attendance | 20% | 0–100 |
| LMS | 15% | 0–100 |
| Engagement | 10% | 0–100 |
| Placement readiness | 20% | 0–100; otherwise mean of aptitude, coding, and interview when all three are supplied |

Current review thresholds are **High** below 50, **Watch** from 50 to below 65, and **Low** at 65 or above. Separate flags are academic review when CGPA is below 6.0 or backlogs are at least 2, placement readiness below 55, and attendance below 75%. Flags can overlap.

These are the demo’s rules, not validated college thresholds. Before a pilot, faculty and student-support leads should approve or replace each cutoff, the time window for each indicator, and the minimum data completeness needed to display a score. Keep the rules as the baseline if a predictive model is evaluated later; do not call these thresholds a prediction model.

## 4. Proposed access matrix

Enforce permissions on the server and data API; hiding a page or changing the “Faculty” selector is not access control. Assign a human owner for each account and remove access when their role changes.

| Role | Proposed access | Needs college approval |
|---|---|---|
| Student-success administrator | Cohort aggregates, authorized student profiles, case assignment, approved exports, data-quality reports | Who qualifies; which exports are allowed |
| Faculty/advisor | Only assigned students or approved course/program scope; profile indicators; own follow-up cases | Assignment source and scope; whether program leads can see all program records |
| Analyst / institutional research | Pseudonymized row-level data for approved analysis; aggregate reporting | Whether row-level access is required and permitted |
| Student | No access in this staff prototype | Whether a future student-facing view is in scope |

Require institutional sign-in, least-privilege permissions, audit records for profile access and exports, encrypted transport/storage, retention/deletion rules, and a correction route for students before real student data is used. The browser-local storage in the prototype is not suitable for real student records.

## 5. Proposed intervention workflow

1. Staff reviews the flags, indicator freshness, and missing-data notes.
2. Staff opens the student profile and checks context with the student.
3. Staff selects or edits a support suggestion, assigns an owner, and sets a follow-up date.
4. Staff records contact attempts, student response, agreed support, and next check-in.
5. Authorized leads review workload, overdue cases, and aggregate outcomes.

A score change after contact is descriptive, not proof that the intervention caused it. Define a separate evaluation plan before reporting intervention effectiveness.

## 6. Predictive model gate

Do not describe the current rule score as machine learning or future-risk prediction. Before any predictive pilot:

1. Choose a specific outcome and prediction window with the college (for example, a defined course outcome by term end).
2. Obtain approved historical records with consistent, time-stamped features and outcome labels.
3. Compare a simple interpretable baseline with the current rules using a time-based holdout, not a random split alone.
4. Review calibration, false-positive and false-negative rates, and performance across programs and student groups with institutional stakeholders.
5. Keep human review, document model version and limitations, monitor drift, and provide a correction/appeal path.

## 7. Pilot acceptance checklist

- [ ] Data owner approves the field definitions, source systems, refresh cadence, and identifier mapping.
- [ ] Faculty/student-support leads approve thresholds, definitions, and suggested actions.
- [ ] Privacy/security/legal reviewers approve purpose, access, retention, and permitted exports.
- [ ] The institution provides a small, approved, pseudonymized test file for join and quality checks.
- [ ] Staff roles and assigned-student scope are tested at the server/API layer.
- [ ] CSV import, data-quality feedback, profile explanation, case workflow, and exports are reviewed with representative staff.
- [ ] A named owner handles incorrect data and student correction requests.

## Decisions required from the college

1. Which system is authoritative for student ID, program, term, and enrollment status?
2. Which attendance/LMS/engagement time windows and normalization rules should be used?
3. Who can see each student profile and who may export data?
4. Which support outcome should a future prediction target, and what historical period is approved for evaluation?
5. What freshness, completeness, retention, and correction standards apply?
