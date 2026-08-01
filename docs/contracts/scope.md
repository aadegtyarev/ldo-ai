# Scope — what this app does and deliberately doesn't

- [2026-08-01] LDO deliberately doesn't rebuild what Claude Code already ships. Don't add a role or skill that duplicates `/code-review`, `/security-review`, `/simplify`, or `/deep-research` — complement them, or point to them, instead. (Source: `README.md`, "Use with the built-ins".)
- [2026-08-01] Agent files (`agents/*.md`) declare no model of their own — routing lives only in `DEFAULT_MODELS`/`config.models` in `workflows/ldo.js`. Don't add a `model:` field to an agent's frontmatter; that would create a second, conflicting source of routing truth. (Source: `README.md`, `skills/ldo-config/SKILL.md`; verified all 6 `agents/*.md` files carry no `model:` frontmatter today.)
