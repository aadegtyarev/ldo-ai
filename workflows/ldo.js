export const meta = {
  name: 'ldo',
  description: 'Lightweight Dev Orchestrator: [Research→]Plan→[Security→]Code⇄Review, with a different model per role',
  whenToUse: 'args.task runs one feature in the current directory. args.tasks (an array) runs N independent features in parallel, each isolated in its own git worktree created by that feature\'s Planner; each ships separately afterward via /ldo-ship run from its own worktree.',
  phases: [
    { title: 'Research', detail: 'Multi-source web research (opt-in)' },
    { title: 'Plan', detail: 'Read the codebase, plan the change, rate complexity + security surface' },
    { title: 'Security', detail: 'Threat-model the plan before code exists (elevated surface only)' },
    { title: 'Code', detail: 'Set up env, implement, test, document' },
    { title: 'Review', detail: 'Read the diff, drive the app, prove the criteria' },
    { title: 'Record', detail: 'Persist the review report, architecture doc, backlog (approved medium+ only)' },
  ],
}

// ═══════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    complexity: { type: 'string', enum: ['trivial', 'medium', 'complex'] },
    security_surface: {
      type: 'string',
      enum: ['none', 'low', 'elevated'],
      description: 'none = no attack surface; low = data paths, no new entry point; elevated = new input/auth/secrets/injection/dependency/crypto surface',
    },
    security_notes: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    codebase_context: {
      type: 'object',
      description: 'The ONLY codebase information downstream agents receive. Becomes the shared cache prefix.',
      properties: {
        stack: { type: 'string', description: 'Language, framework, package manager, test framework, database' },
        conventions: { type: 'string', description: 'Patterns the Coder must match. 3-8 lines.' },
        relevant_files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              role: { type: 'string', enum: ['primary', 'dependent', 'test', 'config'] },
              note: { type: 'string' },
            },
            required: ['path', 'role'],
          },
        },
        test_command: { type: 'string' },
        run_command: { type: 'string', description: 'How to start the app; null if not runnable' },
      },
      required: ['stack', 'relevant_files'],
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          what: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          acceptance: { type: 'string' },
          user_facing: { type: 'boolean' },
        },
        required: ['what', 'files', 'acceptance'],
      },
    },
    problem_evidence: {
      type: 'object',
      description: 'What observation shows the problem is real. A task that cannot answer this is a guess, and the pipeline builds guesses as readily as it builds fixes.',
      properties: {
        basis: {
          type: 'string',
          enum: ['measured', 'reported', 'inspected', 'asserted'],
          description: 'measured = a number/output in hand; reported = a user or log reported it; inspected = read the code and the defect is visible there; asserted = the task says so and nothing else confirms it',
        },
        evidence: { type: 'string', description: 'The specific observation — the failing output, the log line, the code path. Empty when basis is asserted.' },
        confirms: { type: 'string', description: 'What measurement would show the change worked. Must be observable, not "the code is better".' },
      },
      required: ['basis'],
    },
    risks: { type: 'array', items: { type: 'string' } },
    rollback_plan: { type: 'string' },
    worktree_path: { type: 'string', description: 'Populated only in multi-feature mode — the exact path the Planner cd\'d into' },
    branch: { type: 'string', description: 'Populated only in multi-feature mode — the exact branch the Planner created' },
    migrations: {
      type: 'object',
      description: 'Only when this plan creates database migrations or any other globally-numbered file',
      properties: {
        count: { type: 'number', description: 'How many migration files this plan creates. 0 or omit the field when it creates none.' },
        directory: { type: 'string', description: 'Real, verified path to the migrations directory, relative to the repo root' },
        identifiers: { type: 'array', items: { type: 'string' }, description: 'The exact filename number prefixes to use, e.g. ["0075","0076"]' },
        note: { type: 'string' },
      },
      required: ['count', 'directory'],
    },
  },
  required: ['complexity', 'summary', 'steps', 'codebase_context'],
}

const CODER_SCHEMA = {
  type: 'object',
  properties: {
    files_changed: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    tests: {
      type: 'object',
      properties: {
        written: { type: 'array', items: { type: 'string' } },
        updated: { type: 'array', items: { type: 'string' } },
        result: { type: 'string', description: 'e.g. "42 passed, 0 failed"' },
        pre_existing_failures: { type: 'array', items: { type: 'string' }, description: 'Exactly the entries in tests.baseline.failing that still fail at the end — not recollection' },
        baseline: {
          type: 'object',
          description: 'The suite\'s state before any edit, captured up front so pre_existing_failures is evidence, not memory',
          properties: {
            captured: { type: 'boolean' },
            command: { type: 'string' },
            result: { type: 'string', description: 'e.g. "39 passed, 3 failed" as of before any edit' },
            failing: { type: 'array', items: { type: 'string' } },
            note: { type: 'string', description: 'Why it could not be captured, if it could not' },
          },
        },
      },
    },
    env: {
      type: 'object',
      properties: {
        actions: { type: 'array', items: { type: 'string' } },
        unresolved: { type: 'array', items: { type: 'string' } },
      },
    },
    docs_updated: { type: 'array', items: { type: 'string' } },
    deviations: { type: 'array', items: { type: 'string' } },
  },
  required: ['files_changed', 'summary'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['approved', 'changes_requested'] },
    summary: { type: 'string' },
    worktree_root: { type: 'string', description: 'Verbatim output of `git rev-parse --show-toplevel` from where you reviewed — the revert-and-restore proof rewrites files, so this must be confirmed before that step runs' },
    migrations_check: {
      type: 'object',
      description: 'Only when the plan declares a migrations block',
      properties: {
        status: { type: 'string', enum: ['ok', 'mismatch', 'collision', 'not_applicable'] },
        declared: { type: 'number' },
        created: { type: 'array', items: { type: 'string' } },
        collisions: { type: 'array', items: { type: 'string' } },
        evidence: { type: 'string' },
      },
    },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] },
          what: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['file', 'severity', 'what', 'suggestion'],
      },
    },
    verification: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['verified', 'partial', 'failed', 'nothing_to_drive'] },
        criteria: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              criterion: { type: 'string' },
              status: { type: 'string', enum: ['passed', 'failed', 'skipped'] },
              evidence: { type: 'string' },
              note: { type: 'string' },
            },
            required: ['criterion', 'status', 'evidence'],
          },
        },
        blockers: { type: 'array', items: { type: 'string' } },
      },
    },
    attacks: {
      type: 'array',
      description: 'What the Reviewer actively tried to break, and whether it held',
      items: {
        type: 'object',
        properties: {
          vector: { type: 'string', description: 'The input or condition tried' },
          outcome: { type: 'string', enum: ['broke', 'held'] },
          evidence: { type: 'string', description: 'Command and captured output' },
        },
        required: ['vector', 'outcome'],
      },
    },
  },
  required: ['status', 'summary'],
}

