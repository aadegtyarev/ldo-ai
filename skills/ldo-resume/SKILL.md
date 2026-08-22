---
name: ldo-resume
description: Track and recover LDO pipeline runs across an interrupted session — check for runs left in progress, resume from cache instead of restarting cold
---

A `/ldo:ldo` run can take a while — Plan, maybe Security, one or more Code⇄Review rounds. If the session gets interrupted partway (killed, crashed, hit a limit) nothing about the run itself is lost: the Workflow tool keeps every completed `agent()` call cached against a `runId`, and relaunching with that `runId` replays the cached prefix instantly and only re-runs what didn't finish. The gap this skill closes is that nobody was writing the `runId` down, so there was nothing to resume *from* once the session that held it in its head was gone.

This skill is two things: the tracking protocol every `/ldo:ldo` call should follow (referenced from the `CLAUDE.md` block `/ldo-init` writes), and the recovery flow for when a run looks interrupted.

## The constraint that shapes this: resume is session-scoped

`resumeFromRunId` works only within the harness session that produced the `runId` — the cache lives in that session's process, not on disk. That means:

- **Session got summarized mid-run, or you're picking the conversation back up in the same session** (closed and reopened via its own resume mechanism, not a brand-new session): the cache is very likely still there. `runId` still resolves.
- **A genuinely new session, or the old one is gone** (process ended, `--resume` wasn't used, too much time passed): the `runId` won't resolve to anything. This is the common case in practice.

So the tracking file's job isn't "guarantee resume always works" — it's "know a run was left unresolved, and try the cheap thing (resume) before falling back to the correct thing (re-run from scratch, plan/verdict permitting)." Always attempt resume first when there's a candidate `runId`; if it doesn't resolve, that's expected and not an error — fall back immediately, don't treat it as broken.

## The tracking file

`.claude/ldo-runs.json` at the project root — one JSON array, one entry per `/ldo:ldo` invocation:

```json
[
  {
    "runId": "wf_a1b2c3",
    "task": "add rate limiting to the API endpoints",
    "argsFile": ".claude/ldo-args/wf_a1b2c3.json",
    "startedAt": "2026-07-31T14:02:00Z",
    "status": "running",
    "updatedAt": "2026-07-31T14:02:00Z"
  }
]
```

The full `args` object goes verbatim into the side file `argsFile` points at — `.claude/ldo-args/<runId>.json` — not inline in this entry. `task` stays as a separate human-readable line for the operator skimming the file; the args file is what the resume call actually needs.

**Two reasons the args live in a side file rather than inline.** First: `resumeFromRunId` does not carry arguments — resuming means calling `Workflow` again with *both* the run id and the original `args`, and the cache only replays the prefix when the args match what produced it. Recording only `task` is what makes a resume look like it "lost" the arguments — flags like `security`, `research`, `isolate`, and any `config.models` override are gone, and the replayed run silently differs from the one it claims to continue. A resumed run must be byte-identical in its arguments — **never shorten, sample, or summarise what goes into the args file.** Second: with args inlined into `ldo-runs.json`, appending run #3 means rewriting runs #1 and #2's blobs as well, since the whole array gets rewritten on every append — a 4-6 KB task description gets re-emitted on disk every single time any run starts or finishes, for no reason related to that run. A reference costs one small write per event instead.

`status` is one of `running`, `approved`, `changes_requested`, `error`, `abandoned`. For a multi-feature run (`args.tasks`), one entry still — `task` becomes a short joined summary ("3 features: ...", or the count) since one Workflow call produces one `runId` covering all of them via `parallel()` internally.

This file is local session state, not project data — it belongs in `.gitignore`, the same way `tags` does. `/ldo-init` adds it if the entry isn't already there. `.claude/ldo-args/` gets its own `.gitignore` (containing just `*`) written the moment the directory is created — see the protocol below — so the args stay out of version control even in a project whose root `.gitignore` predates this directory existing.

## The protocol (what `CLAUDE.md`'s block points here for)

**Right after calling `Workflow({ name: "ldo:ldo", args: {...} })`, before waiting on its result:** the tool call itself returns a `runId` immediately (the workflow runs in the background). Write the args file first — `.claude/ldo-args/<runId>.json` containing the full `args` object verbatim, creating `.claude/ldo-args/` (and its own `.gitignore` with `*` in it, if not already there) the first time this runs in a project — then append the small entry to `.claude/ldo-runs.json` with `status: "running"` and `argsFile` pointing at what you just wrote. Create `ldo-runs.json` (as `[]`) first if it doesn't exist. Report only the reference to the operator — never echo the args back. Don't wait for the run to finish to record that it started; the whole point is surviving an interruption mid-run.

**When the run's result comes back:** update that entry's `status` — `"approved"` or `"changes_requested"` from the verdict, `"error"` if the result carries an `error` field — and set `updatedAt`. A finished run doesn't need to stay in the file forever, but don't delete it immediately either; keep the last handful (say, 20) so `/ldo-docs-audit`-style "what's been happening" questions have something to look at. Trim oldest resolved entries past that if the file is growing — and when you trim an entry, delete the `argsFile` it points at in the same operation. A trimmed run is unresumable, so its args have no remaining purpose and keeping them around is pure retained risk: `.claude/ldo-args/` accumulates verbatim task text, which can hold whatever the operator pasted into a task, credentials included. An args file with no corresponding index entry is safe to delete at any time, trim or not.

**At the start of a session** (or whenever `/ldo:ldo` is about to be invoked and this file exists): read `.claude/ldo-runs.json`, filter to `status: "running"`. If any exist, don't silently ignore them — see Recovery below. This is a cheap read, do it without asking.

## Recovery

For each entry still marked `"running"`:

1. **Try resuming first.** Read the full args from `argsFile` (`.claude/ldo-args/<runId>.json`), then call `Workflow({ name: "ldo:ldo", args: <that object, verbatim>, resumeFromRunId: <runId> })`. An older entry from before this side-file split — inline `args` and no `argsFile` — still resumes the same way, just read straight from the entry instead. If the entry predates the `args` field entirely and only has `task`, reconstruct `{ task: <task> }` and say so — flags that were on the original call can't be recovered, so the resumed run may not match it. If the cache is live, this returns fast and picks up wherever the interrupted run left off — no re-planning, no re-coding what already passed review.
2. **If that errors or the run ID doesn't resolve** (new/different session, cache expired), that's expected, not a failure to report as broken — mark the entry `"abandoned"` and tell the operator plainly: "a run for '<task>' was interrupted and the cache isn't reachable from this session; re-running it from scratch" — then start it fresh as a normal `/ldo:ldo` call, which will log its own new entry.
3. **Don't do this silently.** Whichever path it takes, say so — resumed-from-cache and started-fresh are different enough outcomes (one skips real work, one redoes it) that the operator should know which happened, especially if it costs tokens either way.

If several entries are `"running"` at once (e.g. more than one call was made before the interruption), handle them in the order they started; a later one may depend on files an earlier one was mid-writing to shared state (worktrees make this mostly moot for multi-feature runs, but a plain single-task run isn't isolated).

## What this doesn't cover

This is about resuming an `/ldo:ldo` *pipeline* run specifically — it has nothing to do with the separate question of whether a chat/channel wrapper around Claude Code preserves its own connection across a restart. That's a property of whatever harness or channel integration is running Claude Code, not of LDO, and this file can't fix it.
