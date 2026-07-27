---
name: docs
description: Write or update project documentation based on implemented changes
---

Invoke the docs agent to create or update documentation for the current changes.

## Usage

```
/docs "document the new export API"
```

The docs agent will:
1. Survey existing documentation (README, CHANGELOG, docs/, API specs)
2. Determine what needs updating based on the diff
3. Write/update docs following existing conventions
4. Add CHANGELOG entries for user-facing changes

Use after `/reviewer` approves changes.
