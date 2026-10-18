# Between · AI Builder Cup 2026

Between brings an employee’s digital twin, work relationships and project history into an interactive 3D work world. It helps employees navigate daily work and preserves work knowledge to support project continuity when people leave.

[Open Between](https://between-web-459469440461.australia-southeast1.run.app/)

## Features

- **My Desk:** daily tasks, work notes, shared projects and reminders.
- **Connections:** explore colleagues and projects through Universe, Org Chart and Projects views.
- **Project Timeline:** revisit progress, decisions and exchanges at a selected date.
- **My Contributions:** explore work summaries by month and project, with original source records.
- **Directory and search:** find people, projects and shared work.

## Run locally

Requires Node.js 22+ and Python 3.10+.

```sh
git clone https://github.com/gh9991/between-ai-builder-2026.git
cd between-ai-builder-2026
npm run setup
npm run build
npm run check
npm start
```

Open **http://127.0.0.1:8080**. Rebuild after editing the source or data.

## Technology

Three.js renders the 3D workspace in the browser. Node.js serves the application and a read-only archive API. Cloud Firestore stores versioned work memory. Gemini analysis scripts generate contribution candidates linked to source records. Cloud Build and Artifact Registry deploy the application to Cloud Run.

This prototype includes an original synthetic archive covering 12 months, 1,337 records and 12 projects. The interface combines authored work relationships with saved Gemini-assisted contribution summaries; it does not connect to real employee accounts. Historical views follow when information became known (`first_seen_at`).

## Project structure

| Directory | Contents |
| --- | --- |
| `work-memory/` | Application source, English archive, local Three.js and tests |
| `work-memory/scripts/monthly-contributions/` | Gemini analysis, evidence checks and report publishing |
| `work-memory/daily-memory/` | Incremental work-memory pipeline |
| `docs/results/` | Saved contribution results and audit evidence |
| `deploy/` | Cloud Run server, Firestore adapter and deployment tools |

## Deployment

Pushes to `main` use `cloudbuild.yaml` to check, build and deploy to Cloud Run. See [deployment setup](deploy/README.md) for configuration and archive import. Third-party Three.js licensing is retained in [THREE-LICENSE.txt](work-memory/vendor/THREE-LICENSE.txt).
