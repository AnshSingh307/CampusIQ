# 🎓 CampusIQ
### Smart Campus Analytics & Student Success Platform

**Transforming student data into actionable insights for better academic outcomes.**

CampusIQ is a smart campus analytics platform developed for the **KPMG Smart Campus Analytics Hackathon Challenge**. It helps educational institutions analyze academic performance, monitor student engagement, identify students requiring support, and make informed decisions through interactive dashboards and explainable analytics.

## 🌐 Live Demo

**Hosted on:** Render

**Live Website:** [CampusIQ Live Demo](PASTE_YOUR_RENDER_URL_HERE)

The public demonstration is accessible without login credentials and uses synthetic student data.

## 🎯 Problem Statement

Educational institutions generate large amounts of student data through academics, attendance, examinations, LMS activity, engagement, and placement preparation.

However, this information is often stored across disconnected systems, making it difficult to identify students requiring early intervention.

CampusIQ addresses this problem by bringing multiple student-success indicators into a unified analytics platform.

## ✨ Key Features

### 📊 Interactive Analytics Dashboard
- Student Success Score overview
- Academic performance visualizations
- Attendance and engagement analytics
- Performance trends across academic terms
- Interactive charts, tables, and filters

### 🚨 Student Risk Identification
- High-risk, watch-list, and low-risk classifications
- Academic performance monitoring
- Attendance-related concerns
- Placement-readiness indicators
- Explainable risk assessment

### 🎯 Student Success Scoring

CampusIQ calculates a weighted Student Success Score using multiple academic and engagement indicators.

| Indicator | Weight |
|---|---|
| Academic Performance | 35% |
| Attendance | 20% |
| LMS Participation | 15% |
| Student Engagement | 10% |
| Placement Readiness | 20% |
| **Total** | **100%** |

Available indicators are combined into a normalized score from 0 to 100. Missing components are excluded and the remaining weights are adjusted proportionally.

### 💡 Personalized Intervention Recommendations
- Academic support suggestions
- Attendance improvement recommendations
- Placement preparation guidance
- Student follow-up and intervention tracking

### 🤖 Campus Analytics Assistant
A built-in, rule-based assistant that helps users explore student analytics, summarize performance metrics, and identify relevant academic concerns.

*The current assistant uses predefined analytical rules rather than a connected generative AI model.*

### 📁 Student Data Management
- CSV-based data import
- Student record filtering and searching
- Data-quality checks
- Export functionality in supported application modes
- Synthetic demonstration dataset

### 🏫 Academic Management Prototype

The project includes backend implementations for:
- Administrator, faculty, and student accounts
- Course scheduling
- Attendance management
- Assignments and submissions
- Grading and feedback
- SQLite data persistence

These backend capabilities require appropriate server configuration and are not necessarily enabled in the public no-login demo.

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript |
| Backend | Node.js |
| Database | SQLite |
| Analytics | JavaScript-based scoring and visualization |
| Data Format | CSV, JSON |
| Hosting | Render |
| Version Control | Git & GitHub |

## 🏗️ System Architecture

```text
CampusIQ
│
├── Frontend
│   ├── HTML/CSS Dashboard
│   ├── JavaScript Analytics
│   ├── Interactive Charts
│   └── Rule-Based Assistant
│
├── Backend (Local Pilot)
│   ├── Node.js Server
│   ├── REST API
│   ├── Authentication
│   └── Academic Management
│
└── Data
    ├── SQLite Database
    └── Synthetic CSV Dataset
```

## 📂 Project Structure

```text
CampusIQ/
├── index.html
├── prototype.js
├── server.js
├── package.json
├── demo-data.csv
├── create-user.ps1
├── start-campusiq.ps1
├── BACKEND-SETUP.md
├── scoring-method.md
├── pilot-blueprint.md
└── README.md
```
## 📈 Dataset

CampusIQ includes a synthetic demonstration dataset containing:

- 512 students
- Four academic terms
- 2,048 student-term records
- Multiple academic programs
- Academic, attendance, engagement, LMS, and placement-readiness indicators

**No real student data is included in the demonstration dataset.**

## 🧠 Risk Classification

| Student Success Score | Classification |
|---|---|
| Below 50 | High Risk |
| 50–64 | Watch |
| 65–100 | Low Risk |

Additional indicators highlight academic concerns, low attendance, and placement-readiness gaps.

These classifications are intended to help prioritize human review, not automatically determine student outcomes.

## 🔮 Future Enhancements

- Machine-learning-based student risk prediction
- Generative AI-powered academic assistant
- Integration with institutional LMS and ERP systems
- Real-time attendance integration
- Advanced placement-readiness analytics
- Automated intervention notifications
- Improved analytics and model explainability
- Institution-approved authentication and data governance

## 🔐 Privacy and Responsible AI

CampusIQ is an educational prototype using synthetic data.

The current scoring methodology is transparent and rule-based. It should not be interpreted as a validated prediction of future student success.

Student risk indicators are designed to support human decision-making rather than replace faculty judgment.

Real-world institutional deployment would require additional privacy, security, compliance, and model-validation measures.

## 🏆 Hackathon Challenge

**Challenge:** Smart Campus Analytics — Predict, Optimize & Improve Student Success

**Focus Areas:**
- Student Success Analytics
- At-Risk Student Identification
- Data-Driven Intervention
- Academic Performance Monitoring
- Explainable Decision Support

## 👥 Development Team

**Team Name:** TEAM VOIDVORTEX

**Team Members:**
- Ansh Singh
- Mukul Kaushik
- Shibam Saha
- Lakshya Sharma

## 📌 Project Status

**Hackathon Prototype**

The core interactive analytics dashboard is implemented. A Node.js and SQLite local pilot backend is also available. Public deployment functionality may differ from the local backend-enabled version.

---

**CampusIQ — Turning Campus Data into Student Success.**
