---
name: ldo-vendor
description: Copy LDO directly into a project's .claude/ directory so it ships with the repo, for use without a local plugin install — e.g. claude.ai/code sessions that just clone a repo
---

The normal install is a plugin: `/plugin marketplace add` + `/plugin install`, living outside the project, updated with `/plugin update`. That's right for a local machine you control. It's the wrong shape for a repo you work on purely by connecting it somewhere else — a cloud session that clones the repo and has no separate plugin-install step to run first. It's also fragile in a way worth naming: a plugin install depends on the marketplace cache actually being current, and that cache can silently lag behind the real source for reasons outside LDO's control (a stale git fetch in whatever's managing the install, a proxy layer, anything upstream of the plugin machinery) — with no error, just an old version quietly running. Vendoring sidesteps that whole failure class: the files are just files in the repo, no cache in the loop to go stale.

Claude Code has a project-native equivalent that needs no install step at all: files placed directly under `.claude/agents/`, `.claude/skills/`, `.claude/workflows/` in the repo are picked up automatically the moment the repo is opened — locally or in a cloud session that just clones it. This skill copies LDO into that shape.

## Why this can't be a plain file copy

`workflows/ldo.js` calls every pipeline agent through a **plugin-scoped** reference — `agentType: 'ldo:isolator'`, `'ldo:planner'`, `'ldo:coder'`, `'ldo:reviewer'`, `'ldo:security'`, `'ldo:researcher'`, `'ldo:recorder'`. That syntax means "the agent named X, inside the plugin named ldo" — it only resolves when LDO is actually installed as a plugin. Copy the files verbatim without a plugin and every one of those seven calls fails to resolve; the pipeline dies on its first agent.

Vendored agents live at `.claude/agents/*.md` instead, referenced by their bare name (`planner`, `coder`, ...). What has to change is the seven `agentType` strings in the workflow script, stripped of their `ldo:` prefix, plus every `/ldo:ldo` slash-command and `Workflow({ name: "ldo:ldo" })` programmatic mention in the skill files' own prose — vendored, the workflow runs as bare `ldo`/`/ldo` (project-level workflows use `meta.name` directly, no plugin prefix), not `ldo:ldo`.

## Run the script — this is the actual mechanism, not just documentation of one

```bash
scripts/vendor.sh <target-project-dir>
```

Run from anywhere inside an LDO checkout; it finds LDO's own source root itself. This isn't a summary for a model to re-derive and re-run by hand each time — it's the vendoring logic itself, deterministic, and testable independent of any particular session. A script either works or fails loudly (bad target, self-vendor, an incomplete transform); a paraphrased instruction can be followed slightly wrong and fail silently. It:

1. Copies `agents/*.md` verbatim into `.claude/agents/` — frontmatter names are already bare, no transform needed. Warns (doesn't block) if a target agent file already exists with a name LDO uses — Claude Code resolves duplicate bare agent names by filesystem read order, silently, no error, so this is the one collision risk worth knowing about before it happens rather than after.
2. Copies `workflows/ldo.js` into `.claude/workflows/ldo.js` with every `agentType: 'ldo:x'` rewritten to `agentType: 'x'`, then **verifies** the result has zero remaining `ldo:` references — refuses to proceed rather than ship a half-transformed file if the source shape ever changes underneath the pattern.
3. Copies every `skills/*/SKILL.md` into `.claude/skills/`, rewriting `/ldo:ldo` to `/ldo` and `name: "ldo:ldo"` to `name: "ldo"` in each, then **verifies** no `ldo:ldo` survived the transform — except `ldo-vendor` itself, skipped by default (vendoring `ldo-vendor` into a project only makes sense if that project is itself meant to re-vendor LDO elsewhere, which is unusual enough to not happen automatically).
4. Writes `.claude/LDO_VENDORED.md` with the source version and today's date — a vendored copy has no update mechanism of its own, so this is what tells a future reader it's not current by default.

Then run `/ldo-init` in the target project as usual — the `CLAUDE.md` block doesn't change between plugin and vendored install.

## If the script genuinely can't run (no shell access to the target)

Fall back to doing what the script does, by hand, in the target project:

```bash
cp agents/*.md <target>/.claude/agents/
sed -E "s/agentType: '?ldo:([a-z]+)'?/agentType: '\1'/g" workflows/ldo.js > <target>/.claude/workflows/ldo.js
grep "ldo:" <target>/.claude/workflows/ldo.js  # must return nothing — stop and fix if it does
sed -e 's#/ldo:ldo#/ldo#g' -e 's#name: *"ldo:ldo"#name: "ldo"#g' skills/<name>/SKILL.md > <target>/.claude/skills/<name>/SKILL.md  # for each skill except ldo-vendor
grep -r "ldo:ldo" <target>/.claude/skills/  # must return nothing — stop and fix if it does
```

Then write `.claude/LDO_VENDORED.md` in the target manually — version and date, same content the script would produce.

## Keeping a vendored copy in sync

There's no `/plugin update` for a vendored copy — LDO doesn't run a background check, and shouldn't; that would mean phoning home from inside someone's project pipeline. Re-run `scripts/vendor.sh` when you know LDO changed and want the update, same as re-running `/ldo-init` refreshes the `CLAUDE.md` block. Read the target's `.claude/LDO_VENDORED.md` first to see what version is currently vendored, and check LDO's own `CHANGELOG.md` for what's changed since — worth knowing before overwriting a project's vendored copy that something in the diff might be relevant (a fixed bug, a behavior change worth telling the operator about) rather than a silent file swap. Vendoring only touches LDO-owned files (`.claude/agents/`, `.claude/skills/`, `.claude/workflows/`) — anything the target project customized in `CLAUDE.md` or `docs/contracts/` is untouched.

## When to use which install

- **Plugin install** (`/plugin install ldo@ldo-ai`) — the default. Gets `/plugin update`, shares across every project on the machine, namespaced commands (`/ldo:ldo`) so nothing collides. Use this unless something specifically rules it out.
- **Vendored** (`scripts/vendor.sh`) — when the project is worked on somewhere a plugin install step doesn't apply or doesn't travel with the repo (a cloud session that just clones a GitHub repo, a teammate who opens the repo without ever running `/plugin install`), or when the operating environment's plugin-install path has proven unreliable (a marketplace cache that's gone stale for reasons outside LDO's control). Commit the vendored files; they're project data at that point, same as `CLAUDE.md`.
