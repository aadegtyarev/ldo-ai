---
name: reviewer
description: Review code changes — plan compliance, correctness bugs, simplification, efficiency
---

Invoke the reviewer agent to quality-check changes against the plan.

## Usage

```
/reviewer "review the current diff against the plan"
```

The reviewer will:
1. Run `git diff` to see all changes
2. Read each changed file
3. Verify acceptance criteria are met (plan compliance)
4. Check for correctness bugs, simplification opportunities, and efficiency issues
5. Return a verdict: approved or changes_requested with specific issues

Covers both plan-aware review AND built-in code-quality checks in a single pass — no separate code-review phase needed.

Use after `/coder` or standalone on any diff.
