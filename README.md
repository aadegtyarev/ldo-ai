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
  Complexity: medium  |  Security surface: elevated  |  Coder:sonnet  Reviewer:opus
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

**It edits your working tree.** Once you approve the run, the Coder writes files and the Reviewer runs your app; neither stops to ask. Nothing is committed and no branch is created — you're left with uncommitted changes to inspect. Start on a clean tree, or a branch you don't mind resetting.

**For a big or uncertain change**, opt the extra phases in:

```
/ldo:ldo research:true security:true "switch auth from sessions to JWT"
```

**After the pipeline**, ship it with `/ldo-ship` — branch, commit, push, PR, optional squash-merge, each step confirmed. The PR body carries the review report: what was proven, what was attacked, what held. Or get a second opinion first from the built-ins — `/code-review high`, `/security-review`, `/deep-research`.

## Pipeline

```
[Research] → Plan → [Security] → Code ⇄ Review → [Record]
  web         read repo  threat     implement  read diff    write report,
  sources     + rate     model      + test     + attack it  architecture doc,
              the task              + document              backlog
```

**Three agents always run.** Plan reads the codebase and produces the plan. Code sets up the environment, implements it, writes tests, updates docs. Review reads the diff, drives the running application to prove each acceptance criterion — that part never scales down — then switches posture and attacks it. How much attacking scales with the plan's own `complexity` rating: one or two vectors for `trivial`, three or four for `medium`, more for `complex` if the surface warrants it. A threat model is attacked in full regardless — `security_surface` is rated independently of `complexity` for exactly this reason, so a one-line fix to an auth check still gets every exploit scenario run against it.

On approved medium or complex tasks, a fourth pass **Record** writes the run's results to disk: a review report in `docs/reviews/` with the full verification evidence and attack log (the receipts that would otherwise vanish with the session), a one-page `docs/ARCHITECTURE.md` kept current, and backlog items — GitHub Issues if `gh` is connected, otherwise `docs/BACKLOG.md`.

Two more run only when they earn their place:

| Agent | Runs when |
|-------|-----------|
| **Researcher** | `research: true` — the task needs domain knowledge from outside the repo |
| **Security** | The Planner rates the change's attack surface `elevated` |

### Running several features in parallel

Pass `tasks` instead of `task` and each one runs independently, isolated in its own git worktree:

```js
Workflow({name:"ldo", args:{
  tasks: ["add rate limiting to the API", "fix the session token refresh bug"]
}})
```

Each feature's Planner creates its own worktree (`.worktrees/<n>-<slug>` on branch `ldo/<n>-<slug>`) before reading the codebase, and every later agent in that feature's chain works inside it — features never see each other's changes. This is comparable to several developers on separate branches: conflicts get resolved as routine at merge time, not solved architecturally by the orchestrator. Each approved feature ships independently — run `/ldo-ship` from inside that feature's worktree, where it's already on the right branch.

Starting a project from nothing is a conversation, not a pipeline — use `/ldo-bootstrap "your idea"` for that. It researches prior art, works through the stack with you, and hands the first task to `/ldo:ldo`.

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

**Review finds blocking issues → back to Code.** Up to 3 iterations, configurable.

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

### Resuming an interrupted run

A `/ldo:ldo` call already survives more than it looks like: every `Workflow` call gets a `runId`, and Claude Code caches each completed step (Plan, Coder, Reviewer, ...) against it. Pass that same `runId` back via `resumeFromRunId` and the cached steps return instantly — only what hadn't finished actually re-runs. The gap was that nothing wrote the `runId` down, so if the session holding it in its head went away, there was nothing to resume *from*.

If you ran `/ldo-init`, every `/ldo:ldo` call now gets logged to `.claude/ldo-runs.json` the moment it starts, and updated when it finishes. At the start of a session, Claude checks that file for anything still marked `running` and tries to resume it before you ask.

