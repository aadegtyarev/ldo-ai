# LDO — Lightweight Dev Orchestrator

**LDO** = Lightweight Dev Orchestrator (AI-driven).

A 7-agent AI development pipeline for Claude Code. From idea to documented, tested code — with configurable model routing per role.

## Install

```bash
# Into the current project
npx ldo-ai

# Globally (available in all Claude Code sessions)
npx ldo-ai --global
```

After install, configure model routing in `.claude/ldo-config.json`. Then invoke in Claude Code:

```
/ldo "add rate limiting middleware"
```

## Pipeline

```
┌───────────┐   ┌───────┐   ┌─────────┐   ┌──────────┐   ┌──────┐   ┌──────┐   ┌────────┐   ┌──────────┐   ┌───────┐   ┌──────┐
│ Bootstrap │──→│ Scout │──→│ Explore │──→│ Research │──→│ Plan │──→│ Code │──→│ Review │──→│ Security │──→│ Setup │──→│ Docs │
│           │   │       │   │ (opt-in)│   │ (opt-in) │   │      │   │  ↻   │   │        │   │ (opt-in) │   │       │   │      │
└───────────┘   └───────┘   └─────────┘   └──────────┘   └──────┘   └──────┘   └────────┘   └──────────┘   └───────┘   └──────┘
  greenfield     reads repo   codebase      web search    task→plan  implement   quality      OWASP audit    deps+env    README+
  stack+roadmap  ONCE         deep scan     multi-source  complex.   +tests      gate         threat model   smoke-check CHANGELOG
```

| Phase | Agent | What it does |
|-------|-------|-------------|
| Bootstrap | bootstrapper | (Greenfield) Research similar solutions, pick stack, draft roadmap |
| Scout | ctx-scout | Read the codebase ONCE — produce a deterministic cache-prefix snapshot |
| Explore | Claude Explorer | (Opt-in) Fan-out search for task-specific patterns, usages, call sites |
| Research | researcher | (Opt-in) Deep web search on the task domain, cross-verify claims |
| Plan | planner | Task + context → ordered steps with acceptance criteria |
| Code | coder | Implement the plan, write tests |
| Review | reviewer | Review the diff, approve or request specific fixes |
| Security | security | (Opt-in) OWASP threat audit: injection, auth, data exposure, supply chain |
| Setup | setup | Install dependencies, configure services, smoke-check |
| Docs | docs | Update README, CHANGELOG, API docs |

**Review finds issues → back to Code.** Up to 3 fix iterations (configurable).

## Token efficiency

The pipeline is designed to minimize token waste through cold cache starts:

- **Split Scout** — the codebase is read exactly once by a dedicated agent. The snapshot becomes a **shared cache prefix** for all downstream agents (Coder, Reviewer, Setup, Docs). On workflow resume, Scout is skipped — the cache stays hot.
- **Fix-loop strip** — after the first pass, Coder and Reviewer don't see the full codebase context. Only the specific issues and affected files. Saves ~75% input tokens per fix iteration.
- **Budget-aware Docs** — the Docs phase is skipped if the remaining token budget drops below a configurable floor. It's non-blocking.

## Model routing

Every role can use a different model. Configure in `.claude/ldo-config.json`:

```json
{
  "models": {
    "trivial": {
      "scout": "haiku",  "planner": "haiku",  "coder": "haiku",
      "reviewer": "haiku", "setup": "haiku",   "docs": "haiku",
      "bootstrapper": "sonnet"
    },
    "medium": {
      "scout": "sonnet", "planner": "sonnet", "coder": "sonnet",
      "reviewer": "sonnet", "setup": "sonnet", "docs": "haiku",
      "bootstrapper": "fable"
    },
    "complex": {
      "scout": "fable",  "planner": "fable",  "coder": "fable",
      "reviewer": "fable",  "setup": "fable",   "docs": "haiku",
      "bootstrapper": "fable"
    }
  }
}
```

**Cache rule**: Coder, Reviewer, and Setup on the **same model** = cache hits for all three. Different model = +1 cold start. Reviewer on a different model gives an adversarial benefit (fresh eyes) at the cost of one cold start.

Override per task:

```js
Workflow({name:"ldo", args:{
  task: "refactor auth module",
  config: { models: { medium: { coder: "opus", reviewer: "opus" } } }
}})
```

Walk through setup: `/ldo-config` in Claude Code.

## Usage summary

| Command | What |
|---------|------|
| `/ldo "task"` | Full pipeline (complexity auto-detected) |
| `/ldo mode:greenfield "idea"` | Bootstrap + full pipeline |
| `/ldo research:"topic"` | Full pipeline with deep research pre-phase |
| `/ldo security:"task"` | Full pipeline with security audit |
| `/bootstrapper "idea"` | Research + stack + roadmap only |
| `/ctx-scout` | Scan codebase, produce snapshot |
| `/planner "task"` | Plan only (needs `/ctx-scout` first) |
| `/coder "task"` | Implement only |
| `/reviewer` | Review current diff |
| `/security` | Security threat audit on current diff |
| `/setup` | Bootstrap dev environment |
| `/docs` | Write documentation for current changes |
| `/ldo-config` | Walk through model routing config |

## How it works

1. **Planner complexity assessment** → picks `trivial`, `medium`, or `complex` tier
2. Model routing table maps tier + role → model name
3. Each agent receives the previous agent's structured output (JSON Schema validated)
4. Coder and Reviewer loop until approved or max iterations exhausted
5. Security audits approved code for OWASP threats (opt-in)
6. Setup bootstraps the environment; Docs updates documentation for user-facing changes

**Universal**: the protocol is not tied to Claude Code. Each role has a defined prompt + JSON Schema contract. The orchestrator can be replaced with an external script that calls any LLM runner.

## Files

```
.claude/
├── workflows/ldo.js          # Orchestrator (~880 lines)
├── agents/                   # 9 agent definitions
│   ├── bootstrapper.md
│   ├── ctx-scout.md
│   ├── planner.md
│   ├── coder.md
│   ├── reviewer.md
│   ├── security.md
│   ├── researcher.md
│   ├── setup.md
│   └── docs.md
├── skills/                   # 10 slash-commands
│   ├── bootstrapper.md
│   ├── ctx-scout.md
│   ├── planner.md
│   ├── coder.md
│   ├── reviewer.md
│   ├── security.md
│   ├── researcher.md
│   ├── setup.md
│   ├── docs.md
│   └── ldo-config.md
└── ldo-config.json           # Model routing table
```

## License

MIT
