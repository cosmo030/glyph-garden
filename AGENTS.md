# Working rules for coding agents

Glyph Garden is a browser new-tab page of animals drawn from keyboard characters (TypeScript, WXT
browser extension, WebGL2 renderer). Read these first; this file summarises them and does not repeat
them:

- [README.md](README.md): what the project is, commands, privacy promises
- [CONTRIBUTING.md](CONTRIBUTING.md): code style, comments, performance, secrets
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): folder layout, units, renderer, how to add a parameter or animal

## Workflow

- Never commit to `main`. Use one branch per change (`feat/...`, `fix/...`, `docs/...`), then open a
  pull request. The owner reviews and merges.
- Before opening a PR, run and pass all four:
  - `npm run check`
  - `npm run build`
  - `npm run build:firefox`
  - `npm run preview:build`
- Add an entry under "Unreleased" in [CHANGELOG.md](CHANGELOG.md) for every user-visible change.
- Update [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) when the structure or behaviour it describes
  changes.
- For visual changes, attach a screenshot or recording to the PR.

## Attribution

- Commits use the repo's configured git author only.
- No `Co-Authored-By` trailers and no AI or tool attribution anywhere: not in commits, PR titles or
  descriptions, code comments or docs.

## Code

Follow [CONTRIBUTING.md](CONTRIBUTING.md). In short:

- Every file starts with a header comment, and every export has a doc comment.
- Comments explain why, not what.
- No allocation in per-frame code (`step`, `draw`). Use typed arrays and reuse scratch values.
- Every tunable number goes in `src/params/schema.ts`, never hard-coded.
- Units are grid cells, seconds and radians.

## Safety

- Never commit secrets (`.env`, keys). `.env.example` holds variable names only.
- Ask before adding any dependency, permission or network request. The extension's only permissions
  are `storage` and `search`, and it makes no network requests of its own.
