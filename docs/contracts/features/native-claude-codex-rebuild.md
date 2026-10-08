# Feature: native Claude Code and Codex rebuild

Status: approved; implementation pending

## Goal and user-visible behavior

Replace LDO's custom workflow runtime with a Markdown-first `ldo-ai` package usable immediately through Claude Code and Codex native agent/subagent and instruction conventions. Preserve repository identity, LICENSE, and useful role guidance. Use the role philosophy and prompt style of the installed `pi-subagents` package as inspiration, not its implementation/runtime.

## Scenarios

- Users can install or update the package for either host while preserving unrelated project/user files.
- Claude Code and Codex discover their respective native role definitions and shared instructions without invoking a custom orchestration engine.
- Package structure checks detect malformed manifests, missing agent files, unsafe installation behavior, and residual custom runtime.

## Non-goals

- Pi product support in this release.
- Custom orchestration/runtime, role routing, fix loops, state/resume machinery, or compatibility with the legacy workflow engine.
- Recorder and Researcher roles; they are removed entirely.
- Copying pi-subagents implementation/runtime.

## Roles

Keep only roles with a clear native-agent purpose: at minimum planner, worker, and reviewer. Add security only if implementation establishes a distinct justified boundary. Do not include Recorder or Researcher.

## Affected surfaces

- [Scope](../scope.md) (legacy rules superseded)
- [Code](../code.md) (retain applicable portable guidance)
- [Native Claude Code and Codex package](../surfaces/native-claude-codex.md) (new durable contract)

## Interfaces and constraints

- Preserve `ldo-ai` identity and LICENSE.
- Claude Code/Codex must own agent orchestration via their native mechanisms.
- JavaScript is permitted only for justified package/install/validation mechanics, never a custom orchestrator.
- Keep files single-responsibility, preferably at most 100 lines; remove obsolete runtime/tests/docs rather than leave compatibility shells.
- README and CHANGELOG must state the incompatible reset, supported workflows, installation, examples, constraints, and removal of legacy compatibility.
- Do not push, publish, install globally, or deploy.

## Acceptance criteria

1. Legacy workflow/orchestration/runtime, role adapters, schemas, state/resume, routing/fix loops, and obsolete tests/docs are removed.
2. Native Claude Code and Codex package paths and safe update/install mechanics work and preserve unrelated files.
3. Useful planner, worker, reviewer role guidance is available without duplicated common behavior; no Recorder or Researcher role remains. Security exists only with a distinct justified boundary.
4. README/CHANGELOG explain the breaking reset and host usage; focused tests validate packaging/install safety and prove no custom runtime remains.
5. Durable surface contract is updated; this feature contract remains marked `ready-for-verification` for independent review.

## Validation

Run focused structural/install tests, syntax/metadata checks, stale-runtime searches, `git diff --check`, and relevant tests available in the rebuilt package. Native host smoke tests may be skipped if clients are unavailable; report that explicitly.
