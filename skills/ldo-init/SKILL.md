---
name: ldo-init
description: Write LDO's working instructions into the project CLAUDE.md so the agent self-routes real work through the pipeline without manual /ldo
---

Drop an LDO instruction block into the project's `CLAUDE.md` so Claude self-routes work at the right weight — trivial inline, real changes through the pipeline — without the operator invoking `/ldo:ldo` each time.

## What to do

1. Find the project's `CLAUDE.md` at the repo root. Create it if it doesn't exist.
2. Check whether `docs/contracts/` exists. If it does, include the contracts line in the block below; if it doesn't, don't create the directory yet — go to step 3 first, it may create it via confirmed contracts. If step 3 doesn't apply or turns up nothing, omit the line and leave the directory uncreated; that's fine, `/ldo-contract` creates it whenever the operator has a contract to record.
   Same check for `docs/DECISIONS.md`: if it exists, include the decisions line in the block below; if it doesn't, omit it and don't create it — that's `/ldo-note`'s job when there's an actual decision to record. `docs/NOTES.md` doesn't need a pointer line here at all — `agents/coder.md` already checks for it directly on every run, whether or not `CLAUDE.md` mentions it.
3. **Discover contract candidates — only when this is the first run** (marker line absent, see step 4) **and the project has existing code** (not an empty/near-empty repo). A brand-new project has no history to mine — skip this for `/ldo-bootstrap`-started projects. Otherwise: run the discovery process from `/ldo-contract`'s "Discovering contracts in an existing project" section — read for evidence, propose candidates with sources, let the operator confirm or reject, write only what's confirmed. This is a one-time migration aid, not something re-run on every `/ldo-init`.

   **Before moving to step 4, report the outcome of this step by itself — don't fold it into the end-of-run summary.** State plainly: how many candidates were found, how many the operator confirmed, and what got written where (`docs/contracts/scope.md`, `security.md`, `code.md`) — or, if nothing checkable turned up, say that explicitly ("no explicit contracts found — the project doesn't state these decisions anywhere I can read"). This step ran silently more than once before this note existed: the operator sees `/ldo-init` finish, `CLAUDE.md` gets written either way, and without an explicit status line here there's no way to tell "discovery ran and found nothing" apart from "discovery didn't run." Both look identical from the outside — only this line distinguishes them.
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
  `Workflow({ name: "ldo:ldo", args: { task: "<the task>" } })`. It plans, implements,
  reviews, and proves the result. For a change touching auth, secrets, user input,
  or crypto, add `security: true`. For one needing outside knowledge, `research: true`.
- **New project** is a conversation first: `/ldo-bootstrap "idea"`.

**Track every pipeline call in `.claude/ldo-runs.json`** so an interrupted run can
resume instead of restarting cold — see `/ldo-resume` for the exact protocol
(record the `runId` right after calling, update its status when the result
comes back). At the start of this session, before anything else, check that file
for entries still marked `running` — an earlier session may have been
interrupted mid-run. If any exist, follow `/ldo-resume`'s recovery steps rather
than leaving them unmentioned.

When working inline, keep the discipline: read before editing, write or update a
test for any behavior change, and update README/CHANGELOG for user-facing changes.

For any report or handoff: verdict first, evidence not assertion, name what you're
unsure of. See `/ldo-agent-ux`.

Project contracts live in `docs/contracts/`. When a task touches scope, security,
or structural rules, read the relevant file before planning — see `/ldo-contract`.

Decision history lives in `docs/DECISIONS.md` — check it before re-litigating a
past call, don't read it automatically. See `/ldo-note`.

Models route automatically: Haiku for trivial work, Sonnet writing and Opus
reviewing for real changes. To change that, pass the routing on the call —
`Workflow({ name: "ldo:ldo", args: { task: "...", config: { models: { medium: {
coder: "haiku", reviewer: "opus" } } } } })`. Keep any project-specific routing
in this block so it's applied on every run.

A single-task run edits the working tree directly by default — no commit, no
branch. Pass `isolate: true` on the call to run it in a separate worktree instead
and leave your tree untouched.

**Docs drift log.** Append a line here after each user-facing change. When the
list reaches roughly eight, offer to run `/ldo-docs-audit` and `/ldo-code-audit`
— full cold reads that catch documentation drift and code accretion (bloated
files, comment sprawl, duplicated logic) no single diff reveals — then clear
the list. Offer; don't run either unasked.

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

It exists because per-change review can't catch cumulative drift — in the docs *or* the code. The Reviewer checks that *this* change's docs kept up and that *this* diff isn't needlessly complex; it has no way to notice that six changes ago a section stopped describing reality, or that a file five changes deep has quietly grown three unrelated responsibilities. The counter is a cheap proxy for "enough has moved that a full read is due".

Around eight entries, offer both audits — don't launch either. They're full reads and cost real tokens; the operator decides, and can run one without the other if only one seems relevant. Clear the list once whichever ran is done.

Eight is a starting point, not a rule. A docs-heavy project might want five; one with a thin README might go twenty. The number lives in prose precisely so it can be argued with.

## After writing

Tell the operator the block was added and that it loads automatically every session. Also add `tags` and `.claude/ldo-runs.json` to the project's `.gitignore` if they aren't already there — the Coder generates a `ctags` symbol index on each run, and `ldo-runs.json` is local session-tracking state (see `/ldo-resume`); neither belongs in version control. Suggest they skim the block and adjust to taste — some teams want *everything* through the pipeline, others only architectural changes; some want the audit offered sooner. The block is plain prose in `CLAUDE.md`, and editing it directly is the intended way to tune.

Run `/ldo-init` once per project. Re-running updates the block in place, preserving any drift-log entries already there.

If `docs/NOTES.md` doesn't exist yet, don't create it here — it starts empty and gets its first entry via `/ldo-note` or a Coder's suggestion, same as contracts and decisions.
