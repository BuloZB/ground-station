# AGENTS.md

## Project Truths
- This is a public open-source project on GitHub: `https://github.com/sgoudelis/ground-station` (default branch `main`, license GPL-3.0).
- GitHub issues and pull requests should be handled with `gh`, and commands should target `sgoudelis/ground-station` explicitly (example: `gh issue list --repo sgoudelis/ground-station`).
- Stack split is backend Python/FastAPI + Socket.IO and frontend React/Vite.
- Backend package metadata is in `backend/pyproject.toml`; frontend scripts are in `frontend/package.json`.
- Backend runtime requirement in `backend/pyproject.toml` is Python `>=3.12,<3.13`.
- Backend Python tooling (pytest/python/alembic/etc.) is available in `backend/venv/bin`.
- Frontend uses Node tooling (Vite/Vitest/Playwright) with scripts like `dev`, `build`, `test`, `test:e2e`.
- Default backend app config is host `0.0.0.0`, port `5000`, DB `data/db/gs.db`.
- CI exists in both GitHub Actions (`.github/workflows/tests.yml`, release workflow) and Drone (`.drone.yml`).

## Test Commands
- Backend unit tests:
  - `cd backend && ./venv/bin/pytest -m unit`
- Frontend unit tests:
  - `cd frontend && npm test`
- Frontend E2E tests:
  - `cd frontend && npm run test:e2e`

## Notes
- Python dev/test tools for backend are in `backend/venv/bin` (for example `./venv/bin/pytest`, `./venv/bin/python`, `./venv/bin/alembic` from inside `backend/`).
- For pytest runs, set `ALEMBIC_CONTEXT=1` to avoid app CLI argument parsing conflicts (example: `cd backend && ALEMBIC_CONTEXT=1 ./venv/bin/pytest -q`).
- Frontend E2E tests require the app/backend to be running and reachable by Playwright test config.

## GitHub Safety
- Never post/comment/create/update/delete on GitHub (issues/PRs/comments/labels/assignees/milestones/releases) unless the user explicitly asks for that exact write action in the current turn.
- Default to read-only `gh` usage (list/view/status/check) unless explicit write permission is given in the current turn.
- If there is any ambiguity, stop and ask before running any `gh` command that mutates remote state.
