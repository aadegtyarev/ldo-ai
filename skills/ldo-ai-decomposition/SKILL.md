---
name: ldo-ai-decomposition
description: Use when a task splits a module, extracts a seam, migrates callers, or otherwise restructures code.
---
<!-- managed by ldo-ai -->

# Evidence-driven decomposition

- Start from important observable behavior and real change pressure; avoid abstraction, coverage, or file splitting for its own sake.
- Add focused characterization or contract tests proportional to behavior risk and value before moving code. Do not mechanically test every line.
- Separate structural movement from behavior changes so regressions and review scope stay attributable.
- Migrate incrementally across a real seam, verify each step, move callers, and remove the old path; avoid permanent parallel implementations.
- Split or update a surface contract only when consumers or observable guarantees form a real boundary. Do not mirror file/module structure in contracts.
