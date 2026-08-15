---
name: ldo-feedback
description: File a bug or observation about LDO itself — structured, secrets redacted, as a GitHub issue in the LDO repo
---

Feedback about LDO used to be free-form — whatever the operator felt like writing, in whatever shape. That's the problem: two reports about the same bug carry different information, one omits the version, another pastes a token straight into the issue. This skill makes it structured (every report has the same fields), safe (secrets and accounts are redacted by a script, not by memory), and actionable (it lands as a GitHub issue in `aadegtyarev/ldo-ai`).

## When

- The pipeline errored, stalled, or produced a wrong result and the cause looks like LDO, not the task
- You noticed a gap, a confusing message, or a behavior worth changing
- `/ldo-resume` hit an `abandoned` run for a reason that looks like a bug

Not for the project's own bugs — this is feedback on the orchestrator.

## The structured form

Fill every field. "Not applicable" is a valid answer; silently omitting the field isn't.

1. **Version + install** — the `version` in `.claude-plugin/plugin.json`, or in `.claude/LDO_VENDORED.md` if vendored. Say which install shape.
2. **Where** — which agent/phase (Planner / Coder / Reviewer / Security / Recorder), or "config", "vendoring", "the CLI block", "LDO as a whole".
3. **What happened** — the observed failure. Evidence, not assertion: the exact error line, the log, the diff, the unexpected output.
4. **What was expected** — what should have happened instead.
5. **How to reproduce** — the `task` text, the minimal steps, the relevant command. A bug nobody can reproduce stays open forever.
6. **Context / impact** — how it was found, what it cost (an extra review pass, a manual fix, a wrong result), any workaround.
7. **Environment** — Claude Code version, OS. (Secrets and accounts in any of these get redacted by the next step.)

## Redact, then show, then file

**Never post without the operator seeing the redacted text.** `gh issue create` publishes to a public repo; a redaction miss is a token in a public issue. The order is:

1. Confirm the gate works: `scripts/redact.sh --self-test` — every line must be `ok`. If any fail, do not proceed; the redaction itself is broken and needs fixing first.
2. Compose the title and body from the form above.
3. Redact both: pipe each through `scripts/redact.sh` (stdin → stdout).
4. **Show the redacted title and body to the operator and wait for confirmation.** The operator is the last gate — if the script over-redacted something harmless (a commit hash, an IP that wasn't sensitive) or under-redacted, they see it here. Over-redaction is deliberate and safe; under-redaction is the failure to catch.
5. On confirmation, file it:
   ```
   gh issue create --repo aadegtyarev/ldo-ai --title "<redacted title>" --body "<redacted body>"
   ```

## If you can't file

- **No `gh` or not authenticated**: write the redacted title+body to a file (e.g. `.claude/ldo-feedback-issue.md`) and tell the operator to post it manually. Never skip the redaction because `gh` isn't there — the redaction is the point, the issue is the destination.
- **Redaction self-test fails**: report that the gate is broken and do not file; the script needs fixing before anything leaves the machine.

## Keep it minimal

One issue per distinct problem, not one per run. A run that failed because the task was ambiguous isn't an LDO bug — it's a task problem. Before filing, ask: is the defect in the orchestrator, or in the input it was given? Two reports of the same bug are worse than one; check for an existing open issue first with `gh issue list --repo aadegtyarev/ldo-ai --state open`.
