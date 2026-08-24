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

The protocol exists so different roles can run on different models. `planner` is `opus` in every row, and `reviewer` is `opus` except on `complex` where it's `fable` (Sonnet fallback), on purpose, not by oversight:

```json
{
  "models": {
    "trivial": { "planner": "opus", "coder": "haiku",  "reviewer": "opus",  "reviewerFix": "opus",  "security": "opus", "researcher": "sonnet", "recorder": "sonnet" },
    "medium":  { "planner": "opus", "coder": "sonnet", "reviewer": "opus",  "reviewerFix": "opus",  "security": "opus", "researcher": "opus",   "recorder": "sonnet" },
    "complex": { "planner": "opus", "coder": "opus",   "reviewer": "fable", "reviewerFix": "fable", "security": "opus", "researcher": "opus",   "recorder": "sonnet" }
  }
}
```

**Planner is fixed because complexity is its own output.** The whole point of `complexity` is to pick a tier — but the Planner produces that rating *by planning*, so nothing can gate the Planner's model on a complexity it hasn't rated yet. Its value comes from surfacing what the task didn't ask about (an unrelated leak, a race nobody flagged, a security gap outside the stated scope) — that kind of judgment doesn't get cheaper because the resulting plan turns out short. Structurally, only the `medium` row's `planner` value is ever read at runtime (Research and Plan both run before complexity is known); the `trivial`/`complex` rows carry the same value purely for shape consistency, not because a different rating would route to a different model.

**Reviewer stays strong because a cheap reviewer that trusts the Coder isn't a review.** Its entire value is not sharing the Coder's blind spot. A cheap model executes narrow instructions well but doesn't reliably know when to stop and ask instead of writing confident, made-up prose about work it didn't actually verify: a contract line for an event that isn't in the code, a test description that contradicts its own body, a report citing a tool name that doesn't exist. That failure mode is cheaper to produce than the work it claims to describe, and a cheap Reviewer is the worst-positioned agent to catch it — it's exactly the same failure mode it would be checking for. So the reviewer is `opus` on `trivial`/`medium` and `fable` on `complex`, where there's the most to miss; when `fable` isn't on the proxy route the run falls back to `sonnet` — a weaker review still catches things, and no review is what a run can't recover from.

**`reviewerFix` routes rounds 2+, and defaults to the same model as `reviewer` on purpose.** A fix pass genuinely is the easier job: round 1 is an open-ended search for defects nobody has named yet, while a fix pass verifies a list the previous round already wrote down. That's a real argument for a cheaper model — but it's a trade, not a free saving, and the measurement says so: in one run, round 4 found a genuine new `major` that rounds 1-3 had missed. So the defaults change nothing, and setting `reviewerFix` yourself is how you buy cheaper fix rounds knowing what they can cost. It uses the same Fable→Sonnet fallback as `reviewer`.

`coder` scales with the tier — `haiku`/`sonnet`/`opus` — because its job is executing a plan, not making priority calls, and that width (not code difficulty) is what the tier is really measuring for it. If a task looks like it wants a stronger Coder, the better first move is usually narrowing the plan's scope rather than reaching for a stronger model: a narrow task is cheaper to review and fails visibly — done or not — where a wide one gives a cheap model room to make calls it shouldn't and describe the result confidently.

An override is merged per **role**, not per tier — `{models: {medium: {coder: "haiku"}}}` changes the medium Coder and leaves every other medium role at its default. A tier name, role name, or model value LDO doesn't recognise is warned about in the run log and ignored rather than forwarded: an unusable model name reaching the harness fails with your typo nowhere in the output.

**`recorder` is `sonnet` as a workaround, not as a judgment about the role.** Formatting and filing is exactly the shape of work Haiku is right for, and it was routed there until every Haiku sub-agent this project ran failed with `400 clear_thinking_20251015 strategy requires thinking to be enabled` — 6 of 6, against 0 of 47 agents on other models, always on the second request. Nothing about the prompt causes it; the Recorder's input is around 25k of a 200k window. If that's fixed upstream, `haiku` is the right value again — see issue #4.

These apply when nothing is passed. The source of truth is `DEFAULT_MODELS` in `workflows/ldo.js` — this table and `ldo-config.example.json` both describe it; if either ever looks stale, that's the one to check against. Model names mean whatever your setup routes them to — the pipeline assumes nothing about which is stronger.

## The roles

Three always run — `reviewerFix` is a fourth routing key, not a fourth agent: it's the same Reviewer, dispatched on rounds 2 and later:

| Role | Does | Model choice |
|------|------|--------------|
| **planner** | Reads the codebase, writes the plan, rates complexity and security surface | Opus at every tier — it can't be gated on the complexity it's the one rating |
| **coder** | Sets up the environment, implements, tests, updates docs | Scales with the tier (haiku/sonnet/opus) — a plan's width, not the underlying code's difficulty, is what it's routed on |
| **reviewer** | Reads the diff *and* drives the app to prove the criteria | **The reason for the protocol.** Opus at `trivial`/`medium`, Fable at `complex` (Sonnet fallback) — a reviewer that trusts the coder isn't reviewing |
| **reviewerFix** | The same reviewer, on rounds 2+ (the fix passes) | Same model as `reviewer` by default. Lower it to buy cheaper fix rounds — a later round can still find a new blocker, so it's a trade |

