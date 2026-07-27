# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
