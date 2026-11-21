# Meta-contract: creating and maintaining contracts

This document governs project contracts. It is a process rulebook, not a description of any one product surface. Projects should copy it to `docs/contracts/meta-contract.md` and follow it from their `AGENTS.md` instructions.

## What a contract describes

A contract describes a **surface**: a coherent boundary where behavior or an interface is observable by a user, another system, or a maintainer. It records promises and constraints, not arbitrary implementation detail or a file-by-file plan.

Prefer two linked kinds of contract:

- **Surface contracts** in `docs/contracts/surfaces/<meaningful-name>.md` describe the current, durable behavior of one coherent surface: users/consumers, inputs and outputs, scenarios, interfaces, guarantees, errors, security/privacy constraints, and intentional non-goals.
- **Feature contracts** in `docs/contracts/features/<meaningful-name>.md` capture one approved change: goal, scenarios, non-goals, affected surfaces (links), constraints/interfaces, acceptance criteria, and validation. They exist to align implementation and review; they are not a second permanent specification of the same behavior. Delete them after verified completion and durable surface-contract updates; version control preserves their history.

Use semantic filenames, lowercase kebab-case, without dates. A date may appear in the document's metadata when useful. Link related contracts rather than duplicating their requirements. Create a separate surface document only where it has a coherent boundary, independent consumers or guarantees, and can be understood without repeating another contract.

## Size and shape

Agents read the affected contracts on every task, so their size is a cost paid again and again, and a long contract buries the rules that matter.

- Aim for about 150 lines (10 KB, whichever comes first) per surface contract and about 80 lines per feature contract. This is a guideline, not a limit: never drop a promise, boundary, error case or security limit to fit. When a surface contract grows well past it, first remove history, rationale and implementation detail; if it is still long, split it along a real boundary.
- Write promises, boundaries, errors, security limits and non-goals. Leave out history and changelogs (git keeps them), rationale essays, implementation detail and test lists (the code and tests hold them), and copies of other contracts (link them).
- Give each section a clear heading and make it readable on its own. Agents read each affected contract's headings, then in full every section touching the changed behavior plus any boundary, security or non-goal section; when unsure, they read it. The reviewer checks the diff against the whole affected contract.

## Lifecycle

1. **Reconnaissance:** Before approval, investigate read-only as needed to identify affected surfaces and explain the proposed scope. Do not create or edit a contract, plan implementation, or delegate implementation before the user approves the contract.
2. **Approval and recording:** After explicit approval, write the feature contract before planning or implementation. Include its status and optional date inside the file. Record the repository-relative path in the orchestration notes and every delegated task.
3. **Planning and implementation:** The planner, coder/worker, and reviewer must read the approved feature contract and the relevant sections of each affected surface contract. The orchestrator must provide the exact paths and carry their constraints into each bounded task. A manual implementation follows the same source documents.
4. **Impact discovery:** At each stage, compare new findings and the proposed diff with all affected surface contracts. If a different surface, guarantee, interface, or acceptance scope is affected, stop at the boundary and ask the user to approve the revised contract before proceeding with that scope.
5. **Completion:** Review the actual diff against the feature contract and affected surface contracts. After the behavior is verified, update affected surface contracts to describe the new current behavior, mark the feature contract complete for final verification, then delete the temporary feature-contract file. Keep durable references in the surface contracts; version control preserves history. Do not claim an update is verified until its checks ran.
6. **Future changes:** Treat completed surface contracts as current normative documentation. A later approved feature can supersede them; retain useful history in version control rather than copying old requirements into new contracts.

## Required feature-contract sections

Keep contracts concise and specific. Include:

- Goal and user-visible behavior
- Expected scenarios, including error/edge cases that affect scope
- Non-goals
- Affected surface-contract links (or note that none exist yet)
- Interfaces and constraints
- Acceptance criteria that can be checked
- Validation to run
- Prior art, when the user asked for a prior-art study: references, findings, and the decisions taken
- Status/date inside the document when useful

## Required surface-contract sections

Include only applicable sections:

- Boundary, consumers, and ownership
- Observable inputs, outputs, and flows
- Interfaces/protocols and compatibility guarantees
- Failure behavior and recovery
- Security, privacy, and data-retention limits
- Non-goals / behavior intentionally not guaranteed
- Related feature and surface contracts

Do not invent contracts for imagined future behavior. Use `TBD` only for a real unresolved boundary and keep it out of implementation work until resolved.

## Preparation workflow

For a new or existing repository, the project-preparation workflow should:

- Inspect existing documentation and `AGENTS.md` before editing.
- Create `docs/contracts/features/` and `docs/contracts/surfaces/` without destroying existing files.
- Copy this meta-contract only when absent. If an existing copy differs, report the difference and ask before replacing or merging it.
- Add compact references to the contract process in `AGENTS.md`; preserve unrelated project instructions and merge rather than overwrite.
- Never silently rewrite, delete, or relocate existing contracts.