const RECORD_SCHEMA = {
  type: 'object',
  properties: {
    worktree_root: { type: 'string', description: 'Verbatim output of `git rev-parse --show-toplevel` from where you wrote' },
    files_written: { type: 'array', items: { type: 'string' }, description: 'Paths relative to worktree_root' },
    backlog: {
      type: 'object',
      properties: {
        destination: { type: 'string', enum: ['github', 'file'] },
        file: { type: 'string' },
        count: { type: 'number' },
      },
    },
    notes: { type: 'string' },
  },
  required: ['worktree_root', 'files_written'],
}

const SECURITY_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['clean', 'findings'] },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          category: { type: 'string', enum: ['injection', 'auth', 'data_exposure', 'input_validation', 'ssrf', 'supply_chain', 'crypto', 'race_condition', 'resource', 'config'] },
          plan_step: { type: 'string' },
          what: { type: 'string' },
          exploit_scenario: { type: 'string' },
          mitigation: { type: 'string' },
          cwe: { type: 'string' },
        },
        required: ['severity', 'category', 'what', 'exploit_scenario', 'mitigation'],
      },
    },
    threat_model_notes: { type: 'string' },
  },
  required: ['status', 'summary'],
}

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          sources: { type: 'array', items: { type: 'string' } },
          contradictions: { type: 'string' },
        },
        required: ['claim', 'confidence', 'sources'],
      },
    },
    recommendations: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['question', 'summary', 'findings'],
}

// ═══════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════

// The Planner's codebase_context becomes the shared cache prefix. Anthropic keys
// the prompt cache on (model_id + prefix_bytes): Coder and Reviewer on the same
// model both hit it. A different reviewer model means a separate namespace and
// one cold start — usually worth it for the independent read.
function renderContext(ctx) {
  if (!ctx) return ''
  const parts = ['## PROJECT CONTEXT']
  if (ctx.stack) parts.push('### Stack\n' + ctx.stack)
  if (ctx.conventions) parts.push('### Conventions\n' + ctx.conventions)
  if (ctx.relevant_files?.length) {
    parts.push('### Files\n' + ctx.relevant_files
      .map(f => `- \`${f.path}\` (${f.role})${f.note ? ` — ${f.note}` : ''}`)
      .join('\n'))
  }
  const cmds = []
  if (ctx.test_command) cmds.push(`- test: \`${ctx.test_command}\``)
  if (ctx.run_command) cmds.push(`- run: \`${ctx.run_command}\``)
  if (cmds.length) parts.push('### Commands\n' + cmds.join('\n'))
  return parts.join('\n') + '\n\n'
}

function renderPlan(plan) {
  const lines = [`## PLAN (${plan.complexity})`, plan.summary, '', '### Steps']
  plan.steps.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.what}`)
    lines.push(`   Files: ${s.files.join(', ')}`)
    lines.push(`   Accept: ${s.acceptance}`)
  })
  const pe = plan.problem_evidence
  if (pe?.basis) {
    lines.push('', '### Why we believe this problem is real')
    lines.push(pe.basis === 'asserted'
      ? 'UNVERIFIED — the task asserts this problem; nothing observed confirms it. Treat the premise as unproven, not as established fact.'
      : `${pe.basis}${pe.evidence ? ` — ${pe.evidence}` : ''}`)
    if (pe.confirms) lines.push(`Confirmed by: ${pe.confirms}`)
  }
  if (plan.risks?.length) {
    lines.push('', '### Risks')
    plan.risks.forEach(r => lines.push(`- ${r}`))
  }
  if (plan.rollback_plan) lines.push('', '### Rollback', plan.rollback_plan)
  const migrations = renderMigrations(plan)
  if (migrations) lines.push(migrations)
  return lines.join('\n')
}

// Separate from renderPlan because the fix-pass prompts send the compact plan,
// and a Reviewer without this block reports `not_applicable` — which
// enforceMigrationGate then converts into an issue no Coder edit can clear.
// plan.migrations.directory is validated (and deleted if unsafe) once, in
// phasePlan, before this function ever runs — never re-trust the raw string here.
function renderMigrations(plan) {
  if (!(plan?.migrations?.count > 0) || !safeMigrationsDir(plan.migrations.directory)) return ''
  return [
    '',
    '### Migrations (numbering is a hard constraint)',
    `Directory: ${plan.migrations.directory}`,
    `Count: ${plan.migrations.count}`,
    `Identifiers: ${(plan.migrations.identifiers || []).join(', ') || '(none listed)'}`,
    'Create exactly these. If you find you need a number that is not on this list, stop and say so in `deviations` — do not take the next free one. In a parallel run another feature already owns it, and two migrations with the same number have undefined apply order.',
  ].join('\n')
}

function renderPlanCompact(plan) {
  return plan.steps.map((s, i) => `${i + 1}. ${s.what} [${s.files.join(', ')}]`).join('\n')
}

function renderCoderSummary(r) {
  if (!r) return '(No summary)'
  if (typeof r === 'string') return r
  const lines = [`**Files changed**: ${r.files_changed?.join(', ') || '(none)'}`]
  if (r.summary) lines.push(`**Summary**: ${r.summary}`)
  if (r.tests?.result) lines.push(`**Tests**: ${r.tests.result}`)
  if (r.tests?.baseline?.captured) {
    lines.push(`**Baseline (before any edit)**: ${r.tests.baseline.result || '(no result recorded)'} — failing: ${(r.tests.baseline.failing || []).join(', ') || '(none)'}`)
  } else if (r.tests?.baseline) {
    lines.push(`**Baseline**: NOT CAPTURED — pre-existing and introduced failures cannot be told apart${r.tests.baseline.note ? ` (${r.tests.baseline.note})` : ''}`)
  }
  const t = [...(r.tests?.written || []), ...(r.tests?.updated || [])]
  if (t.length) lines.push(`**Test files**: ${t.join(', ')}`)
  if (r.tests?.pre_existing_failures?.length) lines.push(`**Pre-existing failures**: ${r.tests.pre_existing_failures.join('; ')}`)
  if (r.env?.actions?.length) lines.push(`**Env actions**: ${r.env.actions.join('; ')}`)
  if (r.env?.unresolved?.length) lines.push(`**Env unresolved**: ${r.env.unresolved.join('; ')}`)
  if (r.docs_updated?.length) lines.push(`**Docs**: ${r.docs_updated.join(', ')}`)
  if (r.deviations?.length) lines.push(`**Deviations**: ${r.deviations.join('; ')}`)
  return lines.join('\n')
}

// Full threat model when the Security agent ran; otherwise the Planner's own
// notes, so a `low` surface still reaches the Coder without an extra agent.
function renderSecurity(sec, plan) {
  if (sec?.status === 'findings' && sec.findings?.length) {
    const lines = ['## SECURITY THREAT MODEL (mitigations are hard requirements)']
    sec.findings.forEach((f, i) => {
      const stepRef = f.plan_step ? ` (plan step: ${f.plan_step})` : ''
      lines.push(`${i + 1}. [${f.severity}] ${f.category}: ${f.what}${stepRef}`)
      lines.push(`   Mitigation: ${f.mitigation}`)
    })
    if (sec.threat_model_notes) lines.push(`\nNotes: ${sec.threat_model_notes}`)
    return lines.join('\n') + '\n\n'
  }
  if (!sec && plan?.security_notes?.length && plan.security_surface !== 'none') {
    return '## SECURITY NOTES (handle these carefully)\n'
      + plan.security_notes.map(n => `- ${n}`).join('\n') + '\n\n'
  }
  return ''
}

// Multi-feature isolation. Suggested paths/branches are always derived through
// slugify() before they're ever interpolated into a prompt as a literal shell
// command — an operator-supplied label lands in "git worktree add <this>", so it
// must be shell-safe by construction, not by hoping the agent notices.
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/

function slugify(text, fallback) {
  const s = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return SAFE_SLUG.test(s) ? s : fallback
}

// Same reasoning as SAFE_SLUG above: plan.migrations.directory originates in
// Planner output derived from task text (often pasted from an issue tracker,
// not the operator's own keyboard), and it reaches a shell command in the
// Reviewer's collision check. Character-class validation alone lets through
// paths like `.git/hooks`, `.`, or `-rf` that are syntactically safe but a
// bad write/scan target — so reject by path segment, not by regex alone.
const SAFE_REL_PATH = /^[A-Za-z0-9._\/-]+$/

function safeMigrationsDir(dir) {
  const d = String(dir || '')
  if (!d || !SAFE_REL_PATH.test(d) || d.startsWith('/')) return null
  const normalized = d.replace(/\/+$/, '')
  const segments = normalized.split('/')
  if (segments.includes('..')) return null
  if (segments.some(seg => seg.startsWith('.') || seg.startsWith('-'))) return null
  return normalized
}

function renderWorktree(worktreePath, branch, label) {
  if (!worktreePath || !branch) return ''
  const labelLine = label ? ` This feature's label is \`${label}\` — use it wherever a per-feature filename is called for.` : ''
  return `## ISOLATION\nYour work happens in \`${worktreePath}\` on branch \`${branch}\`. cd there before anything else and verify with \`pwd\` / \`git rev-parse --show-toplevel\`. Other features are running in sibling worktrees right now — never touch the main tree or another feature's directory.${labelLine}\n\n`
}

