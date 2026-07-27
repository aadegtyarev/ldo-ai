---
name: bootstrapper
description: Kickstart a new project from a rough idea — research, stack selection, roadmap
---

Invoke the bootstrapper agent to turn a rough idea into a concrete project blueprint.

## Usage

```
/bootstrapper "a CLI tool for managing tmux sessions with git integration"
```

The bootstrapper will:
1. Clarify the idea with you if it's vague
2. Search for existing similar open-source and commercial solutions
3. Propose a tech stack with rationale and alternatives
4. Draft a phased roadmap starting with scaffold → core → polish
5. Return a blueprint ready for `/planner` to break down

Use this when starting a greenfield project, or when exploring whether an idea is worth building.
