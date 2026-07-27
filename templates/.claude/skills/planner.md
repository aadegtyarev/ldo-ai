---
name: planner
description: Analyze a dev task using a cached codebase snapshot and produce a structured implementation plan
---

Invoke the planner agent to analyze a development task and produce a structured plan.

## Usage

```
/planner "add rate limiting to the API endpoints"
```

The planner receives a PROJECT CONTEXT snapshot (from `/ctx-scout`) and will:
1. Assess task complexity (trivial/medium/complex)
2. Produce an ordered list of implementation steps with files and acceptance criteria
3. Identify risks

Note: the planner does NOT scan the repo itself — run `/ctx-scout` first, or use `/ldo` which runs both automatically.

Use before `/coder` or as the second planning stage of `/ldo`.
