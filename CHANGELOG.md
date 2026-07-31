# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.9.0] — 2026-07-28

### Added

- **Project contracts — rules the operator decided, not conventions inferred from
  code.** Four kinds, each checked at a different stage: **scope boundaries**
  ("single-user by design, never add auth") the Planner checks before writing a
  plan; **accepted risks** ("CSRF skipped — VPN-only access") Security won't
  re-raise as findings; **security floors** ("every handler validates input")
  Security and the Reviewer enforce regardless of the task's own `security_surface`
  rating; **code contracts** ("no raw SQL concatenation") the Reviewer blocks on —
  always `critical`, independent of how minor the instance looks.

  Contracts live in `docs/contracts/` — `scope.md`, `security.md` (Required +
  Accepted sections), `code.md` — not in `CLAUDE.md`. `CLAUDE.md` carries one
  pointer line; the Planner reads a contract file only when the task plausibly
  touches what it governs, so a variable rename never pays for the security floor.

  Record one with the new `/ldo-contract` skill — interactive, elicits the rule,
  classifies it, writes it precisely enough to check against a diff. An override
  mid-run gets appended as a note, not silently edited away, since a contract
  someone overrode once is a signal the contract itself may need revisiting.
  `/ldo-docs-audit` also checks contracts now: an accepted risk whose reasoning no
  longer matches the code, and patterns repeated everywhere that aren't written
  down yet — a suggestion, never an auto-write.

## [2.8.0] — 2026-07-28

### Added

- **Parallel multi-feature mode.** `args.tasks: [...]` instead of `args.task` runs
  N independent features at once, each isolated in its own git worktree —
  comparable to several developers on separate branches, conflicts resolved as
  routine at merge time rather than solved architecturally. The workflow script
  has no filesystem access, so each feature's Planner creates its own worktree via
  Bash before reading the codebase; every later agent in that feature's chain
  gets a workflow-composed block telling it to `cd` there first. Each approved
  feature ships independently via `/ldo-ship`, run from its own worktree.

  The entire existing pipeline body became `runOneFeature(task, ctx)`, called once
  for single mode (unchanged behavior) or N times through `parallel()` for multi
  mode — this is what makes per-feature state safe under concurrency instead of
  racing on shared module-level variables. A thrown error inside one feature
  returns a failure shape rather than aborting its siblings. Planned by a real
  `/ldo:planner` run on this repo.

## [2.7.3] — 2026-07-28

### Fixed

- **`ReferenceError` on every approved medium/complex run.** The Record-phase gate
  read `approved`, but the declaration had been dropped in an earlier refactor —
  found by the `/ldo:planner` run above while investigating an unrelated feature,
  not by review. One line, restored.
- **Six skills' Usage examples used pre-rename command names** (`/coder`,
  `/planner`, `/researcher`, `/reviewer`, `/security`, `/ldo`) — left behind by the
  2.0.0 `ldo-` prefix rename. Now `/ldo-coder`, `/ldo-planner`, `/ldo-researcher`,
  `/ldo-reviewer`, `/ldo-security`, `/ldo:ldo`.

## [2.7.2] — 2026-07-28

### Fixed

- **Coder's "don't re-scan the whole repo" rule was ambiguous.** It meant "don't
  redo Scout's full-repo pass" but could be read as "never look beyond the plan's
  file list" — which blocks the normal work of checking whether a helper already
  exists or following an unfamiliar import while implementing. Clarified: no
  upfront re-scan, but grep/read freely once inside a file that raises a question.

## [2.7.1] — 2026-07-28

### Added

- **`/ldo-ship` auto and auto-merge modes.** Alongside the default confirm-each-
  step flow: `auto` runs branch → commit → push → PR in one pass with no
  confirmations, stopping only on errors. `auto-merge` adds a squash-merge at the
  end, gated on **local tests first** (free, seconds — no CI minutes spent on what
  the dev machine can verify) and then CI if configured, merging on green and
  stopping on red. Mode is picked from natural language: "ship it" = interactive,
  "no questions" = auto, "ship and merge" = auto-merge.

## [2.7.0] — 2026-07-28

### Added

- **`/ldo-ship` — branch, commit, push, PR, squash-merge.** The pipeline left
  uncommitted changes and stopped; shipping was manual. `/ldo-ship` takes it the
  rest of the way, interactively: proposes a branch name from the task, a commit
  message from the plan and verdict, pushes, and creates a PR whose body is the
  review report — verification evidence, attacks tried, security findings. The
  receipts become the PR description, so a reviewer sees what was proven, not just
  "done." Every step is a separate confirmation; nothing ships without a yes.

## [2.6.1] — 2026-07-28

### Added

- **`ctags` symbol index for fast codebase navigation.** The Coder regenerates
  `tags` via `ctags -R .` on each run, if `ctags` is installed — a symbol → file →
  line index, gitignored as derived data. The Planner greps it first when
  searching for symbol locations: O(1) lookup against the index instead of O(n)
  search across source. Falls back to grepping source directly when `ctags` isn't
  present; no new agent, no new mechanism, just Grep pointed at a generated file.

## [2.6.0] — 2026-07-28

### Added

- **Record phase — the run's results survive past the session.** Until now the
  plan, the verdict, the verification evidence, and the attack log were ephemeral:
  they lived in the run's result object and vanished when the session ended. The
  whole pitch was "shows receipts" — but nothing kept them.

  On approved medium or complex tasks, a Recorder agent (Haiku — it formats, not
  thinks) writes three things: a review report at `docs/reviews/<date>-<slug>.md`
  with the full evidence and attack log; a one-page `docs/ARCHITECTURE.md` kept
  current from the plan's codebase context; and backlog items — GitHub Issues if
  `gh` is connected, otherwise `docs/BACKLOG.md`.

  The review report is the receipt. Every "proven" or "broke" claim carries the
  command output it was made with. A reader six months later can see exactly what
  was checked and how, not just that someone said it works.

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
