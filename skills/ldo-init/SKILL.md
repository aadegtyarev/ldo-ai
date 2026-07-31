---
name: ldo-init
description: Write LDO's working instructions into the project CLAUDE.md so the agent self-routes real work through the pipeline without manual /ldo
---

Drop an LDO instruction block into the project's `CLAUDE.md` so Claude self-routes work at the right weight — trivial inline, real changes through the pipeline — without the operator invoking `/ldo:ldo` each time.

## What to do

1. Find the project's `CLAUDE.md` at the repo root. Create it if it doesn't exist.
2. Check whether `docs/contracts/` exists. If it does, include the contracts line in the block below; if it doesn't, don't create the directory yet — go to step 3 first, it may create it via confirmed contracts. If step 3 doesn't apply or turns up nothing, omit the line and leave the directory uncreated; that's fine, `/ldo-contract` creates it whenever the operator has a contract to record.
3. **Discover contract candidates — only when this is the first run** (marker line absent, see step 4) **and the project has existing code** (not an empty/near-empty repo). A brand-new project has no history to mine — skip this for `/ldo-bootstrap`-started projects. Otherwise: run the discovery process from `/ldo-contract`'s "Discovering contracts in an existing project" section — read for evidence, propose candidates with sources, let the operator confirm or reject, write only what's confirmed. This is a one-time migration aid, not something re-run on every `/ldo-init`.
4. Look for the marker line `<!-- BEGIN ldo -->`. 
   - If absent: append the block below, between `<!-- BEGIN ldo -->` and `<!-- END ldo -->` markers.
   - If present: replace everything between the markers with the current block below (keeps it up to date on re-run).
5. Don't touch anything outside the markers — the file may hold other instructions.

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
- **New project** is a conversation first: `/ldo-bootstrap "idea"`.

When working inline, keep the discipline: read before editing, write or update a
test for any behavior change, and update README/CHANGELOG for user-facing changes.

For any report or handoff: verdict first, evidence not assertion, name what you're
unsure of. See `/ldo-agent-ux`.

Project contracts live in `docs/contracts/`. When a task touches scope, security,
or structural rules, read the relevant file before planning — see `/ldo-contract`.

Models route automatically: Haiku for trivial work, Sonnet writing and Opus
reviewing for real changes. To change that, pass the routing on the call —
`Workflow({ name: "ldo", args: { task: "...", config: { models: { medium: {
coder: "haiku", reviewer: "opus" } } } } })`. Keep any project-specific routing
in this block so it's applied on every run.

**Docs drift log.** Append a line here after each user-facing change. When the
list reaches roughly eight, offer to run `/ldo-docs-audit` — a full cold read
that catches contradictions and stale claims no single diff reveals — then clear
the list. Offer; don't run it unasked.

<!-- ldo:features -->
<!-- /ldo:features -->
<!-- END ldo -->
```

## About the drift log

The `<!-- ldo:features -->` markers hold one line per user-facing change — a few words each, enough to recognise what moved:

```
<!-- ldo:features -->
- rate limiting on the API
- export endpoint takes a date range
- config moved to CLAUDE.md
<!-- /ldo:features -->
```

It exists because per-change review can't catch cumulative drift. The Reviewer checks that *this* change's docs kept up; it has no way to notice that six changes ago a section stopped describing reality. The counter is a cheap proxy for "enough has moved that a full read is due".

Around eight entries, offer the audit — don't launch it. It's a full documentation read and costs real tokens; the operator decides. Clear the list once it's run.

Eight is a starting point, not a rule. A docs-heavy project might want five; one with a thin README might go twenty. The number lives in prose precisely so it can be argued with.

## After writing

Tell the operator the block was added and that it loads automatically every session. Also add `tags` to the project's `.gitignore` if it isn't already there — the Coder generates a `ctags` symbol index on each run, and it's a derived file that shouldn't be committed. Suggest they skim the block and adjust to taste — some teams want *everything* through the pipeline, others only architectural changes; some want the audit offered sooner. The block is plain prose in `CLAUDE.md`, and editing it directly is the intended way to tune.

If step 3 ran, say plainly what happened either way — how many candidates were confirmed and written, or that discovery found nothing checkable. Migrating an existing project's tribal knowledge into contracts is the whole point of running discovery; a silent "done" hides whether it actually found anything.

Run `/ldo-init` once per project. Re-running updates the block in place, preserving any drift-log entries already there.
