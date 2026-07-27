# LDO — Lightweight Dev Orchestrator

A development pipeline for [Claude Code](https://claude.com/claude-code) built on three agents: **Planner, Coder, Reviewer**.

Each runs on its own model. That's the point — your Reviewer can run stronger than your Coder, so code gets written cheaply and checked carefully.

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
[Bootstrap] → [Research] → Plan → [Security] → Code ⇄ Review
 greenfield     web        read repo  threat     implement  read diff
 only           sources    + rate     model      + test     + drive app
                           the task              + document
```

**Three agents always run.** Plan reads the codebase and produces the plan. Code sets up the environment, implements it, writes tests, updates docs. Review reads the diff *and* drives the running application to prove the acceptance criteria hold.

Three more run only when they earn their place:

| Agent | Runs when |
|-------|-----------|
| **Bootstrapper** | `mode: "greenfield"` — new project, no codebase yet |
| **Researcher** | `research: true` — the task needs domain knowledge from outside the repo |
| **Security** | The Planner rates the change's attack surface `elevated` |

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

That leaves the three roles the protocol started with — plus three specialists that genuinely want different models and genuinely don't always run.

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

Model names mean whatever your setup routes them to. Each tier also takes `security`, `researcher`, and `bootstrapper` keys.

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
| `/ldo` + `mode: "greenfield"` | Bootstrap a new project first |
| `/ldo` + `research: true` | Add the web research phase |
| `/ldo` + `security: true` \| `false` | Force the threat model on or off |
| `/planner "task"` | Plan only |
| `/coder "task"` | Implement a plan |
| `/reviewer` | Review the current diff and drive the app |
| `/security` | Threat-model a plan |
| `/researcher "topic"` | Multi-source web research |
| `/bootstrapper "idea"` | Research + stack + roadmap |
| `/ldo-config` | Walk through model routing |

## How it works

1. The Planner reads the codebase, writes the plan, rates complexity and security surface
2. Complexity picks the models; security surface decides whether a Security agent runs
3. Each agent returns schema-validated JSON, rendered compactly for the next stage
4. Coder and Reviewer loop until approved, or until no `critical`/`major` issues remain
5. The Reviewer's verdict includes captured evidence — a criterion passes only with proof

**Portable**: the protocol isn't tied to Claude Code. Each role is a prompt plus a JSON Schema contract. The orchestrator can be any script calling any LLM runner.

## Files

```
.claude/
├── workflows/ldo.js     # Orchestrator (~600 lines)
├── agents/              # Prompts live here
│   ├── planner.md
│   ├── coder.md
│   ├── reviewer.md
│   ├── security.md
│   ├── researcher.md
│   └── bootstrapper.md
├── skills/              # One slash-command per agent, plus ldo-config
└── ldo-config.json      # Model routing
```

The installer writes exactly these files — your own settings, hooks, and agents are never touched. Re-running it skips anything you've edited unless you pass `--force`.

## Contributing

The protocol is deliberately small. Before proposing a new agent, apply the test from above: *would this warrant a different model than the Coder?* If the answer is no, it probably belongs inside an existing role.

## License

[MIT](LICENSE) © Alexander Degtyarev

Release notes: [CHANGELOG.md](CHANGELOG.md)
