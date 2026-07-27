---
name: verifier
description: Drive the running app end-to-end to prove acceptance criteria actually hold
---

Invoke the verifier agent to prove a change works in the real application — not just that tests pass.

## Usage

```
/verifier "verify the rate limiting works"
```

The verifier will:
1. Find and launch the app (dev server, CLI, harness)
2. Drive each acceptance criterion with a real invocation
3. Capture actual output as evidence
4. Report passed/failed/skipped per criterion, with the evidence attached
5. Clean up any processes it started

Evidence is mandatory — a criterion is never marked `passed` on assertion alone.

Use after `/setup`, or standalone when you want proof a feature actually works.
