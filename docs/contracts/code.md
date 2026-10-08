# Code — portable structural guidance

- Never silently swallow an error; handle it explicitly or allow it to propagate.
- Comments explain constraints or intent that the code cannot show by itself; do not narrate obvious behavior.
- Keep validation and installation mechanics separate from host-owned orchestration. This package must not implement agent scheduling or workflow state.
- Prefer evidence-driven decomposition, proportional behavior tests, and incremental migration at real seams; [conditional decomposition guidance](../../skills/ldo-ai-decomposition/SKILL.md).

## Sources

**Explicit failure handling and useful comments** — retained portable guidance from the former worker role.

**Host-owned agent execution** — [native Claude Code and Codex surface](surfaces/native-claude-codex.md).
