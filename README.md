# LDO — Lightweight Dev Orchestrator

**Orchestration as code, with cost-aware model routing.** A development pipeline for [Claude Code](https://claude.com/claude-code) where each role runs on a different model — implementation on a cheap one, review on a strong one.

That routing is the whole point. Claude Code's own `feature-dev`, and community pipelines like `superpowers`, all run every phase on one model. LDO lets you spend where it matters: Sonnet writes, Opus checks.

The plan is held by a deterministic script, not by a model remembering it turn to turn, and every hand-off between roles is a validated JSON schema.

## Install

Requires Node 18+ and Claude Code.

```bash
# Into the current project
npx ldo-ai

# Globally (available in every Claude Code session)
npx ldo-ai --global

# Custom directory, if your config lives somewhere non-standard
npx ldo-ai --target /opt/claude/.claude
```

Set your model routing in `.claude/ldo-config.json`, then in Claude Code:

```
/ldo "add rate limiting middleware"
```

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

Walk through it: `/ldo-config` in Claude Code.

## Usage

| Command | What |
|---------|------|
| `/ldo "task"` | Full pipeline |
| `/ldo` + `research: true` | Add the web research phase |
| `/ldo` + `security: true` \| `false` | Force the threat model on or off |
| `/bootstrapper "idea"` | Start a project — prior art, stack, roadmap (interactive) |
| `/planner "task"` | Plan only |
| `/coder "task"` | Implement a plan |
| `/reviewer` | Review the current diff and drive the app |
| `/security` | Threat-model a plan |
| `/researcher "topic"` | Multi-source web research |
| `/ldo-config` | Walk through model routing |

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
├── skills/              # One slash-command per role, plus bootstrapper and ldo-config
│   └── <name>/SKILL.md
└── ldo-config.json      # Model routing
```

The installer writes exactly these files — your own settings, hooks, and agents are never touched. Re-running it skips anything you've edited unless you pass `--force`.

## Contributing

The protocol is deliberately small. Before proposing a new agent, apply the test from above: *would this warrant a different model than the Coder?* If the answer is no, it probably belongs inside an existing role.

## License

[MIT](LICENSE) © Alexander Degtyarev

Release notes: [CHANGELOG.md](CHANGELOG.md)
