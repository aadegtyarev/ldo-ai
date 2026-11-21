# Changelog

## [3.7.0] — 2026-11-21

### Changed

- Reviewer reports only issues the diff introduces or makes reachable, with evidence, says "No issues found." when clean, and ends with one verdict line (BLOCK, OK, OK with notes); needless complexity gets concrete examples; re-review checks only whether findings are closed, whether the fix broke what it touched, and whether earlier findings stand.
- Workflow: sort review findings into fix now, optional, and defer or reject with a reason before sending fixes; re-review only after a material change.
- Worker says so when a task that needed edits ended with none, instead of reporting success.
- Planner lists the approved decisions the plan relies on and flags any it would change.
- Prior art: a link is not evidence; verify sources only for claims that would change the decision and mark what is inferred.

## [3.6.3] — 2026-11-21

### Changed

- When project guidance does not name the allowed models, the agent asks the user once which models are available, for what and which are expensive, proposes a choice per role with a reason, and records the answer in the project's agent guidance.

## [3.6.2] — 2026-11-21

### Changed

- No archaeology: code, comments and contracts describe only the current state, without history notes or kept-for-reference code; comments are a short why the code cannot say. The reviewer reports added history notes, dead code and essay comments.

## [3.6.1] — 2026-11-21

### Changed

- Model roles when delegating: plan on the strongest model, implement on a cheaper capable one, review on a different model from the implementer, with review effort scaled to risk; with one model, plan at high effort and review in a fresh context.

## [3.6.0] — 2026-11-21

### Changed

- The workflow aims for the most result for the least effort: first the 20% of the work that delivers 80% of the result.
- Large requests are sliced before contracts: each slice touches the fewest surfaces and the least code, gives a result the user can check, and ships on its own; the next slice starts after the previous one is verified. The planner proposes slices for large requests.
- Contracts stay compact: about 150 lines for a surface contract and 80 for a feature contract; promises, boundaries, errors and non-goals only, no history, rationale essays, implementation detail or copies; sections readable on their own, and agents read the relevant sections.
- Validation runs only the checks a change can affect; the full suite only for shared parts or before a release.
- Delegation asks for at least medium reasoning effort, high for complex planning, review or architecture, never low for implementation or review.

## [3.5.0] — 2026-11-21

### Changed

- Proportionality across roles and skills, to stop simple code growing abstractions in the name of safety: the planner plans and the worker writes the simplest change, adding a layer, option or abstraction only for real duplication now, a seam the task needs, or the contract; input from outside the program is always handled; cases that cannot happen are not handled; class fixes cover the reachable cases.
- The reviewer blocks only on reachable defects with real harm, unapproved scope, or unjustified complexity (naming the simpler shape), always on a weakened protection, and checks each reachable case is tested on re-review; speculative risks and style are suggestions.
- Security scales to the real exposure: never weaken an existing protection, and do not add layers against threats the deployment does not face.
- Validation trusts exit codes, looks at rendered UI at phone and desktop sizes, and checks live results after deploys. The workflow keeps one concern per change, gives the user options with a recommendation and does not reopen their decisions, and asks before outward or irreversible actions.

## [3.4.0] — 2026-11-21

### Added

- `ldo-ai-prior-art` skill: before designing a user-facing surface (API, CLI, config, UI, UX, user journey), agents offer to study best-in-class products and their users' pain points, and for UI or flows a clickable prototype; done only when the user agrees, with findings recorded in the feature contract's Prior art section. Workflow, planner, worker and reviewer reference it.

## [3.3.1] — 2026-10-11

### Changed

- Reviewer does one exhaustive pass per review, reporting every independent finding across all defect classes, grouped and ranked, instead of stopping at the first blocker.

## [3.3.0] — 2026-10-11

### Changed

- Reviewer names each blocking defect class and enumerates its affected cases (verifying class closure on re-review); worker fixes the whole class with a regression test per case; the workflow skill stops and reports to the user after two rejecting reviews of the same change.

## [3.2.0] — 2026-10-09

### Added

- Added a native Codex marketplace/plugin bundle and isolated marketplace lifecycle coverage in CI; retained the shell installer for older Codex CLI versions.

## [3.1.0] — 2026-10-08

### Changed

- Added native conditional skills for contract-first development, evidence-driven decomposition, security, validation, and Git delivery; reduced always-loaded role prompt content while keeping host-controlled workflows.
- Hardened the Codex installer to preflight owned destinations and preserve unrelated files, directories, and symlinks.

## [3.0.0] — 2026-10-08

### Breaking

- Replaced the LDO workflow/orchestration runtime with native Claude Code and Codex agent definitions: planner, worker, and reviewer only. Legacy workflows, schemas, routing, resume/config compatibility, Recorder/Researcher roles, and Pi support are removed. There is no custom runtime or automatic pipeline.
- Claude Code installs through `/plugin marketplace add aadegtyarev/ldo-ai` and `/plugin install ldo@ldo-ai`; Codex installs or updates the marked `ldo-ai-*` native agents with `./scripts/install-codex.sh` and removes them with `--uninstall`. It refuses to overwrite unowned collisions and does not change unrelated instructions/settings/files.
- Example native workflow: ask the planner for an evidence-based plan, approve it, delegate implementation to the worker, then ask the reviewer to inspect the diff and checks. Host-native delegation controls execution; see README for constraints and full setup.

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Legacy history

The complete pre-3.0 changelog is preserved at this [immutable commit](https://github.com/aadegtyarev/ldo-ai/blob/34dbb7ec5db08e4bdf69ed35f5f67cf804db5632/CHANGELOG.md).
