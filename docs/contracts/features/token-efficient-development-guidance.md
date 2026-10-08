# Token-efficient development guidance

Status: approved; ready for verification

## Goal and user-visible behavior

Provide compact native Claude Code and Codex instructions that route trivial work directly and guide non-trivial work through evidence-based contract approval, planning, bounded implementation, independent review, and surface reconciliation without a custom runtime.

## Scenarios

- Trivial, local work goes directly to the worker; non-trivial work proceeds through reconnaissance, concise approval contract, plan, implementation, independent review, and durable contract update. Delete the temporary feature contract only after verification and reconciliation.
- Conditional guidance is delivered as native host skills and loaded only when relevant for development, decomposition, security, validation, and Git delivery.
- Decomposition protects important observable behavior with proportional focused characterization/contract tests; structural and behavior changes are separated, migrated incrementally, and old paths removed. Surface contracts change only at real observable boundaries.
- Claude Code receives skills through its plugin package. The Codex installer safely installs, updates, and uninstalls package-owned skills at the native skills location; a custom agents target maps skills to its corresponding sibling skills directory when provided.
- Role prompts contain only compact routing triggers and role-local rules. Native host skill discovery/loading, not a custom runtime, activates conditional guidance.

## Non-goals

No new roles, runtime, router, schemas, state, Recorder, Researcher, or standalone Security role; no requirement for tests, abstraction, or contract splitting without evidence.

## Affected surfaces

- [Native Claude Code and Codex](../surfaces/native-claude-codex.md)
- [Scope](../scope.md)
- [Code](../code.md)

## Interfaces and constraints

Preserve three native roles and installer ownership/preflight guarantees: complete preflight before mutation, preserving unowned files/directories and live/dangling symlinks. Source each cross-role rule once; host copies are delivery formats, not independent policies. Keep every guidance and role file focused and at most 100 lines. Checks use resilient skill/reference, package completeness, role, legacy-path, and size ceilings, not exact prose or hashes.

## Acceptance criteria

- Claude and Codex receive compact lifecycle and role-local instructions plus reachable native conditional skills, with no custom orchestration.
- Tests cover skill references and delivery, role set, size ceilings, and temporary-directory Codex skill install/update/uninstall safety including preflight preservation.
- Measure before/after always-loaded and role prompt lines and bytes; run required checks and preserve unowned filesystem entries.

## Validation

Run `npm test`, `npm run check`, `sh -n scripts/install-codex.sh`, and `git diff --check`; inspect package install/update/uninstall in temporary directories. Native CLI smoke tests may be unavailable.
