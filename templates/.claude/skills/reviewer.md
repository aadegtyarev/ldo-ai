---
name: reviewer
description: Review code changes against an implementation plan
---

Invoke the reviewer agent to quality-check changes against the plan.

## Usage

```
/reviewer "review the current diff against the plan"
```

The reviewer will:
1. Run `git diff` to see all changes
2. Read each changed file
3. Verify acceptance criteria are met
4. Return a verdict: approved or changes_requested with specific issues

Use after `/coder` or standalone on any diff.
