# Code — structural rules the Reviewer blocks on

- [2026-08-01] Never swallow an error silently — see agents/coder.md, "Never swallow an error silently", for what counts as handled. A violation is blocking `critical`, not a nit.
- [2026-08-01] A comment must state something the code can't show itself — see agents/coder.md, "A comment earns its place", for the standard. Violations block as `critical`.

## Sources

**Never swallow an error silently** (2026-08-01) — `agents/coder.md`; the two `catch` blocks in `workflows/ldo.js` already followed this at the time this contract was written — both log and return an explicit error object.

**A comment earns its place** (2026-08-01) — `agents/coder.md`.
