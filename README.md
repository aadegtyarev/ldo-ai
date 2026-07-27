# LDO — Lightweight Dev Orchestrator

**LDO** = Lightweight Dev Orchestrator (AI-driven).

A 7-agent AI development pipeline for Claude Code. From idea to documented, tested code — with configurable model routing per role.

## Install

```bash
# Into the current project
npx ldo-ai

# Globally (available in all Claude Code sessions)
npx ldo-ai --global

# Custom directory (non-standard config location)
npx ldo-ai --target /opt/claude/.claude
```

After install, configure model routing in `.claude/ldo-config.json`. Then invoke in Claude Code:

```
/ldo "add rate limiting middleware"
```

## Pipeline

```
Bootstrap → Scout → [Explore] → [Research] → Plan → [Security] → Code ⇄ Review → Setup → [Verify] → Docs
greenfield  reads    task-scoped  web         steps+  threat       implement  quality  deps+   prove      README+
only        ONCE     search       research    accept  model        +tests     gate     env     it runs    CHANGELOG
```

Phases in `[brackets]` are opt-in — off by default, enabled per-run or in config.

| Phase | Agent | What it does |
|-------|-------|-------------|
| Bootstrap | bootstrapper | (Greenfield) Research similar solutions, pick stack, draft roadmap |
| Scout | ctx-scout | Read the codebase ONCE — produce a deterministic cache-prefix snapshot |
| Explore | explorer | (Opt-in) Fan-out search for task-specific files, call sites, tricky spots |
| Research | researcher | (Opt-in) Deep web search on the task domain, cross-verify claims |
| Plan | planner | Task + context → ordered steps with acceptance criteria |
| Security | security | (Opt-in) Threat model the PLAN — shift-left: catch risks before coding |
| Code | coder | Implement the plan + security mitigations, write tests |
| Review | reviewer | Plan compliance + correctness + simplification + efficiency in one pass |
| Setup | setup | Install dependencies, configure services, smoke-check |
| Verify | verifier | (Opt-in) Drive the running app, prove each acceptance criterion with evidence |
| Docs | docs | Update README, CHANGELOG, API docs |

**Review finds issues → back to Code.** Up to 3 fix iterations (configurable).

## Token efficiency

The pipeline is designed to minimize token waste through cold cache starts:

- **Split Scout** — the codebase is read exactly once by a dedicated agent. The snapshot becomes a **shared cache prefix** for all downstream agents (Coder, Reviewer, Setup, Docs). On workflow resume, Scout is skipped — the cache stays hot.
- **Fix-loop strip** — after the first pass, Coder and Reviewer don't see the full codebase context. Only the specific issues and affected files. Saves ~75% input tokens per fix iteration.
- **Structured hand-offs** — every agent returns schema-validated JSON, rendered compactly for the next stage. No raw text dumps, no truncation.
- **Severity-gated loop** — only `critical` and `major` issues trigger another Code pass. Minor findings ride along in the final report instead of burning an iteration.
- **Prompts live in agents** — the workflow passes a one-line task; the agent definition carries the full instructions. Keeps the orchestrator readable and the prompts editable in one place.
- **Budget-aware Docs** — the Docs phase is skipped if the remaining token budget drops below a configurable floor. It's non-blocking.

## Model routing

Every role can use a different model. Configure in `.claude/ldo-config.json`:

```json
{
  "models": {
    "medium": {
      "scout": "sonnet",   "explorer": "sonnet", "planner": "sonnet",
      "coder": "sonnet",   "reviewer": "sonnet", "setup": "sonnet",
      "verifier": "sonnet", "docs": "haiku",     "security": "fable",
      "researcher": "fable", "bootstrapper": "fable"
    }
  },
  "maxFixLoops": 3,
  "blockingSeverities": ["critical", "major"],
  "exploreByDefault": false,
  "researchByDefault": false,
  "securityByDefault": false,
  "verifyByDefault": false,
  "docsBudgetFloor": 30000
}
```

Same shape for `trivial` and `complex` tiers. Model names are whatever your setup routes them to — the pipeline makes no assumptions about which is stronger.

**Cache rule**: Coder, Reviewer, and Setup on the **same model** = cache hits for all three. A different model means a separate cache namespace and one cold start. Setting `reviewerDifferentModel: true` buys an independent second read at that cost.

Override per run:

```js
Workflow({name:"ldo", args:{
  task: "refactor auth module",
  explore: true,
  security: true,
  config: { models: { medium: { coder: "opus", reviewer: "opus" } } }
}})
```

Walk through setup: `/ldo-config` in Claude Code.

## Usage summary

| Command | What |
|---------|------|
| `/ldo "task"` | Full pipeline (complexity auto-detected) |
| `/ldo` + `mode: "greenfield"` | Bootstrap first, then the full pipeline |
| `/ldo` + `explore: true` | Add the task-scoped codebase search |
| `/ldo` + `research: true` | Add the web research phase |
| `/ldo` + `security: true` | Add the plan threat model |
| `/ldo` + `verify: true` | Add end-to-end verification after Setup |
| `/bootstrapper "idea"` | Research + stack + roadmap only |
| `/ctx-scout` | Scan codebase, produce snapshot |
| `/explorer "task"` | Find files, call sites, tricky spots for a task |
| `/researcher "topic"` | Multi-source web research |
| `/planner "task"` | Plan only (needs `/ctx-scout` first) |
| `/security` | Threat model a plan |
| `/coder "task"` | Implement only |
| `/reviewer` | Review current diff |
| `/setup` | Bootstrap dev environment |
| `/verifier` | Drive the app, prove acceptance criteria |
| `/docs` | Write documentation for current changes |
| `/ldo-config` | Walk through model routing config |

## How it works

1. **Planner assesses complexity** → picks the `trivial`, `medium`, or `complex` tier
2. The routing table maps tier + role → model name
3. Each agent returns schema-validated JSON; the orchestrator renders it compactly for the next stage
4. Coder and Reviewer loop until approved, or until `critical`/`major` issues stop appearing
5. Security threat-models the plan before code exists — its mitigations become hard requirements for the Coder
6. Setup makes the project runnable; Verify drives it and captures evidence; Docs updates user-facing documentation

**Universal**: the protocol is not tied to Claude Code. Each role is a prompt plus a JSON Schema contract. The orchestrator can be replaced with any script that calls any LLM runner.

## Files

```
.claude/
├── workflows/ldo.js          # Orchestrator (~790 lines)
├── agents/                   # 11 agent definitions — prompts live here
│   ├── bootstrapper.md
│   ├── ctx-scout.md
│   ├── explorer.md
│   ├── researcher.md
│   ├── planner.md
│   ├── security.md
│   ├── coder.md
│   ├── reviewer.md
│   ├── setup.md
│   ├── verifier.md
│   └── docs.md
├── skills/                   # 12 slash-commands
│   └── … one per agent, plus ldo-config
└── ldo-config.json           # Model routing + phase toggles
```

The installer copies exactly these files — nothing else in your `.claude/` is touched.

## License

MIT
