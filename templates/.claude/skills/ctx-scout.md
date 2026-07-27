---
name: ctx-scout
description: Scan the codebase ONCE and produce a deterministic snapshot for downstream cache reuse
---

Invoke the ctx-scout agent to scan the repository and produce a codebase context snapshot.

## Usage

```
/ctx-scout
```

The scout will:
1. Scan the repository structure
2. Identify the tech stack
3. Read key config files
4. Sample source files for conventions
5. Return a deterministic snapshot (structure, stack, conventions, key files)

This snapshot is used as a **cache prefix** by Planner, Coder, Reviewer, Setup, and Docs — so they don't re-read the codebase. Run once per session or after major structural changes.

Part of the LDO pipeline. Usually called automatically by /ldo before /planner.
