---
name: ldo-contract
description: Record a project contract — a rule that must hold regardless of task size, read only when a change touches the area it governs
---

Some rules aren't conventions the Coder should *match* — they're constraints that must hold no matter what. "Every user action emits an audit event." "No raw SQL string concatenation, ever." "This is a single-user tool — never add authentication." These don't come from reading the code; they come from the operator, because they're decisions, not observations.

This skill records one. It's interactive — you elicit the contract, classify it, and write it to the right file.

For a project that already has these decisions made — just not written down anywhere LDO can read — see **Discovering contracts in an existing project**, below, instead of eliciting from scratch.

## Why not `CLAUDE.md`

`CLAUDE.md` loads every session, for every kind of work. A security floor has no business loading when the task is renaming a variable — it costs tokens for nothing, and stuffing every contract into one file over time turns it into an unmaintainable pile nobody rereads. Contracts live in `docs/contracts/`, one file per area, and the Planner reads only the file whose area the task actually touches. `CLAUDE.md` carries a single pointer line, not the contracts themselves.

## Process

### 1. Elicit

If invoked with a description ("add a contract: every user action must emit an audit event"), start from that. If invoked bare, ask: what's the rule, and what happens if it's violated — does the task get refused, does it need a security review, does the diff get blocked?

### 2. Classify

Every contract is one of four kinds. Ask which, if it isn't obvious from the description:

| Kind | File | Meaning | Checked by |
|---|---|---|---|
| **Scope boundary** | `docs/contracts/scope.md` | What this application does and deliberately does not do | Planner, before writing the plan |
| **Accepted risk** | `docs/contracts/security.md` (Accepted section) | A risk the operator has knowingly chosen not to mitigate | Security, so it doesn't re-raise a closed question |
| **Security floor** | `docs/contracts/security.md` (Required section) | A security property that must hold regardless of what the task looks like | Security + Reviewer, always |
| **Code contract** | `docs/contracts/code.md` | A structural rule about how code must be written — observability, error handling, data flow | Reviewer, as a blocking check |

A rule can be both a scope boundary and a security floor ("never add a network listener" reads both ways) — ask which enforcement path matters, or write it to both files if it genuinely does double duty.

### 3. Write it precisely

A contract is a rule an agent can check against a diff or a plan, not a wish. Write it so violation is checkable:

- Bad: "handle errors well"
- Good: "every function that can fail returns a typed error, never throws across a module boundary"

Bad: "be secure"
Good: "no raw SQL string concatenation — only parameterized queries or the query builder"

Keep each entry to one or two lines. If it needs a paragraph to state, it's probably two contracts.

### 4. Append

Each contract file is a flat list, newest at the bottom, each entry dated:

```markdown
# Security — Required

- [2026-07-28] Every request handler validates and sanitizes input before it reaches business logic.
- [2026-07-28] Secrets are read from environment or a secrets manager — never hardcoded, never logged.
```

```markdown
# Security — Accepted risks

- [2026-07-28] CSRF protection is intentionally skipped — internal tool, VPN-only access, no browser session exposure.
```

Create the file (with the two-section header for `security.md`) if it doesn't exist. Append; don't rewrite existing entries — if a contract needs to change, that's a separate action (see Revising, below).

### 5. Wire up `CLAUDE.md`

If this is the first contract in the project, add one line to the `<!-- BEGIN ldo -->` block (run `/ldo-init` first if the block doesn't exist yet):

```
Project contracts live in `docs/contracts/`. When a task touches scope, security,
or structural rules, read the relevant file before planning.
```

Don't duplicate the contracts themselves into `CLAUDE.md` — the pointer is enough; the Planner reads selectively per task.

## Discovering contracts in an existing project

A project being migrated onto LDO usually already *has* these decisions — "single-user, no auth", "we accepted the CSRF risk because it's VPN-only", "handlers always validate input first" — they're just sitting in a README paragraph, a code comment, a security doc, or nowhere but the maintainer's head. `/ldo-init` triggers this automatically the first time it runs on a non-empty existing project (see its "Discover contract candidates" step); you can also run it standalone here if the operator asks to (re-)scan later.

The rule is the same either way: **read and propose, never write silently.** A contract is a decision the operator makes, not one an agent infers — get that wrong and every future task gets checked against a rule nobody actually agreed to.

1. **Read for evidence, not vibes.** Sources worth checking: README (especially "out of scope" / "won't do" / "why we don't" language), `SECURITY.md` or similar, code comments that read as a declared rule rather than an implementation note ("// intentionally no rate limiting — internal only"), CONTRIBUTING/architecture docs, and a code-level pass for a pattern that's *consistent everywhere* (every handler validates input the same way, every DB call goes through one query builder with zero exceptions). A pattern followed inconsistently isn't a contract candidate — it's just current practice; don't propose it.

2. **Every candidate carries its evidence.** Quote the source line or describe the pattern with file references — "`README.md:42`: 'this is a single-user CLI; we will not add network auth'" or "12/12 handlers in `src/routes/` validate via the same `assertValid()` call, no exceptions found." A candidate with no quotable evidence is a guess; drop it rather than propose it.

3. **Classify each candidate** using the table above, same as any contract.

4. **Present the full list to the operator before writing anything.** Group by kind, show the evidence, and ask which to accept, adjust, or skip — one pass, not one confirmation per line. Something that looks like a scope boundary to you might be an incidental fact of the current implementation, not a decision — the operator knows which.

5. **Write only what's confirmed**, exactly as in the normal Append step (dated entry, source file). Nothing gets written on inference alone, no matter how consistent the pattern looked.

6. **Offer to point the source at the contract, don't leave two copies to drift.** When a confirmed candidate's evidence was a documentation section — a README paragraph, a `SECURITY.md` entry — that prose still fully states the rule after `docs/contracts/` now also states it. Two independently-editable copies of the same decision is exactly the duplication this whole mechanism exists to avoid: the contract is now what's actually checked, so a copy left behind in README can drift from it silently and nobody would notice until the disagreement matters. Ask, per candidate, whether to trim that section down to a pointer ("see `docs/contracts/security.md` for the current policy") — never do this without asking, and never touch it at all for a candidate sourced from a code comment or an implicit pattern (there's nothing to trim there, the code itself is the evidence, not a doc). Default to asking once for the whole batch ("trim the source sections these came from to pointers?") rather than per line, unless the operator wants finer control.

If nothing turns up real evidence, say so plainly rather than manufacturing a thin candidate to have something to show — "no explicit contracts found; the project doesn't state any of these decisions anywhere I can read" is a legitimate, useful result.

## Revising or retiring a contract

A contract that gets overridden mid-run (an operator tells the Coder "you can break this one here") is a signal, not a one-off. Don't silently edit history — append a note under the existing entry:

```
- [2026-07-28] No raw SQL string concatenation — only parameterized queries.
  - [2026-08-03] Overridden for the migration script (one-off, not user-facing) — consider whether the contract needs a documented exception class.
```

If a contract is retired outright, mark it rather than deleting it — `~~struck through~~` with the date and reason. History matters here; a contract that was true and stopped being true is worth knowing.

## Rules

- Every contract is checkable against a diff or a plan — no aspirational language.
- One contract per line. Don't bundle three rules into one bullet.
- Classify honestly. A scope boundary checked only by Security won't catch a Planner writing a plan that violates it before Security ever sees it.
- Don't write contracts for things `conventions` already covers (naming, formatting, general style) — this is for rules with teeth, not preferences.
