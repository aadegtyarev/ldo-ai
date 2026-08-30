# LDO — Lightweight Dev Orchestrator

**The model that checks the work isn't the model that did it — and it has to show receipts.**

A development pipeline for [Claude Code](https://claude.com/claude-code) built on three agents: **Planner, Coder, Reviewer**. Each runs on a model you choose, so you can write with a cheap one and review with a strong one. The Reviewer doesn't just confirm the work — it drives your running app and actively tries to break it, and it can't approve anything without captured output proving it holds.

```
Plan ──→ Code ⇄ Review
 │        │       │
 reads    writes  reads the diff, runs the app,
 the repo +tests  tries to break it
```

Claude Code's own `feature-dev` and community pipelines like `superpowers` cover similar ground, but run every phase on one model. Per-role routing, and a plan held by a deterministic script instead of a model's memory, is what LDO adds.

Source: [github.com/aadegtyarev/ldo-ai](https://github.com/aadegtyarev/ldo-ai)

## What a run looks like

```
/ldo:ldo "add rate limiting to the API endpoints"

Budget: unlimited
Task: add rate limiting to the API endpoints

▸ Plan
  Complexity: medium  |  Security surface: elevated  |  Coder:sonnet  Reviewer:opus  Fix-review:opus
    ⚠ New middleware reads a client-supplied X-Forwarded-For header — spoofable
  Plan: 3 step(s), 4 files mapped
    • Add a token-bucket limiter keyed on client IP
    • Wire it into the router ahead of auth
    • Cover the burst and reset paths with tests

▸ Security
  findings — one issue worth fixing before it's written
    [high] input_validation: trusting X-Forwarded-For lets a client forge its IP

▸ Code
  Coder pass 1: 47 passed, 0 failed

▸ Review
  Verification: verified — 3/3 criteria proven
  Attacks: 4 tried, 1 broke it
    ✗ 10k distinct client IPs in one minute
  ✗ 1 issue(s): 1 blocking, 0 advisory
    [major] middleware/rate_limit.go: bucket map grows without bound; no eviction

▸ Code
  Coder pass 2: 49 passed, 0 failed

▸ Review
  Verification: verified — 3/3 criteria proven
  Attacks: 2 tried, 0 broke it
  ✓ APPROVED — limiter returns 429 past 100 req/min, evicts idle buckets after 10m
```

Three things to notice. The Planner flagged the spoofable header **before any code existed**, so the mitigation was a requirement rather than a bug fix. The Reviewer then went past checking that the feature works and actively tried to break it — 10,000 distinct IPs surfaced an unbounded map that all 47 passing tests walked straight over. And the model that found it wasn't the model that wrote it.

(`Budget` in the transcript is Claude Code's own session budget, if one is set — LDO doesn't configure it.)

## Install

Requires Claude Code v2.1.154 or newer — that's the release that added the workflow runtime LDO's pipeline runs on. Check with `claude --version`.

```
/plugin marketplace add aadegtyarev/ldo-ai
/plugin install ldo@ldo-ai
```

Pick **user** scope when Claude Code asks, unless you're setting this up for a team — then see [Set up a project for a team](#set-up-a-project-for-a-team). Updates come with `/plugin update ldo@ldo-ai`.

**Working purely in a cloud session that just clones a repo, with no plugin-install step of its own?** See [Vendoring LDO into a project](#vendoring-ldo-into-a-project) below — a project-native install with no plugin required.

## Getting started

**Skip configuration for now.** The defaults already scale to the task: Haiku handles typos, Sonnet writes real changes, Opus reviews them. See [Configuration](#configuration) when you want to change it.

**Make it self-driving.** Run `/ldo-init` once in a project. It writes a short block into `CLAUDE.md` telling Claude to handle trivial edits inline and route real changes through the pipeline, so you stop typing `/ldo:ldo` for every task. The block is plain prose — edit it to taste.

**Starting a new project** is a conversation, not a pipeline:

```
/ldo-bootstrap "a TUI for tracking reading progress, syncing over a plain git repo"
```

It researches what already exists, works the stack out with you, and ends by naming the first task. Hand that to the pipeline:

```
/ldo:ldo "scaffold the Go module with Bubble Tea, rendering an empty list view that exits on q"
```

**Working on an existing project** is one command. The Planner reads the codebase, rates the task, and the pipeline scales itself:

```
/ldo:ldo "add rate limiting to the API endpoints"
```

The Planner rates the task, and that rating decides what runs. A refactor with no attack surface goes straight Plan → Code → Review. A change touching auth or user input adds a threat model first. You don't choose — though you can override, below.

**It edits your working tree.** Once you approve the run, the Coder writes files and the Reviewer runs your app; neither stops to ask. Nothing is committed and no branch is created — you're left with uncommitted changes to inspect. Start on a clean tree, or a branch you don't mind resetting. If you'd rather it not touch your tree at all, pass `isolate: true` — the run happens in its own worktree (`.worktrees/<slug>` on branch `ldo/<slug>`) and leaves your working tree untouched. The worktree is created and verified in a dedicated first phase before anything else runs, and if it can't be proven to exist the run **fails loudly rather than falling back to your working tree** — isolation you asked for and didn't get costs one run, not a dirty tree. Clean up a worktree you no longer need with `git worktree remove .worktrees/<slug>` and `git branch -D ldo/<slug>`. A fresh worktree starts with nothing gitignored in it — no `.venv`, no `node_modules`, no `.env` — so the Coder rebuilds the environment there before it can run a test; if it can't, the result says so in `env_status` rather than blaming the diff.

**A rule that must hold on every run doesn't belong in the task text.** If you find yourself retyping "the live database is read-only", "don't touch the pinned production worktree", or "check no other run is in flight" into task after task, that's a [project contract](#project-contracts) — record it once with `/ldo-contract` and the Planner and Reviewer enforce it on every run, with a violation rated `critical` automatically. Prose in a task is only as reliable as your memory of typing it.

**For a big or uncertain change**, opt the extra phases in:

```
/ldo:ldo research:true security:true "switch auth from sessions to JWT"
```

**After the pipeline**, ship it with `/ldo-ship` — branch, commit, push, PR, optional squash-merge, each step confirmed. The PR body carries the review report: what was proven, what was attacked, what held — posted from a file and read back afterwards, because `gh` returns a URL and exit 0 whether the body arrived or not. Or get a second opinion first from the built-ins — `/code-review high`, `/security-review`, `/deep-research`.

## Pipeline

```
[Isolate] → [Research] → Plan → [Security] → Code ⇄ Review → [Record]
 create      web         read repo  threat     implement  read diff    write report,
 + verify    sources     + rate     model      + test     + attack it  architecture doc,
 worktree                the task              + document              backlog
```

**Three agents always run.** Plan reads the codebase and produces the plan. Code sets up the environment, implements it, writes tests, updates docs. Review reads the diff, drives the running application to prove each acceptance criterion — that part never scales down — then switches posture and attacks it. How much attacking scales with the plan's own `complexity` rating: one or two vectors for `trivial`, three or four for `medium`, more for `complex` if the surface warrants it. A threat model is attacked in full regardless — `security_surface` is rated independently of `complexity` for exactly this reason, so a one-line fix to an auth check still gets every exploit scenario run against it.

On approved medium or complex tasks, a fourth pass **Record** writes the run's results to disk: a review report in `docs/reviews/` with the full verification evidence and attack log (the receipts that would otherwise vanish with the session), a one-page `docs/ARCHITECTURE.md` kept current, and backlog items — `docs/BACKLOG.md` by default, or GitHub Issues if you opt in with `backlog.destination: "github"`. In a parallel or `isolate: true` run, backlog items go to `docs/backlog/<label>.md` instead — one file per feature, so two Recorders writing at once never race over the same section numbers. Record also confirms it's writing inside its own worktree before it touches disk; a run reports it plainly if a Recorder wrote outside the tree it was assigned. Record also runs when the fix loop exhausts without approval — the report is written and marked NOT APPROVED, backlog items still go out, but the architecture doc is deliberately left untouched since the change may never land.

Three more run only when they earn their place:

| Agent | Runs when |
|-------|-----------|
| **Isolator** | `isolate: true` or `tasks` — creates this feature's worktree and reports the git output proving it exists, before any other agent starts |
| **Researcher** | `research: true` — the task needs domain knowledge from outside the repo |
| **Security** | The Planner rates the change's attack surface `elevated` |

### Running several features in parallel

Pass `tasks` instead of `task` and each one runs independently, isolated in its own git worktree:

```js
Workflow({name:"ldo:ldo", args:{
  tasks: ["add rate limiting to the API", "fix the session token refresh bug"]
}})
```

Each feature gets its own worktree (`.worktrees/<n>-<slug>` on branch `ldo/<n>-<slug>`), created by an **Isolate** phase that runs before that feature's Planner, and every later agent in that feature's chain works inside it — features never see each other's changes. This is comparable to several developers on separate branches: conflicts get resolved as routine at merge time, not solved architecturally by the orchestrator. Each approved feature ships independently — run `/ldo-ship` from inside that feature's worktree, where it's already on the right branch. What the Isolate phase proves is that the directory exists, is a linked worktree of this repository, is on the branch it says it is, and was branched fresh from the current HEAD — four independent git outputs cross-checked against each other by the orchestrator, not a claim from the agent that ran them. It is not proof against deliberate fabrication: four mutually consistent forged outputs would pass. What it does catch is omission, which is the failure that actually happened. The Reviewer and Recorder each report the worktree root they confirmed, and the orchestrator compares that against the **verified** path — no longer against the Planner's own claim — so a mismatch is reported rather than absorbed. The Coder is instructed to verify its tree in its own agent definition. This catches an agent that lost the instruction and honestly reported where it ended up; it is a detection aid, not a containment boundary.

**If a feature's plan creates numbered files — migrations, most often** — the Planner declares how many, where, and the exact identifiers it intends to claim. Sibling features can't see each other's claims while they're planning (that's inherent to running in parallel, not a bug), so the Reviewer runs a collision check across every active worktree before approving: same directory, same number claimed twice, fails the run with a `critical` finding rather than letting two migrations silently share a number.

**Each worktree needs its own environment built before a test can run.** `git worktree` checks out tracked files only, so nothing gitignored comes along — no virtualenv, no `node_modules`, no `.env`, no cached build. The Coder is told to find the project's real install command rather than reach for the obvious one (the optional-dependency group, the Makefile target, the CI workflow), because an environment built from `pip install -e .` where the suite needs `.[dev,test]` produces a suite that fails for reasons that have nothing to do with the change. If it can't be built, the run says so through `env_status` instead of reporting a rejection that reads like a defect in the code. A one-line note in `docs/NOTES.md` (`/ldo-note`) is the cheapest way to stop every future run rediscovering the same setup step.

**If the features run integration tests against a real database**, worktree isolation covers the files but not the data — two runs migrating and truncating the same database will corrupt each other's results, and the failures look like flaky tests rather than interference. You don't need anything elaborate: give each run its own database via whatever environment variable your test setup already reads, and the file isolation handles the rest. Record it as a code contract (`/ldo-contract`) so the Coder and Reviewer set it on every run instead of you remembering to mention it.

Starting a project from nothing is a conversation, not a pipeline — use `/ldo-bootstrap "your idea"` for that. It researches prior art, works through the stack with you, and hands the first task to `/ldo:ldo`.

### Plan first, then split

The Planner rates every plan for size — one run, or several — and reports it on every run, whether or not you asked. `planOnly: true` stops the pipeline after Plan, and after Security when the surface came back `elevated`, so you get the plan and its rating without anything being written. (In a multi-feature batch, and under `isolate: true`, the Isolate phase still runs first and the plans land in the verified worktree.)

When the Planner says the task is really several, the run prints a copy-pasteable `args.tasks` array containing the independent chunks, and lists the dependent ones separately underneath. The separation is the point: `tasks` runs features in parallel worktrees, so a batch whose members depend on each other produces N worktrees fighting over the same lines rather than N features. Dependent chunks get run afterwards, in sequence, once what they name has landed.

LDO does not execute the split for you. The list comes back so you can read it, cut the chunk that shouldn't exist, and reword the one whose scope drifted — that review is the reason for handing it over rather than acting on it. A plan-only result carries `mode: 'plan-only'` and has no `approved` field at all, so nothing downstream can mistake a plan for a rejected run.

### Why the Planner decides about Security

The Planner rates every task on two independent axes:

**Complexity** (`trivial` / `medium` / `complex`) picks the models.

**Security surface** decides whether a threat model is worth an agent:

| Surface | Meaning | Result |
|---------|---------|--------|
| `none` | Pure refactor, docs, tests | Nothing added |
| `low` | Touches data paths, no new entry point | Planner's own notes go to the Coder |
| `elevated` | New input, auth, secrets, injection, dependency, or crypto surface | Security agent runs |

Risk doesn't scale with diff size — a one-line change to an auth check is `trivial` work with an `elevated` surface. When the rating is ambiguous the Planner rounds up: a wrong `elevated` costs one agent, a wrong `none` ships the vulnerability.

**Review finds blocking issues → back to Code.** Up to 3 iterations, configurable. After the first pass, a new blocking finding that the fix didn't cause and wasn't on the verification list is recorded as advisory instead of buying another iteration — otherwise a conscientious Reviewer flagging every fresh small thing as `major` can keep a run from ever converging. Two things are never downgraded that way: a finding in a file the fix pass actually edited (attributed from the Coder's own `files_changed`, not from the Reviewer remembering to flag it), and anything rated `critical`.

### Project contracts

Some rules aren't conventions the Coder should match — they're constraints the operator decided, and they must hold no matter what the task looks like. "Every user action emits an audit event." "No raw SQL string concatenation." "Single-user by design — never add auth." These come from a decision, not from reading the code, so they're recorded explicitly rather than inferred.

Record one with `/ldo-contract`. It's interactive — you describe the rule, it classifies which of four kinds it is and writes it to the matching file under `docs/contracts/`. (Not to be confused with `agents/security.md`, the Security agent's own prompt — `docs/contracts/security.md` is what the operator declared, read *by* that agent, not the agent itself.)

| Kind | File | Checked by | When |
|---|---|---|---|
| Scope boundary | `docs/contracts/scope.md` | Planner | Always, if the file exists — it's short and decides whether the task should exist in this form |
| Accepted risk | `docs/contracts/security.md` (Accepted) | Security | So a closed question doesn't get re-raised as a finding |
| Security floor | `docs/contracts/security.md` (Required) | Security + Reviewer | Whenever the task touches an area the floor governs, independent of the task's own `security_surface` rating |
| Code contract | `docs/contracts/code.md` | Reviewer | Whenever the diff touches structure the contract governs — violation is always `critical` |

None of this loads into `CLAUDE.md` — that file stays thin, one pointer line. The Planner reads a contract file only when the task plausibly touches what it governs; a variable rename never pays for the security floor. `/ldo-docs-audit` also checks contracts occasionally: for an accepted risk whose stated reasoning no longer matches the code, and for patterns repeated everywhere that aren't written down as a contract yet — a suggestion, never an auto-write.

**Migrating an existing project onto LDO?** The first `/ldo-init` run on a project with existing code (not a fresh `/ldo-bootstrap` start) reads README, security docs, and code for decisions that were already made but never written where LDO can check them — "internal tool, no auth by design," a pattern followed with zero exceptions across every handler. Every candidate carries its evidence (a quote, a file reference, or a count of how consistently the pattern held); nothing gets written until you confirm it. Run `/ldo-contract` on its own any time later to re-scan or add one by hand.

### Keeping docs and code honest

Two different failures, handled two different ways.

**A change ships without its docs, or its diff is needlessly messy.** The Reviewer catches this per-change: the plan marks steps `user_facing`, so if one exists and no documentation moved, that's a finding — same review flags dead code, duplication, and over-engineering in the diff it's looking at. It specifically checks every `catch`/error-return path for whether the caller can tell what happened — a swallowed exception is `major` at minimum, `critical` if it can mask data loss or a security-relevant failure — and every comment for whether it states something the code can't show itself, rather than narrating what the next line already does. The Coder is told to write it this way from the start; the Reviewer is what catches it when that didn't happen.

**Things slowly stop being what they look like.** Nothing in a per-change review can catch this, because no single change caused it. Each edit is locally correct; the whole comes apart across many of them. A doc section keeps describing a phase removed three changes ago. A file that was one clear responsibility five changes ago has quietly grown a second and third. A comment explaining a workaround outlives the workaround.

Two audits read the whole thing cold, for this reason specifically:

- **`/ldo-docs-audit`** — reads the docs before the source, deliberately, so gaps aren't filled from memory — reports contradictions, stale claims, undefined jargon, and the worst category: instructions that quietly do nothing, where the reader believes they configured something and nothing errors.
- **`/ldo-code-audit`** — reads the codebase structurally for what accretion did to it: bloated files carrying more than their name says, comment sprawl narrating what the code already shows, logic duplicated and drifted apart, dead exports nothing calls. It doesn't stop at a report — mechanical cleanup routes to `/simplify`, doc drift routes to `/ldo-docs-audit`, and anything structural (splitting a file, extracting a shared module) goes back through the real pipeline as a task, because decomposition is exactly the kind of change most likely to silently break something subtle.

If you ran `/ldo-init`, the Coder appends a line to a drift log in `CLAUDE.md` after each user-facing change. Around eight entries, Claude offers both audits — it offers rather than runs either; a full read costs real tokens, and the timing is yours.

### Notes and decisions

Two more things worth recording that aren't rules and don't fit `docs/contracts/`: operational gotchas, and why something got decided.

`/ldo-note` records one of two kinds, and stores them differently on purpose:

- **Operational note** → `docs/NOTES.md`, read by the Coder before every run. Kept deliberately small — a rough ceiling of 15-20 entries, pruned rather than grown. A note that's stopped being surprising belongs in README instead; a note that's stopped being true gets removed.
- **Decision or mandate** → `docs/DECISIONS.md`, never read automatically by any agent. An append-only log with no size ceiling, because nothing depends on reading it end to end — referenced by date or keyword, like `git log`, when a past call needs explaining.

That split exists because "a log nobody reads" and "a log too big to read" are the two ways these files usually die, and they need opposite fixes: `NOTES.md` stays small because something depends on reading all of it every run; `DECISIONS.md` is allowed to grow precisely because nothing does.

If the same override or workaround shows up more than once, that's not trivia anymore — `/ldo-note` and `/ldo-docs-audit` both flag it as a candidate for `/ldo-contract` instead of a third note.

### Resuming an interrupted run

A `/ldo:ldo` call already survives more than it looks like: every `Workflow` call gets a `runId`, and Claude Code caches each completed step (Plan, Coder, Reviewer, ...) against it. Pass that same `runId` back via `resumeFromRunId` and the cached steps return instantly — only what hadn't finished actually re-runs. The gap was that nothing wrote the `runId` down, so if the session holding it in its head went away, there was nothing to resume *from*.

If you ran `/ldo-init`, every `/ldo:ldo` call now gets logged to `.claude/ldo-runs.json` the moment it starts, and updated when it finishes. The full arguments the call needs to resume — `task`, `security`, `research`, `isolate`, any model override — live in a side file, `.claude/ldo-args/<runId>.json`, with `ldo-runs.json` holding only a small tracking entry that points at it, alongside the `transcriptDir` the `Workflow` call itself returns; that split keeps the args out of the file that gets rewritten on every run and off the operator's screen. At the start of a session, Claude checks that file for anything still marked `running` and tries to resume it before you ask.

One real limit worth knowing: the in-process cache lives in the harness session that produced the `runId`, not on disk. Picking a conversation back up in the *same* session (it got summarized, or you reopened it via its own resume) — the cache is almost always still there. A genuinely new session can't reach it, and when that happens `/ldo-resume` doesn't just give up and start over: it reads the run's on-disk transcript journal for whatever already completed, reports which stages survived, and feeds a recovered plan into the fresh run instead of re-planning it from scratch. See `/ldo-resume` for the exact protocol.

## Usage

Type `ldo` in the command palette and everything clusters together.

| Command | What |
|---------|------|
| `/ldo:ldo "task"` | Full pipeline (Plan → Code ⇄ Review) |
| `/ldo:ldo research:true "task"` | Add the web research phase |
| `/ldo:ldo security:true "task"` | Force the threat model on (or `false` to skip it) |
| `/ldo:ldo planOnly:true "task"` | Plan and stop — no code, no review; returns the plan and its sizing block |
| `Workflow({args:{task, resumePlan}})` | Skip the Planner and run against a plan recovered from an interrupted run's transcript — a plan object, so it goes through the tool call, not the palette |
| `/ldo-bootstrap "idea"` | Start a project — prior art, stack, roadmap (interactive) |
| `/ldo-planner "task"` | Plan only |
| `/ldo-coder "task"` | Implement a plan |
| `/ldo-reviewer` | Review the diff, drive the app, try to break it |
| `/ldo-security` | Threat-model a plan |
| `/ldo-researcher "topic"` | Multi-source web research |
| `/ldo-ship` | Branch, commit, push, PR, squash-merge — with the review report as PR body |
| `/ldo-docs-audit` | Read the docs cold and find what's drifted |
| `/ldo-code-audit` | Read the code cold for bloat, comment sprawl, and duplication, and route fixes |
| `/ldo-contract` | Record a project contract — scope, security, or code rule |
| `/ldo-note` | Record an operational note or a decision/mandate — not a rule, just a fact |
| `/ldo-tui` | Design and build a terminal interface (Textual / Ink) |
| `/ldo-config` | Walk through model routing |
| `/ldo-init` | Write the self-routing block into the project's `CLAUDE.md` |
| `/ldo-agent-ux` | Write agent context and output that a model and a human can both read |
| `/ldo-resume` | Check for a pipeline run left in progress and resume it, or start fresh |
| `/ldo-vendor` | Explains vendoring; the actual copy is `scripts/vendor.sh <target>` |
| `/ldo-feedback` | File an LDO bug/observation — structured, secrets redacted, as a GitHub issue |

Why the punctuation differs: `/ldo:ldo` is a **workflow**, and Claude Code namespaces those by plugin. The `/ldo-*` commands are **skills**, which get no automatic namespace — the `ldo-` prefix is part of their name, so they group in the palette and don't shadow built-ins like `/init`.

## Configuration

> **There is no config file to edit.** A workflow can't read from disk, so settings reach the pipeline only as arguments at invocation. Creating `.claude/ldo-config.json` does nothing — it will be silently ignored and you'll think you configured something. `ldo-config.example.json` in the plugin is a reference list of the keys, not a file anything loads.

Two places to put settings:

**Per project — in `CLAUDE.md`.** Run `/ldo-init`, then add your routing to the block it writes. Claude reads `CLAUDE.md` every session and passes it along, so it applies to every run. Commit it and your team gets the same behaviour.

**Per run — ask for it in the prompt.** Plain English works, because Claude translates it into the call:

```
run ldo on "refactor the auth module", with haiku coding and opus reviewing
```

### What you can set

```json
{
  "models": {
    "trivial": { "planner": "opus", "coder": "haiku",  "reviewer": "opus",  "reviewerFix": "opus",  "security": "opus", "researcher": "sonnet", "recorder": "sonnet" },
    "medium":  { "planner": "opus", "coder": "sonnet", "reviewer": "opus",  "reviewerFix": "opus",  "security": "opus", "researcher": "opus",   "recorder": "sonnet" },
    "complex": { "planner": "opus", "coder": "opus",   "reviewer": "fable", "reviewerFix": "fable", "security": "opus", "researcher": "opus",   "recorder": "sonnet" }
  },
  "maxFixLoops": 3,
  "blockingSeverities": ["critical", "major"],
  "researchByDefault": false,
  "maxParallelFeatures": 12,
  "planner": { "maxStepsPerRun": 8, "preferSplit": true },
  "tests": { "scope": "scoped", "fullSuiteAt": "final-pass" },
  "backlog": { "destination": "file" },
  "stallMs": {
    "planner": 480000,
    "reviewer": 480000,
    "coder": 360000,
    "security": 300000,
    "researcher": 300000,
    "recorder": 180000
  }
}
```

Those are the defaults, in full — matching `ldo-config.example.json`, the copy-paste source if you want a starting point rather than retyping this. `securityByDefault` is deliberately unset — leave it out and the Planner decides per task; set `true` or `false` to override it everywhere.

`stallMs` is keyed by role, not by tier, because how much an agent generates before its first tool call tracks the *schema* that role fills, not how complex the task is — a trivial task's Reviewer still fills out full verification and attack sections. It sets an undocumented Claude Code option; older or future harnesses that don't recognise the key simply ignore it and fall back to their own 180-second default, same as today. Values are milliseconds with a floor of 1000 — `480` meaning "eight minutes" is rejected with a warning rather than silently aborting that role six times in a row — and a role name LDO doesn't recognise is warned about instead of quietly dropped.

`planner.maxStepsPerRun` and `planner.preferSplit` shape how the Planner rates a task's *size* — whether it's one run or several. The ceiling is soft: the orchestrator enforces nothing, doesn't truncate a longer plan and doesn't refuse it, it simply tells the Planner what this project considers one run's worth of work so a plan that sprawls past it comes back rated `fits_one_run: false`. An invalid value is warned about and the default kept. `preferSplit: false` is how you say "plan it as one piece, I know what I'm asking for" — the Planner then only flags a split when the task is outright incoherent as a single run. Both values are interpolated into the Planner's prompt rather than checked after the fact, so changing them actually reaches the agent doing the rating.

`tests.scope` and `tests.fullSuiteAt` decide how often the test suite runs. A single run used to execute it five to eight times — the Coder's baseline, its per-step runs and its end-of-pass run, the Reviewer's own run, and the two runs the revert-and-rerun proof needs to watch one test flip — all repeated on every fix round. With `scope: "scoped"` (the default) those intermediate runs use the Planner-supplied `test_command_scoped` template narrowed to the files actually touched, and the full suite runs once per Coder pass. Set `scope: "full"` to restore the old behaviour exactly.

Scoping only happens when the Planner supplied a `test_command_scoped` that survives validation — one `{paths}` placeholder, no shell metacharacters, a recognised runner. Any project whose runner can't select a subset, and every resumed plan (a recovered command string is dropped rather than executed), falls back to the full suite and behaves precisely as before.

`fullSuiteAt` says where the one full run belongs: `"final-pass"` (default) at the end of each Coder pass, `"ship"` deferred to `/ldo-ship` before the PR, `"never"` nowhere in the pipeline. On `"ship"` and `"never"` the Coder and the Reviewer are each handed an explicit *do not run the full suite* block — the setting removes the run rather than only labelling the result, and it applies to fix passes too, since a fix pass that runs the whole suite costs what the setting exists to avoid. The Reviewer is told to mark a criterion it can no longer prove as `skipped` (reported NOT PROVEN) rather than passing it. `fullSuiteAt` only has meaning under `scope: "scoped"`: with `scope: "full"` the baseline and every per-step run are already the whole suite, so there is nothing left to defer or disable, and the setting is neutralised with a log line rather than silently reporting a run as `disabled` that in fact tested everything. Whatever the setting, the run's result carries `full_suite_status` (`ran` | `not_run` | `disabled` | `deferred_to_ship`), and any value other than `ran` appends a `FULL SUITE NOT RUN` line to the verdict summary and prints one in the run log. It annotates; it never blocks. An `approved: true` from a run whose `full_suite_status` isn't `ran` means only the touched files were tested — read it before treating that approval as a merge signal.

`backlog.destination` decides where the Record phase puts backlog items: `"file"` (the default) or `"github"`. The default is the file and GitHub is opt-in, which is the inverse of how this used to work, and the reason is not a preference. The host safety classifier refuses the *attempt* at external publication rather than its result, so a Recorder that runs even one `gh` probe is ended before it writes anything — and what goes with it is the review report and the architecture doc, neither of which has anything to do with GitHub. Three runs in one session ended exactly that way, each reporting `record_status: failed` with no artifact at all. So on `"file"` the Recorder is told not to run `gh` at all, not even to check whether it is available: "try it and fall back" is the failure mode, not the safety net. Set `"github"` to opt in — one issue per backlog item, labelled `backlog` only if that label already exists, and if `gh` turns out to be missing, unauthenticated or refused it falls back to the file and says so. An unrecognised value warns and keeps `"file"`, and an unknown key under `backlog` is warned about rather than silently dropped. Independently of the setting, a Record phase that returns nothing now appends a `RECORD NOT PERSISTED` line to the verdict summary and the run's `record_status` is `failed` — like `FULL SUITE NOT RUN` it annotates and never blocks, since a dead Recorder says nothing about the code, but it is the only place you learn the report and architecture doc were not written.

Beside it sits `env_status` (`ok` | `unknown` | `unreproducible`), which qualifies the other direction: whether the tests behind the verdict ran in an environment the Coder could actually build. A fresh worktree brings nothing gitignored with it, so a Coder that guessed at the install command can end up running a suite that was never going to pass, and the run then rejects correct code for reasons that have nothing to do with the diff. `unreproducible` means the Coder reported an unresolved environment *and* either took no baseline or saw nothing that was failing before its first edit get better; `unknown` means no baseline was taken and nothing was reported unresolved. Anything other than `ok` prints a line in the run log and the multi-feature summary, and `unreproducible` appends an `ENVIRONMENT NOT REPRODUCED` sentence to the verdict summary. Like `full_suite_status` it annotates and never blocks — it is applied only to a run that was already not approved, and it can never turn a rejection into an approval, since it is derived from fields the Coder reports about itself. `stats.issues_unaccounted` sits alongside: how many issues sent to a fix pass came back with no per-issue outcome, again reported rather than gated.

`work_location` (`worktree` | `working_tree`) says where the pipeline told its agents to work. It is derived from the *verified* isolation object, not from the flag you passed, so it cannot read `worktree` unless the Isolate phase actually proved one exists — `isolate: true` with a failed proof returns an error, never a result claiming isolation it didn't get. `worktree_path` and `branch` carry that verified path and branch rather than the Planner's report of them. What it does not claim is where the agents actually wrote: that is still *detected* by comparing each agent's self-reported root against the verified path, not contained.

`coder` and `reviewer` move between tiers — deliberate, not an oversight. `planner` is Opus everywhere because complexity is *its own output*: nothing can gate the Planner's model on a rating it hasn't produced yet, and its value — surfacing what the task didn't ask about, not just executing what it did — doesn't get cheaper just because the resulting plan turns out short. `reviewer` is Opus on `trivial`/`medium` and Fable on `complex` (falling back to Sonnet when Fable isn't on your route), because its entire premise is not sharing the Coder's blind spot and a cheap model doesn't reliably know when to stop and ask instead of writing confident, made-up prose about work it didn't verify — exactly the failure mode a cheap Reviewer is worst-positioned to catch. Complex work has the most surface to miss, so it gets the strongest reviewer; Sonnet is the floor, because a weaker review still catches things and no review doesn't. `coder` is where the tier does real work — haiku/sonnet/opus — because executing a plan's *width* (not the underlying code's difficulty) is what actually scales with `trivial`/`medium`/`complex`.

Security is Opus at every tier. When the Planner has decided a change can be attacked, that's not where to save money.

`reviewerFix` routes review rounds 2 and later — the fix passes. It ships set to the same model as `reviewer` in every tier, so out of the box nothing about today's behaviour changes. The case for lowering it is genuine: round 1 is an open-ended search for defects nobody has named, while a fix pass is bounded verification of a list the previous round already wrote down, and that is the easier job. The case against it is also genuine, and measured: in one run, round 4 found a real new `major` that rounds 1-3 had missed. So the saving is a trade rather than free, and LDO doesn't take it on your behalf — setting `reviewerFix` is how *you* buy cheaper fix rounds knowing what they can cost. It falls back the same way `reviewer` does (Fable to Sonnet), and the post-plan log line names both models so you can see an override took effect.

An override is merged per **role**, not per tier: `{"models": {"medium": {"coder": "haiku"}}}` changes the medium Coder and leaves the other six medium roles at their defaults. A tier name, role name or model value LDO doesn't recognise is warned about in the run log and ignored — an unusable model name is never forwarded to the harness, where it would fail with your typo nowhere in sight.

Model names mean whatever your setup routes them to; the pipeline assumes nothing about which is stronger. Agent files declare no model of their own, so this is the only thing that decides routing.

Walk through it interactively: `/ldo-config`.

## Use with the built-ins

LDO deliberately doesn't rebuild what Claude Code already ships. These four come with Claude Code — nothing to install:

| Instead of asking LDO | Use |
|---|---|
| A second opinion on a large diff | `/code-review high` — multi-agent, confidence-filtered, `--fix` and `--comment` available |
| A dedicated vulnerability pass | `/security-review` |
| Cleanup only, no bug hunt | `/simplify` |
| Research where the decision is expensive to reverse | `/deep-research` — parallel search, agents vote on each claim, adversarial verification |

Run them yourself after the pipeline finishes. A workflow can't invoke them, so they complement LDO rather than compose into it.

Worth installing from `claude-plugins-official`:

- **`security-guidance`** — reviews every edit, turn, and commit for vulnerabilities as you work. LDO's Security agent threat-models the *plan*; this catches what slips through during *writing*. They layer.
- **`frontend-design`** — if the project has a web UI. Anthropic's own aesthetic-direction skill; no reason to write another.
- **`chrome-devtools-mcp`** — for visual verification the Reviewer can drive. Lighter on tokens than the Playwright alternative.
- **The matching LSP plugin** — `typescript-lsp`, `gopls-lsp`, `rust-analyzer-lsp`, and so on.

## Set up a project for a team

Commit two things so teammates get the same behaviour on first open:

**`CLAUDE.md`** — run `/ldo-init` to write the routing block, then commit it. This is where per-project model routing lives; Claude reads it every session and passes it to the pipeline.

**`.claude/settings.json`** — pin LDO and the plugins worth having alongside it:

```json
{
  "enabledPlugins": {
    "ldo@ldo-ai": true,
    "security-guidance@claude-plugins-official": true,
    "typescript-lsp@claude-plugins-official": true
  }
}
```

When a teammate opens the repo, Claude Code prompts them to install everything listed. Swap the LSP for your language (`gopls-lsp`, `rust-analyzer-lsp`, `pyright-lsp`, …); add `chrome-devtools-mcp` for web UIs, `frontend-design` for design direction. See [Use with the built-ins](#use-with-the-built-ins) below for what each does.

## Vendoring LDO into a project

The plugin install assumes a separate install step somewhere before the pipeline runs — fine on a machine you control, wrong for a repo worked on purely through a cloud session that clones it and has no such step of its own. It's also only as reliable as the marketplace cache behind it: that cache can lag the real source for reasons outside LDO's control, silently, with no error — just an old version quietly running. Claude Code has a project-native path that sidesteps both problems: files placed directly under a repo's `.claude/agents/`, `.claude/skills/`, `.claude/workflows/` are picked up automatically the moment the repo is opened, locally or in the cloud — no install, no marketplace, no cache to go stale.

`scripts/vendor.sh <target-project-dir>` copies LDO into that shape — a real script, not instructions for a model to re-derive by hand each time. It isn't a plain file copy: the workflow script calls every pipeline agent through a plugin-scoped reference (`ldo:planner`, `ldo:coder`, …) that only resolves inside an actual plugin install, so the script strips that prefix from the six agent references — and **verifies** the result before writing it, refusing to proceed if anything's left half-transformed — plus rewrites every `/ldo:ldo` mention in the skills' own prose to bare `/ldo` (project-level workflows use their name directly, no plugin prefix). Run it from anywhere inside an LDO checkout; it finds the source root and the target on its own, and warns on agent-name collisions rather than silently overwriting.

```
scripts/vendor.sh /path/to/target-project
```

It leaves `.claude/LDO_VENDORED.md` behind — the version vendored and a note that this copy has no `/plugin update` equivalent. Re-run the script when you know LDO has changed and want the update; there's no background check pulling updates into a vendored copy, and there shouldn't be. See `/ldo-vendor` for the full mechanism and a manual fallback for the rare case a script can't run against the target at all.

Use the plugin install unless something specifically rules it out — it updates centrally and shares across every project on the machine. Vendor when the pipeline needs to travel with the repo itself, or when the plugin-install path in your environment has proven unreliable.

## How it works

1. The Planner reads the codebase, writes the plan, rates complexity and security surface
2. Complexity picks the models; security surface decides whether a Security agent runs
3. Each agent returns schema-validated JSON, rendered compactly for the next stage
4. Coder and Reviewer loop until approved, or until no `critical`/`major` issues remain — a fix-pass finding not caused by the fix, not re-verified, not `critical` and not in a file that pass edited rides along as advisory instead of holding the loop
5. The Reviewer's verdict includes captured evidence — a criterion passes only with proof

**Portable**: the protocol isn't tied to Claude Code. Each role is a prompt plus a JSON Schema contract. The orchestrator can be any script calling any LLM runner.

## Why only three core agents

Every role has to answer: *would I route this to a different model than the Coder?* If not, it's taxonomy, not architecture.

- **Environment setup** isn't separate — the Coder needs a working environment to run tests, and tests aren't optional. Splitting it means the setup agent finishes before the code that needs it exists.
- **Docs** aren't separate — a CHANGELOG line isn't a different skill from the code that earned it, and the Coder already knows what changed.
- **Verification** belongs to the Reviewer. Checking your own work is weak review; the same blind spot that wrote the bug will skip the test that catches it. Reading the diff and running the app are two ways to answer one question, and both benefit from a model that didn't write the code.
- **Codebase reading** belongs to the Planner. You can't plan what you haven't read.

That leaves the three roles the protocol started with — plus three specialists that genuinely want different models and genuinely don't always run: Researcher and Security when the task calls for them, and Recorder to persist the results of an approved non-trivial run.

Bootstrapping went the other way: it produces *decisions*, not code, and decisions need a conversation. It lives as `/ldo-bootstrap`, where you can push back on a stack choice and get a revised answer.

## Token efficiency

- **One codebase read** — the Planner's `codebase_context` becomes a shared prefix reused by Coder and Reviewer. They never re-scan.
- **Prompt cache** — Anthropic keys the cache on (model, prefix bytes). Coder and Reviewer on the same model both hit it. A stronger Reviewer costs one cold start — usually worth it.
- **Narrow fix loop** — after the first pass, the Coder sees only the specific issues and files, not the whole context. Roughly 75% fewer input tokens per iteration.
- **Severity gating** — only `critical` and `major` buy another Code pass. Minor findings ride along in the final report instead of burning an iteration. On a fix pass, a fresh `major` the Reviewer doesn't attribute to the fix itself is downgraded to advisory the same way, so the loop still terminates. Attribution doesn't rest on the Reviewer volunteering it: a finding in any file that pass reported changing keeps blocking, and a `critical` is never downgraded — the termination argument is worth a `major` riding along in the report, never a `critical` written off.
- **Structured hand-offs** — every agent returns schema-validated JSON, rendered compactly for the next stage. No raw dumps, no truncation.
- **Prompts live in agent files** — the workflow passes one line; `.claude/agents/*.md` carries the instructions. One place to edit each role.

## Files

```
.claude-plugin/
└── plugin.json              # Plugin manifest

workflows/ldo.js             # The orchestrator
agents/                      # Prompts live here
├── isolator.md
├── planner.md
├── coder.md
├── reviewer.md
├── security.md
├── researcher.md
└── recorder.md
skills/                      # One slash-command per role, plus bootstrap, config, init,
│                             # contract, note, docs-audit, code-audit, resume, vendor, ship, tui, agent-ux
└── <name>/SKILL.md
scripts/vendor.sh            # The actual vendoring mechanism — see /ldo-vendor
scripts/check-*.sh           # Nine gates over LDO's own source — schema size, model
│                             # table, verdict gates, scoped tests, env status,
│                             # record/backlog, contracts, redaction, and
│                             # check-isolation.sh; see Contributing
scripts/fixtures/            # Real captured data the gates assert against
ldo-config.example.json      # Reference template of every config key

docs/contracts/               # Not shipped by the plugin — created per project via /ldo-contract
├── scope.md                  #   what this app does and deliberately doesn't
├── security.md                #   Required floor + Accepted risks
└── code.md                    #   structural rules the Reviewer blocks on

.claude/ldo-runs.json         # Not shipped — local run tracking for /ldo-resume,
                               #   gitignored, same as `tags`
.claude/ldo-args/<runId>.json # Not shipped — full args for one tracked run, referenced
                               #   by ldo-runs.json rather than inlined; gitignored,
                               #   self-protecting via its own inner .gitignore

docs/reviews/<date>-<slug>.md # Not shipped — written by the Recorder on approval, and also
                               #   when the fix loops exhaust without one (marked NOT APPROVED,
                               #   architecture doc left untouched)
docs/ARCHITECTURE.md          # Not shipped — created/updated by the Recorder (or an
                               #   existing equivalent doc, updated in place instead)
docs/BACKLOG.md               # Not shipped — written by the Recorder by default; GitHub Issues
                               #   only when config.backlog.destination is "github"
docs/backlog/<label>.md       # Not shipped — written instead of docs/BACKLOG.md when the
                               #   Recorder is running inside a parallel/isolated feature's
                               #   worktree, one file per feature to avoid section-number races

docs/NOTES.md                  # Not shipped — created per project via /ldo-note,
                                #   read by the Coder every run, kept deliberately small
docs/DECISIONS.md              # Not shipped — created per project via /ldo-note,
                                #   never auto-read, grows without a ceiling
```

Installing the plugin adds only these. Your own settings, hooks, and agents are never touched; `/plugin update` carries only LDO's files.

## Troubleshooting

**No `/ldo-*` commands after installing.** Check the version — anything before 2.0.0 shipped the components in a layout Claude Code couldn't find, so the plugin installed empty. `/plugin update ldo@ldo-ai` fixes it.

**"Update now" is greyed out, with "Local plugins cannot be updated remotely."** Installs from before v1.3.1 were registered as a local source. Reinstall once to switch to the git source:

```
/plugin uninstall ldo@ldo-ai
/plugin marketplace update ldo-ai
/plugin install ldo@ldo-ai
```

**Routing changes aren't taking effect.** You probably created `ldo-config.json`. Nothing reads it — see [Configuration](#configuration). Put the routing in `CLAUDE.md` or ask for it in the prompt.

**The Reviewer can't drive the app.** It reports `nothing_to_drive` for code with no runtime surface — a library, a pure refactor — and approves on the diff alone. If your project *is* runnable but it can't work out how, say so in the task and it'll use that.

**Removing LDO.** `/plugin uninstall ldo@ldo-ai`, then delete the `<!-- BEGIN ldo -->` block from your `CLAUDE.md` if you ran `/ldo-init`.

## Contributing

The protocol is deliberately small. Before proposing a new agent, apply the test from above: *would this warrant a different model than the Coder?* If the answer is no, it probably belongs inside an existing role.

Each agent's output schema is sent to the harness as a tool definition and passes a safety classifier before the agent runs. A schema past that classifier's ceiling is rejected in milliseconds with `output schema too large to classify safely` — no tokens spent, nothing logged to debug, and `node --check` still green. `PLAN_SCHEMA` crossed it once already, gradually, across three releases. After touching any schema in `workflows/ldo.js`, run `scripts/check-schema-size.sh`; when it fails, move the description prose into the agent's markdown, where the model still reads it and it costs nothing here.

The model-routing table is duplicated in four places (`workflows/ldo.js`, `ldo-config.example.json`, `README.md`, `skills/ldo-config/SKILL.md`) — deliberately, but that's exactly the shape that drifts silently. After touching `DEFAULT_MODELS` or any of its copies, run `scripts/check-model-table.sh` — it parses all four against `workflows/ldo.js` as the source of truth and fails loudly on any mismatch, rather than waiting for the next `/ldo-docs-audit` to catch it after the fact. It also drives the real `mergeModelTable` out of the file and asserts what a *partial* `config.models` override actually routes, because four identical tables tell you nothing about that: a whole-row merge once left every role the operator didn't name with no model while this check still passed. Pass a second argument to point it at another copy (`git show HEAD:workflows/ldo.js > /tmp/pre.js`) and it prints that source's routing for the documented override instead of asserting against it.

The review loop decides whether a run is reported as approved, and it once got that wrong while staying perfectly valid JavaScript: a blocker re-raised in different words got a different identity and was written off as unrelated, and no approval branch had ever read `verification.verdict`, so a run with every acceptance criterion failed came back approved on an empty diff. The same class returned by a second route — the downgrade was escapable only by a flag the Reviewer had to volunteer, so a real regression it forgot to mark was relabelled advisory. `scripts/check-verdict-gates.sh` proves all of it is closed: a re-worded re-raise still blocks, a failed verification cannot be approved, a finding in a file the fix pass edited is not downgraded (once per path form the two sources actually produce, as separately named assertions — a comparison that silently never matches would otherwise pass), and a `critical` is never downgraded at all. It brace-extracts the real functions out of `workflows/ldo.js` and drives them against a committed fixture of that run's actual verdicts, including the negative controls: a genuinely unrelated `major` in an untouched file is still downgraded, and a clean verified verdict is still approved. It also drives `accountIssueOutcomes` and the two blocks quoted into another agent's prompt. Run it after touching the review loop's issue identity, the downgrade rule or either approval branch. Pass a second argument to point it at another copy of the file (`git show HEAD:workflows/ldo.js > /tmp/pre.js`) to see it fail on a source that lacks the gates.

Scoped test runs put a Planner-authored string into a Bash line that two agents execute, and they make it possible for a run to be approved without the full suite ever having run — both invisible to `node --check`, since a template that selects zero tests is syntactically perfect. `scripts/check-scoped-tests.sh` brace-extracts `safeScopedTemplate`, the path filter and `markFullSuite` out of `workflows/ldo.js` and drives them in both directions: the four legitimate templates are accepted, and each injection and shape defect is a separately named assertion, so a failure says which shape leaked rather than that one of twenty did. It also asserts the controls — `markFullSuite` stays reference-identical on the `ran` path (three gates in the review loop detect firing by identity), it never rewrites `status`, and a `full_suite.ran: true` with no command or result is read as not run. Run it after touching the validator, the path filter or the full-suite disclosure. Pass a second argument to point it at another copy of the file (`git show HEAD:workflows/ldo.js > /tmp/pre.js`) to see it fail on a source that lacks them.

A run whose environment was never successfully built rejects correct code, and every gate above stays green while it happens — the result object is syntactically perfect and the verdict is a legitimate `changes_requested`. `scripts/check-env-status.sh` brace-extracts `deriveEnvStatus` and `markEnvUnreproducible` out of `workflows/ldo.js` and drives them over the four states an honest Coder report can produce, plus the malformed ones. Its two load-bearing assertions are controls: the marker stays reference-identical on the clean path (three markers in the review loop detect firing by identity), and it never rewrites `status` — `env_status` is derived from fields the Coder reports about itself, so "it annotates and can never approve a run" has to be proven rather than written down. Run it after touching the environment disclosure or `shapeResult`. Pass a second argument to point it at another copy of the file (`git show HEAD:workflows/ldo.js > /tmp/pre.js`) to see it fail on a source that lacks it.

A Recorder refused on every single run is syntactically perfect, and so is a backlog default flipped back to GitHub by one word in a later edit — the whole failure is that the phase attempts an external publication it was never asked for and is ended before it writes the review report. `scripts/check-record-backlog.sh` brace-extracts `resolveBacklogDestination`, `renderBacklogDirective` and `markRecordFailed` out of `workflows/ldo.js` and asserts the default is `file` for each shape of "unset" separately (no block, empty block, invalid value, near-miss casing), that `github` is honoured only when set exactly, that the FILE directive forbids running `gh` outright *and* carries no fallback-or-availability wording, and that the directive is actually composed into the Record prompt rather than resolved and dropped. `markRecordFailed` gets the same control as the other markers: reference-identical on its no-op paths, never rewrites `status`. It also reads `RECORD_SCHEMA`'s `backlog.destination` enum out of the source. Run it after touching the Record phase or the backlog config. Pass a second argument to point it at another copy of the file to see it fail on a source that lacks them.

`isolate: true` and `tasks` promise your working tree is not written to, and a pipeline that never creates a worktree is syntactically perfect — issue #12's control pair measured the promise failing silently, 27 files written into the operator's own tree with nothing logged. `scripts/check-isolation.sh` brace-extracts `verifyWorktreeProof` and `parseWorktreeList` out of `workflows/ldo.js` and drives them against `scripts/fixtures/worktree-proof.json` — real `git worktree add` output with only the repository root rewritten to a synthetic `/srv/repo`, so no machine layout is committed. A CONTROL asserts the genuine proof still verifies (a checker that rejects everything aborts every isolated run and is not a fix), then each defect shape is a separately named assertion checked for its own reason string: a main-checkout `git_dir`, a `toplevel` equal to `main_root`, an adopted branch whose HEAD isn't the base commit, a porcelain listing with no matching entry, an absolute or `..`-bearing path, a branch outside `ldo/`. Two source-level assertions cover what the behavioural ones structurally cannot see — `phaseIsolate` must reference `verifyWorktreeProof`, and `runOneFeature` must call `phaseIsolate` before `phasePlan`, because a mechanism that exists and is never invoked is exactly the defect. Run it after touching the Isolate phase, the proof checker or the worktree path validation. Pass a second argument to point it at another copy of the file (`git show HEAD:workflows/ldo.js > /tmp/pre.js`) to see it fail on a source that lacks them.

Contract entries are copied verbatim into `plan.risks` and re-rendered into both fix-pass prompts on every round, so an entry over the documented 200-character limit is paid for repeatedly — and until recently nothing measured that limit at all. `scripts/check-contracts.sh` reads `docs/contracts/*.md` as data (it never executes anything it reads), fails on an entry over 200 characters or carrying an inline `(Source: …)` tail, warns without failing on a file with entries and no `## Sources` section, and prints the per-file entry count and byte total so the recurring cost stays visible. Pass a second argument to point it at a different contracts directory. It covers *this* repository only: LDO structurally cannot audit a host project's contracts from inside the pipeline, since the workflow has no filesystem access of its own — for a host project the signal is instead the `⚠ Plan risks trimmed` line the orchestrator logs when it truncates an over-long entry on its way into a fix-pass prompt.

## License

[MIT](LICENSE) © Alexander Degtyarev

Release notes: [CHANGELOG.md](CHANGELOG.md)
