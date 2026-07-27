# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-07-27

### Changed

- **Distribution moved to a Claude Code plugin marketplace; npx removed.**
  The previous `npx ldo-ai` installer copied files into `.claude/` with no version
  tracking and no update path. A marketplace (`/plugin marketplace add`, then
  `/plugin install`) is the native mechanism — it carries updates, scope (user /
  project / local), and discovery. Added `.claude-plugin/marketplace.json`, removed
  `bin/ldo-install.js` and `package.json`.

## [1.1.0] — 2026-07-27

### Changed

- **Bootstrapping moved out of the pipeline.** It produced decisions, not code, and
  decisions need a conversation — a subagent hands back JSON and disappears, so you
  couldn't push back on a stack choice. It's now `/bootstrapper`, an interactive
  skill that researches prior art, works the stack out with you, and hands the first
  task to `/ldo`. The workflow lost its greenfield mode and 78 lines with it.
- **Skills follow the documented layout** — `.claude/skills/<name>/SKILL.md` instead
  of flat `.md` files. The flat form is the legacy `commands/` format.
- **Positioning rewritten around model routing.** Claude Code's own `feature-dev`
  and community pipelines like `superpowers` cover similar phases, but run every one
  on a single model. Per-role routing is what LDO actually offers.

### Added

- **`.claude-plugin/plugin.json`** — LDO can now be distributed as a Claude Code
  plugin, which brings `/plugin update` and version tracking. The npx installer
  remains as a fallback.
- **Guidance on the built-ins.** `/code-review`, `/security-review`, `/simplify`,
  and `/deep-research` do things LDO deliberately doesn't rebuild. The Reviewer and
  Researcher skills now say when to reach for them, and the README lists the plugins
  worth installing alongside — `security-guidance`, `frontend-design`,
  `chrome-devtools-mcp`, and the language LSPs.

## [1.0.0] — 2026-07-27

First public release.

### Added

- **Three-agent pipeline** — Planner, Coder, Reviewer. Each runs on its own model,
  so implementation can be cheap while review stays careful.
- **Per-role model routing** (`.claude/ldo-config.json`) with three complexity tiers.
  The Planner rates each task `trivial`, `medium`, or `complex`; that rating picks
  the models. Default puts Opus on Review above Sonnet on Code.
- **Security surface rating** — the Planner rates what a change exposes
  (`none` / `low` / `elevated`) independently of how large it is. A dedicated
  Security agent threat-models the plan only when the surface is `elevated`;
  a `low` surface passes the Planner's own notes to the Coder without an extra call.
- **Conditional specialists** — Bootstrapper for greenfield projects, Researcher
  for tasks needing knowledge from outside the repo. Both off by default.
- **Evidence-backed verification** — the Reviewer drives the running application
  against each acceptance criterion and captures real output. A criterion passes
  only with proof, never on inspection alone.
- **Severity-gated fix loop** — only `critical` and `major` findings buy another
  Code pass; minor findings ride along in the final report. Configurable via
  `blockingSeverities`.
- **Structured hand-offs** — every agent returns schema-validated JSON, rendered
  compactly for the next stage. No raw text dumps, no truncation.
- **Shared context prefix** — the Planner reads the codebase once; its
  `codebase_context` is reused by Coder and Reviewer, who never re-scan.
- **npx installer** — `npx ldo-ai` for the current project, `--global` for
  `~/.claude/`, `--target <path>` for non-standard locations. Installs from an
  explicit manifest, so nothing else in your `.claude/` is touched.
- **Slash commands** — one per agent, plus `/ldo-config` for a routing walkthrough.

### Notes

Earlier iterations of this design carried up to eleven agents, including separate
roles for codebase scanning, environment setup, verification, and documentation.
Each was folded into one of the three core roles after applying a single test:
*would this warrant a different model than the Coder?* Environment setup and
documentation belong to whoever writes the code; verification belongs to whoever
reviews it. Those versions were never published.
