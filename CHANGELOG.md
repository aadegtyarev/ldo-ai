# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.33.0] — 2026-08-28

### Fixed

- **A blocking finding in a file the fix pass just edited is no longer written
  off as unrelated, and a `critical` is never downgraded at all** (issue #5).
  The fix-pass downgrade — the rule that stops a run looping forever on
  pre-existing defects a narrow pass was never asked to touch — could only be
  escaped by `introduced_by_fix`, a flag the Reviewer has to volunteer and which
  the code's own comment already said could not be relied on. So a real
  regression the Reviewer simply forgot to mark was relabelled advisory and the
  run was approved over it. Attribution now comes from the fix pass's own
  `files_changed`, a fact the Coder reports about the edits it just made rather
  than a judgement about causation; a blocking issue whose file that list names
  keeps blocking. Path comparison handles the four forms the two sources really
  produce — bare relative, `./`-prefixed, an absolute worktree path, a
  `file.js:120` line suffix and the linter/compiler `file.js:120:5` form — as
  separately named assertions, because a comparison that silently never matches
  reinstates the old behaviour while every other check stays green. The last of
  those was the review's own remaining finding, fixed by hand before commit: the
  trailing-line-reference strip ran once, so `file.js:120:5` lost only `:5` and
  normalized to `file.js:120`, and a blocking finding carrying a path copied
  from linter output fell through to advisory — precisely the fail-open this
  control exists to close. The strip now repeats, and the reverted regex is
  proven to fail exactly the new assertion and no other. Two decisions worth stating outright: a
  `critical` is now **never** downgradeable, on the argument that the
  termination rationale is worth a `major` riding along as advisory in the
  report but never a `critical` written off — that is exactly the false-approval
  class of run `wf_2b451aee`, and the migration and verification gates inject
  `critical` precisely because it must not be bypassable. The cost is a run that
  can spend all three fix loops on a pre-existing critical; `MAX_FIX_LOOPS`
  still terminates it, and the exhausted-run report already separates what was
  closed from what remains. And an ambiguous bare basename (`ldo.js` against a
  changed `workflows/ldo.js`) is treated as a match, because an over-eager match
  costs at worst one fix pass while a missed one downgrades a live blocker.

- **A fix pass that fixed one issue of three is no longer indistinguishable from
  one that fixed all three** (issue #6). The fix-pass prompt said "Narrow pass —
  touch only these files", which was being read as permission to decline, and
  the Coder's result carried no per-issue outcome, so nothing could tell the
  difference. The boundary now says what it is — a scope guard against
  rewriting the world — and names the three permitted outcomes for each issue:
  fix it; fix it in a file outside the list because that is where the fix lives,
  naming that file; or report it blocked with the reason. Silently returning an
  unfixed issue is not one of them. `issue_outcomes` is a new optional field on
  the Coder's result, and the orchestrator — not the Reviewer — checks that
  every issue it sent came back with an entry, logging each gap and quoting the
  Coder's account into the next review under a header saying plainly that these
  are unverified claims by the agent under review. The second arguable decision:
  a missing entry is logged and surfaced as `stats.issues_unaccounted`, but it
  does **not** gate the verdict. A schema omission must not fail a run whose
  code was right, and an issue genuinely left unfixed keeps blocking on the next
  review's own merits, which is a stronger test than a self-report.

- **A run in a worktree whose environment could never be built no longer reports
  a plain rejection** (issue #8). A fresh worktree brings nothing gitignored
  with it, so the Coder rebuilt the environment from the most obvious install
  command — which for many projects omits the optional extras the suite needs.
  The tests then failed for reasons that had nothing to do with the diff and the
  run reported `approved: false` on correct code, with nothing anywhere saying
  the environment was the variable. The Coder is now told to *find* the
  project's real install command rather than guess at it (naming where to look,
  and that `pip install -e '.[dev,test]'` is not `pip install -e .`), and that a
  baseline failing wholesale in a fresh worktree is evidence about the
  environment, not about the suite. The orchestrator derives `env_status` —
  `ok`, `unknown` or `unreproducible` — from the baseline and the unresolved
  environment the Coder reports, surfaces it in the log, the multi-feature
  summary and the result object, and appends an `ENVIRONMENT NOT REPRODUCED`
  line to the verdict summary. It annotates and never blocks: it is applied only
  to a run that was already not approved, and it can never turn a rejection into
  an approval.

- **`/ldo-feedback` filed four issues with empty bodies.** Issues #5, #6, #7 and
  #8 arrived at GitHub with zero-length bodies because the skill passed a
  multi-KB markdown body — backticks, `$`, quotes, fenced blocks — as an inline
  shell argument, and `gh issue create` returns a URL and exit 0 either way.
  This is not fixable retroactively: those four bodies were never received by
  GitHub and are not recoverable, so the defects above were reconstructed by the
  operator rather than read from the reports. The skill now writes the redacted
  body to a file and posts it with `--body-file`, passes the title through a
  command substitution so model-composed text is never interpolated into a
  command line, keeps the unredacted composition in a private temp file outside
  any git working tree, checks the redaction gate's exit status and refuses to
  post any file that is not demonstrably its output, and reads the issue back
  with `gh issue view --json body` and diffs it against what it posted before
  telling anyone it was filed.

### Changed

- **A Reviewer's `suggestion` is presented to the Coder as a hypothesis, not an
  instruction** (issue #7). It used to be rendered as a bare `→ do this`, with
  no signal that the Reviewer may not have verified it and no visibility into
  what earlier passes in the same run had already closed. The fix pass now sees
  each suggestion labelled as the Reviewer's unverified hypothesis to check
  against the code, plus an `ALREADY CLOSED IN THIS RUN — DO NOT REINTRODUCE`
  list built from the orchestrator's own record of which issues stopped being
  re-raised. A suggestion contradicted by the code or by that list means fix the
  issue a different way and say so in `deviations` — never that there is nothing
  to do. Reviewers are asked to say what they actually checked, in the
  suggestion itself.

### Added

- **`scripts/check-env-status.sh`**, a fifth gate script in the same
  brace-extraction style as the others, driving `deriveEnvStatus` and
  `markEnvUnreproducible` out of `workflows/ldo.js`. Its load-bearing assertions
  are the two CONTROLs: the marker is reference-identical on the clean path (the
  call sites detect firing by identity), and it never touches `status`, so an
  environment state derived from Coder-reported fields can never approve a run.

## [2.32.0] — 2026-08-24

### Changed

- **Test runs are scoped by default, cutting a run's 5-8 full-suite executions
  to one.** A single run used to execute the whole suite over and over: the
  Coder's baseline, its per-step runs and its end-of-pass run, the Reviewer's
  own run, and the two runs the revert-and-rerun proof needs to watch one test
  flip red→green — all repeated on every fix round, up to three. On a suite that
  takes tens of minutes, that dominated the run. The Planner now emits an
  optional `codebase_context.test_command_scoped` — the same runner narrowed to
  a file list via a single `{paths}` placeholder, e.g. `pytest {paths}` — and
  the orchestrator substitutes the specific files itself, handing the Coder and
  the Reviewer a command already built rather than asking an agent to assemble a
  shell line. The default is `tests.scope: "scoped"`: this is a behaviour change
  for every existing project on upgrade, and it is deliberate, because a saving
  nobody hears about reaches nobody. Set `tests.scope: "full"` to restore the
  previous behaviour exactly. It is only safe as a default because two things
  hold alongside it — the full suite still runs once per Coder pass
  (`tests.fullSuiteAt: "final-pass"`), and a run that never ran it now says so.
  Projects whose runner cannot select a subset, and every resumed plan, fall
  back to the full suite unchanged.

### Added

- **A run that never executed the full suite reports that fact instead of a bare
  `approved: true`.** The result now carries `full_suite_status` beside
  `approved`: `ran`, `not_run`, `disabled` or `deferred_to_ship`. An enum rather
  than a boolean for the same reason `record_status` is one — `full_suite:
  false` is satisfied identically by a crashed Coder, by a deliberate
  `fullSuiteAt: "never"` and by a run deferring to ship, and those are three
  different facts. Anything but `ran` appends a `FULL SUITE NOT RUN` line to the
  verdict summary and prints one in the run log and the multi-feature summary.
  It annotates and never blocks. `fullSuiteAt: "ship"` and `"never"` remove the
  run rather than only labelling the result: on either, the Coder and the
  Reviewer are each handed an explicit *do not run the full suite* block on
  every pass — including fix passes, where running the whole suite costs exactly
  what the setting exists to avoid — with the Reviewer told to mark a criterion
  it can no longer prove as `skipped` (reported NOT PROVEN) rather than passing
  it. Both settings apply only under `scope: "scoped"`; with `scope: "full"` the
  baseline and every per-step run are already the whole suite, so the setting is
  neutralised with a log line instead of reporting `disabled` for a run that in
  fact tested everything. The status is derived, not taken on trust: a
  Coder reporting `full_suite.ran: true` with no command and no result is
  recorded as not run, the same way `markUnproven` derives skipped criteria from
  the structured list rather than asking. `/ldo-ship`'s auto-merge path now runs
  the full suite itself whenever the status isn't `ran`, so the deferral has
  somewhere to land.
- **`config.tests`** — `scope` (`scoped`|`full`) and `fullSuiteAt`
  (`final-pass`|`ship`|`never`). Invalid values keep the default with a warning,
  and an unrecognised key under `tests` is warned about rather than silently
  dropped, matching the `planner` and `stallMs` merges.
- **`scripts/check-scoped-tests.sh`** — the fourth gate over LDO's own source.
  `test_command_scoped` is model-authored text that two agents put into a Bash
  line, so it is validated once in `phasePlan` and deleted when it fails: one
  `{paths}`, no shell metacharacter, under 200 characters, and an `argv[0]` that
  is either a known test runner or the first token of the `test_command` this
  run already derived — scoping may narrow a command the pipeline was going to
  invoke, never introduce a new one. Every path substituted into a scoped
  command is filtered in code, including the Coder-reported test filenames the
  Reviewer's revert proof uses, rather than by a prose rule addressed to the
  same kind of component that produced the string. The gate drives all of it
  out of `workflows/ldo.js` and names each injection shape as its own assertion.

## [2.31.1] — 2026-08-24

### Fixed

- **The Recorder is routed off Haiku, so an approved run's artifacts actually
  get written.** Every Haiku sub-agent this project has run died on `400
  clear_thinking_20251015 strategy requires thinking to be enabled` — 6 of 6,
  against 0 of 47 agents on every other model — and the Recorder was the only
  role routed to Haiku, so the review report, architecture doc and backlog were
  silently never written. Measured before changing anything: the failure is
  always the *second* request, the first one carrying a prior thinking block
  back in its history, and the Recorder's input is ~25k of a 200k window, so
  neither the prompt nor its size is the cause. This is a workaround for a
  mismatch between the `context_management` strategy and `thinking` on a Haiku
  sub-agent request, reported upstream as issue #4; if that is fixed, `haiku` is
  the right value for this role again. `recorder` is now `sonnet` in all three
  tiers, in `DEFAULT_MODELS` and all three documentation copies, and the
  hardcoded fallback beside the `runAgent` call no longer contradicts the table
  it backstops.

## [2.31.0] — 2026-08-24

### Changed

- **The reviewer reports a defect class, not the instances it happened to
  notice.** A measured run went through four review rounds because round 1
  listed three fields, the coder fixed exactly three, and four siblings of the
  same defect survived — twice. `agents/reviewer.md` now requires a repeated
  defect shape to be reported as a class with a command that enumerates every
  member, and requires the durable fix to be recommended over the narrow one:
  round 1 of that run identified a try/catch wrapper and then argued the coder
  out of it, and that recommendation cost two rounds. `agents/coder.md` now
  states that a fix pass closes the class within the files the issue names,
  and that going past the literal list belongs in `deviations`.

- **The fix-pass reviewer is routed per round.** A new `reviewerFix` role
  selects the model for rounds 2+, so the open-ended first review can stay
  strong while a bounded verification pass runs cheaper. It defaults to the
  same model `reviewer` already uses, so nothing changes until an operator
  opts in. The tension is real and not hidden: round 4 of the measured run
  found a genuine new major the earlier rounds missed, so a weaker fix-pass
  reviewer is not free.

- **The previous round's verification reaches the fix-pass reviewer.** The
  prompt already said to re-run what broke and skip what held, but the
  Reviewer was handed no list, so it could not tell which was which — over
  three rounds tool calls went 45 → 65 → 68 while criteria checked went
  15 → 10 → 11. The prior round's criteria and attack outcomes are now
  threaded into the prompt, compactly: outcome per item, no evidence text,
  because the cost lives in `cache_read`.

### Fixed

- **A partial `config.models` override left most roles with no model at all.**
  `routeModels` spread whole tier rows, so the example printed in this repo's
  own `CLAUDE.md` — `{ medium: { coder: "haiku", reviewer: "opus" } }` — left
  planner, security, researcher and recorder `undefined`, and only the recorder
  had a fallback. The merge is now per role, and an invalid model value, an
  unknown role and an unknown tier each warn instead of silently routing
  nothing. `scripts/check-model-table.sh` gained behavioural assertions that
  drive the real merge, and it fails against the pre-fix source naming the
  unrouted roles.

- **A malformed verification could abort a run that had already been approved.**
  The verification log block reads the verdict through an alias
  (`const v = verdict.verification`), which hid it from an enumeration grepping
  for `verification?.criteria`. `?.` guards null but not type, so a `criteria`
  that is a string reaches `.filter` and throws, and `blockers: 'none'` has a
  truthy `.length` and throws on `.join`. A verdict whose word is `verified`
  passes the verification gate by reference and lands here. The block now uses
  the same `Array.isArray` guard as the gate itself, with null-safe entry
  access, and `scripts/check-verdict-gates.sh` drives the real extracted block
  against all three shapes.

### Added

- **`record_status` on the run result.** `record_misplaced: false` is satisfied
  trivially by writing nothing, so a Recorder that died was indistinguishable
  from one that succeeded — the run reported `approved: true` with no signal
  that the review report and architecture doc were never written. The result
  object now carries `record_status: 'ok' | 'failed' | 'skipped'`, and a failed
  Record is surfaced in the multi-feature summary rather than only in the log
  of a phase the operator may not scroll back to.

## [2.30.0] — 2026-08-24

### Fixed

- **A run could be reported approved on a zero-line diff.** Run `wf_2b451aee-6ea`
  returned `approved: true` while both reviewer rounds said `changes_requested`,
  `verification.verdict` was `failed`, and 8 of 8 acceptance criteria had failed.
  Two independent defects had to line up, and both are now closed.

  An issue's identity was the Reviewer's verbatim prose (`${file}::${what}`),
  computed at nine sites. A Reviewer that re-raised the same blocker in different
  words produced a different key, so `downgradeUnrelatedFindings` read a live
  blocker as a new unrelated finding and downgraded it to advisory, `blocking`
  reached 0, and the loop approved. Identity is now a single `issueKey()` over a
  canonicalized `what`, plus a Dice-coefficient similarity match for the
  cross-round question. The 0.45 threshold is measured, not chosen: over 18 run
  journals, 121 same-round same-file issue pairs — distinct defects by
  construction — score at most 0.439, while the real re-worded pair scores 0.824.
  A rewording sharing under 45% of its tokens is still missed; the verification
  gate below is the independent backstop for that case. A false match reads as
  ALREADY SENT and keeps the finding blocking, which is the safe direction.

  Separately, neither approval branch had ever consulted `verification.verdict`,
  and `markUnproven` does not cover it — it only rescues a `skipped` criterion
  and passes `failed` straight through. `enforceVerificationGate` now blocks a
  failed, malformed, or absent verification, sequenced after
  `downgradeUnrelatedFindings` and `enforceMigrationGate` so a later downgrade
  cannot undo it, and detected by object identity rather than a field a Reviewer
  could write in. `partial` blocks only when a criterion actually failed, so
  `markUnproven`'s NOT PROVEN handoff still works; `nothing_to_drive` does not
  block on its own. Any failed criterion blocks even when the verdict word says
  `verified` — the enum and the criteria list are written by the same model in
  one object and nothing makes them agree, so the itemized list outranks the
  one-word summary of it.

### Added

- **`scripts/check-verdict-gates.sh`** — both defects above stayed syntactically
  perfect through the entire false approval, so `node --check` and the other two
  gates were blind to them. This one brace-extracts the real functions out of
  `workflows/ldo.js` and drives them against `scripts/fixtures/wf2b451aee-verdicts.json`,
  which holds that run's two actual verdicts with the re-worded pair copied
  verbatim. It fails against pre-fix source and passes after, and carries
  negative controls: a genuinely unrelated finding is still downgraded, a clean
  verified verdict is still approved, and the pass path stays reference-identical.
  A second argument points the same assertions at another copy of the file.

## [2.29.1] — 2026-08-23

### Fixed

- **The marketplace entry carried no `homepage` and no `author`.** `plugin.json`
  has had both since the start, but a plugin listing is rendered from
  `marketplace.json`, and that entry had neither — so the install surface showed
  no link back to the project and no author. Both added, matching the shape the
  official marketplace uses for its 286 entries (270 of which carry `homepage`).
  Both URLs verified to resolve.

## [2.29.0] — 2026-08-23

Every run of the pipeline was dead. Not slow, not degraded — the Planner was
rejected before it started, in about twelve milliseconds, for zero tokens, with
`output schema too large to classify safely`. The harness runs a safety
classifier over each agent's output schema as a tool definition, and
`PLAN_SCHEMA` had crossed its ceiling.

It crossed it gradually. Three releases added `migrations`, `problem_evidence`
and `sizing`, taking the schema from 3198 serialized characters in 2.25.0 to
4116 in 2.28.0 — `sizing` alone accounts for 908 of the 918. None of that was
caught, because the installed plugin lagged the repo at 2.25.0 and kept running
the old schema; the first restart that loaded 2.28.0 broke everything at once.
`node --check` was green throughout, and so was `check-model-table.sh`. Nothing
in the repo could have said otherwise.

### Fixed

- **`PLAN_SCHEMA` trimmed to 3223 serialized chars.** Nineteen `description`
  strings shortened; not one property, type, enum or `required` entry touched —
  verified by stripping every description from both versions and comparing the
  remaining structure byte for byte. Each trimmed string was checked against
  `agents/planner.md` first: the schema copies were duplicates of prose the
  Planner already reads, so the model loses nothing. The descriptions that
  remain point at that file rather than restating it.

### Added

- **`scripts/check-schema-size.sh`.** A schema over the limit fails in a way
  the existing gates cannot see — no syntax error, no drift, no output to
  debug. This one discovers every `*_SCHEMA` in `workflows/ldo.js`, evaluates
  it standalone and measures `JSON.stringify().length` against a budget of
  3400, chosen as the largest size proven to work plus a deliberately small
  margin. It fails loudly if its own discovery regex matches nothing, rather
  than reporting a vacuous pass. Run it after touching any schema; the fix for
  a failure is to move the prose into the agent's markdown, where it is free.

## [2.28.0] — 2026-08-23

An interrupted run leaves three layers of state behind. `/ldo-resume` knew
about two of them: the files the Coder already wrote, and the harness's
`resumeFromRunId` cache, which lives in the process and dies with it. The
third is `journal.jsonl` — written by every Workflow run, holding each
completed agent's full return value, and readable months later. A run from
three weeks ago, from a long-closed session, still reads fine on this machine.
So the plan and any finished Code⇄Review passes were sitting on disk while
the recovery skill told the operator to throw them away and start cold.

### Added

- **A journal-read step in `/ldo-resume`'s recovery.** It reports what
  survived — "the plan survived, the first Coder pass survived, review did not
  run" — and feeds the recovered plan into the fresh run. The journal labels
  results by agent id, not by role, so identification goes through each
  agent's `.meta.json` sidecar and falls back to matching the result's shape;
  the skill says which is which rather than implying a role field exists.
  Reading the journal is a documented-behaviour dependency on the harness, not
  a public API, so every step degrades to the old behaviour — mark abandoned,
  re-run fresh — when the directory is missing, unreadable, or the wrong shape.
- **`.claude/ldo-runs.json` records `transcriptDir`.** The Workflow result
  hands the transcript path back alongside the run id; recording it is what
  makes the journal findable from a cold session. Entries written before this
  release have no such field — recovery globs for it, project-pinned, and
  degrades to today's behaviour when the directory is gone.
- **`resumePlan`.** Pass a recovered plan object and the Planner is skipped —
  the single most expensive stage of a re-run, paid for twice otherwise. Only
  in a plain single-task run: not with `args.tasks`, not with `isolate: true`,
  because a recovered plan names a worktree from a dead run that this run
  cannot verify exists. An object that doesn't validate logs why and the
  Planner runs normally.

### Fixed (found while reviewing the above)

- A recovered plan is the one plan object the harness never schema-checks, and
  five optional fields are iterated or dereferenced without a type guard.
  `relevant_files: [null]`, a string `security_notes`, a string `risks`, a
  string `migrations.identifiers`, and a `suggested_split` that is a non-array
  or holds malformed elements each aborted the whole run with an uncaught
  TypeError — the exact opposite of the "costs a log line, not a bad run" the
  skill promises. The `risks` case was the worst: it aborted *after* the plan
  was accepted and `PHASE:Code` had already logged. All five now reject and
  fall back to a normal Planner call.
- A resumed plan's `security_surface` stays a schema enum. Annotating it with
  "(recovered, not re-rated)" made the string `!== 'none'`, so a recovered plan
  rated `none` printed security notes an identical fresh plan suppressed, and
  the annotation leaked into `stats.securitySurface` in the returned result.
  The annotation lives in the log line only.
- `test_command`/`run_command` are stripped from a resumed plan. A command
  string from a dead run is executed by the Coder and cannot be verified; the
  Coder rediscovers them, which it already knows how to do.
- A resumed plan's `security_surface` is checked against the schema enum. It
  was the one optional field the validator didn't cover, and the only one that
  gates a whole phase: the missing-rating safety net tests the field for
  truthiness, so `'Elevated'`, `'nope'` or `{}` was truthy enough to defeat the
  net and unequal enough to skip the threat model — silently, with the garbage
  value handed back in `stats.securitySurface`. Anything not `none|low|elevated`
  now rejects and re-plans. A genuinely absent rating still fails closed: the
  threat model is forced on, since no Planner ran to rate it.
- `scripts/redact.py` leaked the OS username. `/ldo-feedback` pipes reports
  through it before filing a public GitHub issue, and this release starts
  writing absolute home paths into `.claude/ldo-runs.json`, so the gap went
  from theoretical to on the wire. The rule is anchored to a path boundary —
  unanchored it ate the `home`/`Users` segment of relative paths like
  `docs/home/index.md`, mangling exactly the file references a bug report
  needs — and a second rule covers the Windows shape. A third covers the form
  that motivated the whole thing: Claude's project slug spells the home path
  with dashes (`-home-alice-projects-x`), so the username survived inside every
  `transcriptDir` the first rule had just cleaned the front of. Four self-test
  samples, one of them negative, each proven to fail when its rule is removed.

## [2.27.0] — 2026-08-23

The operator's working preference, stated plainly: short atomic runs, because
development moves faster that way — but sometimes you need to plan one large
chunk and then break it into small pieces. LDO supported neither half. The
Planner said nothing about size anywhere in its 147 lines, and the only way to
get a plan was to run the whole pipeline, which then implemented it.

### Added

- **The Planner rates size on every run.** A new `sizing` block on the plan
  schema — `fits_one_run`, a one-line `reason`, and a `suggested_split` of
  self-contained chunks. Size is not complexity and the agent instructions say
  so explicitly: a `complex` task can be one tight run, and three unrelated
  `trivial` chores are three runs. The split signals are named (unrelated
  layers with no shared reason, a migration bundled with a feature that could
  ship without it, over the step ceiling, two different answers to "why are we
  doing this", pieces with different risk profiles) and so is the
  counter-signal, so this doesn't become reflexive fragmentation: a change that
  only works when all of it lands — a rename across call sites, a signature
  change and its callers — is ONE run.
- **`depends_on` on each chunk, and it is load-bearing.** `args.tasks` runs
  features in *parallel worktrees*. A flat list of chunks that actually depend
  on each other produces N worktrees fighting over the same lines. The
  pasteable array therefore contains the independent chunks only; dependent
  ones are listed separately, to be run in sequence afterwards.
- **`planOnly: true`** — a top-level arg like `isolate`. Runs
  Research → Plan → Security (when the surface is elevated) and stops. Nothing
  is written, nothing is reviewed, nothing is recorded. Threat-modelling a plan
  before the code exists is what the Security agent is for, and plan-only is
  when that is most useful, so it still runs.
- **`config.planner.maxStepsPerRun`** (default 8) and
  **`config.planner.preferSplit`** (default true). Both are interpolated into
  the Planner's prompt rather than checked after the fact — a config key the
  agent never sees is dead weight. The ceiling is soft: the orchestrator
  enforces nothing, doesn't truncate a longer plan and doesn't refuse it.
  `sizing` is advisory throughout; a gate here would stall runs the operator
  deliberately chose to make big.

### Fixed (found while reviewing the above)

- **A plan-only result could have been misread as a rejected run.** Returning
  `approved: false` is exactly what a rejected run looks like. Plan-only now
  returns a separate shape with `mode: 'plan-only'` and **no `approved` key at
  all**, so `if (r.approved)` is falsy and `r.approved === false` — the
  rejected-run test — correctly does not match.
- **Every plan-only feature in a multi-feature batch would have been reported
  as a failure.** The existing summary counts `!f.verdict` as failed, and a
  planned feature legitimately has no verdict. Plan-only gets its own summary.
- **`sizing` is deliberately absent from the schema's `required` array.** A
  validation failure aborts the Planner outright; an advisory field that can
  kill a run contradicts itself. A missing block is warned about and rated
  `null` — "unrated" stays distinguishable from "rated as fitting".
- **The pasteable array is emitted through `JSON.stringify`, never by string
  concatenation.** The chunks are model-generated free text; one containing a
  quote or a newline would otherwise hand the operator invalid JSON to run.
- **A typo'd key under `config.planner` is now warned about**, matching the
  `stallMs` pattern. Guarding the value while leaving the key unguarded catches
  only half the mistake — the operator believes they set something and nothing
  in the log says otherwise.
- **A Planner that rates `fits_one_run: false` and then names no chunks now
  says so.** Previously the run printed the rating and then nothing, leaving
  the operator told to split and not told into what.

## [2.26.0] — 2026-08-23

The first report filed through `/ldo-feedback` as a GitHub issue rather than
pasted into a chat: a Planner that burned 47 minutes and ~992k tokens across
six attempts and produced nothing. Every attempt showed a normal working
trajectory — 34-51 tool calls, then a `tool_result` followed by exactly 180.0s
of silence. The agents were neither stuck nor looping.

### Fixed

- **A long plan was indistinguishable from a hung agent, and got killed as
  one.** Claude Code's per-agent stall watchdog clears only on a `tool_use`
  content block. An agent with a `schema` returns its result by calling a
  `StructuredOutput` tool — but while the model composes that call's arguments,
  no block is emitted, so generating a large structured output looks exactly
  like hanging and is aborted at the harness's 180-second default. LDO now
  passes a per-role `stallMs` budget on every agent call: planner and reviewer
  480000, coder 360000, security and researcher 300000, recorder 180000. It is
  keyed by **role, not complexity tier**: output size tracks the schema the
  role fills — a trivial task's Reviewer still writes full verification and
  attack sections — and a per-complexity scale structurally could not cover the
  Planner, whose own call is what *produces* the complexity rating. Override
  with `config.stallMs.<role>`.

- **A stalled Reviewer was misdiagnosed as a dead model and re-run on the
  fallback.** `agentWithModelFallback` treated any throw as a model failure, so
  a stall sent the same long verdict to the fallback model, which stalled the
  same way: six aborts became twelve, 18 wasted minutes became 36, and the log
  said "model failed" throughout. A stall now propagates instead of falling
  back. Found by the pipeline's own Planner; it was not in the brief.

- **The operator saw `stalled` and went looking for an infinite loop that did
  not exist.** Every agent call now funnels through one wrapper that recognises
  the harness's stall message and explains it: the agent was generating, not
  hung; only tool calls reset the timer; here is the current budget and the key
  that raises it. For the Planner it adds the workaround the issue's author
  found on their own — a smaller brief yields a smaller plan. The error is
  always rethrown, never absorbed.

### Fixed (found while reviewing the above)

- **`config.stallMs: {planner: 480}` was accepted.** It reads as "eight
  minutes" and means 480 milliseconds — every planner call aborting instantly,
  six times in a row, which is the exact failure the value check existed to
  prevent. Values now have a 1000ms floor, and the warning names the unit. One
  second cannot reject a legitimate budget; the harness default is 180000.

- **A typo'd role name was silently discarded.** The merge iterated the known
  roles and read each from the config, so `plannner` was never visited and
  never warned about: the operator believed they had raised a budget, the run
  behaved as if they hadn't, and nothing in the log disagreed. Unrecognised
  keys now warn, like invalid values already did.

- **The stall detector could stall.** Its regex backtracked quadratically on
  large inputs — 240k characters took 5.1 seconds, 800k took 56 — on a failure
  path where the payload may be a dumped stack. Bounded, made lazy, and the
  input sliced: the same 240k now takes 1ms.

- **It also matched ordinary prose.** `work stalled because there was no
  progress on the API contract` tested true. Since stall detection now gates
  the model fallback, a false positive would deny a genuinely failed model its
  fallback — this fix, inverted. The pattern now requires the harness's own
  `no progress for <n>ms`.

- **A comment described a verification that never happened**, citing a grep
  over a Claude Code source checkout — which is not how Claude Code is
  distributed. Replaced with what was actually done: reading the constant out
  of the 2.1.239 binary.

## [2.25.0] — 2026-08-22

A third operator field report, this one about a run that could not finish: a
feature reviewed three times, each round's own prose saying the work was done,
each round returning `changes_requested` on a fresh finding the previous round
hadn't raised. The run ended with no verdict, no report, and nothing on disk.
Everything here is about that failure mode — a loop that never converges — plus
the token cost of the contract files, raised in the same report.

### Fixed

- **A fix pass could manufacture a contract violation the Coder couldn't see
  the rule for.** `renderPlanCompact` carries only each step's `what` and
  `files`, but `agents/planner.md` tells the Planner to carry project contracts
  verbatim into `risks` or a step's `acceptance` — so from round 2 onward both
  the Coder's and the Reviewer's prompts lost exactly the text
  `agents/reviewer.md` makes an always-`critical` blocking check. A new
  `renderConstraints` renders acceptance criteria and risks into both fix-pass
  prompts, separate from `renderPlan` for the same reason `renderMigrations`
  is: a fix pass must not pay for the full plan.
- **A fresh blocking finding on a fix pass could restart the loop
  indefinitely.** A fix pass is narrow by construction — it asks the Coder to
  touch specific files — so a `critical`/`major` the Reviewer doesn't attribute
  to that work is a pre-existing defect, not a regression. After the first
  pass, such a finding is now downgraded to advisory: it keeps its severity in
  the report, is labelled as downgraded, and reaches the backlog, but doesn't
  buy another iteration. A regression the fix actually caused
  (`introduced_by_fix: true`, new in `VERDICT_SCHEMA`) keeps blocking, as does
  anything re-raised from the verification list, and the first review is
  untouched. Decided in the orchestrator, not asked of the Reviewer — the same
  reasoning as `markUnproven`: an omission is what a model is least reliable at
  volunteering, and the downgrade decision is read from the orchestrator's own
  record of what it did, never from a field on model-authored JSON.
- **An exhausted run left no artifact at all.** Three rounds of falsification
  evidence — criteria proven, attacks run, issues closed along the way — and
  none of it written down, leaving the operator to read raw verdicts to decide
  whether the work was mergeable. The Recorder now runs when the loop exhausts:
  the review report is written and marked NOT APPROVED, issues split into still
  open and closed along the way, backlog items go out as usual. The
  architecture doc is deliberately left untouched — it must not describe a
  change that may never land.

### Changed

- **The Reviewer is told what severity actually does.** Nothing in
  `agents/reviewer.md` said `critical`/`major` re-enter the fix loop while
  `minor`/`nit` ride along advisory, so there was no way for it to know that
  inflating a small finding costs a whole iteration. It now says so, without
  weakening any existing escalation: contract violations, fabrication, and
  duplicate migration numbers are still always `critical`, a failed criterion
  still at least `major`.
- **Contract entries are capped at ~200 characters, provenance moved out of the
  rule line.** A contract file is re-rendered into the Planner's and Reviewer's
  prompt on every run that touches its area, and the Planner carries its text
  verbatim into `risks`, which is then re-rendered into every downstream prompt
  for the rest of the run — so a `(Source: …)` tail welded to the rule gets
  multiplied by every pass that carries it forward. Provenance now lives in a
  trailing `## Sources` section, and a rule that already exists as an agent
  instruction is referenced rather than restated, with the contract stating the
  enforcement it adds. This repo's own contracts shrank accordingly;
  `skills/ldo-contract/SKILL.md` documents the format with a worked example and
  the measured cost.

### Fixed (found while reviewing the above)

- A `null` entry in a Reviewer's `issues` array aborted the whole feature on
  the first property access; malformed entries are now dropped once, before
  anything else touches the verdict, with a log of how many.
- `coder_passes` over-reported by one on an exhausted run.
- Model-authored issue text is newline-collapsed before it enters the Record
  prompt, so it cannot forge a `## SECTION` header there.

## [2.24.0] — 2026-08-22

Everything here comes from a second operator field report — a parallel
multi-feature batch (3 features, 18 agents, 8h40m, all approved and shipped)
that surfaced races and gaps the single-feature runs behind 2.23.0 hadn't hit.

### Fixed

- **A Recorder could write outside its assigned worktree.** Prompt text alone
  told it to stay inside `worktree_path`, but nothing checked that it had —
  in a parallel run a misdirected write would land in a sibling feature's tree
  or the main working copy with no signal it had happened. The orchestrator
  now verifies the Recorder's reported location against the Planner's
  `worktree_path` and surfaces a mismatch in the run summary instead of
  absorbing it silently. The Reviewer's reported location is checked the same
  way and a mismatch is logged during the run, but — because the Reviewer's
  verdict already flows through a fix loop rather than a single write — that
  check doesn't yet carry a flag into the run summary the way the Recorder's
  does.
- **Parallel Recorders collided on `docs/BACKLOG.md` section numbers.** Two
  features finishing close together both read the same "next" section number
  and both appended it, corrupting the file's numbering. A Recorder running
  inside a parallel or `isolate: true` worktree now writes to its own
  `docs/backlog/<label>.md` instead of the shared file, so there's nothing
  left to race over.
- **Migration filename numbers collided across parallel features.** Two
  features could independently pick the same next-free migration number since
  neither Planner can see what a sibling is about to claim. The Planner now
  declares the exact count, directory, and identifiers it intends to create;
  the Reviewer runs a collision check across every active worktree before
  approving, and two migrations sharing a number now fails the run as
  `critical` instead of shipping silently.
- **`/ldo-resume`'s tracking file echoed the full args blob.** Every append to
  `.claude/ldo-runs.json` re-emitted every prior run's complete `args` object,
  including whatever task text an operator had pasted in — a needless write on
  disk and a needless thing to have sitting in a file the operator might skim.
  Args now live in a per-run side file, `.claude/ldo-args/<runId>.json`, with
  the tracking entry holding only a small reference to it; a trimmed run
  deletes its args file in the same operation. Older entries without an
  `argsFile` still resume correctly — `/ldo-resume` reads inline `args` when
  that's all a pre-2.24.0 entry has.

### Added

- **A migration numbering gate.** See above — the Planner's `migrations` field
  and the Reviewer's collision check are new, and only apply when a plan
  actually declares migrations; most tasks don't touch this at all.
- **A test baseline captured before the Coder's first edit.** Previously
  `pre_existing_failures` was whatever the Coder recalled noticing on its way
  through, not something it had actually run before touching code. The Coder
  now runs the test command once at the very start of section 1 and records
  the result as `tests.baseline` — command, raw result, and which tests were
  already failing — so `pre_existing_failures` in the final report is evidence
  instead of recollection. Reported honestly as not captured when the
  environment couldn't run it, rather than silently left blank.

### Documentation

- README documents per-feature backlog files, the Recorder/Reviewer worktree
  check, and the migration numbering gate in the parallel-runs section, plus
  the `.claude/ldo-args/<runId>.json` split in the resume section and both new
  paths in the file map.
- `/ldo-resume` rewritten to describe the args side file: what goes in it, why
  it's separate from the tracking entry, and how a trimmed run cleans it up.

## [2.23.0] — 2026-08-21

Everything here comes from one operator's field report after 18 runs in a session
against a real project (~4400 integration tests, live Postgres).

### Fixed

- **An `approved` verdict could hide a skipped check.** `VERDICT_SCHEMA` made
  `status` and `verification.criteria[].status` structurally independent, so a run
  whose most expensive criterion was `skipped` still came back as a bare
  `approved` — the word carried no sign that the last step had been handed back to
  the operator. It showed up in 2 of 18 runs. Any skipped criterion now forces
  `verification.verdict` to `partial`, adds an `unproven` list to the result, and
  appends a `NOT PROVEN` line to the summary naming what's left to run. Enforced in
  the orchestrator rather than asked of the Reviewer: an omission is what a model
  is least reliable at volunteering.
- **Parallel runs overwrote each other's review reports.** The Recorder checked
  whether `docs/reviews/<date>-<slug>.md` was free and then wrote it — three
  concurrent runs all saw it free and all wrote the same name. Replaced with an
  atomic claim via `set -o noclobber`, verified against 8 concurrent claimants
  producing 8 distinct files.
- **Resuming a run lost its arguments.** `.claude/ldo-runs.json` recorded only a
  human-readable `task`, but `resumeFromRunId` doesn't carry arguments — flags like
  `security`, `research`, `isolate`, and any model override were silently dropped
  on resume. Entries now store the full `args` object.

### Added

- **A test suite may now outlive a single tool call.** One Bash call is capped at
  ten minutes and can't be raised; a 17-minute suite previously became a `skipped`
  criterion. The Reviewer and Coder are now told to detach the suite and block on
  it in slices (`timeout 590 tail --pid=$PID -f /dev/null`, repeated until it
  exits, real exit code recovered from a file). This blocks on the process instead
  of polling it, so it doesn't trip the existing no-op-loop rule, and it makes
  "too long for one call" no longer a legitimate reason to skip.
- **The Planner now names what makes the problem real.** New optional
  `problem_evidence` field: a `basis` of `measured` / `reported` / `inspected` /
  `asserted`, the observation behind it, and what measurement would confirm the fix
  worked. An `asserted` basis — the task says so, nothing observed confirms it — is
  a legitimate answer, but it now prints a warning in the run log and renders as
  UNVERIFIED in the plan every downstream agent reads. The pipeline builds a
  plausible fix from a false premise as readily as from a true one; this is the
  last cheap point to say so.

### Documentation

- README now points at project contracts from Getting started, where the pain
  actually occurs — a standing rule retyped into every task ("the live database is
  read-only") is a contract, and prose in a task is only as reliable as your memory
  of typing it. The mechanism already existed; it was documented too far down to
  find.
- Documented that parallel runs with integration tests need one environment
  variable per run for the database — worktree isolation covers files, not data.

## [2.22.1] — 2026-08-15

### Fixed

- **`scripts/redact.sh` wrote nothing in pipe mode — the heredoc consumed
  stdin.** `python3 - <<'PY'` read the program from stdin, so the documented
  `redact.sh < input.txt` silently emitted zero bytes while `--self-test` still
  passed every check — the gate reported success while doing no work, and an
  agent reading empty output as "clean" would file unredacted text. The program
  now lives in its own `scripts/redact.py` and `redact.sh` is a thin `exec`
  wrapper that leaves stdin alone; `--self-test` exercises the real stdin path,
  and empty input now fails loudly instead of succeeding silently.

- **The generated block's one-line model summary went stale after 2.22.0.**
  `ldo-init` (and this repo's own `CLAUDE.md`) still said "Sonnet writing and
  Opus reviewing for real changes"; it now says complex is Opus writing + Fable
  reviewing (Sonnet fallback).

## [2.22.0] — 2026-08-15

### Changed

- **Complex tasks now code on Opus and review on Fable.** Sonnet couldn't keep
  up on complex features and provoked extra review passes, so the `complex` row
  now routes `coder: opus` and `reviewer: fable` (`trivial`/`medium` are
  unchanged). When `fable` isn't on the proxy route, the reviewer falls back to
  `sonnet` — a weaker review still catches things, and no review is what a run
  can't recover from. The fallback lives in `REVIEWER_FALLBACK` in
  `workflows/ldo.js` and is applied by `agentWithModelFallback` at the reviewer
  dispatch.

## [2.21.0] — 2026-08-15

### Added

- **`/ldo-feedback` — a structured, redacted path for reporting LDO bugs.**
  Feedback used to be free-form, so two reports of the same bug carried
  different information and a token could end up pasted into a public issue.
  The skill replaces that with a fixed form (version + install shape, which
  phase, what happened with evidence, expected, reproduction, impact,
  environment), then redacts it through `scripts/redact.sh` before filing a
  GitHub issue in `aadegtyarev/ldo-ai`.

- **`scripts/redact.sh` — deterministic secret/PII redaction with a
  self-test.** A conservative pattern list (GitHub/AWS/OpenAI/Slack/Stripe/
  Google tokens, JWTs, private keys, `password=…`/`token=…` assignments,
  emails, IPs, URLs with embedded credentials) replaces each match with a
  typed `<REDACTED:…>` placeholder. `--self-test` proves the gate catches a
  set of real token shapes before anything is filed; over-redaction is the
  safe direction. The skill never posts without showing the operator the
  redacted text first.

- **The pipeline points at it when it breaks.** An unexpected error during a
  run now logs a suggestion to run `/ldo-feedback`, so feedback is captured
  while the context is fresh rather than reconstructed later.

## [2.20.0] — 2026-08-15

### Added

- **`isolate: true` — run a single task in its own worktree instead of the
  working tree.** Only a `tasks` batch got worktree isolation before; a single
  `task` always edited the working tree directly, and nothing said so. The
  pipeline now logs a loud warning before touching the working tree, and
  `isolate: true` reuses the multi-feature worktree machinery for one feature
  (`.worktrees/<slug>`, branch `ldo/<slug>`), leaving your tree untouched.

- **The Reviewer now proves tests catch the defect, not just pass.** A test
  that's green on both the old and the new code proves nothing — it never
  exercised the fix. For each added or changed test the Reviewer temporarily
  reverts the code change (keeping the test), confirms the test *fails*
  against the old code, restores, and confirms it passes again — both runs
  captured as evidence. A test that stays green through the revert is
  fabrication (`critical`).

### Changed

- **An exhausted fix loop reports what it closed, not just what's still
  open.** At the iteration cap the verdict used to be an undifferentiated
  refusal the operator had to re-diff by hand. It now tracks issues resolved
  across passes and reports "closed N, still open M" — the remaining list is
  usually small enough to finish by hand rather than re-run the pipeline.

### Fixed

- **The workflow name was documented wrong everywhere.** Docs said
  `Workflow({ name: "ldo" })`, but a plugin-installed workflow is namespaced
  `ldo:ldo` — the bare form returns "Workflow 'ldo' not found". All docs and
  the `CLAUDE.md` block `/ldo-init` writes now say `ldo:ldo`.

- **Vendoring left `name: "ldo:ldo"` untransformed.** `scripts/vendor.sh`
  rewrote slash-commands (`/ldo:ldo` → `/ldo`) but not the programmatic
  `Workflow({ name: "ldo:ldo" })` form now in skill prose. It now rewrites
  both and verifies no `ldo:ldo` survived before finishing — the same
  refuse-rather-than-half-transform logic as the `agentType` check.

- **Comment-archaeology slipped through on fix passes.** A Coder fixing a
  review finding would leave a comment narrating the fix ("changed X to Y
  because the reviewer flagged Z") — history that belongs in the summary or
  commit. The fix-pass Coder and Reviewer prompts now call it out: the Coder
  is told not to write it, the Reviewer to flag it like dead code.

## [2.19.1] — 2026-08-06

### Fixed

- **Coder and Reviewer could stall for hours waiting on a background command
  that would never notify them.** A subagent (spawned via `Agent` or via a
  Workflow's `agent()` call) doesn't get the async task-completion
  notification that the top-level session gets when a `run_in_background`
  command finishes — that mechanism only reaches the top level. Reported
  from a real run: the Coder started a 15-minute test suite backgrounded,
  then called a no-op `Bash("true")` **110 times in a row** waiting for a
  notification that structurally could not arrive in its context, burning
  most of a 3-hour run on an idle loop nothing would ever break.

  Not a bug in this project's own code — confirmed as an undocumented gap in
  the platform's subagent execution model, not something a workflow script
  can route around. The fix is telling the agents explicitly: run anything
  you're waiting the result of (a test suite, a build, a one-shot check) in
  the *foreground*, blocking, with a generous timeout — never
  `run_in_background` on something you then poll for. Backgrounding a
  long-lived server process to curl against and later stop is unaffected;
  that's a different pattern from waiting on a command to *finish*.

  Both agents also got an explicit escape hatch: noticing the same no-op
  check repeating more than a few times is itself the signal to stop and
  report the blocker, rather than trusting the wait to resolve on its own.

## [2.19.0] — 2026-08-01

### Added

- **`scripts/check-model-table.sh` — mechanical drift detection for the
  model-routing table's four copies.** The table lives in `workflows/ldo.js`
  (`DEFAULT_MODELS`), `ldo-config.example.json`, `README.md`, and
  `skills/ldo-config/SKILL.md` on purpose — a runnable default, a copy-paste
  reference, and two docs explaining it. "On purpose" never made it safe:
  this exact regression (a role or key silently missing from one copy) hit
  this project three separate times across the session, caught only by a
  full `/ldo-docs-audit` after the fact each time.

  The script parses `DEFAULT_MODELS` out of `workflows/ldo.js` as the source
  of truth and checks the other three copies against it, cell by cell —
  every tier, every role. Tested against both failure shapes this project
  actually hit: a changed value (`trivial.planner` edited in one copy but
  not the others) and a missing key (`recorder` dropped from one tier row),
  confirmed the script catches both with the exact file, cell, and mismatched
  values named, not just "something's different."

  `/ldo-docs-audit` now runs it instead of diffing the four copies by eye
  when checking this specific duplication. README's Contributing section
  says to run it after touching the table or any of its copies — drift
  becomes a failure at check time instead of a finding weeks later.

## [2.18.0] — 2026-08-01

### Changed

- **Model routing collapsed to one real axis: `coder`.** The default table
  previously made `planner` and `reviewer` look like they scaled with
  `complexity` (`trivial: planner=haiku`, `complex: planner=opus`), but that
  was never true at runtime — the Planner produces `complexity` by planning,
  so it structurally cannot be gated on a rating it hasn't made yet; only the
  `medium` row's `planner` value was ever actually read (Research and Plan
  both run before complexity is known). The `trivial`/`complex` planner
  entries looked configurable and weren't.

  Fixed by making it true instead of documenting around it: `planner` is
  `opus` in every tier now, because its value — surfacing what a task didn't
  ask about, not executing what it did — doesn't shrink because the plan
  turns out short. `reviewer` moved to `opus` at every tier too, on the same
  reasoning applied consistently: a cheap Reviewer that trusts the Coder
  isn't a review, and task size was never why review matters. `coder` is the
  one role that actually scales with the tier now — the axis that was real
  is now the only one the table claims is real.

  Updated everywhere the table is duplicated: `workflows/ldo.js`
  (`DEFAULT_MODELS`), `ldo-config.example.json`, `README.md`, and
  `skills/ldo-config/SKILL.md` — all four checked consistent after the edit.

### Added

- **The Planner now weighs narrowing a step before leaving it wide.** A cheap
  Coder executes a fully-specified step well; handed a step with a real
  judgment call left open, it doesn't reliably stop and ask — it produces
  confident output describing what it decided, which is more likely to read
  as done than to get caught. The Planner now narrows a step with a real
  open choice rather than leaving the call to whoever executes it, unless
  narrowing would genuinely lose something — in which case it says so rather
  than silently staying wide.
- **The Reviewer checks for fabrication as its own dimension**, alongside
  correctness/simplification/efficiency: a contract line naming an event the
  code never emits, a test whose assertions contradict its own body, a
  summary citing a tool or file name that doesn't exist. This is cheaper to
  produce than the work it claims to describe, and always `critical` — not a
  behavioral defect but a false claim about what the behavior is, which
  everything downstream ends up trusting.

## [2.17.0] — 2026-08-01

### Added

- **`/ldo-note` — operational notes and decision history, neither of them
  contracts.** A contract is a rule an agent checks against future work; a lot
  of what's actually worth recording isn't that — "this service needs a
  restart after env changes" is a fact, not a rule, and "we merged despite a
  known-flaky check because X" is a decision worth being able to find again,
  not something to re-litigate every time it comes up.

  Two kinds, stored deliberately differently:
  - **Operational note** → `docs/NOTES.md`, read by the Coder at the start of
    every run. Kept small on purpose — a ~15-20 entry ceiling, pruned rather
    than grown; a note that's stopped being surprising belongs in README
    instead, one that's stopped being true gets removed.
  - **Decision or mandate** → `docs/DECISIONS.md`, never auto-loaded by any
    agent. An append-only log with no size ceiling, referenced by date or
    keyword like `git log`, not read end to end.

  The split exists because "a log nobody reads" and "a log too big to read"
  are the two failure modes these files hit, and they need opposite fixes:
  `NOTES.md` stays small because something depends on reading all of it every
  run; `DECISIONS.md` can grow because nothing does.

  The Coder now reads `docs/NOTES.md` before setting up the environment, and
  suggests (never writes) a note when it hits a real gotcha. `/ldo-ship`
  suggests a decision entry when merging over a red gate on explicit
  instruction. `/ldo-docs-audit` flags a `NOTES.md` past its size ceiling or
  stale against current code, and a decision made the same way more than
  once — that's not a note anymore, it's an unwritten contract.

## [2.16.2] — 2026-08-01

### Fixed

- **`/ldo-init`'s contract-discovery outcome could go unreported.** The
  instruction to say plainly what discovery found (candidates confirmed,
  or nothing checkable) lived in the "After writing" section at the end of
  the skill, folded into the end-of-run summary — easy to skip, and skipping
  it left two very different outcomes ("discovery ran and found nothing" vs.
  "discovery never ran") looking identical from the operator's side: either
  way, `/ldo-init` finishes and `CLAUDE.md` gets written. An operator asked
  after running `/ldo-init` on an existing project whether migration had
  happened at all, with no way to tell from what they'd been shown.

  The status report is now part of step 3 itself — required before moving on
  to writing `CLAUDE.md`, not an afterthought that can get lost in a longer
  summary.

## [2.16.1] — 2026-08-01

### Fixed

- **Ran `/ldo-docs-audit` on this project's own repo again after the vendoring
  and decomposition changes.** Two findings, both fixed:
  - README's "Why only three core agents" section still said "plus two
    specialists" — stale since the Recorder agent was added (2.6.0); there are
    now three conditional agents (Researcher, Security, Recorder).
  - This CHANGELOG's own top entries were out of version order (2.15.2,
    2.15.1, 2.16.0, 2.15.3, 2.15.0, ...) — each release had been inserted
    after the prior top entry instead of at the true top, so the
    currently-shipped version sat third from the top instead of first.
    Reordered to strict descending version order.

  Everything else checked — `scripts/vendor.sh`'s described behavior, the
  `workflows/ldo.js` six-phase decomposition, both `docs/contracts/` files,
  the model-routing table's four copies, and the skill/file-tree listings —
  matched source.

## [2.16.0] — 2026-08-01

### Changed

- **`/ldo-vendor` is now a real script (`scripts/vendor.sh`), not instructions
  for a model to re-derive and re-run by hand each time.** Prompted directly
  by hitting a version of exactly the failure vendoring exists to avoid: an
  installed plugin's marketplace cache silently stuck on an old version while
  the real source had moved on — no error, just a stale copy running.
  Vendoring sidesteps that whole failure class (no cache in the loop at all),
  but the mechanism itself was still text a model had to interpret correctly
  every time, which is the same class of unreliability one level up.

  `scripts/vendor.sh <target-project-dir>` does the actual copy: agents
  verbatim, the workflow script with its `ldo:` agent-scope prefix stripped
  and the result *verified* clean before writing (refuses to proceed on an
  incomplete transform), skills with `/ldo:ldo` rewritten to bare `/ldo`,
  `ldo-vendor` itself skipped by default, a `.claude/LDO_VENDORED.md` marker
  written with the source version. Warns rather than silently overwrites on
  an agent-name collision. Tested against a real temp directory before
  documenting it as working — verified zero residual `ldo:`/`/ldo:ldo`
  references, valid JS syntax, and both error paths (missing target,
  self-vendor refusal).

  `/ldo-vendor` is now the explanation and a manual fallback for the rare
  case a script can't run against the target at all; the script is the
  primary path.

## [2.15.3] — 2026-08-01

### Changed

- **Decomposed `runOneFeature` (286 lines, 6 responsibilities) into six
  separate phase functions.** Each phase takes explicit parameters instead of
  closing over shared mutable locals. The orchestrator sequences them, checks
  for error returns from Plan and Review phases, and passes data through.
  - `phaseResearch(task, ctx, logStage, logPrefix)` — encloses the DO_RESEARCH
    conditional; returns `{researchReport}`.
  - `phasePlan(task, ctx, researchReport, logStage, logPrefix)` — returns
    `{plan, models, CTX, surface, DO_SECURITY, WORKTREE_BLOCK}` on success, or
    error objects for Planner failure / missing worktree.
  - `phaseSecurity(plan, models, ctx, WORKTREE_BLOCK, CTX, DO_SECURITY,
    logStage, logPrefix)` — encloses the DO_SECURITY conditional; returns
    `{securityReport, SECURITY_BLOCK}`.
  - `phaseCodeReview(plan, models, ctx, WORKTREE_BLOCK, CTX, SECURITY_BLOCK,
    task, logStage, logPrefix)` — the full while loop; returns
    `{finalVerdict, iteration}` or error object.
  - `phaseRecord(approved, plan, finalVerdict, securityReport, task, ctx,
    WORKTREE_BLOCK, models, logStage, logPrefix)` — encloses the approved &&
    non-trivial gate.
  - `shapeResult(approved, plan, researchReport, securityReport, finalVerdict,
    surface, models, iteration, task, ctx)` — pure synchronous result builder;
    takes the orchestrator's already-computed `approved` rather than
    re-deriving it from `finalVerdict`, so there's one source of truth for it
    instead of two independent (if currently identical) derivations.
  - `runOneFeature` is now ~40 lines. Same agent calls, same schemas, same
    logPrefix/logStage conventions, same early-return failure shapes for both
    single and multi modes. Resolves the decomposition backlog item from the
    2.15.1 audit.

  Planned, coded, and reviewed by this project's own `/ldo:ldo` pipeline, run
  directly against this repo — first real dogfood run, not just a demo. The
  Reviewer found no bugs, only two review-quality issues (four design-
  rationale comments dropped during extraction, and the exact duplicate-
  derivation pattern described above); both fixed before merging.

  Not this project's bug, but worth recording since it surfaced running this:
  the first attempt (invoking `Workflow({name: "ldo:ldo", ...})` normally)
  failed outright — the plugin installed in that environment was cached at
  2.3.0, which predates the 2.5.2 bare→scoped agent-name fix and the entire
  Recorder role (added in 2.6.0), so `ldo:recorder` didn't resolve. Re-running
  via `scriptPath` directly against this repo's `workflows/ldo.js` bypassed
  the stale cache and completed correctly. If your own `/plugin update`
  doesn't pick up a new release, check whether your git remote's `fetch` is
  actually reaching current `origin/master` — `git ls-remote` is a cheaper,
  more reliable way to check than trusting `origin/<branch>` after a `fetch`.

## [2.15.2] — 2026-08-01

### Fixed

- **`/ldo-vendor` didn't mention the one real collision risk of bare-named
  agents.** Checked: `planner`, `coder`, `reviewer`, `security`, `researcher`,
  `recorder` don't collide with anything Claude Code ships or any official
  plugin's agents (those are always scoped, e.g. `some-plugin:code-reviewer`,
  never bare). But two files under `.claude/agents/` sharing the same bare
  name resolve silently by filesystem read order, no error or warning. Added
  a note to check for that before vendoring, and to re-check if the project
  later adopts another tool that also drops bare-named agents there.

## [2.15.1] — 2026-08-01

### Fixed

- **Ran `/ldo-docs-audit` and `/ldo-code-audit` on this project's own repo**, each
  via a fresh subagent with no prior context, per their own methodology. Real
  findings, fixed:
  - `skills/ldo-security/SKILL.md` described the Security agent backwards — it
    told the reader to invoke it on a diff, after the Reviewer approves.
    `agents/security.md` runs it on the *plan*, before code exists (shift-left).
    Root cause: the skill was never updated when Security moved to plan-time.
    Rewritten to match.
  - README's "What you can set" config example was missing `recorder` and
    `maxParallelFeatures` again — the exact regression already fixed once in
    2.10.2, in a third copy that drifted back out of sync with
    `ldo-config.example.json` and `DEFAULT_MODELS`. Fixed, and now notes
    `ldo-config.example.json` as the copy-paste source to reduce a fourth
    recurrence.
  - `workflows/ldo.js`'s Research stage was the one pipeline call that skipped
    the `${ctx.label}:role` labeling and `logPrefix` convention every other
    stage follows in multi-feature mode — its label and log lines were
    indistinguishable between concurrent features, in exactly the scenario
    that convention exists to prevent. `logPrefix` moved to the top of
    `runOneFeature` and applied consistently; two inline duplicates of the
    same ternary were collapsed into it.
  - `CODER_SCHEMA.env.actions` — the Coder is told to report what environment
    setup it performed, but `renderCoderSummary` never rendered it, so the
    Reviewer never saw it. Same bug class as the fields fixed in 2.10.2; this
    one slipped through that pass. Now rendered.
  - `skills/ldo-coder/SKILL.md` and `skills/ldo-reviewer/SKILL.md` didn't
    mention the exception-handling/comment rules (2.14.0) or the
    complexity-scaled attack depth (2.12.0) — both real, enforced behaviors
    documented correctly in the agent prompts but absent from the shorter
    skill summaries most likely to be someone's first read. Added.
  - Two comments narrated refactor history ("...as before this refactor")
    instead of stating a constraint — the exact pattern the project's own
    comment-discipline rule (2.14.0) tells the Coder not to write, present in
    the orchestrator's own source. Trimmed to the substantive part.

  One finding left open on purpose: `runOneFeature` in `workflows/ldo.js` is a
  286-line, six-responsibility function — a real decomposition candidate, but
  the audit's own routing rule says structural changes go through the pipeline
  as a task, not a quick hand-edit, since decomposition is exactly the kind of
  change most likely to silently break something subtle. Left as a backlog
  item rather than rushed.

## [2.15.0] — 2026-08-01

### Added

- **`/ldo-vendor` — a project-native install with no plugin required.** The
  plugin install assumes a separate install step before the pipeline runs —
  right for a machine you control, wrong for a repo worked on purely through a
  cloud session that clones it and has no install step of its own. Claude Code
  auto-discovers `.claude/agents/`, `.claude/skills/`, `.claude/workflows/`
  committed directly in a repo, no marketplace or plugin involved.

  This can't be a plain file copy: `workflows/ldo.js` calls every pipeline
  agent through a plugin-scoped reference (`ldo:planner`, `ldo:coder`, …) that
  only resolves inside an actual plugin install — copied verbatim without one,
  every agent call fails to resolve and the pipeline dies on its first step.
  `/ldo-vendor` strips the `ldo:` prefix from all six agent references and
  from every `/ldo:ldo` mention in the skills' own prose (a vendored pipeline
  runs as bare `/ldo`, since project-level workflows use their name directly).
  Verified the transform actually leaves no `ldo:` references behind before
  documenting it.

  Leaves `.claude/LDO_VENDORED.md` — the vendored version and a note that
  there's no `/plugin update` equivalent; re-running `/ldo-vendor` is how a
  vendored copy gets refreshed.

## [2.14.0] — 2026-07-31

### Changed

- **Swallowed exceptions and narrative comments are now checked at every stage,
  not just the periodic `/ldo-code-audit`.** Both were previously only real
  findings on a full cold read of the codebase — a per-change review could miss
  a `catch (e) { return null }` or a comment restating the next line, and it
  would only surface once enough of them accumulated for an audit to notice the
  pattern. That's late: an empty catch block is a bug the moment it's written,
  in whatever unlikely scenario nobody happened to test.

  The Coder now writes against this from the start: never swallow an error
  without the caller being able to tell what happened (logged, rethrown, or a
  typed result — not silently dropped), and a comment only earns its place by
  stating a constraint the code can't show itself, never by narrating what the
  next line already does or explaining history that belongs in a commit
  message. When acceptance criteria don't say what an edge case should do, fail
  loud rather than silently guessing, and record the choice in `deviations`.

  The Reviewer checks both explicitly now, per diff: every `catch`/error-return
  path for whether the caller can detect failure, every comment against the
  same "does this say something the code can't" test applied to dead code.
  Severity is explicit — a swallowed exception is `major` by default, `critical`
  when it can mask data loss or a security-relevant failure.

  `/ldo-code-audit` still exists for the cumulative case — patterns that
  predate this change, or that a fast-moving stretch let through — but the
  first line of defense is now at write time and per-diff review, not a
  periodic sweep.

## [2.13.0] — 2026-07-31

### Added

- **`/ldo-code-audit` — the code-side counterpart to `/ldo-docs-audit`.** Every
  individual change is disciplined (tests, per-diff review, contracts), and
  that still doesn't stop a file from becoming three files' worth of
  responsibility fifty small changes later, or a function from growing a
  comment for every edge case anyone ever hit instead of a name that says what
  it does. No single change looks wrong; the accumulation does — the same
  failure shape `/ldo-docs-audit` exists for, aimed at structure instead of
  prose.

  Reads the codebase cold, structurally, for module and file bloat, comment
  sprawl (a comment earns its place only by stating a constraint the code
  can't show — everything else is narration), duplicated logic that's already
  drifted apart, decomposition candidates, and dead surface — each verified,
  not asserted (grep for real callers before calling something dead).

  It doesn't stop at a report. Confirmed findings route by kind: mechanical
  cleanup (stale comments, verified-dead code) goes to the built-in
  `/simplify`; doc drift routes to `/ldo-docs-audit`; anything structural —
  splitting a file, extracting a shared module — goes back through the real
  pipeline as a task, because decomposition is exactly the kind of change most
  likely to silently break something subtle and deserves review, not a quick
  pass because it "should" be safe.

  `/ldo-init`'s drift-log counter now offers both audits together when it
  reaches the threshold — run one or both, the operator's call, same as before.

## [2.12.0] — 2026-07-31

### Changed

- **The Reviewer's attack step scales with the plan's `complexity` rating.**
  Until now step 3 ("try to break it") ran the same three-or-four-vector sweep
  regardless of whether the Planner rated the change `trivial`, `medium`, or
  `complex` — only the *model* running Review scaled, not how much attacking it
  did. A one-line fixup earned the identical adversarial sweep as a real
  feature.

  Now: `trivial` gets one or two of the most plausible vectors, `medium` keeps
  the existing three-or-four, `complex` can go past four when the surface
  genuinely has more angles. Verification — proving each acceptance criterion
  actually holds — never scales down; that's the part that makes the review
  real, not the exhaustiveness of the attack sweep.

  This scaling never touches the threat model. `security_surface` is rated
  independently of `complexity` precisely so a `trivial` one-line change to an
  auth check still gets every threat-model finding attacked in full — the
  independence of the two ratings was already the design, this just makes sure
  the new scaling respects it rather than accidentally undercutting it.

## [2.11.0] — 2026-07-31

### Added

- **`/ldo-resume` — pipeline runs survive an interrupted session.** The Workflow
  tool already caches every completed step against a `runId` and can replay it
  via `resumeFromRunId` — nothing about a `/ldo:ldo` call was actually lost when
  a session got killed or hit a limit. What was missing: nobody wrote the
  `runId` down, so there was nothing left to resume *from* once the session
  holding it in its head was gone.

  `/ldo-init` now wires a tracking protocol into `CLAUDE.md`: log the `runId`
  the moment a pipeline call starts (to `.claude/ldo-runs.json`, gitignored
  local state, not project data), update its status when the result comes back,
  and check for anything still `running` at the start of a session — before the
  operator has to ask.

  One real limit, stated plainly rather than glossed over: the cache lives in
  the harness session that produced the `runId`, not on disk. Picking a
  conversation back up in the *same* session (summarized, or reopened via its
  own resume) reaches the cache; a genuinely new session can't. `/ldo-resume`
  tries resume first, and falls back to a fresh run — reporting which happened
  rather than silently picking one — when the cache isn't reachable.

## [2.10.2] — 2026-07-31

### Fixed

- **Fresh-eyes audit of the whole project turned up its own drift**, the exact
  failure mode `/ldo-docs-audit` exists to catch, found on the project's own docs:
  - `ldo-config.example.json` pointed at `/ldo:init`, a command that doesn't
    exist (real name: `/ldo-init`, no colon) — dead reference in the one file
    meant to be copied as a reference.
  - `skills/ldo-config/SKILL.md`'s model-routing table had regressed to the
    pre-2.2.0 numbers (trivial and medium shown identical) — a second copy of
    the same table as README's, and only README got updated when the tiers
    were actually differentiated. Now points at `DEFAULT_MODELS` in
    `workflows/ldo.js` as the one source of truth, with both copies in sync.
  - Same skill referenced "the file" two paragraphs after establishing no
    config file exists — a leftover from before the no-file rewrite.
  - `recorder` — a real, running role — was missing from the example config
    and the roles table; `maxParallelFeatures` was a real, working config key
    documented nowhere.
  - README's pipeline diagram omitted the Record phase; its Files section
    listed `docs/contracts/` as a created-per-project path but not
    `docs/reviews/`, `docs/ARCHITECTURE.md`, or `docs/BACKLOG.md`, all written
    by the same Recorder.
  - `Budget` appears on line two of README's very first transcript, undefined
    anywhere — it's Claude Code's own session budget, not something LDO sets.
  - Two schema fields agents were told to fill (`plan_step` on a security
    finding, `note` on a verification criterion, `threat_model_notes`) were
    never read by the render functions that surface them downstream — accepted
    from the agent, then silently dropped before reaching the next stage. Now
    rendered.
  - A stray `claude.log.old` (terminal color codes from an unrelated session)
    was tracked in git; removed, `.gitignore` now covers `claude.log*`.

## [2.10.1] — 2026-07-31

### Fixed

- **Contract and architecture-doc discovery could create duplicates instead of
  migrating.** Confirming a contract candidate sourced from README/`SECURITY.md`
  prose left the full rule sitting in both places — the new contract file and the
  original doc — free to drift apart with nobody noticing until they disagreed.
  Same problem for the Recorder's architecture doc: it always wrote
  `docs/ARCHITECTURE.md`, even when a project already had `ARCHITECTURE.md` at
  the root or `docs/DESIGN.md`, producing two partial maps of the same system.

  `/ldo-contract` now offers, once per discovery batch, to trim a confirmed
  candidate's source section down to a pointer at the new contract — asked, never
  silent, and skipped entirely for candidates sourced from code rather than docs.
  The Recorder now checks for an existing architecture doc under another name
  before creating `docs/ARCHITECTURE.md`, and updates that one in place instead.
  `/ldo-docs-audit` also gained a check for this pattern generally, to catch a
  duplicate that slipped through some other way.

## [2.10.0] — 2026-07-31

### Added

- **`/ldo-init` discovers existing contracts on migration.** Running `/ldo-init` on
  a project that already has code (not a fresh `/ldo-bootstrap` start) now reads
  README, security docs, and the codebase itself for decisions that were already
  made but never written where LDO can check them — "internal tool, no auth by
  design" in a README paragraph, a pattern followed with zero exceptions across
  every request handler. Runs once, on the first `/ldo-init` in a project.

  Every candidate carries its evidence — a quoted line, a file reference, or a
  count of how consistently a pattern held — and nothing is written until the
  operator confirms it. A pattern followed inconsistently isn't proposed at all;
  guessing at a decision nobody made would put an unagreed rule in the checked
  path. `/ldo-contract` gained a "Discovering contracts in an existing project"
  section documenting the same process for a standalone re-scan later.

## [2.9.0] — 2026-07-28

### Added

- **Project contracts — rules the operator decided, not conventions inferred from
  code.** Four kinds, each checked at a different stage: **scope boundaries**
  ("single-user by design, never add auth") the Planner checks before writing a
  plan; **accepted risks** ("CSRF skipped — VPN-only access") Security won't
  re-raise as findings; **security floors** ("every handler validates input")
  Security and the Reviewer enforce regardless of the task's own `security_surface`
  rating; **code contracts** ("no raw SQL concatenation") the Reviewer blocks on —
  always `critical`, independent of how minor the instance looks.

  Contracts live in `docs/contracts/` — `scope.md`, `security.md` (Required +
  Accepted sections), `code.md` — not in `CLAUDE.md`. `CLAUDE.md` carries one
  pointer line; the Planner reads a contract file only when the task plausibly
  touches what it governs, so a variable rename never pays for the security floor.

  Record one with the new `/ldo-contract` skill — interactive, elicits the rule,
  classifies it, writes it precisely enough to check against a diff. An override
  mid-run gets appended as a note, not silently edited away, since a contract
  someone overrode once is a signal the contract itself may need revisiting.
  `/ldo-docs-audit` also checks contracts now: an accepted risk whose reasoning no
  longer matches the code, and patterns repeated everywhere that aren't written
  down yet — a suggestion, never an auto-write.

## [2.8.0] — 2026-07-28

### Added

- **Parallel multi-feature mode.** `args.tasks: [...]` instead of `args.task` runs
  N independent features at once, each isolated in its own git worktree —
  comparable to several developers on separate branches, conflicts resolved as
  routine at merge time rather than solved architecturally. The workflow script
  has no filesystem access, so each feature's Planner creates its own worktree via
  Bash before reading the codebase; every later agent in that feature's chain
  gets a workflow-composed block telling it to `cd` there first. Each approved
  feature ships independently via `/ldo-ship`, run from its own worktree.

  The entire existing pipeline body became `runOneFeature(task, ctx)`, called once
  for single mode (unchanged behavior) or N times through `parallel()` for multi
  mode — this is what makes per-feature state safe under concurrency instead of
  racing on shared module-level variables. A thrown error inside one feature
  returns a failure shape rather than aborting its siblings. Planned by a real
  `/ldo:planner` run on this repo.

## [2.7.3] — 2026-07-28

### Fixed

- **`ReferenceError` on every approved medium/complex run.** The Record-phase gate
  read `approved`, but the declaration had been dropped in an earlier refactor —
  found by the `/ldo:planner` run above while investigating an unrelated feature,
  not by review. One line, restored.
- **Six skills' Usage examples used pre-rename command names** (`/coder`,
  `/planner`, `/researcher`, `/reviewer`, `/security`, `/ldo`) — left behind by the
  2.0.0 `ldo-` prefix rename. Now `/ldo-coder`, `/ldo-planner`, `/ldo-researcher`,
  `/ldo-reviewer`, `/ldo-security`, `/ldo:ldo`.

## [2.7.2] — 2026-07-28

### Fixed

- **Coder's "don't re-scan the whole repo" rule was ambiguous.** It meant "don't
  redo Scout's full-repo pass" but could be read as "never look beyond the plan's
  file list" — which blocks the normal work of checking whether a helper already
  exists or following an unfamiliar import while implementing. Clarified: no
  upfront re-scan, but grep/read freely once inside a file that raises a question.

## [2.7.1] — 2026-07-28

### Added

- **`/ldo-ship` auto and auto-merge modes.** Alongside the default confirm-each-
  step flow: `auto` runs branch → commit → push → PR in one pass with no
  confirmations, stopping only on errors. `auto-merge` adds a squash-merge at the
  end, gated on **local tests first** (free, seconds — no CI minutes spent on what
  the dev machine can verify) and then CI if configured, merging on green and
  stopping on red. Mode is picked from natural language: "ship it" = interactive,
  "no questions" = auto, "ship and merge" = auto-merge.

## [2.7.0] — 2026-07-28

### Added

- **`/ldo-ship` — branch, commit, push, PR, squash-merge.** The pipeline left
  uncommitted changes and stopped; shipping was manual. `/ldo-ship` takes it the
  rest of the way, interactively: proposes a branch name from the task, a commit
  message from the plan and verdict, pushes, and creates a PR whose body is the
  review report — verification evidence, attacks tried, security findings. The
  receipts become the PR description, so a reviewer sees what was proven, not just
  "done." Every step is a separate confirmation; nothing ships without a yes.

## [2.6.1] — 2026-07-28

### Added

- **`ctags` symbol index for fast codebase navigation.** The Coder regenerates
  `tags` via `ctags -R .` on each run, if `ctags` is installed — a symbol → file →
  line index, gitignored as derived data. The Planner greps it first when
  searching for symbol locations: O(1) lookup against the index instead of O(n)
  search across source. Falls back to grepping source directly when `ctags` isn't
  present; no new agent, no new mechanism, just Grep pointed at a generated file.

## [2.6.0] — 2026-07-28

### Added

- **Record phase — the run's results survive past the session.** Until now the
  plan, the verdict, the verification evidence, and the attack log were ephemeral:
  they lived in the run's result object and vanished when the session ended. The
  whole pitch was "shows receipts" — but nothing kept them.

  On approved medium or complex tasks, a Recorder agent (Haiku — it formats, not
  thinks) writes three things: a review report at `docs/reviews/<date>-<slug>.md`
  with the full evidence and attack log; a one-page `docs/ARCHITECTURE.md` kept
  current from the plan's codebase context; and backlog items — GitHub Issues if
  `gh` is connected, otherwise `docs/BACKLOG.md`.

  The review report is the receipt. Every "proven" or "broke" claim carries the
  command output it was made with. A reader six months later can see exactly what
  was checked and how, not just that someone said it works.

## [2.5.2] — 2026-07-28

### Fixed

- **Workflow agents referenced by bare name, which may not resolve in a plugin.**
  Plugin agents register under their scoped identifier (`ldo:planner`, not
  `planner`) — that scoped name is the documented form used in @-mention,
  `--agent`, and hook matchers. The workflow's `agentType` calls now use the
  scoped form. The bare form was the one unverified risk most likely to break the
  entire pipeline at the first agent call; this makes the references match how
  plugin agents are actually identified.

## [2.5.1] — 2026-07-28

### Added

- **`/ldo-tui` gained the keyboard-encoding traps section** it was missing.
  Terminals encode keys as bytes and several collide: `Ctrl`+letter is `key &
  0x1F` (so Ctrl-M/I/H/[ collide with Enter/Tab/Backspace/Esc), `Ctrl-S`/`Ctrl-Q`
  are XON/XOFF and freeze the TTY by default, `Ctrl+Shift+letter` is indistinguishable
  from `Ctrl+letter`, macOS has no Meta key by default, and modifier+arrow is
  unreliable across terminals. The Kitty keyboard protocol fixes this but tmux
  doesn't pass it through — so design for the legacy encoding and treat Kitty as
  enhancement. Also softened "q or Esc quits" — Esc is better as cancel/go-back,
  and a tool that loses work on quit should confirm an accidental one.

## [2.5.0] — 2026-07-28

### Added

- **`/ldo-tui` — terminal interface design for Textual (Python) and Ink (TypeScript).**
  The strongest move is usually to not take over the screen at all: a full-screen
  TUI redraws a cell grid, which breaks the linear stream a screen reader consumes.
  The skill opens with that decision, then covers keyboard-first conventions,
  tiered colour degradation with NO_COLOR and TTY detection, density over chrome,
  honest progress, and surviving resize, tmux, ssh, and Windows. Named anti-patterns
  — the terminal web-app, colour vomit, the lying progress bar, gradient slop — are
  the catalog the skill exists to deliver. Framework primitives confirmed against
  current docs; design principles sourced from clig.dev, Seirdy, and CMU's
  progress-bar perception research.

## [2.4.0] — 2026-07-27

### Added

- **`/ldo-docs-audit` — a cold read of the whole documentation set.** Per-change
  review structurally cannot catch cumulative drift: every edit is locally correct
  and the whole comes apart across many of them. This reads everything *before*
  looking at the source, so gaps aren't filled from memory, then reports
  contradictions, stale claims, undefined jargon, and instructions that quietly do
  nothing — the category where the reader believes they configured something and
  no error ever appears.
- **The Reviewer now checks that a change's own docs kept up.** If the plan marks a
  step `user_facing` and no documentation moved, that's a finding — as is
  documentation describing what the plan intended rather than what was built.
- **A drift log in `CLAUDE.md`.** The Coder appends a line per user-facing change;
  around eight entries Claude offers the audit. It offers rather than runs, because
  a full read costs real tokens and the timing belongs to the operator.

## [2.3.0] — 2026-07-27

### Added

- **The Reviewer now attacks the change, not just checks it.** After proving the
  acceptance criteria, it switches posture and looks for the input that breaks
  things: boundaries, absent values, wrong shapes, an order-of-magnitude more load,
  concurrent calls, a failed dependency. Where the Planner flagged a threat model,
  it runs each named exploit — a mitigation counts as proven only when the attack
  is attempted and fails, with the output to show it.

  Breaks must be reproducible: command and captured output, or it's a guess and
  doesn't reach the verdict. A clean result is reported too, so "nothing broke" is
  distinguishable from "nobody tried". The new `attacks` field records what was
  tried and what held.

  Only the first review pass attacks; fix rounds re-run what previously broke.
  Re-attacking the whole surface each iteration would triple the cost of a loop
  that exists to close specific issues.

## [2.2.0] — 2026-07-27

### Changed

- **Tiers now actually differ.** `trivial` and `medium` shipped byte-identical, so
  the complexity rating changed one field in one tier — the routing was barely
  routing. Trivial work now runs Haiku end to end with Sonnet reviewing; medium is
  Sonnet writing and Opus reviewing; complex adds a stronger Planner. Security stays
  Opus everywhere: once the Planner says a change can be attacked, that isn't where
  to save money.
- **README reordered for a first-time reader.** A transcript of a real run now sits
  second, before install. The command table moved up out of the design essays, and
  the rationale sections moved below the mechanics they justify.

## [2.1.0] — 2026-07-27

### Fixed — documentation

Reviewed by someone reading the docs cold. Three factual errors, all stale text
left behind by earlier refactors:

- **The README described Setup and Docs as pipeline phases.** They were folded into
  the Coder in 1.x, and a whole section elsewhere argues they shouldn't be separate.
- **It claimed "every command is namespaced."** Skills aren't — that's why 2.0.0
  renamed them by hand. Now explains why `/ldo:ldo` has a colon and `/ldo-*` a hyphen.
- **Nothing warned that `ldo-config.json` is never read.** The Files section listed
  a `.example.json` "template," so the obvious move was to copy it — and get silently
  ignored routing. Now a bordered warning at the top of Configuration.

### Added — documentation

- **A transcript of a real run**, showing the security surface caught pre-code and
  the Reviewer finding an unbounded map that 47 passing tests missed.
- **A plain answer to "does it edit my files?"** — yes, unattended after approval;
  nothing committed, no branch created.
- **A Troubleshooting section** covering empty installs, greyed-out updates, ignored
  config, undrivable projects, and clean removal.
- Version check (`claude --version`), scope guidance on install, a link to the repo,
  and clarification that `/code-review` and friends ship with Claude Code.

### Changed

- `securityByDefault` documented in the config example — it was read by the workflow
  but absent from the reference.
- Pre-2.0 changelog entries collapsed into one `1.x` summary. Nine same-day releases,
  several undoing each other, presented as semver history was noise.

## [2.0.0] — 2026-07-27

### Changed — BREAKING

- **Every skill is now prefixed `ldo-`.** Skills are *not* namespaced by plugin the
  way agents are: the docs say a plugin skill creates a bare `/name` shortcut. So
  `/init` and `/config` were shadowing Claude Code's own built-in commands of the
  same name, and nothing clustered under a searchable prefix.

  | Was | Now |
  |---|---|
  | `/init` ⚠ clashed with built-in | `/ldo-init` |
  | `/config` ⚠ clashed with built-in | `/ldo-config` |
  | `/planner`, `/coder`, `/reviewer` | `/ldo-planner`, `/ldo-coder`, `/ldo-reviewer` |
  | `/security`, `/researcher` | `/ldo-security`, `/ldo-researcher` |
  | `/bootstrapper` | `/ldo-bootstrap` |
  | `/agent-ux` | `/ldo-agent-ux` |

  The workflow is unaffected — workflows *are* namespaced, so it stays `/ldo:ldo`.

## [1.x] — 2026-07-27

Same-day iterations before the first usable release. Kept brief on purpose: several
of these fixed each other, and the detail is only useful as archaeology.

- **Design converged from eleven agents to three.** Separate roles for codebase
  scanning, environment setup, verification, and documentation were folded into
  Planner, Coder, and Reviewer after applying one test to each: *would this warrant
  a different model than the Coder?* Environment setup and docs belong to whoever
  writes the code; verification belongs to whoever reviews it.
- **Bootstrapping moved out of the pipeline** into `/ldo-bootstrap`. It produces
  decisions, not code, and decisions need a conversation.
- **Security became surface-gated, not size-gated.** The Planner rates a change's
  attack surface independently of its complexity, because risk doesn't scale with
  diff size.
- **Distribution moved from an npx installer to a plugin marketplace**, then through
  three packaging fixes: a local source that couldn't auto-update, a manifest that
  pointed at a directory where a file list was required, and a component layout
  Claude Code couldn't discover.
- **`ldo-config.json` was found to be dead.** A workflow has no filesystem access;
  config only ever arrived through invocation arguments. The file existed and was
  documented while nothing read it — routing silently stayed on defaults. It's now
  `ldo-config.example.json`, clearly a reference, with the real mechanism documented.
