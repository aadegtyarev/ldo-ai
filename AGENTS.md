# Repository guidance

- Native Claude Code/Codex only; exactly planner, worker, reviewer. No runtime or router.
- Trivial work goes directly to worker. For non-trivial work, use `ldo-ai-workflow`; read affected contracts and relevant conditional skills, and ask at unapproved boundaries.
- Reconcile durable contracts after checks; retain feature contracts as `ready-for-verification` through independent review. Keep prompts/skills focused and <=100 lines.
- Package checks: `npm test`, `npm run check`, `sh -n scripts/install-codex.sh`, `git diff --check`.