One real limit worth knowing: the cache lives in the harness session that produced the `runId`, not on disk. Picking a conversation back up in the *same* session (it got summarized, or you reopened it via its own resume) — the cache is almost always still there. A genuinely new session can't reach it; `/ldo-resume` notices, says so, and falls back to running the task fresh rather than guessing or failing silently. See `/ldo-resume` for the exact protocol.

## Usage

Type `ldo` in the command palette and everything clusters together.

| Command | What |
|---------|------|
| `/ldo:ldo "task"` | Full pipeline (Plan → Code ⇄ Review) |
| `/ldo:ldo research:true "task"` | Add the web research phase |
| `/ldo:ldo security:true "task"` | Force the threat model on (or `false` to skip it) |
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
| `/ldo-tui` | Design and build a terminal interface (Textual / Ink) |
| `/ldo-config` | Walk through model routing |
| `/ldo-init` | Write the self-routing block into the project's `CLAUDE.md` |
| `/ldo-agent-ux` | Write agent context and output that a model and a human can both read |
| `/ldo-resume` | Check for a pipeline run left in progress and resume it, or start fresh |
| `/ldo-vendor` | Copy LDO into `.claude/` for a project-native install, no plugin required |

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
    "trivial": { "planner": "haiku",  "coder": "haiku",  "reviewer": "sonnet", "security": "opus", "researcher": "sonnet", "recorder": "haiku" },
    "medium":  { "planner": "sonnet", "coder": "sonnet", "reviewer": "opus",   "security": "opus", "researcher": "opus",   "recorder": "haiku" },
    "complex": { "planner": "opus",   "coder": "sonnet", "reviewer": "opus",   "security": "opus", "researcher": "opus",   "recorder": "haiku" }
  },
  "maxFixLoops": 3,
  "blockingSeverities": ["critical", "major"],
  "researchByDefault": false,
  "maxParallelFeatures": 12
}
```

Those are the defaults, in full — matching `ldo-config.example.json`, the copy-paste source if you want a starting point rather than retyping this. `securityByDefault` is deliberately unset — leave it out and the Planner decides per task; set `true` or `false` to override it everywhere.

The tiers differ in a way you can feel. A typo doesn't need Sonnet to plan it or Opus to review it, so `trivial` runs Haiku end to end with Sonnet checking. `medium` is the shape the project is named for: Sonnet writes, Opus checks. `complex` additionally buys a stronger Planner, because a wrong approach is the expensive kind of wrong — while the Coder stays on Sonnet, since the Reviewer above it catches what it misses.

Security is Opus at every tier. When the Planner has decided a change can be attacked, that's not where to save money.

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

The plugin install assumes a separate install step somewhere before the pipeline runs — fine on a machine you control, wrong for a repo worked on purely through a cloud session that clones it and has no such step of its own. Claude Code has a project-native path for exactly this: files placed directly under a repo's `.claude/agents/`, `.claude/skills/`, `.claude/workflows/` are picked up automatically the moment the repo is opened, locally or in the cloud — no install, no marketplace.

`/ldo-vendor` copies LDO into that shape. It isn't a plain file copy — the workflow script calls every pipeline agent through a plugin-scoped reference (`ldo:planner`, `ldo:coder`, …) that only resolves inside an actual plugin install, so vendoring strips that prefix from the six agent references and from every `/ldo:ldo` mention in the skills' own prose (the vendored pipeline runs as bare `/ldo`, since project-level workflows use their name directly with no plugin prefix). Get that transform wrong and the copy either breaks on its first agent call or tells the reader the wrong command.

```
/ldo-vendor
```

It leaves `.claude/LDO_VENDORED.md` behind — the version vendored and a note that this copy has no `/plugin update` equivalent. Re-run `/ldo-vendor` when you know LDO has changed and want the update; there's no background check pulling updates into a vendored copy, and there shouldn't be.

Use the plugin install unless something specifically rules it out — it updates centrally and shares across every project on the machine. Vendor when the pipeline needs to travel with the repo itself.

## How it works

1. The Planner reads the codebase, writes the plan, rates complexity and security surface
2. Complexity picks the models; security surface decides whether a Security agent runs
3. Each agent returns schema-validated JSON, rendered compactly for the next stage
4. Coder and Reviewer loop until approved, or until no `critical`/`major` issues remain
5. The Reviewer's verdict includes captured evidence — a criterion passes only with proof

**Portable**: the protocol isn't tied to Claude Code. Each role is a prompt plus a JSON Schema contract. The orchestrator can be any script calling any LLM runner.

## Why only three core agents

Every role has to answer: *would I route this to a different model than the Coder?* If not, it's taxonomy, not architecture.

- **Environment setup** isn't separate — the Coder needs a working environment to run tests, and tests aren't optional. Splitting it means the setup agent finishes before the code that needs it exists.
- **Docs** aren't separate — a CHANGELOG line isn't a different skill from the code that earned it, and the Coder already knows what changed.
- **Verification** belongs to the Reviewer. Checking your own work is weak review; the same blind spot that wrote the bug will skip the test that catches it. Reading the diff and running the app are two ways to answer one question, and both benefit from a model that didn't write the code.
- **Codebase reading** belongs to the Planner. You can't plan what you haven't read.

That leaves the three roles the protocol started with — plus two specialists that genuinely want different models and genuinely don't always run.

Bootstrapping went the other way: it produces *decisions*, not code, and decisions need a conversation. It lives as `/ldo-bootstrap`, where you can push back on a stack choice and get a revised answer.

## Token efficiency

- **One codebase read** — the Planner's `codebase_context` becomes a shared prefix reused by Coder and Reviewer. They never re-scan.
- **Prompt cache** — Anthropic keys the cache on (model, prefix bytes). Coder and Reviewer on the same model both hit it. A stronger Reviewer costs one cold start — usually worth it.
- **Narrow fix loop** — after the first pass, the Coder sees only the specific issues and files, not the whole context. Roughly 75% fewer input tokens per iteration.
- **Severity gating** — only `critical` and `major` buy another Code pass. Minor findings ride along in the final report instead of burning an iteration.
- **Structured hand-offs** — every agent returns schema-validated JSON, rendered compactly for the next stage. No raw dumps, no truncation.
- **Prompts live in agent files** — the workflow passes one line; `.claude/agents/*.md` carries the instructions. One place to edit each role.

## Files

```
.claude-plugin/
└── plugin.json              # Plugin manifest

workflows/ldo.js             # The orchestrator
agents/                      # Prompts live here
├── planner.md
├── coder.md
├── reviewer.md
├── security.md
├── researcher.md
└── recorder.md
skills/                      # One slash-command per role, plus bootstrap, config, init,
│                             # contract, docs-audit, code-audit, resume, vendor, ship, tui, agent-ux
└── <name>/SKILL.md
ldo-config.example.json      # Reference template of every config key

docs/contracts/               # Not shipped by the plugin — created per project via /ldo-contract
├── scope.md                  #   what this app does and deliberately doesn't
├── security.md                #   Required floor + Accepted risks
└── code.md                    #   structural rules the Reviewer blocks on

.claude/ldo-runs.json         # Not shipped — local run tracking for /ldo-resume,
                               #   gitignored, same as `tags`

docs/reviews/<date>-<slug>.md # Not shipped — written by the Recorder each approved run
docs/ARCHITECTURE.md          # Not shipped — created/updated by the Recorder (or an
                               #   existing equivalent doc, updated in place instead)
docs/BACKLOG.md               # Not shipped — written by the Recorder only if `gh` isn't available
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

## License

[MIT](LICENSE) © Alexander Degtyarev

Release notes: [CHANGELOG.md](CHANGELOG.md)
