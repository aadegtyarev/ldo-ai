# Scope — what this app does and deliberately doesn't

- [2026-08-01] Don't add a role or skill duplicating `/code-review`, `/security-review`, `/simplify`, or `/deep-research` — complement or point to them instead.
- [2026-08-01] Agent files (`agents/*.md`) declare no `model:` in frontmatter — routing lives only in `DEFAULT_MODELS`/`config.models` in `workflows/ldo.js`.

## Sources

**Don't duplicate built-ins** (2026-08-01) — `README.md`, "Use with the built-ins".

**No `model:` in agent frontmatter** (2026-08-01) — `README.md`, `skills/ldo-config/SKILL.md`; verified all 6 `agents/*.md` files carried no `model:` frontmatter at the time this contract was written.
