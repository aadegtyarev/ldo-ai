# Scope — supported product surfaces

- `ldo-ai` provides Markdown-first role guidance for Claude Code and Codex through each host's native agent/subagent and instruction conventions.
- Keep only native roles with a distinct use: planner, worker, and reviewer. Security is included only if its boundary is distinct and justified.
- Do not ship Recorder or Researcher roles, a Pi product surface, custom orchestration/runtime, model routing, state/resume machinery, or legacy compatibility.
- JavaScript is limited to justified package, installation, or validation mechanics.

## Sources

**Native host ownership and intentional exclusions** — [native Claude Code and Codex surface](surfaces/native-claude-codex.md); [approved rebuild feature](features/native-claude-codex-rebuild.md).
