# Release 3.1.0 preparation

Status: ready-for-verification

## Goal

Prepare the existing native Claude Code and Codex package for version 3.1.0 without changing runtime, installation, or host behavior.

## Scenarios

- Package and plugin consumers see a consistent 3.1.0 version in every normative version source.
- Changelog concisely records the shipped native skills, contract-first workflow, decomposition guidance, prompt reduction, and Codex safe-install guarantees.
- A structural check prevents package version drift.

## Non-goals

No behavior expansion, user-install mutation, CLI version update, publication, tag, deployment, or external release action. Publication/tag/update smoke is deferred until after merge.

## Affected surfaces

- [Native Claude Code and Codex](../surfaces/native-claude-codex.md)

## Constraints and acceptance

- Preserve exactly the existing native roles, skills, prompts, and package behavior.
- Every normative version source is 3.1.0 and the package check guards drift.
- Every Codex model smoke/eval uses exactly `gpt-6-luna`; never fall back. Unsupported model or unavailable CLI is a blocker.
- Pre-release checks pass; read-only Codex discovery uses a fresh ephemeral exec. Do not mutate user installations.
- Keep this contract `ready-for-verification` through independent review.

## Validation

Run `npm test`, `npm run check`, `sh -n scripts/install-codex.sh`, `git diff --check`, Claude plugin validation, and the exact-model Codex discovery smoke. Report publication/tag/update smoke as deferred until after merge.
