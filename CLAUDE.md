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
(write the full `args` object to `.claude/ldo-args/<runId>.json` right after
calling, then record the `runId`, the `transcriptDir` the tool result hands
back, and that reference in the tracking entry, and update its status when the
result comes back; resuming needs both the run id and the real args, and the
tracking entry alone doesn't carry them). At the start of this session, before
anything else, check that file for entries still marked `running` — an earlier session may have been interrupted mid-run. If any
exist, follow `/ldo-resume`'s recovery steps rather than leaving them
unmentioned.

When working inline, keep the discipline: read before editing, write or update a
test for any behavior change, and update README/CHANGELOG for user-facing changes.

For any report or handoff: verdict first, evidence not assertion, name what you're
unsure of. See `/ldo-agent-ux`.

Project contracts live in `docs/contracts/`. When a task touches scope, security,
or structural rules, read the relevant file before planning — see `/ldo-contract`.

Models route automatically: Haiku codes trivial work, Sonnet writes + Opus
reviews for medium, Opus writes + Fable reviews for complex (Sonnet fallback).
To change that, pass the routing on the call —
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
- redact.sh pipe mode fixed — was silently emitting empty output
- approved verdict now carries NOT PROVEN when a criterion was skipped
- reviewer/coder can slice a test suite past the 10-minute tool ceiling
- recorder claims report filenames atomically (parallel runs collided)
- ldo-runs.json stores full args so resume doesn't drop flags
- planner rates problem_evidence — asserted premises surface as UNVERIFIED
- recorder/reviewer worktree location verified by the orchestrator, not just asked for
- parallel recorders write docs/backlog/<label>.md instead of racing on the shared file
- planner declares migrations; reviewer runs a cross-worktree collision gate
- coder captures a pre-edit test baseline so pre_existing_failures is evidence
- ldo-runs.json args moved to a per-run side file, referenced not inlined
- fix-pass prompts now carry acceptance criteria and contract risks
- reviewer told that severity gates the loop, plus introduced_by_fix
- unrelated fix-pass findings downgraded to advisory instead of holding the loop
- recorder now runs on an exhausted run, marked not approved, architecture doc skipped
- contract entries capped at 200 chars with provenance moved to a Sources section
- per-role stallMs raises the harness stall watchdog; a stall is explained, not reported as "stalled"
- planner rates sizing; planOnly:true stops after plan and prints a pasteable split
- cold resume reads the run's journal.jsonl; a recovered plan feeds back via resumePlan
- PLAN_SCHEMA exceeded the harness safety-classifier ceiling; trimmed, plus scripts/check-schema-size.sh
- issue identity is a canonicalized key plus a measured similarity match; a re-worded re-raise no longer reads as unrelated
- a failed or unreported verification blocks approval in the orchestrator, not on the reviewer's word
- a failed criterion blocks even when the verdict word says verified — the itemized list outranks the summary
- config.models merges per role, not per tier; an unknown tier, role or bad model value warns instead of routing nothing
- reviewerFix routes the fix-pass reviewer per round, defaulting to the same model reviewer already uses
- the previous round's criteria and attack outcomes reach the fix-pass reviewer, so "skip what held" names a list
- reviewer reports a repeated defect as a class with an enumeration command; coder closes the class, not the listed lines
- the verification log block guards its aliased reads; a malformed criteria no longer aborts an already-approved run
- record_status distinguishes a Recorder that failed from one that wrote nothing by design
- recorder routed off haiku: every haiku sub-agent died on a thinking/context_management 400, so artifacts were never written
- test runs are scoped to touched files by default; a run that skipped the full suite says so
- fullSuiteAt 'ship'/'never' tells the agents not to run the suite, instead of only labelling the result
<!-- /ldo:features -->
<!-- END ldo -->
