---
name: ldo-ai-validation
description: Use to choose and report checks for changed behavior, interfaces, packaging, or failure paths.
---
<!-- managed by ldo-ai -->

# Validation

- Select the narrowest meaningful checks for changed behavior and expand to required package checks; account for regression risk, not line count.
- Include relevant success, edge, and failure cases. Verify observable behavior rather than implementation details.
- Run checks after edits and report exact commands/results; distinguish skipped checks, environment limits, and pre-existing failures.
- Never claim tests, review, or runtime behavior passed without observed evidence. Inspect the final diff for scope and stale references.
