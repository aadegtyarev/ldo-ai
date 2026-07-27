---
name: setup
description: Bootstrap the project development environment — install deps, configure services, make it runnable
---

Invoke the setup agent to get the project into a runnable state.

## Usage

```
/setup
```

The setup agent will:
1. Detect the project type (Node, Python, Go, etc.)
2. Install missing dependencies
3. Start required services (databases, caches)
4. Configure environment variables
5. Smoke-check that the project builds/runs
6. Report what was done and what's still unresolved

Does NOT write tests, review code, or verify features. Pure environment bootstrapping.

## Positioning

- **Standalone**: use before `/coder` or after cloning a new repo to get ready for development
- **In LDO pipeline**: Phase 4, runs after Code+Review (ensures the environment matches the implemented changes)
