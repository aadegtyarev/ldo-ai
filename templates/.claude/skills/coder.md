---
name: coder
description: Execute an implementation plan by making actual code changes and writing tests
---

Invoke the coder agent to implement changes according to a plan.

## Usage

```
/coder "implement the plan from /planner output"
```

The coder will:
1. Read each file referenced in the plan
2. Make edits step by step
3. Write or update tests for every behavior change (happy path + edge cases + error handling)
4. Run tests to confirm they pass
5. Run `git diff` to review changes holistically
6. Return a structured summary: files changed, tests, deviations

Use after `/planner` and before `/reviewer`, or as part of `/ldo`.
