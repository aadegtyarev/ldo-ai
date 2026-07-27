---
name: reviewer
description: Review the diff and drive the running app to prove acceptance criteria hold
---

Invoke the reviewer to quality-gate a change. Usually the strongest model in the pipeline.

## Usage

```
/reviewer
```

The reviewer will:
1. Read the diff — plan compliance, correctness, simplification, efficiency
2. Drive the actual application against each acceptance criterion
3. Capture real output as evidence — a criterion passes only with proof
4. Confirm security mitigations were actually implemented
5. Return a verdict with specific, actionable issues

Reading and running are both its job: the two ways of catching what the Coder missed, done by a model that didn't write the code.

Use after `/coder`, or standalone on any diff.
