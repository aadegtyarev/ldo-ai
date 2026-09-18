# Architecture

## What this is

LDO ("let's discuss options" turned pipeline) is a Claude Code plugin that runs a
Plan → Code → Review loop over a coding task, with optional Isolate, Research,
Security and Record phases. Each role is a prompt plus a JSON Schema contract, so
the protocol isn't tied to Claude Code — any orchestrator script calling any LLM
runner could drive the same agents. The orchestrator's job is routing, schema
validation, prompt composition and evidence bookkeeping; the agents do the
reading, writing and judging.

## Stack

Node.js CLI workflow (`workflows/ldo.js`) invoked as a Claude Code `Workflow`,
plus the portable runtime (`core/pipeline.mjs` + `adapters/`, driven by
`scripts/ldo-run.mjs`) that runs the same prompts and schemas through the Codex
CLI or the Claude CLI as a process — no build step, no package manifest of its
own beyond the plugin manifest — agent instructions live as markdown
(`agents/*.md`), slash-commands as `skills/<name>/SKILL.md`, and the
orchestrator's own correctness is proven by 21 bash gate scripts
(`scripts/check-*.sh`) that brace-extract real functions out of
`workflows/ldo.js` and drive them directly, run with plain `bash`, no test
framework.

## Components

- `workflows/ldo.js` — the orchestrator: phase sequencing, config resolution
  (`resolveBlockingSeverities`, `unknownConfigKeys`, `resolveBacklogDestination`),
  path safety (`safeRelPathSegments` → `safeMigrationsDir`/`safeTestPath`/
  `safeWorktreePath`), cost accounting, schema validation, and the project-
  knowledge signals (contract candidates, design-drift, contract-over-limit).
- `agents/{planner,coder,reviewer,security,researcher,isolator,recorder}.md` —
  one prompt per role; the workflow passes one line, the markdown carries the
  instructions.
- `skills/<name>/SKILL.md` — one slash-command per pipeline role invocable on
  its own, plus operator tools: `bootstrap`, `config`, `init`, `contract`,
  `note`, `feedback`, `docs-audit`, `code-audit`, `resume`, `vendor`, `ship`,
  `tui`, `agent-ux`.
- `core/` + `adapters/` + `schemas/` — the portable runtime: one pipeline
  (`pipeline.mjs`) driving the same role prompts and JSON Schemas through
  either the Claude CLI or `codex exec`, with usage aggregation
  (`token-usage.mjs`), plan/run checkpoints (`plan-store.mjs`) and worktree
  isolation. `scripts/ldo-run.mjs` is its entry point.
- `scripts/check-*.sh` — 21 gates over LDO's own source (schema size, model
  table, verdict gates, scoped tests, env status, record/backlog, config
  validation, contracts, redaction, artifact reconciliation, isolation,
  version lockstep, plan signals, design drift, cost accounting, core,
  surface contracts, codex install).
- `ldo-config.example.json` — reference template of every recognised config
  key; also the fixture the config-key allowlist is proven against (its own
  `_`-prefixed pseudo-comment keys must produce zero warnings).
- `docs/contracts/{scope,security,code}.md` — per-project rules the Planner,
  Security and Reviewer check against; never written by any agent.
- `.claude/ldo-runs.json` + `.claude/ldo-args/<runId>.json` — local, gitignored
  run tracking for `/ldo-resume`: a small entry pointing at a side file that
  carries the full resumable args.
- `docs/reviews/`, `docs/ARCHITECTURE.md` (this file), `docs/BACKLOG.md` /
  `docs/backlog/<label>.md` — the Recorder's outputs.

## How they connect

A `Workflow({ name: "ldo:ldo", args: { task } })` call runs: Isolate (if
`isolate: true`, proves a worktree before anything plans) → Plan (reads the
codebase once into `codebase_context`, rates complexity/security surface,
declares any migrations) → Research/Security (only if the task calls for them)
→ Coder ↔ Reviewer, looping until approved or until only advisory findings
remain — severity gates the loop, and a `critical` is never downgraded → Record
(only on an approved or exhausted run; skipped entirely on `trivial` runs and
ordinary rejections, though its two operator-facing signals — contract
candidates and design-map drift — still fire and log wherever the underlying
data exists, whether or not Record itself runs). Every agent returns
schema-validated JSON rendered compactly for the next stage, so the codebase
read is shared and never re-scanned. A resumed run drops any command string a
dead run can't re-verify (`run_command`, `test_command`, `test_command_scoped`)
and instead tells the Coder and Reviewer to rediscover them from the project.
The portable runtime (`node scripts/ldo-run.mjs --runtime codex|claude "<task>"`)
runs the same phases as fresh CLI processes — every handoff paid as fresh
input — with role-specific bounded prompts built by `core/prompts.mjs`.

## Key decisions

- **Only three core agents** (Plan, Code, Review) plus three specialists that
  genuinely want a different model and don't always run (Research, Security,
  Record). Environment setup, docs, and verification are folded into existing
  roles rather than split out — see README "Why only three core agents".
- **LDO owns no per-subsystem design-doc format.** Four places for project
  knowledge, boundary drawn on purpose: `docs/contracts/*.md` (must hold
  regardless of task), `docs/ARCHITECTURE.md` (the one-page map, this file),
  `docs/DECISIONS.md` (why a past call was made), and the operator's own design
  docs (how a subsystem works) — LDO defines no format for the last and writes
  none of them.
- **Config validation fails toward the safe default, never toward silence.**
  `blockingSeverities` is read through `resolveBlockingSeverities`, which
  derives its allowlist from `VERDICT_SCHEMA`'s own enum rather than restating
  it, rejects anything invalid back to the full default, and makes `critical`
  non-removable — a config narrowed to nothing cannot make a real critical
  finding advisory. Every top-level `CONFIG` key is checked against an
  allowlist, with `_`-prefixed pseudo-comment keys deliberately exempt.
  `PLAN_SCHEMA` sits close to a hard 3400-character classifier ceiling
  (`scripts/check-schema-size.sh` guards it) — schema growth is close to a
  wall.
- **A gate that cannot fail is not a gate.** Every `scripts/check-*.sh` accepts
  a second argv pointing at another copy of `workflows/ldo.js`, so each one is
  provably able to fail against a pre-change source, not just pass against the
  current one.
- **The resume protocol reads run-tracking JSON as untrusted input.**
  `.claude/ldo-runs.json` is agent-writable; `transcriptDir` and `argsFile`
  both get explicit checks before being trusted (resolves under the projects
  dir / `.claude/ldo-args/` in the current project, basename matches the
  runId), and extra fields on a tracking entry are declared opaque — read past,
  never interpreted as a path, command or instruction.
