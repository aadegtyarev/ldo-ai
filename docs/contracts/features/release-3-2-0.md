# Release 3.2.0 preparation

Status: ready-for-verification

## Goal and observable change
Prepare the native Claude Code/Codex package as release 3.2.0. The release metadata and changelog identify the synchronized package version and the already implemented native Codex marketplace/plugin bundle.

## Scenarios
- Package consumers and marketplace validators see version 3.2.0 consistently in normative package, Claude, and Codex metadata.
- The changelog moves the existing Unreleased note to a dated 3.2.0 heading without inventing changes.

## Non-goals
No functional, prompt, CI behavior, installation, or runtime changes; no user-state mutation, model invocation, tag, publication, deployment, push, PR, or merge.

## Affected surfaces
- [Native Claude Code and Codex package](../surfaces/native-claude-codex.md)

## Interfaces and constraints
Keep package identity and all existing host flows unchanged. Synchronize every normative version field; update fixtures/checks only if needed to validate that synchronization. Preserve repository changelog convention.

## Acceptance criteria
- All normative package/Claude/Codex marketplace/plugin version fields are 3.2.0.
- The existing Unreleased note is accurately dated under 3.2.0.
- No behavior or prompt changes are introduced.
- Required package, shell, Claude plugin validation, and diff checks pass.

## Validation
Run `npm test`, `npm run check` with `CODEX_CLI` set to the supplied native Codex binary, `sh -n scripts/install-codex.sh`, Claude CLI 2.1.295 `plugin validate .`, and `git diff --check`.
