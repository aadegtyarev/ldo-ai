# LDO core and execution adapters

LDO's phase logic must not know which agent runtime executes a role. A
runtime adapter receives a prompt, role, model, working directory and output
schema, then returns a normalized result and usage metadata.

```js
const result = await adapter.run({
  role: 'planner',
  prompt,
  model: '...',
  cwd,
  schema,
})
```

The existing `workflows/ldo.js` is the legacy Claude Code executor. The shared
CLI path is available now for both runtimes:

```sh
node scripts/ldo-run.mjs --runtime codex "add rate limiting"
node scripts/ldo-run.mjs --runtime claude "add rate limiting"
```

Both use the same optional Research → Plan → Security (when elevated) → Code
→ Review policy, prompts and schemas. `--research` opts into external research
before planning. This lets us move the remaining Claude-only features here
incrementally.

Use `--plan-only` to stop after the Planner, or route roles independently:

```sh
node scripts/ldo-run.mjs --runtime codex \
  --planner-model <model> --coder-model <model> --reviewer-model <model> \
  --plan-only "plan an API migration"
```

Pass `--isolate` to create and verify a fresh `.worktrees/<task>` checkout on
an `ldo/<task>` branch before any phase runs. The core verifies the linked
worktree root, branch and base commit itself; it never falls back to the main
checkout when isolation fails.
