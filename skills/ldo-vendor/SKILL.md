---
name: ldo-vendor
description: Copy LDO directly into a project's .claude/ directory so it ships with the repo, for use without a local plugin install — e.g. claude.ai/code sessions that just clone a repo
---

The normal install is a plugin: `/plugin marketplace add` + `/plugin install`, living outside the project, updated with `/plugin update`. That's right for a local machine you control. It's the wrong shape for a repo you work on purely by connecting it somewhere else — a cloud session that clones the repo and has no separate plugin-install step to run first.

Claude Code has a project-native equivalent that needs no install step at all: files placed directly under `.claude/agents/`, `.claude/skills/`, `.claude/workflows/` in the repo are picked up automatically the moment the repo is opened — locally or in a cloud session that just clones it. This skill copies LDO into that shape.

## Why this can't be a plain file copy

`workflows/ldo.js` calls every pipeline agent through a **plugin-scoped** reference — `agentType: 'ldo:planner'`, `'ldo:coder'`, `'ldo:reviewer'`, `'ldo:security'`, `'ldo:researcher'`, `'ldo:recorder'`. That syntax means "the agent named X, inside the plugin named ldo" — it only resolves when LDO is actually installed as a plugin. Copy the files verbatim without a plugin and every one of those six calls fails to resolve; the pipeline dies on its first agent.

Vendored agents live at `.claude/agents/*.md` instead, referenced by their bare name (`planner`, `coder`, ...) — the frontmatter `name:` field is already bare in every agent file, nothing to change there. What has to change is the six `agentType` strings in the workflow script, stripped of their `ldo:` prefix, plus every `/ldo:ldo` slash-command mention in the skill files' own prose — vendored, the workflow runs as bare `/ldo` (project-level workflows use `meta.name` directly, no plugin prefix), not `/ldo:ldo`. Get either of these wrong and the vendored copy either doesn't work or actively misleads whoever reads its instructions.

`Workflow({ name: "ldo", args: {...} })` calls do **not** change — the `name` passed to the `Workflow` tool is the bare `meta.name` either way, plugin or project-level. Only the slash-command form and the internal `agentType` strings differ.

## What to do

Find LDO's own source root first — walk up from this skill's own file path until you find a directory containing `agents/`, `skills/`, and `workflows/ldo.js` as siblings (that's the plugin root, whether it's the plugin's install cache or a checkout of the LDO repo itself). Then, in the **target project** (confirm which project — don't assume the current directory if it's ambiguous):

1. **Copy agents verbatim.** `agents/*.md` → `.claude/agents/*.md`. No transform needed — frontmatter names are already bare.

   Bare names (`planner`, `coder`, `reviewer`, `security`, `researcher`, `recorder`) don't collide with anything built into Claude Code or shipped in official plugins — those are all scoped (`some-plugin:code-reviewer`) or use different names entirely. The one real risk: if the target project already has, or later gets, its own `.claude/agents/reviewer.md` (or any of the other five names) from somewhere else, Claude Code doesn't error — it silently picks one by filesystem read order, no warning. Check `.claude/agents/` for a name collision before vendoring, and re-check if the project starts using another tool that also drops bare-named agents in that directory.

2. **Copy the workflow script, transformed.** `workflows/ldo.js` → `.claude/workflows/ldo.js`, with the plugin prefix stripped from every agent reference:
   ```bash
   sed -E "s/agentType: '?ldo:([a-z]+)'?/agentType: '\1'/g" workflows/ldo.js > <target>/.claude/workflows/ldo.js
   ```
   Verify afterward — `grep "ldo:" <target>/.claude/workflows/ldo.js` should return nothing. If it does, something in the source changed shape since this skill was written; stop and fix the pattern rather than shipping a half-transformed file.

3. **Copy skills, with slash-command references updated.** `skills/*/SKILL.md` → `.claude/skills/*/SKILL.md`, and in each copy, replace the plugin-namespaced workflow mention with the bare form:
   ```bash
   sed -i 's#/ldo:ldo#/ldo#g' <target>/.claude/skills/*/SKILL.md
   ```
   This only touches the literal `/ldo:ldo` slash-command text — it doesn't touch `Workflow({ name: "ldo", ...})` calls, which are already correct as-is.

4. **Don't vendor `ldo-vendor` itself into a project that's going to develop LDO further** — that's circular. Skip this skill's own directory when copying skills (`.claude/skills/ldo-vendor/` in the target would only make sense if that project is itself meant to re-vendor into other projects, which is unusual — ask if it's actually wanted before including it).

5. **Leave a marker.** Write `.claude/LDO_VENDORED.md` in the target project with the date, the LDO version this was vendored from (check `.claude-plugin/plugin.json`'s `version` at the source), and one line: "Vendored copy — not updated by `/plugin update`. Re-run `/ldo-vendor` against a current LDO checkout to refresh." A vendored copy has no update mechanism of its own; without this note, a stale vendored copy looks identical to a current one until something in it is missing a fix that shipped since.

6. **Then run `/ldo-init`** in the target project as usual — the `CLAUDE.md` block it writes doesn't change between plugin and vendored install; every reference in it is either a bare skill name or a `Workflow({name:"ldo",...})` call, both stable either way.

## Keeping a vendored copy in sync

There's no `/plugin update` for a vendored copy — LDO doesn't run a background check, and shouldn't; that would mean phoning home from inside someone's project pipeline. Re-run `/ldo-vendor` when you know LDO changed and want the update, same as re-running `/ldo-init` refreshes the `CLAUDE.md` block. Read `.claude/LDO_VENDORED.md` first to see what version is currently vendored, and check the source's `CHANGELOG.md` for what's changed since — worth knowing before overwriting a project's vendored copy that something in the diff might be relevant (a fixed bug, a behavior change worth telling the operator about) rather than a silent file swap.

## When to use which install

- **Plugin install** (`/plugin install ldo@ldo-ai`) — the default. Gets `/plugin update`, shares across every project on the machine, namespaced commands (`/ldo:ldo`) so nothing collides. Use this unless something specifically rules it out.
- **Vendored** (`/ldo-vendor`) — when the project is worked on somewhere a plugin install step doesn't apply or doesn't travel with the repo: a cloud session that just clones a GitHub repo, a teammate who opens the repo without ever running `/plugin install` themselves, or any workflow where "the pipeline is part of this codebase" matters more than "the pipeline updates centrally." Commit the vendored files; they're project data at that point, same as `CLAUDE.md`.