function renderResearch(r) {
  if (!r) return ''
  const lines = ['## RESEARCH FINDINGS', r.summary, '']
  if (r.findings?.length) {
    lines.push('### Findings')
    r.findings.forEach(f => lines.push(`- [${f.confidence}] ${f.claim}`))
  }
  if (r.recommendations?.length) {
    lines.push('', '### Recommendations')
    r.recommendations.forEach(x => lines.push(`- ${x}`))
  }
  if (r.gaps?.length) lines.push('', '### Unanswered\n' + r.gaps.map(g => `- ${g}`).join('\n'))
  return lines.join('\n') + '\n\n'
}

// ═══════════════════════════════════════════
// MODEL ROUTING
// ═══════════════════════════════════════════

// The reason the protocol exists: Reviewer runs on a stronger model than Coder.
// Model names mean whatever your setup routes them to — no assumption is made
// about which is more capable.
//
// The tiers genuinely differ. A typo doesn't need Sonnet to plan it or Opus to
// review it, so trivial work runs cheap end to end. Medium is the default shape:
// Sonnet writes, Opus checks. Complex additionally buys a stronger Coder and
// Reviewer, because a wrong approach on a big change is the expensive kind of
// wrong.
// planner is 'opus' in every tier deliberately, not by coincidence: complexity
// is the Planner's own output, so it structurally cannot gate its own model —
// only its call under the 'medium' row is ever actually read (see
// prePlanModels below), which is also why trivial/complex.planner exist here
// only for shape consistency, not because they take effect independently.
// reviewer is 'opus' in trivial/medium and 'fable' in complex, with 'sonnet' as
// the fallback when fable isn't on the proxy route (see REVIEWER_FALLBACK).
// Catching what the Coder missed is the entire premise of the protocol — a
// cheap Reviewer that trusts the Coder is an expensive no-op, not a real review.
// Complex work has the most surface to miss, so it gets the strongest reviewer;
// sonnet is the floor: a weaker review still catches things, and no review is
// what a run can't recover from.
const DEFAULT_MODELS = {
  trivial: { planner: 'opus', coder: 'haiku',  reviewer: 'opus',  security: 'opus', researcher: 'sonnet', recorder: 'haiku' },
  medium:  { planner: 'opus', coder: 'sonnet', reviewer: 'opus',  security: 'opus', researcher: 'opus',   recorder: 'haiku' },
  complex: { planner: 'opus', coder: 'opus',   reviewer: 'fable', security: 'opus', researcher: 'opus',   recorder: 'haiku' },
}

function routeModels(complexity, config) {
  const table = config?.models ? { ...DEFAULT_MODELS, ...config.models } : DEFAULT_MODELS
  return table[complexity] || table.medium
}

// One transient failure shouldn't abort a run that has already done real work
async function agentWithRetry(prompt, opts, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    const result = await agent(prompt, opts)
    if (result) return result
    if (i < attempts - 1) log(`  ↻ ${opts.label} returned nothing — retrying (${i + 2}/${attempts})`)
  }
  return null
}

// 'fable' isn't on every proxy route. When the reviewer's model has an entry
// here, an unavailable primary (the call returns nothing, or throws) retries
// once on the fallback instead of the run failing outright — a weaker review
// still catches things; no review is what a run can't recover from.
const REVIEWER_FALLBACK = { fable: 'sonnet' }

function logUnproven(verdict, logPrefix) {
  if (!verdict.unproven?.length) return
  log(`${logPrefix}  ⚠ NOT PROVEN — ${verdict.unproven.length} criterion(s) skipped, over to you:`)
  verdict.unproven.forEach(c => log(`${logPrefix}    ○ ${c}`))
}

// A criterion the Reviewer marked `skipped` is work handed back to the operator —
// typically the one check too expensive to finish inside a single tool call. Nothing
// in VERDICT_SCHEMA couples that to `status`, so a verdict could come back `approved`
// with its most expensive criterion silently unproven, and the word "approved" carried
// no sign of it. Couple them here rather than asking the Reviewer to self-report: an
// omission is exactly what a model is least reliable at volunteering.
function markUnproven(verdict) {
  const unproven = (verdict.verification?.criteria || []).filter(c => c.status === 'skipped')
  if (!unproven.length) return verdict

  const names = unproven.map(c => c.criterion)
  return {
    ...verdict,
    verification: {
      ...verdict.verification,
      // 'verified' asserts every criterion was proven; a skip makes that false.
      verdict: verdict.verification.verdict === 'failed' ? 'failed' : 'partial',
    },
    unproven: names,
    summary: `${verdict.summary}\n\nNOT PROVEN — ${names.length} criterion(s) skipped, left for the operator to run: ${names.join('; ')}`,
  }
}

