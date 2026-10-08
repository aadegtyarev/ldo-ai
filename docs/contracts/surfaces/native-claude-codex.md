# Native Claude Code and Codex package

## Boundary, consumers, and ownership

`ldo-ai` provides role guidance and packaging for Claude Code and Codex. Each host owns agent discovery, delegation, execution, and lifecycle through its native mechanisms. This package contains no orchestration runtime.

## Observable inputs, outputs, and flows

Users install/update the Claude Code plugin through its native plugin mechanism or use the package's native Codex installation path. Both expose planner, worker, and reviewer roles. Codex installation updates only marked `ldo-ai-*` agent definitions, refuses to overwrite unowned collisions, and leaves unrelated host/project files untouched.

## Interfaces and compatibility

- Claude Code agent definitions use plugin-native agent files and metadata.
- Codex agent definitions use native Codex agent configuration; shared project instructions use `AGENTS.md` conventions.
- Package/repository identity remains `ldo-ai`; legacy LDO workflow/runtime compatibility is intentionally removed.

## Failure behavior and recovery

The Codex installer validates all sources and target collisions before writing; it updates/removes only files carrying the package ownership marker. Failures are explicit and do not clean unrelated files. Claude Code installation/update remains managed by Claude Code's marketplace/plugin mechanism.

## Security, privacy, and retention

Install/update mechanics operate only on requested package-owned destinations. No runtime state, task history, or credentials are collected or retained.

## Non-goals

No Pi product surface, custom orchestrator, automatic model routing, resumable pipeline, or compatibility shell is provided. Recorder and Researcher roles are excluded. There is no standalone security role because security is handled as part of worker/reviewer guidance, not a separate workflow boundary.

## Related contracts

- [Native Claude/Codex rebuild feature](../features/native-claude-codex-rebuild.md)
- [Scope](../scope.md)
