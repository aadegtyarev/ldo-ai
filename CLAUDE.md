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
- isolate:true — a single task can run in a worktree instead of the working tree
- /ldo-feedback — structured, redacted bug reports filed as GitHub issues
- complex: coder→opus, reviewer→fable (sonnet fallback when fable is off-route)
<!-- /ldo:features -->
<!-- END ldo -->
