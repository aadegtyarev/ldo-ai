# LDO — Lightweight Dev Orchestrator

**The model that checks the work isn't the model that did it — and it has to show receipts.**

A development pipeline for [Claude Code](https://claude.com/claude-code) built on three agents: **Planner, Coder, Reviewer**. Each runs on a model you choose, so you can write with a cheap one and review with a strong one. The Reviewer reads the diff *and* drives your running app, and it can't approve a criterion without captured output proving it holds.

```
Plan ──→ Code ⇄ Review
 │        │       │
 reads    writes  reads the diff, runs the app,
 the repo +tests  proves each criterion
```

Claude Code's own `feature-dev` and community pipelines like `superpowers` cover similar ground, but run every phase on one model. Per-role routing, and a plan held by a deterministic script instead of a model's memory, is what LDO adds.

Source: [github.com/aadegtyarev/ldo-ai](https://github.com/aadegtyarev/ldo-ai)

## Install

Requires Claude Code v2.1.154 or newer — that's the release that added the workflow runtime LDO's pipeline runs on. Check with `claude --version`.

```
/plugin marketplace add aadegtyarev/ldo-ai
/plugin install ldo@ldo-ai
```

Pick **user** scope when Claude Code asks, unless you're setting this up for a team — then see [Set up a project for a team](#set-up-a-project-for-a-team). Updates come with `/plugin update ldo@ldo-ai`.

## Getting started

**Skip configuration for now.** The defaults already do the useful thing — Sonnet writes, Opus reviews. See [Configuration](#configuration) when you want to change it.

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

**After the pipeline**, get a second opinion from the built-ins LDO doesn't duplicate — `/code-review high` for a multi-agent correctness pass, `/security-review`, or `/deep-research` when the call is expensive to reverse.

### What a run looks like

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
  ✗ 1 issue(s): 1 blocking, 0 advisory
    [major] middleware/rate_limit.go: bucket map grows without bound; no eviction

▸ Code
  Coder pass 2: 49 passed, 0 failed

▸ Review
  Verification: verified — 3/3 criteria proven
  ✓ APPROVED — limiter returns 429 past 100 req/min, evicts idle buckets after 10m
```

Two things to notice. The Planner flagged the spoofable header **before any code existed**, so the mitigation was a requirement rather than a bug fix. And the Reviewer — a different model than the one that wrote it — caught an unbounded map that all 47 tests passed straight over.

### Set up a project for a team

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

## Pipeline

```
[Research] → Plan → [Security] → Code ⇄ Review
  web         read repo  threat     implement  read diff
  sources     + rate     model      + test     + drive app
              the task              + document
```

**Three agents always run.** Plan reads the codebase and produces the plan. Code sets up the environment, implements it, writes tests, updates docs. Review reads the diff *and* drives the running application to prove the acceptance criteria hold.

Two more run only when they earn their place:

| Agent | Runs when |
|-------|-----------|
| **Researcher** | `research: true` — the task needs domain knowledge from outside the repo |
| **Security** | The Planner rates the change's attack surface `elevated` |

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
    "trivial": { "planner": "sonnet", "coder": "sonnet", "reviewer": "opus", "security": "opus", "researcher": "sonnet" },
    "medium":  { "planner": "sonnet", "coder": "sonnet", "reviewer": "opus", "security": "opus", "researcher": "opus" },
    "complex": { "planner": "opus",   "coder": "sonnet", "reviewer": "opus", "security": "opus", "researcher": "opus" }
  },
  "maxFixLoops": 3,
  "blockingSeverities": ["critical", "major"],
  "researchByDefault": false
}
```

Those are the defaults, in full. `securityByDefault` is deliberately unset — leave it out and the Planner decides per task; set `true` or `false` to override it everywhere.

Note the routing is conservative: the Coder is Sonnet at every tier because it's a solid implementer with a stronger Reviewer above it, and only the Planner steps up on `complex`, where a wrong approach is expensive to unwind. If you want to save more, `"coder": "haiku"` on `trivial` is the obvious next move — the Reviewer still catches what it misses.

Model names mean whatever your setup routes them to; the pipeline assumes nothing about which is stronger. Agent files declare no model of their own, so this is the only thing that decides routing.

Walk through it interactively: `/ldo-config`.

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
| `/ldo-reviewer` | Review the current diff and drive the app |
| `/ldo-security` | Threat-model a plan |
| `/ldo-researcher "topic"` | Multi-source web research |
| `/ldo-config` | Walk through model routing |
| `/ldo-init` | Write the self-routing block into the project's `CLAUDE.md` |
| `/ldo-agent-ux` | Write agent context and output that a model and a human can both read |

Why the punctuation differs: `/ldo:ldo` is a **workflow**, and Claude Code namespaces those by plugin. The `/ldo-*` commands are **skills**, which get no automatic namespace — the `ldo-` prefix is part of their name, so they group in the palette and don't shadow built-ins like `/init`.

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

## How it works

1. The Planner reads the codebase, writes the plan, rates complexity and security surface
2. Complexity picks the models; security surface decides whether a Security agent runs
3. Each agent returns schema-validated JSON, rendered compactly for the next stage
4. Coder and Reviewer loop until approved, or until no `critical`/`major` issues remain
5. The Reviewer's verdict includes captured evidence — a criterion passes only with proof

**Portable**: the protocol isn't tied to Claude Code. Each role is a prompt plus a JSON Schema contract. The orchestrator can be any script calling any LLM runner.

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
└── researcher.md
skills/                      # One slash-command per role, plus bootstrap, config, init, agent-ux
└── <name>/SKILL.md
ldo-config.example.json      # Reference template of every config key
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
