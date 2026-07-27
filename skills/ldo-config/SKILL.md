---
name: ldo-config
description: Configure LDO model routing — which model runs which role, and when the optional agents fire
---

Walk the operator through LDO's model routing and help them set it for this project.

## How config actually reaches the pipeline

A workflow has no filesystem access — it can't read a config file. Routing reaches it **only** through `args.config` at invocation:

```js
Workflow({ name: "ldo", args: {
  task: "refactor the auth module",
  config: { models: { medium: { coder: "haiku", reviewer: "opus" } } }
}})
```

So "configuring LDO" means one of two things:

1. **Per project (the usual way)** — put the routing in the project's `CLAUDE.md`, inside the LDO block that `/ldo-init` writes. Claude reads that every session and passes it on each run.
2. **Per run** — pass `config` inline, as above, to override for one invocation.

`ldo-config.example.json` in the plugin is a reference template of every key with its default. Copy from it; nothing reads it directly.

## The defaults

The protocol exists so different roles can run on different models. The default puts a stronger model on Review than on Code: cheap to write, careful to check.

```json
{
  "models": {
    "trivial": { "planner": "sonnet", "coder": "sonnet", "reviewer": "opus" },
    "medium":  { "planner": "sonnet", "coder": "sonnet", "reviewer": "opus" },
    "complex": { "planner": "opus",   "coder": "sonnet", "reviewer": "opus" }
  }
}
```

These apply when nothing is passed. Model names mean whatever your setup routes them to — the pipeline assumes nothing about which is stronger.

## The roles

Three always run:

| Role | Does | Model choice |
|------|------|--------------|
| **planner** | Reads the codebase, writes the plan, rates complexity and security surface | Steps up on `complex`, where a wrong approach is expensive to unwind |
| **coder** | Sets up the environment, implements, tests, updates docs | Sonnet handles this well; the Reviewer above catches what it misses |
| **reviewer** | Reads the diff *and* drives the app to prove the criteria | **The reason for the protocol.** Put your strongest model here |

Two are conditional:

| Role | Fires when |
|------|-----------|
| **researcher** | `research: true`, or `researchByDefault` — task needs knowledge from outside the repo |
| **security** | The Planner rates `security_surface: "elevated"` — new input, auth, secrets, injection, dependency, or crypto surface |

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

## Per-run override

Anything in the file can be overridden for one invocation:

```js
Workflow({name: "ldo", args: {
  task: "refactor the auth module",
  research: true,
  security: true,
  config: {
    maxFixLoops: 5,
    models: { medium: { coder: "haiku", reviewer: "opus" } }
  }
}})
```

## Check it took effect

Run `/ldo:ldo` on something small and read the log line after Plan:

```
Complexity: medium  |  Security surface: none  |  Coder:sonnet  Reviewer:opus
```

That's the routing that actually applied.

## Standalone calls

Agent files deliberately declare no model — this config is the only place routing lives. Calling `/ldo-coder` or `/ldo-reviewer` directly runs it on your session's current model. To pin one, use the workflow, or pass a model when invoking the agent.