Three are conditional:

| Role | Fires when | Model choice |
|------|-----------|--------------|
| **researcher** | `research: true`, or `researchByDefault` — task needs knowledge from outside the repo | Opus at medium/complex — cross-verifying sources is worth it |
| **security** | The Planner rates `security_surface: "elevated"` — new input, auth, secrets, injection, dependency, or crypto surface. Force with `security: true/false` or `securityByDefault` | Opus at every tier — a missed vulnerability costs more than a strong model does |
| **recorder** | Approved, and `complexity != "trivial"` — persists the review report, architecture doc, and backlog so they survive past the session. In a parallel or `isolate: true` run it writes backlog items to `docs/backlog/<label>.md` instead of the shared `docs/BACKLOG.md`, so sibling features never race over the same section numbers | Sonnet at every tier. The work is formatting and filing, not judgment, so Haiku is the right size — but every Haiku sub-agent this project has run died on `400 clear_thinking_20251015 strategy requires thinking to be enabled` (6 of 6, against 0 of 47 on other models), so the Recorder is routed off it as a workaround. See issue #4 |

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
| `stallMs` | per-role: planner/reviewer `480000`, coder `360000`, security/researcher `300000`, recorder `180000` | How many ms an agent may generate without a tool call before Claude Code aborts it as stalled. Only tool calls reset this timer, so a large structured output (a long plan, a full verdict) needs headroom — a genuinely hung agent costs this value six times over (the harness retries 5 times). Values are milliseconds and must be at least `1000`; anything smaller is rejected with a warning and the default kept, since `480` meaning "eight minutes" would otherwise abort the role instantly, six times over. An unrecognised role name is warned about, not silently ignored |
| `planner.maxStepsPerRun` | `8` | The soft step ceiling handed to the Planner. Above it the Planner is expected to rate `fits_one_run: false` unless the steps are genuinely one unit of work. Not enforced by the orchestrator — nothing is blocked or truncated; an invalid value (non-numeric, or below `1`) is warned about and the default kept |
| `tests.scope` | `"scoped"` | Whether the Coder's baseline/per-step runs and the Reviewer's revert proof run the whole suite or only the touched files. `"scoped"` uses the Planner's `test_command_scoped` template and cuts a run's 5-8 full suite executions to one; `"full"` restores the old behaviour. Scoping only applies when the Planner supplied a template that survives validation — otherwise, and on every resumed plan, the full suite is used unchanged |
| `tests.fullSuiteAt` | `"final-pass"` | Where the one full run belongs: `"final-pass"` at the end of each Coder pass, `"ship"` deferred to `/ldo-ship` before the PR, `"never"` nowhere in the pipeline (you own that gate). On `"ship"` and `"never"` the Coder and the Reviewer each get an explicit do-not-run block on every pass, so the setting removes the run rather than only labelling the result. Only meaningful under `scope: "scoped"` — with `scope: "full"` every run is already the whole suite, so it is neutralised with a log line. The result always carries `full_suite_status` (`ran`/`not_run`/`disabled`/`deferred_to_ship`), and anything but `ran` appends a `FULL SUITE NOT RUN` line to the verdict summary — it annotates, it never blocks |
| `planner.preferSplit` | `true` | Matches the preference for short atomic runs. `false` means "plan it as one piece, I know what I'm asking for", and the Planner then only flags a split when the task is outright incoherent as one run |

## Per-run override

Anything shown above can be overridden for one invocation:

```js
Workflow({name: "ldo:ldo", args: {
  task: "refactor the auth module",
  research: true,
  security: true,
  isolate: true,
  planOnly: true,
  config: {
    maxFixLoops: 5,
    models: { medium: { coder: "haiku", reviewer: "opus" } }
  }
}})
```

`isolate: true` and `planOnly: true` are both top-level args (like `research`/`security`, not `config` keys). `isolate` runs the task in its own git worktree instead of your working tree — same isolation a `tasks` batch gets, for a single feature. `planOnly` stops the pipeline early: Research → Plan → Security-if-elevated, then it stops and hands the plan back. The result carries `mode: 'plan-only'` and deliberately has no `approved` field, so a plan is never mistaken for a rejected run.

## Check it took effect

Run `/ldo:ldo` on something small and read the log line after Plan:

```
Complexity: medium  |  Security surface: none  |  Coder:sonnet  Reviewer:opus  Fix-review:opus
```

That's the routing that actually applied.

## Standalone calls

Agent files deliberately declare no model — this config is the only place routing lives. Calling `/ldo-coder` or `/ldo-reviewer` directly runs it on your session's current model. To pin one, use the workflow, or pass a model when invoking the agent.
