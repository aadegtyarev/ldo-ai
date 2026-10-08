# Scope — supported product surfaces

- `ldo-ai` provides Markdown-first planner, worker, and reviewer roles plus conditional native skills for Claude Code and Codex.
- Keep exactly three roles; development lifecycle, decomposition, security, validation, and Git delivery are conditional guidance skills, not extra roles.
- Do not ship Recorder or Researcher roles, a Pi product surface, custom orchestration/runtime, model routing, state/resume machinery, or legacy compatibility.
- JavaScript is limited to justified package, installation, or validation mechanics.

## Sources

**Native host ownership and intentional exclusions** — [native Claude Code and Codex surface](surfaces/native-claude-codex.md).
