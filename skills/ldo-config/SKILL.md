---
name: ldo-config
description: Configure LDO model routing — which model runs which role, and when the optional agents fire
---

Walk the operator through LDO's model routing and help them set it for this project.

## How config actually reaches the pipeline

A workflow has no filesystem access — it can't read a config file. Routing reaches it **only** through `args.config` at invocation:

```js
Workflow({ name: "ldo:ldo", args: {
  task: "refactor the auth module",
  config: { models: { medium: { coder: "haiku", reviewer: "opus" } } }
}})
```

So "configuring LDO" means one of two things:

1. **Per project (the usual way)** — put the routing in the project's `CLAUDE.md`, inside the LDO block that `/ldo-init` writes. Claude reads that every session and passes it on each run.
2. **Per run** — pass `config` inline, as above, to override for one invocation.

`ldo-config.example.json` in the plugin is a reference template of every key with its default. Copy from it; nothing reads it directly.

## The defaults

The protocol exists so different roles can run on different models — but only one role actually varies by tier. `planner` and `reviewer` are `opus` in every row on purpose, not by oversight:

```json
{
  "models": {
    "trivial": { "planner": "opus", "coder": "haiku",  "reviewer": "opus", "security": "opus", "researcher": "sonnet", "recorder": "haiku" },
    "medium":  { "planner": "opus", "coder": "sonnet", "reviewer": "opus", "security": "opus", "researcher": "opus",   "recorder": "haiku" },
    "complex": { "planner": "opus", "coder": "sonnet", "reviewer": "opus", "security": "opus", "researcher": "opus",   "recorder": "haiku" }
  }
}
```

**Planner is fixed because complexity is its own output.** The whole point of `complexity` is to pick a tier — but the Planner produces that rating *by planning*, so nothing can gate the Planner's model on a complexity it hasn't rated yet. Its value comes from surfacing what the task didn't ask about (an unrelated leak, a race nobody flagged, a security gap outside the stated scope) — that kind of judgment doesn't get cheaper because the resulting plan turns out short. Structurally, only the `medium` row's `planner` value is ever read at runtime (Research and Plan both run before complexity is known); the `trivial`/`complex` rows carry the same value purely for shape consistency, not because a different rating would route to a different model.

**Reviewer is fixed because a cheap reviewer that trusts the Coder isn't a review.** Its entire value is not sharing the Coder's blind spot — that's not a task-size property. A cheap model executes narrow instructions well but doesn't reliably know when to stop and ask instead of writing confident, made-up prose about work it didn't actually verify: a contract line for an event that isn't in the code, a test description that contradicts its own body, a report citing a tool name that doesn't exist. That failure mode is cheaper to produce than the work it claims to describe, and a cheap Reviewer is the worst-positioned agent to catch it — it's exactly the same failure mode it would be checking for.

`coder` is the one role actually meant to scale with the tier — its job is executing a plan, not making priority calls, and that width (not code difficulty) is what the tier is really measuring for it. If a task looks like it wants a stronger Coder, the better first move is usually narrowing the plan's scope rather than reaching for a stronger model: a narrow task is cheaper to review and fails visibly — done or not — where a wide one gives a cheap model room to make calls it shouldn't and describe the result confidently.

These apply when nothing is passed. The source of truth is `DEFAULT_MODELS` in `workflows/ldo.js` — this table and `ldo-config.example.json` both describe it; if either ever looks stale, that's the one to check against. Model names mean whatever your setup routes them to — the pipeline assumes nothing about which is stronger.

## The roles

Three always run:

| Role | Does | Model choice |
|------|------|--------------|
| **planner** | Reads the codebase, writes the plan, rates complexity and security surface | Opus at every tier — it can't be gated on the complexity it's the one rating |
| **coder** | Sets up the environment, implements, tests, updates docs | The one role that actually scales with the tier — a plan's width, not the underlying code's difficulty, is what it's routed on |
| **reviewer** | Reads the diff *and* drives the app to prove the criteria | **The reason for the protocol.** Opus at every tier — a reviewer that trusts the coder isn't reviewing |

Three are conditional:

| Role | Fires when | Model choice |
|------|-----------|--------------|
| **researcher** | `research: true`, or `researchByDefault` — task needs knowledge from outside the repo | Opus at medium/complex — cross-verifying sources is worth it |
| **security** | The Planner rates `security_surface: "elevated"` — new input, auth, secrets, injection, dependency, or crypto surface. Force with `security: true/false` or `securityByDefault` | Opus at every tier — a missed vulnerability costs more than a strong model does |
| **recorder** | Approved, and `complexity != "trivial"` — persists the review report, architecture doc, and backlog so they survive past the session | Haiku at every tier — it formats and files, it doesn't judge |

Starting a project from scratch isn't part of the pipeline — `/ldo-bootstrap` handles that as a conversation, then hands the first task to `/ldo:ldo`.

## Which tier applies

The Planner rates each task `trivial`, `medium`, or `complex`, and that picks the row from `models`. You don't set it — it's assessed per task.

## Cache impact

Anthropic keys its prompt cache on (model, prompt prefix). The Planner's `codebase_context` is the shared prefix for Coder and Reviewer.

- **Same model for both** → the Reviewer hits a warm cache.
- **Different models** → separate cache namespaces, one cold start.

The default accepts that cold start deliberately: an independent read is worth more than the cached tokens. If you're optimising purely for cost on a large codebase, matching the models will save more.

## Other keys

| Key | Default | Effect |
|-----|---------|--------|
| `maxFixLoops` | `3` | How many Code⇄Review rounds before giving up |
| `blockingSeverities` | `["critical","major"]` | Which findings buy another round. Minor and nit ride along in the report |
| `researchByDefault` | `false` | Run the Researcher on every task |
| `securityByDefault` | *(unset)* | Force the Security agent on or off, overriding the Planner's rating |
| `maxParallelFeatures` | `12` | Cap on concurrent features in a multi-feature run (`args.tasks`) — a run above this logs a warning, it isn't blocked |

## Per-run override

Anything shown above can be overridden for one invocation:

```js
Workflow({name: "ldo:ldo", args: {
  task: "refactor the auth module",
  research: true,
  security: true,
  isolate: true,
  config: {
    maxFixLoops: 5,
    models: { medium: { coder: "haiku", reviewer: "opus" } }
  }
}})
```

`isolate: true` is a top-level arg (like `research`/`security`, not a `config` key): the task runs in its own git worktree instead of your working tree — same isolation a `tasks` batch gets, for a single feature.

## Check it took effect

Run `/ldo:ldo` on something small and read the log line after Plan:

```
Complexity: medium  |  Security surface: none  |  Coder:sonnet  Reviewer:opus
```

That's the routing that actually applied.

## Standalone calls

Agent files deliberately declare no model — this config is the only place routing lives. Calling `/ldo-coder` or `/ldo-reviewer` directly runs it on your session's current model. To pin one, use the workflow, or pass a model when invoking the agent.
