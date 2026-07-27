---
name: init
description: Write LDO's working instructions into the project CLAUDE.md so the agent self-routes real work through the pipeline without manual /ldo
---

Drop an LDO instruction block into the project's `CLAUDE.md` so Claude self-routes work at the right weight — trivial inline, real changes through the pipeline — without the operator invoking `/ldo` each time.

## What to do

1. Find the project's `CLAUDE.md` at the repo root. Create it if it doesn't exist.
2. Look for the marker line `<!-- BEGIN ldo -->`. 
   - If absent: append the block below, between `<!-- BEGIN ldo -->` and `<!-- END ldo -->` markers.
   - If present: replace everything between the markers with the current block below (keeps it up to date on re-run).
3. Don't touch anything outside the markers — the file may hold other instructions.

## The block to write

```markdown
<!-- BEGIN ldo -->
## LDO — development workflow

This project uses LDO. Match the work to its size; don't invoke the pipeline for
what doesn't need it, and don't hand-edit around it for what does.

- **Trivial** (typo, one-liner, config value, obvious bug): just do it inline.
- **Real change** (feature, refactor, bug fix, multi-file): run the pipeline —
  `Workflow({ name: "ldo", args: { task: "<the task>" } })`. It plans, implements,
  reviews, and proves the result. For a change touching auth, secrets, user input,
  or crypto, add `security: true`. For one needing outside knowledge, `research: true`.
- **New project** is a conversation first: `/ldo:bootstrap "idea"`.

When working inline, keep the discipline: read before editing, write or update a
test for any behavior change, and update README/CHANGELOG for user-facing changes.

For any report or handoff: verdict first, evidence not assertion, name what you're
unsure of. See `/ldo:agent-ux`.

Models route automatically (Sonnet writes, Opus reviews). Tune per-project in
`.claude/ldo-config.json`, or `/ldo:config` for a walkthrough.
<!-- END ldo -->
```

## After writing

Tell the operator the block was added and that it loads automatically every session. Suggest they skim it and adjust the routing thresholds to their taste — e.g. some teams want *everything* through the pipeline, others only architectural changes. The block is plain prose in `CLAUDE.md`; editing it directly is the intended way to tune.

Run `/ldo:init` once per project. Re-running updates the block in place.
