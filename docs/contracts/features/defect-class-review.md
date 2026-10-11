# Feature: defect-class review and bounded review rounds

Status: ready-for-verification (approved by the operator 2026-10-11).

Goal: stop review/fix rounds that surface a new P1 of the same class each time.

- Reviewer (Claude and Codex): for each blocking finding, name the broken invariant and enumerate every affected case; on re-review verify the whole class is closed, each case is tested, and no regression was introduced.
- Worker (both hosts): fix the defect class, not only the reported instance, with a regression test per case; ask when that exceeds approved scope.
- Workflow skill (both bundles): after two rejecting independent reviews of the same change since the user's last decision, stop delegating and report findings, per-round fixes, state, and options to the user.

Non-goals: runtime enforcement or counters (no orchestration runtime). Acceptance: both hosts carry the same guidance; `npm test`, `npm run check`, `sh -n scripts/install-codex.sh`, `git diff --check` pass.
