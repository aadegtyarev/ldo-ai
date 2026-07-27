# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.5.2] — 2026-07-28

### Fixed

- **Workflow agents referenced by bare name, which may not resolve in a plugin.**
  Plugin agents register under their scoped identifier (`ldo:planner`, not
  `planner`) — that scoped name is the documented form used in @-mention,
  `--agent`, and hook matchers. The workflow's `agentType` calls now use the
  scoped form. The bare form was the one unverified risk most likely to break the
  entire pipeline at the first agent call; this makes the references match how
  plugin agents are actually identified.

## [2.5.1] — 2026-07-28

### Added

- **`/ldo-tui` gained the keyboard-encoding traps section** it was missing.
  Terminals encode keys as bytes and several collide: `Ctrl`+letter is `key &
  0x1F` (so Ctrl-M/I/H/[ collide with Enter/Tab/Backspace/Esc), `Ctrl-S`/`Ctrl-Q`
  are XON/XOFF and freeze the TTY by default, `Ctrl+Shift+letter` is indistinguishable
  from `Ctrl+letter`, macOS has no Meta key by default, and modifier+arrow is
  unreliable across terminals. The Kitty keyboard protocol fixes this but tmux
  doesn't pass it through — so design for the legacy encoding and treat Kitty as
  enhancement. Also softened "q or Esc quits" — Esc is better as cancel/go-back,
  and a tool that loses work on quit should confirm an accidental one.

## [2.5.0] — 2026-07-28

### Added

- **`/ldo-tui` — terminal interface design for Textual (Python) and Ink (TypeScript).**
  The strongest move is usually to not take over the screen at all: a full-screen
  TUI redraws a cell grid, which breaks the linear stream a screen reader consumes.
  The skill opens with that decision, then covers keyboard-first conventions,
  tiered colour degradation with NO_COLOR and TTY detection, density over chrome,
  honest progress, and surviving resize, tmux, ssh, and Windows. Named anti-patterns
  — the terminal web-app, colour vomit, the lying progress bar, gradient slop — are
  the catalog the skill exists to deliver. Framework primitives confirmed against
  current docs; design principles sourced from clig.dev, Seirdy, and CMU's
  progress-bar perception research.

## [2.4.0] — 2026-07-27

### Added

- **`/ldo-docs-audit` — a cold read of the whole documentation set.** Per-change
  review structurally cannot catch cumulative drift: every edit is locally correct
  and the whole comes apart across many of them. This reads everything *before*
  looking at the source, so gaps aren't filled from memory, then reports
  contradictions, stale claims, undefined jargon, and instructions that quietly do
  nothing — the category where the reader believes they configured something and
  no error ever appears.
- **The Reviewer now checks that a change's own docs kept up.** If the plan marks a
  step `user_facing` and no documentation moved, that's a finding — as is
  documentation describing what the plan intended rather than what was built.
- **A drift log in `CLAUDE.md`.** The Coder appends a line per user-facing change;
  around eight entries Claude offers the audit. It offers rather than runs, because
  a full read costs real tokens and the timing belongs to the operator.

## [2.3.0] — 2026-07-27

### Added

- **The Reviewer now attacks the change, not just checks it.** After proving the
  acceptance criteria, it switches posture and looks for the input that breaks
  things: boundaries, absent values, wrong shapes, an order-of-magnitude more load,
  concurrent calls, a failed dependency. Where the Planner flagged a threat model,
  it runs each named exploit — a mitigation counts as proven only when the attack
  is attempted and fails, with the output to show it.

  Breaks must be reproducible: command and captured output, or it's a guess and
  doesn't reach the verdict. A clean result is reported too, so "nothing broke" is
  distinguishable from "nobody tried". The new `attacks` field records what was
  tried and what held.

  Only the first review pass attacks; fix rounds re-run what previously broke.
  Re-attacking the whole surface each iteration would triple the cost of a loop
  that exists to close specific issues.

## [2.2.0] — 2026-07-27

### Changed

- **Tiers now actually differ.** `trivial` and `medium` shipped byte-identical, so
  the complexity rating changed one field in one tier — the routing was barely
  routing. Trivial work now runs Haiku end to end with Sonnet reviewing; medium is
  Sonnet writing and Opus reviewing; complex adds a stronger Planner. Security stays
  Opus everywhere: once the Planner says a change can be attacked, that isn't where
  to save money.
- **README reordered for a first-time reader.** A transcript of a real run now sits
  second, before install. The command table moved up out of the design essays, and
  the rationale sections moved below the mechanics they justify.

## [2.1.0] — 2026-07-27

### Fixed — documentation

Reviewed by someone reading the docs cold. Three factual errors, all stale text
left behind by earlier refactors:

- **The README described Setup and Docs as pipeline phases.** They were folded into
  the Coder in 1.x, and a whole section elsewhere argues they shouldn't be separate.
- **It claimed "every command is namespaced."** Skills aren't — that's why 2.0.0
  renamed them by hand. Now explains why `/ldo:ldo` has a colon and `/ldo-*` a hyphen.
- **Nothing warned that `ldo-config.json` is never read.** The Files section listed
  a `.example.json` "template," so the obvious move was to copy it — and get silently
  ignored routing. Now a bordered warning at the top of Configuration.

### Added — documentation

- **A transcript of a real run**, showing the security surface caught pre-code and
  the Reviewer finding an unbounded map that 47 passing tests missed.
- **A plain answer to "does it edit my files?"** — yes, unattended after approval;
  nothing committed, no branch created.
- **A Troubleshooting section** covering empty installs, greyed-out updates, ignored
  config, undrivable projects, and clean removal.
- Version check (`claude --version`), scope guidance on install, a link to the repo,
  and clarification that `/code-review` and friends ship with Claude Code.

### Changed

- `securityByDefault` documented in the config example — it was read by the workflow
  but absent from the reference.
- Pre-2.0 changelog entries collapsed into one `1.x` summary. Nine same-day releases,
  several undoing each other, presented as semver history was noise.

## [2.0.0] — 2026-07-27

### Changed — BREAKING

- **Every skill is now prefixed `ldo-`.** Skills are *not* namespaced by plugin the
  way agents are: the docs say a plugin skill creates a bare `/name` shortcut. So
  `/init` and `/config` were shadowing Claude Code's own built-in commands of the
  same name, and nothing clustered under a searchable prefix.

  | Was | Now |
  |---|---|
  | `/init` ⚠ clashed with built-in | `/ldo-init` |
  | `/config` ⚠ clashed with built-in | `/ldo-config` |
  | `/planner`, `/coder`, `/reviewer` | `/ldo-planner`, `/ldo-coder`, `/ldo-reviewer` |
  | `/security`, `/researcher` | `/ldo-security`, `/ldo-researcher` |
  | `/bootstrapper` | `/ldo-bootstrap` |
  | `/agent-ux` | `/ldo-agent-ux` |

  The workflow is unaffected — workflows *are* namespaced, so it stays `/ldo:ldo`.

## [1.x] — 2026-07-27

Same-day iterations before the first usable release. Kept brief on purpose: several
of these fixed each other, and the detail is only useful as archaeology.

- **Design converged from eleven agents to three.** Separate roles for codebase
  scanning, environment setup, verification, and documentation were folded into
  Planner, Coder, and Reviewer after applying one test to each: *would this warrant
  a different model than the Coder?* Environment setup and docs belong to whoever
  writes the code; verification belongs to whoever reviews it.
- **Bootstrapping moved out of the pipeline** into `/ldo-bootstrap`. It produces
  decisions, not code, and decisions need a conversation.
- **Security became surface-gated, not size-gated.** The Planner rates a change's
  attack surface independently of its complexity, because risk doesn't scale with
  diff size.
- **Distribution moved from an npx installer to a plugin marketplace**, then through
  three packaging fixes: a local source that couldn't auto-update, a manifest that
  pointed at a directory where a file list was required, and a component layout
  Claude Code couldn't discover.
- **`ldo-config.json` was found to be dead.** A workflow has no filesystem access;
  config only ever arrived through invocation arguments. The file existed and was
  documented while nothing read it — routing silently stayed on defaults. It's now
  `ldo-config.example.json`, clearly a reference, with the real mechanism documented.