// Verifies a self-reported location against the location the pipeline told the
// agent to be in — used for both the Recorder (workflows/ldo.js:phaseRecord)
// and the Reviewer (workflows/ldo.js:phaseCodeReview). This is honesty-of-report,
// not location-of-write: it checks what the agent says it saw, not what actually
// happened on disk, so it reliably catches "forgot to cd and honestly reported
// where it was" but is not a containment boundary against a model that
// misreports. That's the actual failure mode observed in the field (a weak
// model losing a prompt-only instruction), so it's worth building for even
// though it isn't a guarantee.
function verifyAgentLocation(reportedRoot, plan, ctx) {
  if (!ctx?.isMulti) return false
  // `git rev-parse --show-toplevel` — what both schemas ask the agent to
  // report verbatim — ends in a newline, and stray leading/trailing spaces
  // are just as plausible from a model's text output. Trim before
  // normalising, or a fully compliant report false-positives as misplaced.
  const wp = String(plan?.worktree_path || '').trim().replace(/\/+$/, '').replace(/^\.\//, '')
  const root = String(reportedRoot || '').trim().replace(/\/+$/, '')
  if (!wp || !root) return false
  // Exact match or path-suffix only — never includes(), which would let
  // `.worktrees/1-foo-evil` pass against `.worktrees/1-foo`.
  return root !== wp && !root.endsWith('/' + wp)
}

// A number claimed by two migrations means undefined apply order and a
// possibly broken schema — before this gate, only a human eye at merge time
// caught it. Enforced here, not asked of the Reviewer's self-report, because
// an omitted check is exactly what a model is least reliable at volunteering:
// it's easy to forget to run and cheap to skip silently, and "I didn't check"
// looks identical to "approved" unless something downstream refuses to accept it.
function enforceMigrationGate(verdict, plan) {
  if (!(plan?.migrations?.count > 0)) return verdict

  const c = verdict.migrations_check
  // The plan is the authority on whether migrations exist, so a Reviewer
  // reporting `not_applicable` here is always a contradiction, not a valid
  // outcome — treat it the same as a missing check rather than letting it
  // bypass the gate.
  if (c?.status === 'ok') return verdict

  // The schema declares `collisions`/`created` as arrays, but that's a hint
  // to the model, not a runtime guarantee — a single collision is exactly
  // the shape a model tends to fill with a lone string instead of a
  // one-element array. Coerce rather than crash: the safe direction on a
  // malformed report is to keep the gate blocking, not to abort the run.
  const list = a => (Array.isArray(a) ? a : a ? [String(a)] : [])

  const what = c?.status === 'collision'
    ? `Migration numbering collision: ${list(c.collisions).join(', ') || '(no numbers listed)'}`
    : c?.status === 'mismatch'
      ? `Migration count/identifier mismatch — declared ${plan.migrations.count}, created ${list(c.created).join(', ') || '(not reported)'}`
      : c?.status === 'not_applicable'
        ? 'migrations_check reported not_applicable, but the plan declares migrations — the plan is authoritative, so this is treated as an unrun check'
        : 'migrations_check was not run — the plan declared migrations but the Reviewer never ran the collision/count check'

  const issue = {
    file: plan.migrations.directory,
    severity: 'critical',
    what,
    suggestion: c?.status === 'collision'
      ? 'Renumber the colliding migration(s) inside the declared range so no identifier is claimed twice.'
      : 'Run the migration collision/count check and report the result in `migrations_check` before this can be approved.',
  }

  return {
    ...verdict,
    status: 'changes_requested',
    issues: [...(verdict.issues || []), issue],
    summary: `${verdict.summary}\n\nMIGRATION GATE: ${what}`,
  }
}

async function agentWithModelFallback(prompt, opts, fallbackModel) {
  if (!fallbackModel) return agent(prompt, opts)
  try {
    const result = await agent(prompt, opts)
    if (result) return result
  } catch (err) {
    log(`  ↻ ${opts.label}: model '${opts.model}' failed (${err?.message || err}) — falling back to '${fallbackModel}'`)
    return agent(prompt, { ...opts, model: fallbackModel })
  }
  log(`  ↻ ${opts.label}: model '${opts.model}' returned nothing — falling back to '${fallbackModel}'`)
  return agent(prompt, { ...opts, model: fallbackModel })
}

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

const CONFIG = args?.config || {}
const MAX_FIX_LOOPS = CONFIG.maxFixLoops || 3
const BLOCKING_SEVERITIES = CONFIG.blockingSeverities || ['critical', 'major']
const DO_RESEARCH = args?.research ?? CONFIG.researchByDefault ?? false
const MAX_PARALLEL_FEATURES = CONFIG.maxParallelFeatures || 12

// Parses args.tasks into {task, label}[] with unique labels, or null if this
// isn't a multi-feature run (falls through to the single-task path below).
// Labels come from an explicit `label` field or slugify(task); collisions get
// -2, -3, ... suffixes, same convention as the Recorder's file naming.
function normalizeTasks(a) {
  const raw = a?.tasks
  if (!Array.isArray(raw) || raw.length === 0) return null

  const seen = new Map()
  return raw.map((entry, i) => {
    const t = typeof entry === 'string' ? entry : entry?.task
    if (typeof t !== 'string' || !t.trim()) {
      throw new Error(`tasks[${i}] is malformed — expected a string or {task, label?}`)
    }
    const requestedLabel = typeof entry === 'object' ? entry.label : null
    let label = slugify(requestedLabel || t, `feature-${i + 1}`)
    const n = (seen.get(label) || 0) + 1
    seen.set(label, n)
    if (n > 1) label = `${label}-${n}`
    return { task: t, label }
  })
}

// Security is gated on attack surface, not task size — a one-line change to an
// auth check is trivial work with elevated risk. The Planner rates this; the
// dedicated agent runs only when that rating is `elevated`.
function securityEnabled(plan) {
  if (args?.security !== undefined) return args.security
  if (CONFIG.securityByDefault !== undefined) return CONFIG.securityByDefault
  return plan.security_surface === 'elevated'
}

// Research and Plan run before complexity is known — resolve their models up
// front, always from the 'medium' row. This is why prePlanModels.planner is
// the only planner value that ever actually takes effect at runtime — the
// trivial/complex rows' planner entries exist for config shape, not because
// a different complexity rating changes which model plans it.
const prePlanModels = routeModels('medium', CONFIG)

// ═══════════════════════════════════════════
// PHASE FUNCTIONS
// ═══════════════════════════════════════════

// ── phaseResearch ──────────────────────────

async function phaseResearch(task, ctx, logStage, logPrefix) {
  if (!DO_RESEARCH) {
    return { researchReport: null }
  }

  logStage('Research')

  const researchReport = await agent(
    `Deep-research this topic. Cross-verify claims across independent sources.\n\n## TOPIC\n${task}`,
    { label: ctx.isMulti ? `${ctx.label}:researcher` : 'researcher', phase: 'Research', model: prePlanModels.researcher, agentType: 'ldo:researcher', schema: RESEARCH_SCHEMA }
  )

  if (researchReport) {
    const high = researchReport.findings?.filter(f => f.confidence === 'high').length || 0
    log(`${logPrefix}Research: ${researchReport.findings?.length || 0} findings (${high} high-confidence), ${researchReport.recommendations?.length || 0} recommendations`)
  } else {
    log(`${logPrefix}⚠ Research returned nothing — proceeding without it.`)
  }

  return { researchReport }
}

// ── phasePlan ──────────────────────────────

async function phasePlan(task, ctx, researchReport, logStage, logPrefix) {
  logStage('Plan')

  const worktreeTrigger = ctx.isMulti
    ? `This run is part of a parallel multi-feature batch. Before reading the codebase, create your own isolated worktree:\n\n\`git worktree add ${ctx.worktreeHint.suggestedPath} -b ${ctx.worktreeHint.suggestedBranch}\`\n\nThen \`cd\` into it and do all your work there. Only deviate from this path/branch if it collides with something that already exists. Report the exact worktree_path and branch you used.\n\n`
    : ''

  const plan = await agentWithRetry(
    worktreeTrigger + renderResearch(researchReport) + `Read the codebase and plan this task.\n\n## TASK\n${task}`,
    { label: ctx.isMulti ? `${ctx.label}:planner` : 'planner', phase: 'Plan', model: prePlanModels.planner, agentType: 'ldo:planner', schema: PLAN_SCHEMA }
  )

  if (!plan) {
    log(`${logPrefix}ERROR: Planner failed.`)
    return { error: 'Planner failed', label: ctx.label, task }
  }

  if (ctx.isMulti && (!plan.worktree_path || !plan.branch)) {
    log(`${logPrefix}ERROR: Planner didn't report a worktree — refusing to continue agents into an undefined directory.`)
    return { error: 'Planner did not create/report a worktree in multi-feature mode', label: ctx.label, task, plan }
  }

  // Validate once, here, so renderPlan/enforceMigrationGate/the Reviewer's prompt
  // never see a rejected directory string — a Planner-supplied path often
  // originates in pasted task text, not the operator's own keyboard, and it
  // reaches a shell command downstream in the Reviewer's hands.
  if (plan.migrations?.count > 0 && !safeMigrationsDir(plan.migrations.directory)) {
    log(`${logPrefix}⚠ Rejected migrations.directory as unsafe: '${plan.migrations.directory}' — migration gate disabled for this run.`)
    delete plan.migrations
  }

  const models = routeModels(plan.complexity, CONFIG)
  const CTX = renderContext(plan.codebase_context)
  const surface = plan.security_surface || 'unrated'
  const DO_SECURITY = securityEnabled(plan)
  const WORKTREE_BLOCK = ctx.isMulti ? renderWorktree(plan.worktree_path, plan.branch, ctx.label) : ''

  log(`${logPrefix}Complexity: ${plan.complexity}  |  Security surface: ${surface}  |  Coder:${models.coder}  Reviewer:${models.reviewer}`)
  if (ctx.isMulti) log(`${logPrefix}Worktree: ${plan.worktree_path} (${plan.branch})`)
  if (surface !== 'none' && plan.security_notes?.length) {
    plan.security_notes.forEach(n => log(`${logPrefix}  ⚠ ${n}`))
  }
  // A task nobody can point to evidence for is the pipeline's blind spot: it builds
  // a plausible fix for a problem that may not exist, and every downstream agent
  // treats the premise as settled. Surface it here — the operator is the only one
  // who can tell "no evidence yet" apart from "no problem".
  if (plan.problem_evidence?.basis === 'asserted') {
    log(`${logPrefix}  ⚠ Premise unverified: nothing observed confirms this problem is real — the plan takes the task's word for it.`)
    if (plan.problem_evidence.confirms) log(`${logPrefix}    Would be confirmed by: ${plan.problem_evidence.confirms}`)
  }
  log(`${logPrefix}Plan: ${plan.steps.length} step(s), ${plan.codebase_context?.relevant_files?.length || 0} files mapped`)
  plan.steps.forEach(s => log(`${logPrefix}  • ${s.what}`))
  if (plan.migrations?.count > 0) {
    log(`${logPrefix}Migrations: ${plan.migrations.count} in ${plan.migrations.directory} — ${(plan.migrations.identifiers || []).join(', ') || '(no identifiers listed)'}`)
  }

  return { plan, models, CTX, surface, DO_SECURITY, WORKTREE_BLOCK }
}

// ── phaseSecurity ──────────────────────────

async function phaseSecurity(plan, models, ctx, WORKTREE_BLOCK, CTX, DO_SECURITY, logStage, logPrefix) {
  let securityReport = null

  if (DO_SECURITY) {
    logStage('Security')

    const flagged = plan.security_notes?.length
      ? `\n\n## SURFACE THE PLANNER FLAGGED\n${plan.security_notes.map(n => `- ${n}`).join('\n')}\n\nStart from these, then look for what the Planner missed.`
      : ''

    securityReport = await agent(
      WORKTREE_BLOCK + CTX + `Threat-model this implementation plan. No code exists yet — identify risks before they are written.\n\n${renderPlan(plan)}${flagged}`,
      { label: ctx.isMulti ? `${ctx.label}:security` : 'security', phase: 'Security', model: models.security, agentType: 'ldo:security', schema: SECURITY_SCHEMA }
    )

    if (securityReport) {
      log(`${logPrefix}Security: ${securityReport.status} — ${securityReport.summary}`)
      securityReport.findings?.forEach(f => log(`${logPrefix}  [${f.severity}] ${f.category}: ${f.what}`))
    } else {
      log(`${logPrefix}⚠ Security returned nothing — proceeding without threat model.`)
    }
  }

  const SECURITY_BLOCK = renderSecurity(securityReport, plan)

  return { securityReport, SECURITY_BLOCK }
}

// ── phaseCodeReview ────────────────────────

async function phaseCodeReview(plan, models, ctx, WORKTREE_BLOCK, CTX, SECURITY_BLOCK, task, logStage, logPrefix) {
  let iteration = 0
  let reviewIssues = []
  let finalVerdict = null
  let lastIssues = []
  // Issues sent to a fix pass that the next review did NOT re-raise — kept so
  // an exhausted run can say "these were closed, these remain" instead of
  // handing back an undifferentiated refusal the operator has to re-diff.
  const resolvedIssues = []

  while (iteration < MAX_FIX_LOOPS) {
    const isFirstPass = iteration === 0

    logStage('Code')

    // Fix passes stay narrow — only the flagged files, not a re-review of the
    // whole surface — because re-attacking everything on every loop would
    // triple the cost of a multi-round fix for no proportional benefit.
    const coderPrompt = isFirstPass
      ? WORKTREE_BLOCK + CTX + SECURITY_BLOCK + `Set up the environment, then execute this plan. The PROJECT CONTEXT above is your map — don't re-scan the repo.\n\n${renderPlan(plan)}`
      : WORKTREE_BLOCK + `Fix the review issues below. Narrow pass — touch only these files. Don't leave a comment narrating the fix ("changed X to Y because the reviewer flagged Z") — the why belongs in your summary, not in the code.\n\n## ISSUES\n${reviewIssues.map((iss, i) => `${i + 1}. [${iss.severity}] ${iss.file}: ${iss.what}\n   → ${iss.suggestion}`).join('\n\n')}\n\n## PLAN (context)\n${renderPlanCompact(plan)}`

    const coderLabel = isFirstPass ? 'coder' : `coder-fix-${iteration}`
    const coderResult = await agent(coderPrompt, {
      label: ctx.isMulti ? `${ctx.label}:${coderLabel}` : coderLabel,
      phase: 'Code',
      model: models.coder,
      agentType: 'ldo:coder',
      schema: CODER_SCHEMA,
    })

    if (coderResult?.tests?.result) log(`${logPrefix}Coder pass ${iteration + 1}: ${coderResult.tests.result}`)
    else log(`${logPrefix}Coder pass ${iteration + 1} complete`)
    if (coderResult?.env?.unresolved?.length) log(`${logPrefix}  ⚠ Env: ${coderResult.env.unresolved.join('; ')}`)
    // Warning, not a gate — a suite too expensive to run twice is a real
    // situation, and an honest `captured: false` with a reason is the correct
    // answer there. This just makes the gap visible instead of silent.
    if (isFirstPass && !coderResult?.tests?.baseline?.captured) {
      log(`${logPrefix}⚠ No test baseline captured before the first edit — pre-existing failures are unattributable`)
    }

    logStage('Review')

    const reviewerPrompt = isFirstPass
      ? WORKTREE_BLOCK + CTX + SECURITY_BLOCK + `Review this implementation against the plan, drive the app to prove the acceptance criteria, then try to break it.\n\n${renderPlan(plan)}\n\n## CODER'S SUMMARY\n${renderCoderSummary(coderResult)}`
      : WORKTREE_BLOCK + `Verify these fixes landed, and scan for new problems introduced by them. Re-run any attack that previously broke something; no need to repeat the ones that held. Check the new code for archaeology comments too — a line explaining what the fix changed and why is history, not a constraint; flag it the same as dead code.\n\n## ISSUES TO VERIFY\n${reviewIssues.map((iss, i) => `${i + 1}. [${iss.severity}] ${iss.file}: ${iss.what}`).join('\n')}\n\n## CODER'S FIX SUMMARY\n${renderCoderSummary(coderResult)}\n\n## PLAN (context)\n${renderPlanCompact(plan)}${renderMigrations(plan)}`

    const reviewerLabel = isFirstPass ? 'reviewer' : `reviewer-${iteration}`
    const rawVerdict = await agentWithModelFallback(reviewerPrompt, {
      label: ctx.isMulti ? `${ctx.label}:${reviewerLabel}` : reviewerLabel,
      phase: 'Review',
      model: models.reviewer,
      agentType: 'ldo:reviewer',
      schema: VERDICT_SCHEMA,
    }, REVIEWER_FALLBACK[models.reviewer])

    if (!rawVerdict) {
      log(`${logPrefix}ERROR: Reviewer failed.`)
      return { error: 'Reviewer failed', plan, label: ctx.label, task }
    }
    const verdict = enforceMigrationGate(rawVerdict, plan)
    if (verdict !== rawVerdict) {
      log(`${logPrefix}✗ Migration gate: ${verdict.migrations_check?.status || rawVerdict.migrations_check?.status || 'missing check'}`)
    } else if (plan.migrations?.count > 0 && verdict.migrations_check?.status === 'ok') {
      log(`${logPrefix}✓ Migration numbering verified: ${verdict.migrations_check.evidence || 'no collision, count matches'}`)
    }

    // Destructive on a wrong tree: the revert-and-restore proof runs `git
    // checkout --` and `git apply` against whatever the Reviewer thinks is its
    // worktree. This is honesty-of-report (see verifyAgentLocation), not a
    // containment guarantee, but it catches the documented failure — a weak
    // model losing the prompt-only ISOLATION instruction — before the operator
    // finds their uncommitted work gone.
    if (verifyAgentLocation(verdict.worktree_root, plan, ctx)) {
      log(`${logPrefix}✗ REVIEWER OPERATED OUTSIDE ITS WORKTREE — expected ${plan.worktree_path}, reported ${verdict.worktree_root}`)
    } else if (ctx.isMulti && !verdict.worktree_root) {
      log(`${logPrefix}⚠ Reviewer did not report worktree_root — its location could not be verified`)
    }

    const v = verdict.verification
    if (v) {
      const passed = v.criteria?.filter(c => c.status === 'passed').length || 0
      const total = v.criteria?.length || 0
      log(`${logPrefix}Verification: ${v.verdict}${total ? ` — ${passed}/${total} criteria proven` : ''}`)
      v.criteria?.filter(c => c.status !== 'passed').forEach(c => {
        const mark = c.status === 'failed' ? '✗' : '○' // skipped/other
        log(`${logPrefix}  ${mark} ${c.criterion}${c.note ? ` — ${c.note}` : ''}`)
      })
      if (v.blockers?.length) log(`${logPrefix}  ⚠ Blockers: ${v.blockers.join('; ')}`)
    }

    // An empty attack list on a runnable change means the Reviewer only
    // checked the happy path — worth surfacing, not just silently absent.
    const atk = verdict.attacks || []
    if (atk.length) {
      const broke = atk.filter(a => a.outcome === 'broke')
      log(`${logPrefix}Attacks: ${atk.length} tried, ${broke.length} broke it`)
      broke.forEach(a => log(`${logPrefix}  ✗ ${a.vector}`))
    }

    lastIssues = verdict.issues || []

    // Anything we sent to this pass that the review didn't re-raise is closed.
    // Match on file+what: same file and same description means the same issue.
    if (reviewIssues.length) {
      const stillOpen = new Set(lastIssues.map(i => `${i.file}::${i.what}`))
      reviewIssues.forEach(prev => {
        if (!stillOpen.has(`${prev.file}::${prev.what}`)) resolvedIssues.push({ ...prev, resolved_in_pass: iteration + 1 })
      })
    }

    if (verdict.status === 'approved') {
      finalVerdict = markUnproven(verdict)
      log(`${logPrefix}✓ APPROVED — ${verdict.summary}`)
      logUnproven(finalVerdict, logPrefix)
      break
    }

    const blocking = lastIssues.filter(i => BLOCKING_SEVERITIES.includes(i.severity))
    const advisory = lastIssues.filter(i => !BLOCKING_SEVERITIES.includes(i.severity))

    log(`${logPrefix}✗ ${lastIssues.length} issue(s): ${blocking.length} blocking, ${advisory.length} advisory`)
    lastIssues.forEach(iss => log(`${logPrefix}  [${iss.severity}] ${iss.file}: ${iss.what}`))

    if (blocking.length === 0) {
      finalVerdict = markUnproven({ ...verdict, status: 'approved', summary: `${verdict.summary} (${advisory.length} advisory issue(s) left unfixed)` })
      log(`${logPrefix}✓ APPROVED — no blocking issues remain`)
      logUnproven(finalVerdict, logPrefix)
      break
    }

    reviewIssues = blocking
    iteration++
  }

  if (!finalVerdict) {
    log(`${logPrefix}⚠ Max fix loops (${MAX_FIX_LOOPS}) exhausted.`)
    if (resolvedIssues.length) {
      log(`${logPrefix}  Closed across the run (${resolvedIssues.length}):`)
      resolvedIssues.forEach(iss => log(`${logPrefix}    ✓ [${iss.severity}] ${iss.file}: ${iss.what} (pass ${iss.resolved_in_pass})`))
    }
    log(`${logPrefix}  Still open (${lastIssues.length}):`)
    lastIssues.forEach(iss => log(`${logPrefix}    ✗ [${iss.severity}] ${iss.file}: ${iss.what}`))
    finalVerdict = {
      status: 'changes_requested',
      summary: `Max ${MAX_FIX_LOOPS} fix iterations reached. ${resolvedIssues.length} issue(s) were closed along the way; the 'issues' list holds only what's still open — often small enough to fix by hand rather than re-running the pipeline.`,
      issues: lastIssues,
      resolved_issues: resolvedIssues,
    }
  }

  return { finalVerdict, iteration }
}

// ── phaseRecord ────────────────────────────

// The Recorder runs on the weakest model in the pipeline (Haiku), and a prompt
// instruction with no reinforcement loses on it — the field-report symptom was a
// review report landing in the main checkout mid-run and getting swept into a
// neighbouring feature's commit, with nothing catching it until merge. This
// checks what the Recorder itself reported, using the same honesty-of-report
// comparison as the Reviewer's location check (see verifyAgentLocation above),
// plus a stricter rule specific to what it writes: a reported path must never be
// absolute or contain a `..` segment, regardless of which worktree it claims.
function verifyRecordLocation(recordResult, plan, ctx) {
  if (!ctx?.isMulti) return false
  if (verifyAgentLocation(recordResult.worktree_root, plan, ctx)) return true
  return (recordResult.files_written || []).some(f => {
    const path = String(f || '')
    return path.startsWith('/') || path.split('/').includes('..')
  })
}

// A formatting agent (Haiku) writes these files rather than the workflow
// script itself, because the script has no filesystem access — only agents
// it spawns can read/write, so persisting anything to disk has to go through
// an agent call even when the "work" is just rendering already-known data.
async function phaseRecord(approved, plan, finalVerdict, securityReport, task, ctx, WORKTREE_BLOCK, models, logStage, logPrefix) {
  if (!approved || plan.complexity === 'trivial') {
    return { recordMisplaced: false }
  }

  logStage('Record')

  const recordPrompt = WORKTREE_BLOCK + `Persist this run's results to the repo. Write the review report with full evidence, update the architecture doc, and create backlog items for anything unfixed.

## TASK
${task}

## PLAN
${renderPlan(plan)}

## VERDICT
${finalVerdict.status.toUpperCase()} — ${finalVerdict.summary}

## VERIFICATION
${(finalVerdict.verification?.criteria || []).map((c, i) => `${i + 1}. [${c.status}] ${c.criterion}\n   Evidence: ${c.evidence || '(none)'}`).join('\n')}

## ATTACKS
${(finalVerdict.attacks || []).map((a, i) => `${i + 1}. [${a.outcome}] ${a.vector}\n   Evidence: ${a.evidence || '(none)'}`).join('\n')}

## ISSUES
All: ${(finalVerdict.issues || []).map(iss => `[${iss.severity}] ${iss.file}: ${iss.what} → ${iss.suggestion}`).join('; ') || 'none'}

## SECURITY (if any)
${securityReport?.status === 'findings' ? securityReport.findings.map(f => `[${f.severity}] ${f.category}: ${f.what} → ${f.mitigation}`).join('\n') : 'none'}`

  const recordResult = await agent(recordPrompt, {
    label: ctx.isMulti ? `${ctx.label}:recorder` : 'recorder',
    phase: 'Record',
    model: models.recorder || 'haiku',
    agentType: 'ldo:recorder',
    schema: RECORD_SCHEMA,
  })

  if (!recordResult) {
    log(`${logPrefix}⚠ Recorder returned nothing — artifacts not persisted.`)
    return { recordMisplaced: false }
  }

  const files = recordResult.files_written || []
  log(`${logPrefix}Record: wrote ${files.join(', ') || '(nothing reported)'}${recordResult.backlog?.destination ? ` — backlog → ${recordResult.backlog.destination}` : ''}`)

  const misplaced = verifyRecordLocation(recordResult, plan, ctx)
  if (misplaced) {
    log(`${logPrefix}✗ RECORDER WROTE OUTSIDE ITS WORKTREE — expected ${plan.worktree_path}, reported ${recordResult.worktree_root}`)
    log(`${logPrefix}  Files: ${files.join(', ') || '(none reported)'}`)
  }

  return { recordMisplaced: misplaced }
}

// ── shapeResult ────────────────────────────

// approved leads the object — a caller checking the run's outcome shouldn't
// have to dig past everything else to find it.
function shapeResult(approved, plan, researchReport, securityReport, finalVerdict, surface, models, iteration, task, ctx, recordMisplaced) {
  return {
    approved,
    record_misplaced: !!recordMisplaced,
    label: ctx.label,
    worktree_path: plan.worktree_path || null,
    branch: plan.branch || null,
    verdict: finalVerdict,
    verification: finalVerdict.verification?.verdict || 'not_run',
    unproven: finalVerdict.unproven || [],
    attacks: finalVerdict.attacks || [],
    stats: {
      complexity: plan.complexity,
      securitySurface: surface,
      securityStatus: securityReport?.status || 'not_run',
      models,
      coder_passes: iteration + 1,
      researched: !!researchReport,
      files_mapped: plan.codebase_context?.relevant_files?.length || 0,
    },
    plan,
    researchReport,
    securityReport,
    task,
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

// The single-task path and the multi-feature path share this function. Single
// mode calls it once with ctx.isMulti = false. Multi mode calls it N times
// through parallel(), one closure per feature — every let/const below is
// scoped inside the function, so N concurrent calls each get their own copy
// instead of racing on shared state. Never throws: a failure inside becomes a
// returned {error, ...} object for that feature, so one bad feature can't
// abort the others running alongside it under parallel().
async function runOneFeature(task, ctx) {
  try {
    const logPrefix = ctx.isMulti ? `[${ctx.label}] ` : ''

    log(`Budget: ${budget.total ? Math.round(budget.remaining() / 1000) + 'k' : 'unlimited'}`)
    log(`${logPrefix}Task: ${task.slice(0, 200)}${task.length > 200 ? '...' : ''}`)

    const logStage = (title) => {
      if (ctx.isMulti) log(`[${ctx.label}] ▸ ${title}`)
      else phase(title)
    }

    // Phase 1: Research (opt-in)
    const { researchReport } = await phaseResearch(task, ctx, logStage, logPrefix)

    // Phase 2: Plan
    const planResult = await phasePlan(task, ctx, researchReport, logStage, logPrefix)
    if (planResult.error) return planResult
    const { plan, models, CTX, surface, DO_SECURITY, WORKTREE_BLOCK } = planResult

    // Phase 3: Security
    const { securityReport, SECURITY_BLOCK } = await phaseSecurity(plan, models, ctx, WORKTREE_BLOCK, CTX, DO_SECURITY, logStage, logPrefix)

    // Phase 4: Code + Review
    const reviewResult = await phaseCodeReview(plan, models, ctx, WORKTREE_BLOCK, CTX, SECURITY_BLOCK, task, logStage, logPrefix)
    if (reviewResult.error) return reviewResult
    const { finalVerdict, iteration } = reviewResult

    const approved = finalVerdict.status === 'approved'

    // Phase 5: Record
    const { recordMisplaced } = await phaseRecord(approved, plan, finalVerdict, securityReport, task, ctx, WORKTREE_BLOCK, models, logStage, logPrefix)

    // Phase 6: Shape result
    return shapeResult(approved, plan, researchReport, securityReport, finalVerdict, surface, models, iteration, task, ctx, recordMisplaced)
  } catch (err) {
    // A thrown error inside one feature must not abort siblings running under
    // parallel() — return a failure shape instead of letting it propagate.
    log(`${ctx?.isMulti ? `[${ctx.label}] ` : ''}ERROR: ${err?.message || err}`)
    log(`${ctx?.isMulti ? `[${ctx.label}] ` : ''}If this looks like an LDO bug rather than the task, run /ldo-feedback — it redacts secrets and files a GitHub issue.`)
    return { error: String(err?.message || err), label: ctx?.label, task, approved: false }
  }
}

// ── DISPATCH ────────────────────────────────

let tasksList
try {
  tasksList = normalizeTasks(args)
} catch (err) {
  log(`ERROR: ${err.message}`)
  return { error: err.message }
}

if (tasksList) {
  // Parallel multi-feature mode. Each feature gets its own git worktree, created
  // by that feature's Planner (the workflow script has no filesystem access).
  // Cost and merge-conflict handling are accepted trade-offs, not solved here —
  // this is comparable to N developers on N branches; conflicts are routine at
  // merge time, not something the orchestrator resolves.
  if (tasksList.length > MAX_PARALLEL_FEATURES) {
    log(`⚠ ${tasksList.length} features requested, exceeds maxParallelFeatures (${MAX_PARALLEL_FEATURES}) — likely unintentional, but proceeding.`)
  }

  log(`Multi-feature run: ${tasksList.length} feature(s), each isolated in its own git worktree.`)
  tasksList.forEach((t, i) => log(`  [${t.label}] ${t.task.slice(0, 100)}${t.task.length > 100 ? '...' : ''}`))

  const results = await parallel(tasksList.map((t, i) => () => runOneFeature(t.task, {
    index: i,
    total: tasksList.length,
    label: t.label,
    isMulti: true,
    worktreeHint: {
      suggestedPath: `.worktrees/${i + 1}-${t.label}`,
      suggestedBranch: `ldo/${i + 1}-${t.label}`,
    },
  })))

  const features = results.map((r, i) => r || { error: 'No result returned', label: tasksList[i].label, task: tasksList[i].task, approved: false })
  const approved = features.filter(f => f.approved).length
  const failed = features.filter(f => f.error || !f.verdict).length
  const changesRequested = features.length - approved - failed

  log('')
  log(`Multi-feature summary: ${approved}/${features.length} approved, ${changesRequested} changes requested, ${failed} failed`)
  features.forEach(f => {
    if (f.worktree_path) log(`  [${f.label}] ${f.approved ? '✓' : '✗'} → run /ldo-ship from ${f.worktree_path} (already on ${f.branch})`)
    else log(`  [${f.label}] ✗ ${f.error || 'no worktree — see error above'}`)
    if (f.record_misplaced) log(`  [${f.label}] ⚠ Recorder wrote outside its worktree — check the main checkout before you git add`)
  })
  if (budget.total) log(`Budget remaining: ${Math.round(budget.remaining() / 1000)}k`)

  return {
    mode: 'multi',
    summary: { total: features.length, approved, changesRequested, failed },
    features,
  }
}

// Single-task mode.
const singleTask = args?.task || (typeof args === 'string' ? args : null)

if (!singleTask) {
  log('ERROR: No task provided. Workflow({name:"ldo:ldo", args:{task:"..."}}) or {tasks:[...]} for parallel features.')
  return { error: 'No task provided' }
}

// isolate: true runs the single task through the same worktree machinery the
// multi-feature path uses — the Coder writes into its own worktree instead of
// the operator's working tree. Without it, the pipeline edits the tree the
// operator may also be editing, and nothing but memory prevents a collision.
if (args?.isolate) {
  const label = slugify(singleTask, 'task')
  log(`Isolated run: the pipeline will work in its own git worktree, not this working tree.`)
  return await runOneFeature(singleTask, {
    index: 0,
    total: 1,
    label,
    isMulti: true,
    worktreeHint: {
      suggestedPath: `.worktrees/${label}`,
      suggestedBranch: `ldo/${label}`,
    },
  })
}

log(`⚠ Working tree mode: the Coder edits THIS working tree directly. Avoid editing files here until the run finishes — or pass isolate: true to run in a separate worktree.`)
return await runOneFeature(singleTask, { isMulti: false })
