# ldo-ai

> **Incompatible reset:** LDO's custom workflow engine is gone. This release is a Markdown-first set of native agents for Claude Code and Codex, not a workflow runtime.

`ldo-ai` provides focused planner, worker, and reviewer roles. Claude Code and Codex control delegation with their own native agent/subagent mechanisms. There is no Pi product surface, model router, resumable pipeline, compatibility layer, or promise that old workflows continue to work.

## Install

### Claude Code

Add the marketplace and install the native plugin:

```text
/plugin marketplace add aadegtyarev/ldo-ai
/plugin install ldo@ldo-ai
```

Update with `/plugin update ldo@ldo-ai`. The plugin contributes native agents; Claude Code decides when to delegate. To use a checkout directly during development, start Claude Code with `claude --plugin-dir /path/to/ldo-ai`.

### Codex

From a checkout, install the three native agent definitions into the current user's Codex agent directory:

```sh
./scripts/install-codex.sh
```

To install into a chosen agents directory (for example, a project-local configuration), pass its path:

```sh
./scripts/install-codex.sh /path/to/.codex/agents
```

Run the same command again to update. It only writes `ldo-ai-planner.toml`, `ldo-ai-worker.toml`, and `ldo-ai-reviewer.toml`; it refuses to overwrite files without its ownership marker and does not edit `AGENTS.md`, Codex settings, or unrelated agents. Remove only these marked package-owned definitions with `./scripts/install-codex.sh --uninstall [agents-directory]`. Restart Codex after installing or updating.

## Use

Ask Claude Code for `planner`, `worker`, or `reviewer`; in Codex use `ldo-ai-planner`, `ldo-ai-worker`, or `ldo-ai-reviewer`. Delegate the parts that fit the task, for example:

- “Ask the planner to inspect the repository and propose a small implementation plan. Wait for my approval before coding.”
- “Have the worker implement the approved plan and run focused tests.”
- “Ask the reviewer to inspect the diff independently and report blockers with evidence.”

The planner investigates and plans; the worker implements approved work; the reviewer independently checks the diff and evidence. The host remains responsible for delegation, user approval, and final decisions. No role is forced into a fixed pipeline.

## Boundaries

- No custom JavaScript workflow engine, role router, phase state, resume mechanism, or automated fix loop.
- No legacy LDO workflow or configuration compatibility; migrate tasks to your host's native agent workflows.
- No Recorder or Researcher agents, no Pi support, and no automatic model selection.
- Codex installer updates only its three named agent files. Back up any personal edits to those owned files before updating; all other files are preserved.
- Agent behavior depends on the installed Claude Code or Codex version and its native subagent support.

## Validate this package

Requires Node.js 18+ and no third-party dependencies:

```sh
npm test
npm run check
bash -n scripts/install-codex.sh
```

`npm test` covers safe Codex install, repeat update, and removal while preserving unrelated files. `npm run check` validates native package structure and absence of legacy runtime paths.

Source: [github.com/aadegtyarev/ldo-ai](https://github.com/aadegtyarev/ldo-ai)
