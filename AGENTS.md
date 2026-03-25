# AGENTS.md

## Project Truths
- This is a public open-source project on GitHub: `https://github.com/sgoudelis/ground-station` (default branch `main`, license GPL-3.0).
- GitHub issues and pull requests should be handled with `gh`, and commands should target `sgoudelis/ground-station` explicitly (example: `gh issue list --repo sgoudelis/ground-station`).
- Stack split is backend Python/FastAPI + Socket.IO and frontend React/Vite.
- Backend package metadata is in `backend/pyproject.toml`; frontend scripts are in `frontend/package.json`.
- Backend runtime requirement in `backend/pyproject.toml` is Python `>=3.12,<3.13`.
- Frontend uses Node tooling (Vite/Vitest/Playwright) with scripts like `dev`, `build`, `test`, `test:e2e`.
- Default backend app config is host `0.0.0.0`, port `5000`, DB `data/db/gs.db`.
- CI exists in both GitHub Actions (`.github/workflows/tests.yml`, release workflow) and Drone (`.drone.yml`).

## Test Commands
- Backend unit tests:
  - `cd backend && pytest -m unit`
- Frontend unit tests:
  - `cd frontend && npm test`
- Frontend E2E tests:
  - `cd frontend && npm run test:e2e`

## Notes
- Frontend E2E tests require the app/backend to be running and reachable by Playwright test config.
