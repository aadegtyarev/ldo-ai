# Native Claude Code and Codex package

## Boundary, consumers, and ownership

`ldo-ai` provides role guidance and packaging for Claude Code and Codex. Each host owns agent discovery, delegation, execution, and lifecycle through its native mechanisms. This package contains no orchestration runtime.

## Observable inputs, outputs, and flows

Users install/update the Claude Code plugin through its native plugin mechanism or use the package's native Codex installation path. Both expose exactly planner, worker, and reviewer roles and conditionally discover five shared native skills: workflow, decomposition, security, validation, and Git delivery. Claude receives skills from the plugin's `skills/<name>/SKILL.md`; Codex receives the package-owned `SKILL.md` files in its native `$CODEX_HOME/skills/<name>/SKILL.md` location. The installer maps a custom agents-directory argument to the sibling `skills/` directory. Native hosts own skill loading and role dispatch.

## Interfaces and compatibility

- Claude Code agent definitions and skills use plugin-native `agents/` and `skills/` directories.
- Codex agent definitions use native Codex TOML configuration; skills use `$CODEX_HOME/skills/`; shared project instructions use `AGENTS.md` conventions.
- The Codex installer accepts an optional agents directory; the skills destination is its sibling `skills/` directory. Without an argument it uses `$CODEX_HOME/{agents,skills}` when set, otherwise `$HOME/.codex/{agents,skills}`.
- Package/repository identity remains `ldo-ai`; legacy LDO workflow/runtime compatibility is intentionally removed.

## Failure behavior and recovery

The Codex installer validates all sources and agent/skill target collisions before writing or removing anything. It updates/removes only marked package-owned agent files and skill `SKILL.md` files, never removes skill directories or their unowned contents, and preserves unrelated files and directories. It refuses live and dangling symlink collisions during complete preflight in both install and uninstall modes. Failures are explicit. Claude Code installation/update remains managed by Claude Code's marketplace/plugin mechanism; plugin skills are discovered natively.

## Security, privacy, and retention

Install/update mechanics operate only on requested package-owned destinations. No runtime state, task history, or credentials are collected or retained.

## Non-goals

No Pi product surface, custom orchestrator, automatic model routing, resumable pipeline, or compatibility shell is provided. Recorder and Researcher roles are excluded. There is no standalone security role because security is handled as part of worker/reviewer guidance, not a separate workflow boundary.

## Related contracts

- [Scope](../scope.md)
