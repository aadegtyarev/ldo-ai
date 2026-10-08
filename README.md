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

Native marketplace installation is recommended with Codex CLI 0.161.0 or newer. From the repository checkout root, register the marketplace and install the plugin:

```sh
codex plugin marketplace add /path/to/ldo-ai
codex plugin add ldo-ai@ldo-ai
```

The marketplace manifest is `.agents/plugins/marketplace.json`; it installs three Codex agents and five conditional skills from shared package sources. The tested CLI supports removal with `codex plugin remove ldo-ai@ldo-ai` and `codex plugin marketplace remove ldo-ai`. After a package/plugin version bump, rerunning `codex plugin add ldo-ai@ldo-ai` installs the new version; `plugin marketplace upgrade` is for Git marketplaces, not this local-source flow.

#### Shell installer fallback

For Codex CLI versions older than 0.161.0, the shell installer remains available. If `CODEX_HOME` is set, it uses its `agents/` and `skills/`; otherwise it uses `~/.codex/`:

```sh
./scripts/install-codex.sh
```

To install into a chosen agents directory, pass its path. The package-owned skills go to the sibling `skills/` directory (for example, `.codex/agents` maps to `.codex/skills`). Run the same command again to update. It manages only marked role TOMLs and each package-owned skill's `SKILL.md`; preflight refuses unowned files and symlink collisions. Unrelated files and skill-directory contents are preserved. Uninstall with `./scripts/install-codex.sh --uninstall [agents-directory]`.

## Use

Ask Claude Code for `planner`, `worker`, or `reviewer`; in Codex use `ldo-ai-planner`, `ldo-ai-worker`, or `ldo-ai-reviewer`. The plugin and Codex installer deliver native skills that hosts discover/load conditionally; role prompts provide compact routing triggers. Delegate the parts that fit the task, for example:

- “Ask the planner to inspect the repository and propose a small implementation plan. Wait for my approval before coding.”
- “Have the worker implement the approved plan and run focused tests.”
- “Ask the reviewer to inspect the diff independently and report blockers with evidence.”

The planner investigates and plans; the worker implements approved work; the reviewer independently checks the diff and evidence. The host remains responsible for delegation, user approval, and final decisions. No role is forced into a fixed pipeline.

## Boundaries

- No custom JavaScript workflow engine, role router, phase state, resume mechanism, or automated fix loop.
- No legacy LDO workflow or configuration compatibility; migrate tasks to your host's native agent workflows.
- No Recorder or Researcher agents, no Pi support, and no automatic model selection.
- Codex installer updates only `agents/ldo-ai-{planner,worker,reviewer}.toml` and package-owned `skills/ldo-ai-*/SKILL.md` destinations. Unrelated and unowned files are untouched. Updates replace local edits to owned agent or skill files; keep personal skill changes elsewhere.
- Agent behavior depends on the installed Claude Code or Codex version and its native subagent support.

## Validate this package

Requires Node.js 18+ and no third-party dependencies:

```sh
npm test
npm run check
sh -n scripts/install-codex.sh
```

`npm test` covers the shell-installer lifecycle and, when Codex CLI is installed, native marketplace add, plugin install/version update/inventory/removal, and preservation of unrelated state in a temporary `CODEX_HOME`. CI pins Codex CLI 0.161.0 and runs no model calls. Manual/release Codex model tests, if any, are limited to exact model `gpt-6-luna`; they are not part of CI. `npm run check` validates both Codex manifests, shared bundle contents, synchronized versions, skill routing, size ceilings, and absence of legacy runtime paths.

Source: [github.com/aadegtyarev/ldo-ai](https://github.com/aadegtyarev/ldo-ai)
