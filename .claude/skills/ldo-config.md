---
name: ldo-config
description: Configure LDO model-to-role routing — set models per role, per complexity tier, understand cache impact
---

Walk through configuring model routing for the LDO pipeline.

## Procedure

### 1. Open the config

File: `.claude/ldo-config.json`

The `models` section has three complexity tiers — `trivial`, `medium`, `complex`. Each tier maps 7 roles to model names:

```json
"medium": {
  "scout": "sonnet",
  "planner": "sonnet",
  "coder": "sonnet",
  "reviewer": "sonnet",
  "setup": "sonnet",
  "docs": "haiku",
  "bootstrapper": "fable"
}
```

### 2. Understand the roles

| Role | What it does | Model impact |
|------|-------------|-------------|
| **bootstrapper** | Research + stack selection (greenfield only) | Runs once, no cache dependency |
| **scout** | Reads codebase, produces deterministic CTX snapshot | Runs once, cached by resumeFromRunId |
| **planner** | CTX + task → implementation plan | Runs once |
| **coder** | Implements plan + writes tests | First model in the cache chain — populates cache |
| **reviewer** | Reviews diff, returns verdict | Same model as coder = cache hit. Different = adversarial benefit at +1 cold start |
| **setup** | Installs deps, configures services | Same model as coder = cache hit |
| **docs** | Updates README/CHANGELOG/API docs | Separate model = separate cache namespace. Skipped on low budget |

### 3. Cache optimization rule

The CTX prefix (codebase snapshot) is shared across Coder → Reviewer → Setup → Docs. Cache hits happen when the **same model name** sees the **same prefix bytes**.

- **Keep Coder, Reviewer, Setup on the same model** for max cache reuse
- **Reviewer on a different model** costs 1 extra cold start — worth it for complex/ adversarial review
- **Docs** is usually a different model (separate cache namespace) — acceptable since Docs is formulaic and skippable on low budget

### 4. Per-task override

Pass `args.config` when invoking the workflow:

```js
Workflow({name:"ldo", args:{
  task: "refactor auth module",
  config: {
    models: {
      medium: {
        coder: "opus",
        reviewer: "opus",
        setup: "sonnet"
      }
    },
    maxFixLoops: 5,
    reviewerDifferentModel: false
  }
}})
```

Only the keys you provide are overridden — the rest fall back to `ldo-config.json` defaults.

### 5. Other config keys

| Key | Default | What |
|-----|---------|------|
| `maxFixLoops` | 3 | Max code-review iterations before giving up |
| `reviewerDifferentModel` | false | Use `models[complex].reviewer` when reviewer matches coder |
| `docsBudgetFloor` | 30000 | Skip Docs if remaining tokens drop below this |

### 6. Verify

After changing config, run `/ldo` on a small task and check the log line:

```
Complexity: medium  |  Coder:opus  Reviewer:opus  Setup:sonnet  Docs:haiku
```

This confirms your routing took effect.
