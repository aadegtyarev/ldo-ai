---
name: ldo-ai-validation
description: Use to choose and report checks for changed behavior, interfaces, packaging, or failure paths.
---
<!-- managed by ldo-ai -->

# Validation

- Run only the checks the change can affect: a label or text change runs the tests of that screen, not the whole suite. Expand to the full suite only when shared parts change (navigation, storage, security, build) or before a release; weigh regression risk, not line count.
- Cover the success, edge, and failure cases that can actually occur. Verify observable behavior rather than implementation details.
- Run checks after edits and report exact commands and results; trust exit codes (a pipe to `tail` hides a failure). Distinguish skipped checks, environment limits, and pre-existing failures.
- For UI, look at the rendered result at phone and desktop sizes, including empty and error states. After a deploy or config change, check the live result, not only the build.
- Never claim tests, review, or runtime behavior passed without observed evidence. Inspect the final diff for scope and stale references.
