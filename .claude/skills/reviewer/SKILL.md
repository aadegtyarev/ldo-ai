---
name: reviewer
description: Review the diff and drive the running app to prove acceptance criteria hold
---

Quality-gate a change. The strongest model in the pipeline.

## Usage

```
/reviewer
```

The reviewer will:
1. Read the diff — plan compliance, correctness, simplification, efficiency
2. Drive the actual application against each acceptance criterion
3. Capture real output as evidence — a criterion passes only with proof
4. Confirm any security mitigations were actually implemented
5. Return a verdict with specific, actionable issues

Reading and running are both its job: two ways of catching what the Coder missed, done by a model that didn't write the code.

Use after `/coder`, or standalone on any diff.

## Layering with the built-ins

This reviewer is **plan-aware** — it checks the change against acceptance criteria the plan set out. No built-in does that; they review code against the codebase, not against an intent.

For a large or high-stakes change, run a built-in afterwards for an independent second opinion:

| Command | Adds |
|---|---|
| `/code-review high` | Multi-agent correctness pass with confidence-scored filtering. Effort scales `low` → `max`; `--fix` applies findings, `--comment` posts inline on a PR |
| `/security-review` | Dedicated vulnerability pass over the branch |
| `/simplify` | Cleanup-only — dead code, over-engineering, duplication. Applies fixes by default |

These are user-invoked commands: run them yourself after the pipeline finishes. A workflow can't call them, so they complement LDO rather than compose into it.

Also worth installing for ongoing coverage: `security-guidance@claude-plugins-official` reviews every edit, turn, and commit as you work — it catches during writing what this reviewer catches at the gate.
