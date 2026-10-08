# Codex marketplace and CI

Status: ready-for-verification

## Goal

Offer native Codex marketplace/plugin installation while preserving the existing Claude marketplace and the Codex shell-installer fallback. Add CI that validates packaging and exercises native installation without real user state or model calls.

## Scenarios and constraints

- Bundle exactly three agents and five existing skills without duplicated prompt content.
- Support safe native marketplace add, plugin install/update where the pinned CLI supports it, and removal; preserve unrelated Codex state.
- CI runs on pull requests, pushes to `master`, and manual dispatch, using an isolated home and no credentials or model calls.
- Manual/release Codex model tests are limited to exact `gpt-6-luna`; no model tests run in CI.
- Keep normative version sources synchronized and prompt size unchanged. Do not bump version absent release approval.

## Non-goals

No changes to Claude marketplace behavior, shell-installer removal, model calls in CI, publishing, or deployment.

## Affected surfaces

- [Native Claude Code and Codex package](../surfaces/native-claude-codex.md)

## Acceptance and validation

Valid native manifests and exact bundle contents; automated checks cover manifest version drift; isolated CLI smoke proves add/install/inventory/removal and unrelated-state preservation. Run `npm test`, `npm run check`, `sh -n scripts/install-codex.sh`, `claude plugin validate .`, isolated Codex CLI smoke, and `git diff --check`.
