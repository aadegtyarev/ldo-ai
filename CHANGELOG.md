# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
