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

Both use the same Plan → Security (when elevated) → Code → Review policy,
prompts and schemas. This lets us move the remaining Claude-only features here
incrementally.

Use `--plan-only` to stop after the Planner, or route roles independently:

```sh
node scripts/ldo-run.mjs --runtime codex \
  --planner-model <model> --coder-model <model> --reviewer-model <model> \
  --plan-only "plan an API migration"
```
