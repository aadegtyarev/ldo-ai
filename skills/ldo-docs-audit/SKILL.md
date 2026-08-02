---
name: ldo-docs-audit
description: Read the project's documentation cold, as a newcomer would, and find what has drifted — contradictions, stale claims, undefined jargon, wrong ordering
---

Documentation rots by accretion. Every edit is locally correct; the whole comes apart anyway. A section describes a phase that was removed two changes ago. A claim about how something works was true when written. A term gets used in one place and defined in another that was later cut.

None of this shows up in a diff, because no single change introduced it. It only appears when someone reads the whole thing at once — which nobody does, least of all the people who wrote it.

That's this skill. Read the docs as someone seeing them for the first time, and report what doesn't hold together.

## Run it fresh

**Read the documentation before the source.** Your job is to find where the docs and reality disagree, and you can't do that if you learned the reality first — you'll fill gaps from memory without noticing they were gaps.

So: read every doc first, cold, forming your understanding *only* from what they say. Write down what you now believe is true. Then read the code and compare. Every place they diverge is a finding.

If you already have context on this project from earlier in the conversation, say so and delegate this to a subagent that doesn't. Fresh eyes are the entire mechanism; without them this is theatre.

## What to look for

**Contradictions** — two places disagreeing. A command in one section absent from the reference table. Different default values quoted. A capability described as automatic here and manual there.

**Stale claims** — text that was true once. A phase that no longer exists, a file that no longer does anything, a flag that was renamed, a limit that changed. These are the most common and the most damaging, because they read as authoritative.

**Silent-failure traps** — the worst category. Documentation that tells the reader to do something that quietly does nothing. A config file nothing reads. A setting with no effect. The reader believes they configured it; nothing errors; the default silently stands. Rank these highest.

**Undefined jargon** — a term used before it's defined, or never. Project-specific vocabulary that made sense to whoever added it. Check each one: is it introduced before first use?

**Unanswerable questions** — what a newcomer needs before real use and can't find. Does it modify my files? What does it cost? What happens when it fails? How do I undo it? Absence is a finding.

**Broken ordering** — information arriving out of sequence. Design rationale before the mechanism it justifies. The reference table buried below the essays. Setup instructions for teams before the reader has run it once.

**Over-explanation** — sections aimed at a contributor or a skeptic sitting between "how do I run it" and "what are the commands". Usually a sign the doc grew by addition and nothing was ever removed.

**Contracts worth reconsidering** — if `docs/contracts/` exists, read it too. Two things to look for: a contract whose "Accepted risk" reasoning no longer matches the codebase (the accepted CSRF risk assumed VPN-only access — does the code still enforce that?), and a pattern repeated consistently across the codebase that isn't written down anywhere as a contract. The second isn't a finding to fix — it's a suggestion: "this looks like an unwritten rule; consider `/ldo-contract` for it." Don't propose writing one yourself; that's the operator's call.

**Notes and decisions worth reconsidering** — if `docs/NOTES.md` or `docs/DECISIONS.md` exist, check both. `NOTES.md` has a deliberate size ceiling (~15-20 entries, see `/ldo-note`) — if it's past that, or has entries that read as stale against current code (a workaround for a bug that's since been fixed, a tool version constraint no longer true), that's a finding: flag which entries look prunable and why. Separately, look at `DECISIONS.md` for the same pattern `/ldo-note` itself warns about: the same override made more than once — that's not trivia anymore, it's an unwritten rule. Suggest `/ldo-contract`, same as the code-pattern case above; don't write one yourself.

**Duplicated sources of truth** — the same fact stated in two places that can drift independently: a rule in `docs/contracts/` *and* the full prose still sitting in README or `SECURITY.md` (rather than a pointer to the contract), or two architecture docs (`docs/ARCHITECTURE.md` alongside a root-level `ARCHITECTURE.md` or `docs/DESIGN.md`) each partially describing the system. Rank this as a stale-claim risk even before the two disagree — the failure mode is that one gets updated and the other quietly doesn't, and nobody notices until they contradict each other. The fix is a pointer from the duplicate to the canonical copy, not a merge you write unasked.

For the one case this project has actually hit repeatedly — the model-routing table duplicated across `workflows/ldo.js`, `ldo-config.example.json`, `README.md`, and `skills/ldo-config/SKILL.md` — don't diff it by eye. Run `scripts/check-model-table.sh` and report whatever it finds; it exists specifically because eyeballing four copies missed the same regression three times before this script did.

## How to verify

Don't report from reading alone. For every claim that can be checked, check it:

- A documented command — does it exist, spelled that way?
- A stated default — does it match the code?
- A file path — does it exist and do what's claimed?
- An anchor link — does the heading exist?
- A described behaviour — does the code do that?

A finding backed by "README says X, the code does Y at file:line" is actionable. "This section feels outdated" is not.

## Output

Order by what would hurt a reader most:

1. **Silent-failure traps** — following the docs produces no error and no effect
2. **Contradictions and stale claims** — the docs are wrong about the code
3. **Unanswerable questions** — what a newcomer needs and can't find
4. **Structure and clarity** — ordering, jargon, over-explanation

For each: quote the exact line, say what's wrong, and give the correction. Where a fix is a rewrite, write the replacement text.

End with the three edits you'd make first, in order. A list of forty findings gets ignored; three ranked ones get done.

## When to run it

- Before a release, or before showing the project to anyone new
- After a run of changes that each touched the docs a little
- When you suspect something has drifted but can't point at it
- When the ambient counter in `CLAUDE.md` suggests it (see `/ldo-init`)

Not on every change — the Reviewer already checks that a change's own docs kept up. This is the periodic full read that catches what per-change review structurally cannot.
