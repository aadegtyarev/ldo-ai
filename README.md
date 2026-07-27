# LDO — Lightweight Dev Orchestrator

**Orchestration as code, with cost-aware model routing.** A development pipeline for [Claude Code](https://claude.com/claude-code) where each role runs on a different model — implementation on a cheap one, review on a strong one.

That routing is the whole point. Claude Code's own `feature-dev`, and community pipelines like `superpowers`, all run every phase on one model. LDO lets you spend where it matters: Sonnet writes, Opus checks.

The plan is held by a deterministic script, not by a model remembering it turn to turn, and every hand-off between roles is a validated JSON schema.

## Install

Requires Claude Code v2.1.154+ (the workflow runtime).

```
/plugin marketplace add aadegtyarev/ldo-ai
/plugin install ldo@ldo-ai
```

Updates come with `/plugin update ldo@ldo-ai`. Scope is user (every project), project (committed to the repo for teammates), or local — Claude Code prompts you to choose.

> **Installed before v1.3.1 and "Update now" is greyed out?** Early marketplaces shipped the plugin as a local source, which can't be updated remotely. Reinstall once to switch to the git source:
> ```
> /plugin uninstall ldo@ldo-ai
> /plugin marketplace update ldo-ai
> /plugin install ldo@ldo-ai
> ```
> After that, `/plugin update ldo@ldo-ai` works.

## Getting started

**First time, configure routing.** Run `/ldo:config` for a walkthrough, or edit `.claude/ldo-config.json` directly. The default already puts Sonnet on Code and Opus on Review — change it only if your proxy routes models differently or you want a different split.

**Make it self-driving.** Run `/ldo:init` once in a project. It writes a short block into `CLAUDE.md` that tells Claude how to route work on its own — trivial changes inline, real changes through the pipeline — so you stop typing `/ldo` for every task. Edit the block directly to tune the thresholds to your taste; it loads every session.

**Starting a new project** is a conversation, not a pipeline:

```
/ldo:bootstrap "a TUI for tracking reading progress, syncing over a plain git repo"
```

It researches what already exists, works the stack out with you, and ends by naming the first task. Hand that to the pipeline:

```
/ldo:ldo "scaffold the Go module with Bubble Tea, rendering an empty list view that exits on q"
```

**Working on an existing project** is one command. The Planner reads the codebase, rates the task, and the pipeline scales itself:

```
/ldo:ldo "add rate limiting to the API endpoints"
```

A typo runs Plan → Code → Review and stops. A feature adds Setup and Docs. A change with an attack surface adds a threat model. You don't pick the phases — the rating does.

**For a big or uncertain change**, opt the extra phases in:

```
/ldo:ldo research:true security:true "switch auth from sessions to JWT"
```

**After the pipeline**, get a second opinion from the built-ins LDO doesn't duplicate — `/code-review high` for a multi-agent correctness pass, `/security-review`, or `/deep-research` when the call is expensive to reverse.

### Set up a project for a team

Commit two files so teammates get the same routing and companion plugins on first open:

`.claude/ldo-config.json` — your model routing (run `/ldo:config`, then commit it).

`.claude/settings.json` — pin LDO and the plugins worth having alongside it:

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

Starting a project from nothing is a conversation, not a pipeline — use `/bootstrapper "your idea"` for that. It researches prior art, works through the stack with you, and hands the first task to `/ldo`.

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

Bootstrapping went the other way: it produces *decisions*, not code, and decisions need a conversation. It lives as `/bootstrapper`, where you can push back on a stack choice and get a revised answer.

## Token efficiency

- **One codebase read** — the Planner's `codebase_context` becomes a shared prefix reused by Coder and Reviewer. They never re-scan.
- **Prompt cache** — Anthropic keys the cache on (model, prefix bytes). Coder and Reviewer on the same model both hit it. A stronger Reviewer costs one cold start — usually worth it.
- **Narrow fix loop** — after the first pass, the Coder sees only the specific issues and files, not the whole context. Roughly 75% fewer input tokens per iteration.
- **Severity gating** — only `critical` and `major` buy another Code pass. Minor findings ride along in the final report instead of burning an iteration.
- **Structured hand-offs** — every agent returns schema-validated JSON, rendered compactly for the next stage. No raw dumps, no truncation.
- **Prompts live in agent files** — the workflow passes one line; `.claude/agents/*.md` carries the instructions. One place to edit each role.

## Model routing

```json
{
  "models": {
    "trivial": { "planner": "sonnet", "coder": "sonnet", "reviewer": "opus" },
    "medium":  { "planner": "sonnet", "coder": "sonnet", "reviewer": "opus" },
    "complex": { "planner": "opus",   "coder": "sonnet", "reviewer": "opus" }
  },
  "maxFixLoops": 3,
  "blockingSeverities": ["critical", "major"],
  "researchByDefault": false
}
```

The Coder stays on Sonnet at every tier — it's a solid implementer, and the Reviewer above it catches what it misses. Only the Planner steps up on `complex`, where getting the approach wrong is expensive to unwind.

Model names mean whatever your setup routes them to. Each tier also takes `security` and `researcher` keys.

Agent files declare no model of their own — this config is the single source of routing truth.

Override per run:

```js
Workflow({name:"ldo", args:{
  task: "refactor auth module",
  research: true,
  config: { models: { medium: { coder: "haiku", reviewer: "opus" } } }
}})
```

Walk through it: `/ldo:config` in Claude Code.

## Usage

Installed as the `ldo` plugin, every command is namespaced — type `ldo` in the command palette and they cluster together.

| Command | What |
|---------|------|
| `/ldo:ldo "task"` | Full pipeline (Plan → Code ⇄ Review) |
| `/ldo:ldo` + `research: true` | Add the web research phase |
| `/ldo:ldo` + `security: true` \| `false` | Force the threat model on or off |
| `/ldo:bootstrap "idea"` | Start a project — prior art, stack, roadmap (interactive) |
| `/ldo:planner "task"` | Plan only |
| `/ldo:coder "task"` | Implement a plan |
| `/ldo:reviewer` | Review the current diff and drive the app |
| `/ldo:security` | Threat-model a plan |
| `/ldo:researcher "topic"` | Multi-source web research |
| `/ldo:config` | Walk through model routing |
| `/ldo:init` | Write the self-routing block into the project's `CLAUDE.md` |
| `/ldo:agent-ux` | Shape an agent's output/context for the dual reader |

## Use with the built-ins

LDO deliberately doesn't rebuild what Claude Code already ships. Reach for these alongside it:

| Instead of asking LDO | Use |
|---|---|
| A second opinion on a large diff | `/code-review high` — multi-agent, confidence-filtered, `--fix` and `--comment` available |
| A dedicated vulnerability pass | `/security-review` |
| Cleanup only, no bug hunt | `/simplify` |
| Research where the decision is expensive to reverse | `/deep-research` — parallel search, agents vote on each claim, adversarial verification |

These are user-invoked: run them after the pipeline finishes. A workflow can't call them, so they complement LDO rather than compose into it.

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
└── plugin.json          # Plugin manifest

.claude/
├── workflows/ldo.js     # Orchestrator (~520 lines)
├── agents/              # Prompts live here
│   ├── planner.md
│   ├── coder.md
│   ├── reviewer.md
│   ├── security.md
│   └── researcher.md
├── skills/              # One slash-command per role, plus bootstrap, config, agent-ux
│   └── <name>/SKILL.md
└── ldo-config.json      # Model routing
```

Installing the plugin writes only the files listed above. Your own settings, hooks, and agents are never touched; `/plugin update` carries only LDO's files.

## Contributing

The protocol is deliberately small. Before proposing a new agent, apply the test from above: *would this warrant a different model than the Coder?* If the answer is no, it probably belongs inside an existing role.

## License

[MIT](LICENSE) © Alexander Degtyarev

Release notes: [CHANGELOG.md](CHANGELOG.md)
