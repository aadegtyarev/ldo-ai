---
name: ldo-contract
description: Record a project contract — a rule that must hold regardless of task size, read only when a change touches the area it governs
---

Some rules aren't conventions the Coder should *match* — they're constraints that must hold no matter what. "Every user action emits an audit event." "No raw SQL string concatenation, ever." "This is a single-user tool — never add authentication." These don't come from reading the code; they come from the operator, because they're decisions, not observations.

This skill records one. It's interactive — you elicit the contract, classify it, and write it to the right file.

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
