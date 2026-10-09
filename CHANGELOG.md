# Changelog

## [3.2.0] — 2026-10-09

### Added

- Added a native Codex marketplace/plugin bundle and isolated marketplace lifecycle coverage in CI; retained the shell installer for older Codex CLI versions.

## [3.1.0] — 2026-10-08

### Changed

- Added native conditional skills for contract-first development, evidence-driven decomposition, security, validation, and Git delivery; reduced always-loaded role prompt content while keeping host-controlled workflows.
- Hardened the Codex installer to preflight owned destinations and preserve unrelated files, directories, and symlinks.

## [3.0.0] — 2026-10-08

### Breaking

- Replaced the LDO workflow/orchestration runtime with native Claude Code and Codex agent definitions: planner, worker, and reviewer only. Legacy workflows, schemas, routing, resume/config compatibility, Recorder/Researcher roles, and Pi support are removed. There is no custom runtime or automatic pipeline.
- Claude Code installs through `/plugin marketplace add aadegtyarev/ldo-ai` and `/plugin install ldo@ldo-ai`; Codex installs or updates the marked `ldo-ai-*` native agents with `./scripts/install-codex.sh` and removes them with `--uninstall`. It refuses to overwrite unowned collisions and does not change unrelated instructions/settings/files.
- Example native workflow: ask the planner for an evidence-based plan, approve it, delegate implementation to the worker, then ask the reviewer to inspect the diff and checks. Host-native delegation controls execution; see README for constraints and full setup.

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Legacy history

The complete pre-3.0 changelog is preserved at this [immutable commit](https://github.com/aadegtyarev/ldo-ai/blob/34dbb7ec5db08e4bdf69ed35f5f67cf804db5632/CHANGELOG.md).
