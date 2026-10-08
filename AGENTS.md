# Repository guidance

This repository packages native Claude Code and Codex agents; it contains no custom orchestration runtime.

- Read `docs/contracts/meta-contract.md` before planning a feature and save the approved feature contract under `docs/contracts/features/` before implementation.
- Read affected scope/code and surface contracts. Ask before changing an unapproved product or surface decision.
- After checks, update durable surface contracts and retain the feature contract as `ready-for-verification` until independent review.
- Keep role guidance concise and use each host's native agent format; never add a custom workflow runner or runtime.
- Run `npm test`, `npm run check`, and `git diff --check` for package changes.
