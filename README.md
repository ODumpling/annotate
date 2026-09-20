# Annotate

Local-first web app for marking hotspots on images (PDFs later) and exporting a
single self-contained HTML file.

Status: M1 scaffold only — no application features yet. The app plan and
technical spec live in this project's Solo scratchpads.

## Commands

| Command                | Purpose                             |
| ---------------------- | ----------------------------------- |
| `npm run dev`          | Start the Vite dev server           |
| `npm run build`        | Type-check and create a prod build  |
| `npm run lint`         | ESLint                              |
| `npm run typecheck`    | TypeScript project check (`tsc -b`) |
| `npm run test`         | Vitest unit and DOM tests           |
| `npm run format`       | Prettier write                      |
| `npm run format:check` | Prettier check                      |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, format check, and
build on push to `main` and on every pull request.

No backend or remote service is required to boot or build the app.

## Architecture folders

Per the technical spec: `src/model`, `src/store`, `src/ingest`, `src/viewer`,
`src/inspector`, `src/preview`, `src/export`, `src/persist`, and
`src/test-fixtures` are stubbed for their respective milestones.
