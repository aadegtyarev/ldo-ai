# Native Claude Code and Codex package

## Boundary, consumers, and ownership

`ldo-ai` provides role guidance and packaging for Claude Code and Codex. Each host owns agent discovery, delegation, execution, and lifecycle through its native mechanisms. This package contains no orchestration runtime.

## Observable inputs, outputs, and flows

Users install/update the Claude Code plugin through its unchanged Claude marketplace. For Codex CLI 0.161.0 or newer, users add the checkout root as a native marketplace and install `ldo-ai@ldo-ai`; the marketplace definition is `.agents/plugins/marketplace.json` and the plugin bundle is `.codex-plugin/`. The native plugin and Claude package expose exactly planner, worker, and reviewer roles and five shared skills: workflow, decomposition, security, validation, and Git delivery. Shared Codex TOMLs and skill prompts have one canonical plugin-owned source. Older Codex CLI versions can use `scripts/install-codex.sh`, which writes package-owned agents and skills under `$CODEX_HOME` (or `~/.codex`). Native hosts own skill loading and role dispatch.

## Interfaces and compatibility

- Claude Code agent definitions and skills use plugin-native `agents/` and `skills/` directories; the existing Claude marketplace remains independent of Codex metadata.
- Codex marketplace registration receives the checkout root (`codex plugin marketplace add <checkout>`); Codex resolves `.agents/plugins/marketplace.json`, whose local source points to `.codex-plugin/`.
- The Codex plugin bundles native TOML agents and `skills/<name>/SKILL.md`. `scripts/install-codex.sh` accepts an optional agents directory; skills go to its sibling `skills/` directory. Without an argument it uses `$CODEX_HOME/{agents,skills}` when set, otherwise `$HOME/.codex/{agents,skills}`.
- Package/repository identity remains `ldo-ai`; package, Claude metadata, and Codex plugin versions stay synchronized and are checked by package validation. Legacy LDO workflow/runtime compatibility is intentionally removed.

## Failure behavior and recovery

The Codex shell installer validates sources and target collisions before writing/removing; it updates/removes only marked package-owned files, preserves unrelated files/directories, and refuses live or dangling symlink collisions. The tested Codex 0.161.0 native flow supports marketplace add, plugin install/version update by re-adding the changed local plugin, plugin removal, and marketplace removal; its plugin and marketplace inventory is CLI-owned. Claude installation/update remains managed by the independent Claude marketplace. CI uses a temporary `CODEX_HOME`, invokes no models, and does not access credentials or real user state.

## Security, privacy, and retention

Install/update mechanics operate only on requested package-owned destinations. CI uses isolated temporary Codex state and makes no model calls. No runtime state, task history, or credentials are collected or retained.

## Non-goals

No Pi product surface, custom orchestrator, automatic model routing, resumable pipeline, or compatibility shell is provided. Recorder and Researcher roles are excluded. There is no standalone security role because security is handled as part of worker/reviewer guidance, not a separate workflow boundary.

## Related contracts

- [Scope](../scope.md)
