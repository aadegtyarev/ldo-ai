---
name: explorer
description: Fan-out codebase search for task-specific files, call sites, and tricky spots
---

Invoke the explorer agent to find everything in the codebase relevant to a task.

## Usage

```
/explorer "add rate limiting to the API"
```

The explorer will:
1. Identify search targets from the task (functions, config keys, routes, types)
2. Grep/Glob for each across the codebase
3. Trace call sites, consumers, and dependents
4. Locate existing tests for the affected code
5. Flag tricky spots — race conditions, complex branches, error handlers

Returns structured findings: files by role (primary/dependent/test/config), call sites, tests, concerns.

Differs from `/ctx-scout`: Scout gives a broad structural snapshot for caching; Explorer searches narrowly for one specific task.

Use before `/planner` on tasks that touch unfamiliar or widely-used code.
