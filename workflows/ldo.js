export const meta = {
  name: 'ldo',
  description: 'Lightweight Dev Orchestrator: [Research→]Plan→[Security→]Code⇄Review, with a different model per role',
  whenToUse: 'args.task runs one feature in the current directory. args.tasks (an array) runs N independent features in parallel, each isolated in its own git worktree created by that feature\'s Planner; each ships separately afterward via /ldo-ship run from its own worktree. Add planOnly: true to either form to stop after Plan (and Security, when the surface is elevated) and get the plan plus its sizing block back without implementing it. args.resumePlan accepts a previously produced plan object and skips the Planner in a plain single-task run (not isolate: true, not args.tasks); an invalid object logs why and the Planner runs normally.',
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
      description: 'Attack surface this change introduces. See agents/planner.md.',
    },
    security_notes: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    codebase_context: {
      type: 'object',
      description: 'The only codebase information downstream agents receive',
      properties: {
        stack: { type: 'string', description: 'Language, framework, package manager, test framework, db' },
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
      description: 'What observation shows the problem is real. See agents/planner.md.',
      properties: {
        basis: {
          type: 'string',
          enum: ['measured', 'reported', 'inspected', 'asserted'],
          description: 'How the problem is known',
        },
        evidence: { type: 'string', description: 'The specific observation. Empty when basis is asserted.' },
        confirms: { type: 'string', description: 'What observable measurement would show the change worked' },
      },
      required: ['basis'],
    },
    risks: { type: 'array', items: { type: 'string' } },
    rollback_plan: { type: 'string' },
    worktree_path: { type: 'string', description: 'Multi-feature mode only: the path the Planner cd\'d into' },
    branch: { type: 'string', description: 'Multi-feature mode only: the branch the Planner created' },
    migrations: {
      type: 'object',
      description: 'Only when this plan creates globally-numbered files',
      properties: {
        count: { type: 'number', description: '0 or omit when it creates none' },
        directory: { type: 'string', description: 'Verified path, relative to the repo root' },
        identifiers: { type: 'array', items: { type: 'string' }, description: 'Filename number prefixes, e.g. ["0075","0076"]' },
        note: { type: 'string' },
      },
      required: ['count', 'directory'],
    },
    sizing: {
      type: 'object',
      description: 'One run or several. Advisory. See agents/planner.md.',
      properties: {
        fits_one_run: { type: 'boolean' },
        reason: { type: 'string', description: 'One line' },
        suggested_split: {
          type: 'array',
          description: 'Empty when fits_one_run is true',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'lowercase, digits, hyphens' },
              task: { type: 'string', description: 'Self-contained: the next Planner never sees this plan' },
              depends_on: { type: 'array', items: { type: 'string' }, description: 'Labels of chunks that must land first' },
            },
            required: ['label', 'task'],
          },
        },
      },
      required: ['fits_one_run'],
    },
  },
  // sizing is deliberately absent from `required`: a schema-validation failure
  // aborts the Planner outright, and an advisory field that can kill a run
  // contradicts the whole point of it being advisory. A Planner that omits it
  // produces a run with no size rating, which phasePlan warns about.
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
          introduced_by_fix: { type: 'boolean', description: 'True only when this defect is a consequence of the fix just made — code the Coder wrote or changed in this pass. Leave it off for anything pre-existing.' },
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

// renderPlanCompact deliberately carries only `what`/`files` because a fix
// pass is narrow, but agents/planner.md:30 tells the Planner to carry project
// contracts verbatim into `risks` or a step's `acceptance` — so the compact
// renderer dropped exactly the text agents/reviewer.md:142 makes an
// always-`critical` blocking check, letting a fix pass manufacture a contract
// violation the Coder cannot see the rule for. Separate from renderPlan for
// the same reason renderMigrations is: the fix passes must not pay for the
// full plan.
function renderConstraints(plan) {
  const lines = []
  const withAcceptance = (plan.steps || []).filter(s => s.acceptance)
  if (withAcceptance.length) {
    lines.push('', '### Acceptance criteria (from the plan — unchanged by a fix pass)')
    withAcceptance.forEach((s, i) => lines.push(`${i + 1}. ${s.what} — ${s.acceptance}`))
  }
  if (plan.risks?.length) {
    lines.push('', '### Risks and project contracts (verbatim from the plan)')
    plan.risks.forEach(r => lines.push(`- ${r}`))
  }
  return lines.join('\n')
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

// A recovered plan (args.resumePlan) reaches renderPlan and every downstream
// prompt — Security, Coder, Reviewer, Recorder — with no Planner call in
// between to catch a malformed shape. Running the pipeline on a broken plan
// object is strictly worse than re-planning (bad shape corrupts every prompt
// built from it), so this validates it before phasePlan ever assigns it to
// `plan`. Checks PLAN_SCHEMA's required fields; optional fields stay optional,
// but are shape-checked when present, because absent and malformed are not the
// same thing to the code that reads them. Plus bounds a live Planner call is
// implicitly subject to but a file-sourced object is not: a live call's step count and output size are bounded by the
// model's output budget, and its worktree_path is one it just cd'd into
// itself. A recovered object has none of those guarantees, so they're
// checked explicitly here instead of assumed.
function resumePlanRejection(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'not a plan object'
  if (!['trivial', 'medium', 'complex'].includes(p.complexity)) return 'complexity is not trivial|medium|complex'
  if (typeof p.summary !== 'string' || !p.summary.trim()) return 'summary is missing'
  if (
    !Array.isArray(p.steps) ||
    p.steps.length === 0 ||
    p.steps.some(s => !s || typeof s.what !== 'string' || !s.what.trim() || !Array.isArray(s.files) || typeof s.acceptance !== 'string' || !s.acceptance.trim())
  ) {
    return 'steps are missing or malformed'
  }
  if (
    !p.codebase_context ||
    typeof p.codebase_context !== 'object' ||
    typeof p.codebase_context.stack !== 'string' ||
    !Array.isArray(p.codebase_context.relevant_files)
  ) {
    return 'codebase_context is missing or malformed'
  }
  // relevant_files, security_notes, risks, migrations and sizing are every
  // optional field phasePlan/renderContext/renderMigrations/renderSplitPaste
  // iterate or dereference (.map, .forEach, .join, .label, .task, .slice)
  // with no type guard of their own, because a live Planner call always
  // produces them in schema shape. A recovered object carries no such
  // guarantee, so a bad element in any of them would otherwise reach those
  // call sites as an uncaught TypeError instead of a rejection.
  if (p.codebase_context.relevant_files.some(f => !f || typeof f !== 'object' || typeof f.path !== 'string')) {
    return 'relevant_files entries are malformed'
  }
  if (p.security_notes !== undefined && (!Array.isArray(p.security_notes) || p.security_notes.some(n => typeof n !== 'string'))) {
    return 'security_notes is malformed'
  }
  // security_surface is checked for a different reason than the fields around
  // it: it doesn't crash anything, it gates a whole phase. securityEnabled
  // compares it against 'elevated', and the missing-rating safety net below
  // tests !plan.security_surface — so any non-empty garbage ('Elevated',
  // 'nope', {}) is truthy enough to defeat the net and falsy enough to skip
  // the threat model, silently. The enum comes from PLAN_SCHEMA so the two
  // cannot drift apart.
  if (p.security_surface !== undefined && !PLAN_SCHEMA.properties.security_surface.enum.includes(p.security_surface)) {
    return `security_surface is not ${PLAN_SCHEMA.properties.security_surface.enum.join('|')}`
  }
  if (p.risks !== undefined && (!Array.isArray(p.risks) || p.risks.some(r => typeof r !== 'string'))) {
    return 'risks is malformed'
  }
  if (p.migrations !== undefined) {
    if (!p.migrations || typeof p.migrations !== 'object' || Array.isArray(p.migrations)) return 'migrations is malformed'
    if (p.migrations.identifiers !== undefined && (!Array.isArray(p.migrations.identifiers) || p.migrations.identifiers.some(id => typeof id !== 'string'))) {
      return 'migrations is malformed'
    }
  }
  if (p.sizing !== undefined) {
    if (!p.sizing || typeof p.sizing !== 'object' || Array.isArray(p.sizing)) return 'sizing is malformed'
    if (p.sizing.suggested_split !== undefined) {
      if (!Array.isArray(p.sizing.suggested_split)) return 'sizing is malformed'
      if (
        p.sizing.suggested_split.some(
          c => !c || typeof c !== 'object' || typeof c.label !== 'string' || typeof c.task !== 'string' || (c.depends_on !== undefined && !Array.isArray(c.depends_on))
        )
      ) {
        return 'sizing is malformed'
      }
    }
  }
  // A Planner call is bounded by MAX_STEPS_PER_RUN in its prompt and by the
  // model's output budget in practice; a file-sourced object is bounded by
  // neither, so both get an explicit ceiling here. 4x is generous on purpose
  // — a false positive on a legitimately large plan costs one Planner call,
  // not a broken run.
  if (p.steps.length > MAX_STEPS_PER_RUN * 4) return 'too many steps for a recovered plan'
  let size = 0
  try {
    size = JSON.stringify(p).length
  } catch {
    return 'not serializable'
  }
  if (size > 256_000) return 'recovered plan is implausibly large'
  // Belt-and-braces. The live control is the ctx.isMulti rejection in
  // phasePlan — no recovered plan reaches here in a mode where worktree_path
  // does anything, so today this branch cannot fire on a dangerous value.
  // It is here for the day that restriction is relaxed: worktree_path would
  // then flow into renderWorktree's "cd there before anything else"
  // instruction and into verifyAgentLocation, which compares an agent's
  // self-report against this same string — an attacker-chosen path would
  // validate itself. Do not delete the isMulti gate believing this covers it.
  // A worktree path is relative-by-construction wherever one is produced
  // today (the `.worktrees/<label>` hints), so absolute or `..`-bearing is
  // never legitimate.
  if (p.worktree_path !== undefined) {
    const wp = String(p.worktree_path || '').trim()
    if (wp.startsWith('/') || wp.split('/').includes('..')) return 'worktree_path is unsafe'
  }
  return null
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

// Returns log lines, not a prompt string — this one is read by the operator,
// who may paste the args.tasks array straight back into a Workflow call. The
// chunks are model-generated free text, so the array is emitted through
// JSON.stringify and never by concatenation: a task containing a quote or a
// newline would otherwise hand the operator invalid JSON to run.
// Dependent chunks are listed apart from the paste block rather than sorted
// into it, because args.tasks runs features in PARALLEL worktrees — a batch
// whose members depend on each other produces N conflicting worktrees.
function renderSplitPaste(sizing) {
  if (sizing?.fits_one_run !== false) return []
  const chunks = sizing.suggested_split || []
  // "Several runs" with no runs named is a Planner self-contradiction. Say so
  // rather than returning nothing: the rating line still prints above this, so
  // silence here leaves the operator told to split and not told into what.
  if (!chunks.length) return ['⚠ Planner rated this as several runs but suggested no split — re-run with planOnly, or split it by hand.']

  const independent = chunks.filter(c => !c.depends_on?.length)
  const dependent = chunks.filter(c => c.depends_on?.length)

  const lines = [`Suggested split — ${chunks.length} run(s). Dependent chunks must NOT go in the same batch: args.tasks runs features in parallel worktrees.`]
  if (independent.length) {
    lines.push('Paste this to run the independent chunks in parallel:')
    lines.push(`  Workflow({name:"ldo:ldo", args:{tasks:${JSON.stringify(independent.map(c => ({ label: c.label, task: c.task })))}}})`)
  }
  if (dependent.length) {
    lines.push('Run these afterwards, in sequence — each depends on a chunk above:')
    dependent.forEach(c => lines.push(`  [${c.label}] after ${c.depends_on.join(', ')}`))
  }
  return lines
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

// The exact string Claude Code 2.1.239 throws when its watchdog gives up:
// 'agent stalled on all 6 attempts (no progress for 180000ms each)'. Matched
// on the harness's own vocabulary rather than the literal sentence, so a
// reflowed wording still matches. Three deliberate tightenings: the gap is
// bounded and lazy (an unbounded greedy `.*` backtracks quadratically, and
// this runs on a failure path where the payload may be a dumped stack), it
// can't cross a sentence boundary, and it requires the trailing `for <n>ms`
// — without that, ordinary prose like 'work stalled because there was no
// progress on the API contract' matches, and since isStallError now gates
// the model fallback, a false positive denies a genuinely failed model its
// fallback: the exact behaviour this fix exists to prevent, inverted.
const STALL_ERROR_RE = /\bstalled\b[^.]{0,200}?\bno progress for \d+\s*ms/i

function isStallError(err) {
  // Sliced as well as bounded: the regex is linear now, but there's no reason
  // to hand a megabyte-long error payload to it.
  return STALL_ERROR_RE.test(String(err?.message || err || '').slice(0, 2000))
}

// The single point every agent() call funnels through, so a stall can only be
// explained once instead of re-diagnosed (or missed) at each of the six call
// sites. Never absorbs: a stall is logged and rethrown, everything else is
// rethrown untouched — a catch that swallowed either would look like a fix
// and would silently convert a stalled Planner into a bare "Planner failed".
//
// stallMs is undocumented in Claude Code 2.1.239 — it appears only as a
// binary constant (`Ue = we?.stallMs != null ? Number(we.stallMs) : _vw`,
// with `_vw = 180000`), which is where issue #3 found it; nothing in the
// published docs mentions the key. Both
// failure directions degrade safely rather than break: a future harness that
// ignores the key just falls back to its own 180000 default, i.e. today's
// behaviour before this change; a harness whose stall message wording changes
// just stops matching STALL_ERROR_RE, so the generic ERROR line at
// runOneFeature's catch still prints instead of a wrapper throwing on an
// unrecognised shape.
async function runAgent(prompt, opts) {
  try {
    return await agent(prompt, opts)
  } catch (err) {
    if (!isStallError(err)) throw err
    // Line 1: what actually happened — the agent was generating, not hung.
    // Claude Code's watchdog counts only tool_use blocks as progress, so
    // composing one large structured output (a long plan, a verdict with
    // full verification + attacks) is indistinguishable from a stall until
    // it's already been aborted six times.
    log(`  ✗ ${opts.label} stalled — it was generating a large response, not hung. Claude Code's watchdog only counts tool calls as progress; composing a big structured output looks identical to hanging.`)
    log(`  ✗ ${opts.label} current budget: ${opts.stallMs}ms. Raise it with config.stallMs.<role> if this keeps happening.`)
    if (opts.label?.endsWith('planner')) {
      log(`  ✗ ${opts.label}: a smaller brief produces a smaller plan, which fits inside the window — that lever is the operator's, not this pipeline's.`)
    }
    throw err
  }
}

// One transient failure shouldn't abort a run that has already done real work
async function agentWithRetry(prompt, opts, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    const result = await runAgent(prompt, opts)
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

// An issue's identity is the file it names plus the Reviewer's prose describing
// it, and that prose is model-authored free text. Run wf_2b451aee-6ea re-raised
// the same critical on its fix pass in different words, the verbatim key missed,
// downgradeUnrelatedFindings reclassified a still-open blocker as an unrelated
// advisory, and the run reported approved on a zero-line diff. So identity is a
// canonicalized key plus a similarity test, not string equality on prose.
//
// The threshold is measured, not chosen. Over 18 run journals, 121 pairs of
// issues raised in the SAME round on the SAME file — distinct defects by
// construction — score at most 0.439 Dice over distinct normalized tokens,
// while the real re-worded pair scores 0.824. 0.45 sits just above that
// measured ceiling and false-matches none of the 121; at 0.40 one of them
// already does, so lowering it is not an improvement.
//
// What this does NOT catch: a rewording sharing under 45% of its tokens still
// produces a different key and is still missed — a measured 8-token restatement
// of a 24-token finding scores 0.250. enforceVerificationGate is the
// independent backstop for that case; this only reduces how often it is needed.
//
// The failure direction is one-way on purpose. A false match reads as ALREADY
// SENT and keeps the finding blocking, costing at worst a fix pass; a missed
// match downgrades a live blocker, which is the direction that approves nothing.
//
// The 2000-char cap bounds regex cost over model-authored text rather than
// meaning anything semantically: 0ms capped vs 84ms uncapped on an 800k-char
// adversarial input, and this file has already shipped a quadratic-backtracking
// defect in exactly this position (STALL_ERROR_RE).
const normalizeWhat = what => String(what ?? '').slice(0, 2000).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const issueKey = iss => `${iss.file}::${normalizeWhat(iss.what)}`

// `keys` is a Set or Map of canonical keys. Anything else throws on `.has` at
// the first call rather than scoring against a shape it cannot read — a silent
// zero here would mean "never matched", the direction that stops blocking.
const matchIssueKey = (iss, keys) => {
  const exact = issueKey(iss)
  if (keys.has(exact)) return exact

  const cut = exact.indexOf('::')
  const file = exact.slice(0, cut)
  const tokens = new Set(exact.slice(cut + 2).split(' ').filter(Boolean))

  let best = null
  let bestScore = 0
  for (const key of keys.keys()) {
    const kcut = key.indexOf('::')
    // Same file only: identical prose about two different files is two issues.
    if (key.slice(0, kcut) !== file) continue
    const other = new Set(key.slice(kcut + 2).split(' ').filter(Boolean))
    let shared = 0
    for (const t of tokens) if (other.has(t)) shared++
    const total = tokens.size + other.size
    const score = total ? (2 * shared) / total : 0
    if (score > bestScore) {
      bestScore = score
      best = key
    }
  }
  return bestScore >= ISSUE_MATCH_THRESHOLD ? best : null
}

// The first review is the full-scrutiny gate; a fix pass is narrow by
// construction — it only asked the Coder to touch specific files, so a fresh
// `major` the Reviewer didn't attribute to that work is a pre-existing defect,
// not a regression. Restarting the loop for it is how a run stops being able
// to finish: the field case was a feature never approved across three rounds
// despite each round's own prose saying the work was done. Decided here rather
// than asked of the Reviewer, same reason as markUnproven — an omission
// (forgetting to mark `introduced_by_fix`) is what a model is least reliable
// at volunteering, and a conscientious model will over-mark rather than
// under-mark if the incentive is "mark it or it gets ignored". A regression
// the fix actually caused keeps its severity and still blocks; a re-raised
// issue from the verification list is untouched; first-pass reviews never
// call this at all.
// Returns { verdict, downgraded } rather than a verdict alone. `downgraded` is
// a Map from issue key to the pass number that downgraded it, computed here by
// the orchestrator from what THIS call actually did — it is the only thing any
// downstream blocking test or report may consult. Nothing downstream reads a
// field off the issue objects themselves: `advisory` and `downgrade_reason`
// live on model-authored JSON (a Reviewer verdict, not orchestrator state) and
// are not in VERDICT_SCHEMA, so a Reviewer is free to write them in. They are
// stripped from every issue here and re-set only on the ones this function
// downgrades, so the raw verdict an operator reads can't carry a self-declared
// dismissal either.
// Membership against `sentKeys` is a fuzzy match (see matchIssueKey), and only
// in the safe direction: an over-eager match keeps a finding blocking, the same
// fail-safe this comment already commits to, while a missed match is what lets
// a live blocker be reclassified as unrelated.
function downgradeUnrelatedFindings(verdict, sentIssues, iteration) {
  const sentKeys = new Set(sentIssues.map(issueKey))
  const names = []
  const downgraded = new Map()

  const issues = (verdict.issues || []).map(raw => {
    const { advisory, downgrade_reason, ...iss } = raw
    const isBlockingSeverity = BLOCKING_SEVERITIES.includes(iss.severity)
    const key = issueKey(iss)
    const wasSent = matchIssueKey(iss, sentKeys) !== null
    // Strict === true, not truthy — a Reviewer that marks everything true
    // keeps the loop blocking (fail-safe), never bypasses it; a stray string
    // must not widen the check.
    if (!isBlockingSeverity || wasSent || iss.introduced_by_fix === true) return iss

    names.push(`[${iss.severity}] ${iss.file}: ${iss.what}`)
    downgraded.set(key, iteration)
    return { ...iss, advisory: true, downgrade_reason: `new in fix pass ${iteration}, not marked introduced_by_fix` }
  })

  if (!names.length) return { verdict: { ...verdict, issues }, downgraded }

  return {
    verdict: {
      ...verdict,
      issues,
      summary: `${verdict.summary}\n\nDOWNGRADED TO ADVISORY — ${names.length} issue(s) new in this fix pass, not on the verification list and not marked introduced_by_fix: ${names.join('; ')}`,
    },
    downgraded,
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

// Neither approval branch in phaseCodeReview ever consulted `verification.verdict`,
// and markUnproven does not cover it — its own line only rescues a SKIPPED
// criterion, passing a `failed` verification straight through. Run
// wf_2b451aee-6ea therefore reported approved with 8 of 8 acceptance criteria
// failed on a zero-line diff. Enforced here rather than asked of the Reviewer,
// same reason as enforceMigrationGate: the Reviewer already said `failed` and
// the orchestrator approved anyway, so the missing check is the orchestrator's.
//
// The enum is treated by measurement over 34 real reviewer rounds, not by taste:
//   - 'partial' is not blocked wholesale, because markUnproven deliberately
//     forces a skipped criterion down to 'partial' and hands it back as NOT
//     PROVEN for the operator to run rather than as a refusal; blocking every
//     partial would undo that shipped behaviour. It blocks only when some
//     criterion actually says `failed`.
//   - 'nothing_to_drive' is the legitimate answer for a docs-only change or a
//     pure refactor with no runtime surface, and does not block on its own.
//   - ANY failed criterion blocks, whatever the verdict word says. 'verified'
//     or 'nothing_to_drive' alongside a `failed` criterion is a self-
//     contradicting verdict, and the itemized list outranks the one-word
//     summary of it. Unobserved in the 34-round corpus, so this costs nothing
//     against real data; it closes the one shape the enum check alone missed.
//   - an ABSENT verification block DOES block. VERDICT_SCHEMA requires only
//     ['status','summary'], so absence is reachable; 'nothing_to_drive' already
//     exists as the in-schema way to say there was nothing to drive; and 0 of
//     the 34 rounds ever omitted the block. An omission is therefore
//     indistinguishable from a Reviewer that forgot, and an unreported check
//     looks exactly like one that was never run.
// Applied to all 34 rounds, this rule newly blocks none of the 6 that were
// legitimately approved; the 11 it blocks were already changes_requested.
//
// Pure, and the pass path returns the SAME object reference on purpose — the
// call site detects firing by identity (gatedVerdict !== verdict), so an
// unconditional spread would mark every run as blocked forever.
function enforceVerificationGate(verdict) {
  const v = verdict.verification
  const criteria = Array.isArray(v?.criteria) ? v.criteria : []
  const failed = criteria.filter(c => c?.status === 'failed')

  // A failed criterion blocks whatever the summary word says. The enum and the
  // criteria list are written by the same model in one JSON object and nothing
  // makes them agree, so `{verdict:'verified', criteria:[{status:'failed'}]}` is
  // reachable; the earlier rule read the word and approved it. Between the two,
  // trust the itemized list: the enum is one token summarizing the very list
  // that contradicts it, and this is the same fail-safe direction the rest of
  // the gate takes. Costs a fix pass when a Reviewer mislabels; the other
  // direction approves a run with a criterion it just said failed.
  if (!failed.length && (v?.verdict === 'verified' || v?.verdict === 'nothing_to_drive')) return verdict
  if (v?.verdict === 'partial' && !failed.length) return verdict

  const what = (v?.verdict === 'verified' || v?.verdict === 'nothing_to_drive')
    ? `Verification reported '${v.verdict}' but ${failed.length} of ${criteria.length} acceptance criteria are marked failed — the verdict word contradicts its own criteria list, and the list is what was actually checked`
    : v?.verdict === 'failed'
    ? `Verification reported 'failed'${criteria.length ? ` — ${failed.length} of ${criteria.length} acceptance criteria failed` : ' with no criteria reported'}`
    : v?.verdict === 'partial'
      ? `Verification reported 'partial' with ${failed.length} failed criterion(s): ${failed.map(c => c.criterion || '(unnamed)').join('; ')}`
      : v?.verdict
        ? `Verification reported an unrecognized verdict '${v.verdict}' — only 'verified', 'partial', 'failed' and 'nothing_to_drive' are meaningful, so this is treated as an unrun check`
        : 'The Reviewer returned no verification block at all — an unreported check is indistinguishable from one that was never run, and `nothing_to_drive` is the in-schema way to say there was nothing to drive'

  const issue = {
    file: 'verification',
    severity: 'critical',
    what,
    suggestion: 'Drive the failing acceptance criteria and report them passing, or fix the code so they pass, before this can be approved.',
  }

  return {
    ...verdict,
    status: 'changes_requested',
    issues: [...(verdict.issues || []), issue],
    summary: `${verdict.summary}\n\nVERIFICATION GATE: ${what}`,
  }
}

async function agentWithModelFallback(prompt, opts, fallbackModel) {
  if (!fallbackModel) return runAgent(prompt, opts)
  try {
    const result = await runAgent(prompt, opts)
    if (result) return result
  } catch (err) {
    // A stall is not a model failure — the fallback model composes the same
    // long output and stalls the same way, so falling back turns 6 aborts
    // into 12. On the reviewer that's 36 minutes wasted instead of 18. runAgent
    // already logged the explanation; just let the stall propagate rather than
    // re-diagnosing it here as "model failed".
    if (isStallError(err)) throw err
    log(`  ↻ ${opts.label}: model '${opts.model}' failed (${err?.message || err}) — falling back to '${fallbackModel}'`)
    return runAgent(prompt, { ...opts, model: fallbackModel })
  }
  log(`  ↻ ${opts.label}: model '${opts.model}' returned nothing — falling back to '${fallbackModel}'`)
  return runAgent(prompt, { ...opts, model: fallbackModel })
}

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

const CONFIG = args?.config || {}
const MAX_FIX_LOOPS = CONFIG.maxFixLoops || 3
const BLOCKING_SEVERITIES = CONFIG.blockingSeverities || ['critical', 'major']
// Dice coefficient over distinct normalized tokens; see matchIssueKey for the
// corpus this is calibrated against and why lowering it is not an improvement.
const ISSUE_MATCH_THRESHOLD = 0.45
const DO_RESEARCH = args?.research ?? CONFIG.researchByDefault ?? false
// A top-level arg like `isolate`/`research`, not a config key: it describes
// what this one invocation should do, not how the project is set up. Stops the
// pipeline after Plan — and after Security when the surface is elevated —
// returning the plan instead of implementing it.
const PLAN_ONLY = args?.planOnly === true
// A recovered plan describes ONE feature and cannot be keyed to a label, so
// it's rejected outright in multi-feature mode rather than silently applied
// to just the first task or silently ignored with no explanation.
let RESUME_PLAN = args?.resumePlan
if (args?.resumePlan !== undefined && Array.isArray(args?.tasks)) {
  RESUME_PLAN = undefined
  log('⚠ resumePlan is ignored in multi-feature mode (args.tasks) — one recovered plan cannot be keyed to a feature. Every feature will be planned normally.')
}
const MAX_PARALLEL_FEATURES = CONFIG.maxParallelFeatures || 12

const PLANNER_CONFIG = CONFIG.planner || {}
const DEFAULT_MAX_STEPS_PER_RUN = 8
let MAX_STEPS_PER_RUN = DEFAULT_MAX_STEPS_PER_RUN
if (PLANNER_CONFIG.maxStepsPerRun !== undefined) {
  const n = Number(PLANNER_CONFIG.maxStepsPerRun)
  if (Number.isFinite(n) && n >= 1) MAX_STEPS_PER_RUN = n
  else log(`⚠ config.planner.maxStepsPerRun is invalid (${JSON.stringify(PLANNER_CONFIG.maxStepsPerRun)}) — expected a number of steps, at least 1. Keeping default ${DEFAULT_MAX_STEPS_PER_RUN}`)
}
// Only an explicit `false` disables it. A truthy typo ("no", 0-as-string)
// would otherwise flip the operator's stated preference in the direction they
// didn't ask for, silently.
const PREFER_SPLIT = PLANNER_CONFIG.preferSplit !== false
// Same reason the stallMs merge warns on an unrecognised role: a typo'd key is
// never read, so the operator's setting is dropped with nothing in the log to
// say it was. Guarding the value while leaving the key unguarded catches only
// half the mistake.
for (const key of Object.keys(PLANNER_CONFIG)) {
  if (!['maxStepsPerRun', 'preferSplit'].includes(key)) log(`⚠ config.planner.${key} is not a known key — ignored. Keys: maxStepsPerRun, preferSplit`)
}

// Claude Code's own stall watchdog clears only on a tool_use block. While a
// model is composing a large StructuredOutput call — no tool_use emitted yet —
// that looks identical to a hung agent, and the harness aborts it at its
// 180000ms default. That's what killed issue #3's Planner: six attempts, each
// dying at exactly 180.0s of silence after the last tool_result, ~992k tokens
// burned, zero output. This map raises the budget per role.
// Keyed by ROLE, not by complexity tier: output size tracks the schema the
// role fills (VERDICT_SCHEMA carries verification criteria and attacks even on
// a trivial task), and a per-complexity scale structurally cannot cover the
// Planner — its own call is what PRODUCES the complexity rating, so no rating
// exists yet when that call needs its budget. A tier-keyed map (trivial/
// medium/complex) would also collide with the row regex scripts/check-model-
// table.sh matches across four files; a role-keyed one doesn't.
// recorder is left at 180000, the harness default, on purpose — it runs on
// haiku and writes through tools, so tool_use events keep resetting its clock
// naturally. Blanket-raising every role regardless of whether it needs it is
// the thing not to do here.
// The cost of getting this wrong the other way: the harness retries a
// genuinely stalled agent 5 times (6 attempts total), so planner/reviewer at
// 480000 means a real hang now costs up to 48 minutes instead of 18. That's
// the accepted trade against the 47-minute, zero-output run in issue #3.
const DEFAULT_STALL_MS = { planner: 480000, reviewer: 480000, coder: 360000, security: 300000, researcher: 300000, recorder: 180000 }
const MIN_STALL_MS = 1000
const STALL_MS = { ...DEFAULT_STALL_MS }
for (const role of Object.keys(DEFAULT_STALL_MS)) {
  const override = CONFIG.stallMs?.[role]
  if (override === undefined) continue
  const n = Number(override)
  if (Number.isFinite(n) && n >= MIN_STALL_MS) {
    STALL_MS[role] = n
  } else {
    // Two failure shapes, one rejection. A malformed value (string, 0,
    // negative, NaN) reaching setTimeout(NaN) fires immediately and turns
    // every call for that role into an instant 6x abort loop. A small
    // positive number is the same loop arrived at by a seconds/milliseconds
    // mix-up — `{planner: 480}` reads as eight minutes and means 480ms — so
    // the floor catches the unit error the type check can't. One second can't
    // reject a legitimate budget: the harness default is already 180000.
    log(`⚠ config.stallMs.${role} is invalid (${JSON.stringify(override)}) — expected milliseconds, at least ${MIN_STALL_MS}. Keeping default ${DEFAULT_STALL_MS[role]}ms`)
  }
}
// A key the map doesn't contain is never visited by the loop above, so a
// typo'd or wrong-case role would be silently discarded — the operator
// believes they raised a budget and nothing in the log says otherwise. Warn
// on it, the same way an invalid value warns.
for (const key of Object.keys(CONFIG.stallMs || {})) {
  if (!(key in DEFAULT_STALL_MS)) log(`⚠ config.stallMs.${key} is not a known role — ignored. Roles: ${Object.keys(DEFAULT_STALL_MS).join(', ')}`)
}

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
// forceElevated is set only for a resumePlan run whose recovered plan carries
// no security_surface — there was no Planner call to rate it, so treating an
// absent rating as 'none' would silently turn off the one phase that exists
// to catch new attack surface. An explicit `security: false` still overrides
// this, same as it overrides any other rating.
function securityEnabled(plan, forceElevated) {
  if (args?.security !== undefined) return args.security
  if (CONFIG.securityByDefault !== undefined) return CONFIG.securityByDefault
  if (forceElevated) return true
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

  const researchReport = await runAgent(
    `Deep-research this topic. Cross-verify claims across independent sources.\n\n## TOPIC\n${task}`,
    { label: ctx.isMulti ? `${ctx.label}:researcher` : 'researcher', phase: 'Research', model: prePlanModels.researcher, agentType: 'ldo:researcher', schema: RESEARCH_SCHEMA, stallMs: STALL_MS.researcher }
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

  // Identical in plan-only and full runs on purpose: varying it on PLAN_ONLY
  // would fork the cache prefix for no gain — the Planner's job is the same
  // either way.
  const sizingBrief = `## SIZING\nThis project treats ${MAX_STEPS_PER_RUN} steps as the soft ceiling for one run. ` +
    (PREFER_SPLIT
      ? 'The operator prefers short atomic runs — if this task is really several, say so.'
      : 'The operator has asked for this to be planned as ONE run — only flag a split if the task is genuinely incoherent as a single run.') +
    ' Fill `sizing` either way; it is advisory and blocks nothing.\n\n'

  // resumePlan is checked ABOVE every guard below (the `if (!plan)` failure
  // guard, the multi-mode worktree guard, safeMigrationsDir) so a recovered
  // plan passes through every gate a Planner-produced plan does. It is
  // rejected outright — never validated and used — whenever ctx.isMulti is
  // true. That covers both args.tasks (already filtered out at config time,
  // above) and isolate:true, which also sets ctx.isMulti but isn't visible
  // there. This is the live control that keeps a recovered worktree_path away
  // from renderWorktree and verifyAgentLocation — see resumePlanRejection's
  // worktree_path branch for why that matters.
  let plan = null
  let planFromResume = false
  if (RESUME_PLAN !== undefined) {
    if (ctx.isMulti) {
      log(`${logPrefix}⚠ resumePlan ignored (isolated/multi-feature run — a recovered plan names a worktree from a dead run that this run cannot verify exists) — running the Planner normally.`)
    } else {
      const reason = resumePlanRejection(RESUME_PLAN)
      if (reason) {
        log(`${logPrefix}⚠ resumePlan ignored (${reason}) — running the Planner normally.`)
      } else {
        plan = RESUME_PLAN
        planFromResume = true
        log(`${logPrefix}Plan supplied via resumePlan — Planner skipped (${plan.steps.length} step(s) recovered).`)
      }
    }
  }

  if (!plan) {
    plan = await agentWithRetry(
      worktreeTrigger + renderResearch(researchReport) + sizingBrief + `Read the codebase and plan this task.\n\n## TASK\n${task}`,
      { label: ctx.isMulti ? `${ctx.label}:planner` : 'planner', phase: 'Plan', model: prePlanModels.planner, agentType: 'ldo:planner', schema: PLAN_SCHEMA, stallMs: STALL_MS.planner }
    )
  }

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

  // test_command/run_command are the one field on the plan whose entire
  // purpose is to be executed — agents/coder.md substitutes test_command
  // verbatim into a bash line. A live Planner call derives them by reading
  // the codebase; a recovered plan's copy cannot be re-verified against
  // anything, so they're dropped rather than trusted. The Coder handles their
  // absence: agents/coder.md tells it to run the suite before touching a file
  // and to find the command itself if the plan doesn't name one. So this
  // costs one rediscovery and closes the only route a resumed plan has to a
  // shell.
  if (planFromResume && plan.codebase_context && (plan.codebase_context.test_command || plan.codebase_context.run_command)) {
    delete plan.codebase_context.test_command
    delete plan.codebase_context.run_command
    log(`${logPrefix}⚠ resumePlan: dropped test_command/run_command — a recovered command string is executed by the Coder and cannot be verified from a dead run; the Coder will rediscover them.`)
  }

  const models = routeModels(plan.complexity, CONFIG)
  const CTX = renderContext(plan.codebase_context)
  const surface = plan.security_surface || 'unrated'
  if (planFromResume && !plan.security_surface) {
    log(`${logPrefix}⚠ resumePlan carries no security_surface rating — no Planner ran to rate it, so the threat model is being forced on. Pass security:false to skip it deliberately.`)
  }
  const DO_SECURITY = securityEnabled(plan, planFromResume && !plan.security_surface)
  const WORKTREE_BLOCK = ctx.isMulti ? renderWorktree(plan.worktree_path, plan.branch, ctx.label) : ''

  log(`${logPrefix}Complexity: ${plan.complexity}  |  Security surface: ${surface}${planFromResume ? ' (recovered, not re-rated)' : ''}  |  Coder:${models.coder}  Reviewer:${models.reviewer}`)
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
  if (!plan.sizing) {
    log(`${logPrefix}⚠ Planner returned no sizing block — size unrated for this run.`)
  } else if (plan.sizing.fits_one_run !== false) {
    log(`${logPrefix}Sizing: fits one run${plan.sizing.reason ? ` — ${plan.sizing.reason}` : ''}`)
  } else {
    log(`${logPrefix}Sizing: does NOT fit one run${plan.sizing.reason ? ` — ${plan.sizing.reason}` : ''}`)
    const chunks = plan.sizing.suggested_split || []
    chunks.forEach(c => log(`${logPrefix}  ⤷ [${c.label}] ${c.task.slice(0, 100)}${c.task.length > 100 ? '...' : ''}${c.depends_on?.length ? `  (after: ${c.depends_on.join(', ')})` : ''}`))
  }
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

    securityReport = await runAgent(
      WORKTREE_BLOCK + CTX + `Threat-model this implementation plan. No code exists yet — identify risks before they are written.\n\n${renderPlan(plan)}${flagged}`,
      { label: ctx.isMulti ? `${ctx.label}:security` : 'security', phase: 'Security', model: models.security, agentType: 'ldo:security', schema: SECURITY_SCHEMA, stallMs: STALL_MS.security }
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
  let lastVerdict = null
  let lastIssues = []
  // Issues sent to a fix pass that the next review did NOT re-raise — kept so
  // an exhausted run can say "these were closed, these remain" instead of
  // handing back an undifferentiated refusal the operator has to re-diff.
  const resolvedIssues = []
  // Distinct issues downgraded across the whole run, keyed by issueKey — the
  // canonicalized identity, not the Reviewer's verbatim prose, so casing or
  // whitespace variation cannot split one finding into two entries. A Set, not
  // a counter, so a pre-existing finding re-raised on every fix pass is still
  // one entry, not one per pass it survived. Used ONLY for the exhausted-run summary's distinct
  // count; it must never reach the report, because `finalVerdict.issues` is
  // always the LAST pass's issues and only the last pass's decision describes
  // them (see lastDowngraded below).
  const downgradedKeys = new Set()
  // The last completed pass's downgrade decision — key → the pass that made it.
  // This is what phaseRecord annotates from: an issue downgraded on pass 1 and
  // re-raised on pass 2 with `introduced_by_fix: true` is blocking now, and a
  // report built from the run-lifetime Set would label it advisory anyway.
  let lastDowngraded = new Map()

  while (iteration < MAX_FIX_LOOPS) {
    const isFirstPass = iteration === 0

    logStage('Code')

    // Fix passes stay narrow — only the flagged files, not a re-review of the
    // whole surface — because re-attacking everything on every loop would
    // triple the cost of a multi-round fix for no proportional benefit.
    const coderPrompt = isFirstPass
      ? WORKTREE_BLOCK + CTX + SECURITY_BLOCK + `Set up the environment, then execute this plan. The PROJECT CONTEXT above is your map — don't re-scan the repo.\n\n${renderPlan(plan)}`
      : WORKTREE_BLOCK + `Fix the review issues below. Narrow pass — touch only these files. Don't leave a comment narrating the fix ("changed X to Y because the reviewer flagged Z") — the why belongs in your summary, not in the code.\n\n## ISSUES\n${reviewIssues.map((iss, i) => `${i + 1}. [${iss.severity}] ${iss.file}: ${iss.what}\n   → ${iss.suggestion}`).join('\n\n')}\n\n## PLAN (context)\n${renderPlanCompact(plan)}${renderConstraints(plan)}`

    const coderLabel = isFirstPass ? 'coder' : `coder-fix-${iteration}`
    const coderResult = await runAgent(coderPrompt, {
      label: ctx.isMulti ? `${ctx.label}:${coderLabel}` : coderLabel,
      phase: 'Code',
      model: models.coder,
      agentType: 'ldo:coder',
      schema: CODER_SCHEMA,
      stallMs: STALL_MS.coder,
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
      : WORKTREE_BLOCK + `Verify these fixes landed, and scan for new problems introduced by them. Re-run any attack that previously broke something; no need to repeat the ones that held. Check the new code for archaeology comments too — a line explaining what the fix changed and why is history, not a constraint; flag it the same as dead code.\n\n## ISSUES TO VERIFY\n${reviewIssues.map((iss, i) => `${i + 1}. [${iss.severity}] ${iss.file}: ${iss.what}`).join('\n')}\n\n## CODER'S FIX SUMMARY\n${renderCoderSummary(coderResult)}\n\n## PLAN (context)\n${renderPlanCompact(plan)}${renderConstraints(plan)}${renderMigrations(plan)}`

    const reviewerLabel = isFirstPass ? 'reviewer' : `reviewer-${iteration}`
    const rawVerdict = await agentWithModelFallback(reviewerPrompt, {
      label: ctx.isMulti ? `${ctx.label}:${reviewerLabel}` : reviewerLabel,
      phase: 'Review',
      model: models.reviewer,
      agentType: 'ldo:reviewer',
      schema: VERDICT_SCHEMA,
      stallMs: STALL_MS.reviewer,
    }, REVIEWER_FALLBACK[models.reviewer])

    if (!rawVerdict) {
      log(`${logPrefix}ERROR: Reviewer failed.`)
      return { error: 'Reviewer failed', plan, label: ctx.label, task }
    }

    // A `null` or non-object entry in the Reviewer's array used to abort the
    // whole feature on the first property access. Drop them here — before any
    // other stage touches the verdict — rather than guarding every read
    // downstream. This is the first thing done to a raw verdict for a reason:
    // downgradeUnrelatedFindings destructures every entry.
    {
      const raw = rawVerdict.issues || []
      const clean = raw.filter(i => i && typeof i === 'object')
      if (clean.length !== raw.length) {
        log(`${logPrefix}  ⚠ Dropped ${raw.length - clean.length} malformed issue entr(ies) from the verdict`)
      }
      rawVerdict.issues = clean
    }

    // Must run before enforceMigrationGate and enforceVerificationGate: each
    // gate injects a `critical` issue that is by construction neither on the
    // sent list nor marked introduced_by_fix, so downgrading it after the fact
    // would silently disable that gate.
    const { verdict: downgradedVerdict, downgraded: newlyDowngraded } = isFirstPass
      ? { verdict: rawVerdict, downgraded: new Map() }
      : downgradeUnrelatedFindings(rawVerdict, reviewIssues, iteration)
    lastDowngraded = newlyDowngraded
    if (newlyDowngraded.size) {
      (downgradedVerdict.issues || [])
        .filter(iss => newlyDowngraded.has(issueKey(iss)))
        .forEach(iss => {
          downgradedKeys.add(issueKey(iss))
          log(`${logPrefix}  ⚠ DOWNGRADED TO ADVISORY [was ${iss.severity}] ${iss.file}: ${iss.what} (new in fix pass ${newlyDowngraded.get(issueKey(iss))}, not marked introduced_by_fix)`)
        })
    }
    const verdict = enforceMigrationGate(downgradedVerdict, plan)
    if (verdict !== downgradedVerdict) {
      log(`${logPrefix}✗ Migration gate: ${verdict.migrations_check?.status || rawVerdict.migrations_check?.status || 'missing check'}`)
    } else if (plan.migrations?.count > 0 && verdict.migrations_check?.status === 'ok') {
      log(`${logPrefix}✓ Migration numbering verified: ${verdict.migrations_check.evidence || 'no collision, count matches'}`)
    }

    const gatedVerdict = enforceVerificationGate(verdict)
    // Object identity, the same unforgeable signal the migration gate uses
    // above: a boolean read off the verdict would be a field outside
    // VERDICT_SCHEMA, which a Reviewer is free to write in.
    const verificationBlocked = gatedVerdict !== verdict
    if (verificationBlocked) {
      log(`${logPrefix}✗ Verification gate: ${verdict.verification?.verdict || 'no verification block reported'}`)
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

    lastVerdict = gatedVerdict
    lastIssues = gatedVerdict.issues || []

    // Anything we sent to this pass that the review didn't re-raise is closed.
    // Fuzzy (matchIssueKey): the question is whether the Reviewer is describing
    // a defect it already described, and the safe answer is "yes, still open" —
    // an issue re-raised in different words must not be reported as closed.
    if (reviewIssues.length) {
      const stillOpen = new Set(lastIssues.map(issueKey))
      reviewIssues.forEach(prev => {
        if (matchIssueKey(prev, stillOpen) === null) resolvedIssues.push({ ...prev, resolved_in_pass: iteration + 1 })
      })
    }

    if (gatedVerdict.status === 'approved') {
      finalVerdict = markUnproven(gatedVerdict)
      log(`${logPrefix}✓ APPROVED — ${gatedVerdict.summary}`)
      logUnproven(finalVerdict, logPrefix)
      break
    }

    // A downgraded issue keeps its original severity but no longer counts as
    // blocking — see downgradeUnrelatedFindings above. The test trusts
    // `newlyDowngraded`, this pass's own decision, never the `advisory` field
    // on the issue itself (that field arrives on the Reviewer's own verdict
    // JSON and is not part of VERDICT_SCHEMA, so nothing stops a Reviewer from
    // writing it in to bypass the loop) and never the run-lifetime
    // `downgradedKeys` Set — a downgrade decided on one pass must not bind a
    // later pass where the Reviewer re-raises the same finding with
    // `introduced_by_fix: true`.
    // Exact, unlike the fuzzy sentKeys membership in downgradeUnrelatedFindings:
    // this asks what the orchestrator decided about these very objects on this
    // very pass, so a near hit would widen the downgrade set and REDUCE what
    // blocks — the unsafe direction.
    const isBlocking = i => BLOCKING_SEVERITIES.includes(i.severity) && !newlyDowngraded.has(issueKey(i))
    const blocking = lastIssues.filter(isBlocking)
    const advisory = lastIssues.filter(i => !isBlocking(i))

    log(`${logPrefix}✗ ${lastIssues.length} issue(s): ${blocking.length} blocking, ${advisory.length} advisory`)
    lastIssues.forEach(iss => log(`${logPrefix}  [${iss.severity}] ${iss.file}: ${iss.what}`))

    // `verificationBlocked` is tested alongside the injected issue, not instead
    // of it: BLOCKING_SEVERITIES is operator-configurable (config.blockingSeverities),
    // so a project that drops 'critical' from it would let the gate's own issue
    // fall out of `blocking` and reopen the false-approval path.
    if (blocking.length === 0 && !verificationBlocked) {
      finalVerdict = markUnproven({ ...gatedVerdict, status: 'approved', summary: `${gatedVerdict.summary} (${advisory.length} advisory issue(s) left unfixed)` })
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
    finalVerdict = markUnproven({
      status: 'changes_requested',
      summary: `Max ${MAX_FIX_LOOPS} fix iterations reached. ${resolvedIssues.length} issue(s) were closed along the way; the 'issues' list holds only what's still open — often small enough to fix by hand rather than re-running the pipeline.${downgradedKeys.size ? ` ${downgradedKeys.size} issue(s) were downgraded to advisory along the way (new in a fix pass, not attributed to it).` : ''}`,
      issues: lastIssues,
      resolved_issues: resolvedIssues,
      // Carried from the last real verdict — the Recorder's VERIFICATION and
      // ATTACKS sections read straight off this object, and an exhausted run
      // still has three rounds of falsification evidence worth writing down.
      verification: lastVerdict?.verification,
      attacks: lastVerdict?.attacks,
      // Explicit rather than inferred from resolved_issues' presence — see
      // phaseRecord, which branches its prompt on this flag rather than
      // guessing the run's outcome from what else happens to be on the verdict.
      loops_exhausted: true,
    })
    logUnproven(finalVerdict, logPrefix)
  }

  return { finalVerdict, iteration, downgraded: lastDowngraded }
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
async function phaseRecord(approved, plan, finalVerdict, securityReport, task, ctx, WORKTREE_BLOCK, models, logStage, logPrefix, downgraded) {
  if ((!approved && finalVerdict.loops_exhausted !== true) || plan.complexity === 'trivial') {
    return { recordMisplaced: false }
  }

  logStage('Record')

  // The never-approved field case left no artifact at all — three rounds of
  // falsification evidence, criteria proven and attacks run, none of it
  // written down — and the operator had to read raw verdicts to decide the
  // work was mergeable, which is exactly the decision this pass exists to
  // hand them. But the run isn't final, so unlike the approved path this must
  // not touch the architecture doc: it must not describe something that may
  // never land.
  const notApproved = !approved
  const opening = notApproved
    ? `Persist this run's results to the repo. The fix loop was exhausted before the work was approved. Write the review report with full evidence, marked NOT APPROVED, and create backlog items for the issues still open. Skip the architecture-map step entirely — the change is not final and that map must not describe something that may never land.`
    : `Persist this run's results to the repo. Write the review report with full evidence, update the architecture doc, and create backlog items for anything unfixed.`

  const verdictLine = notApproved
    ? `${finalVerdict.status.toUpperCase()} — NOT APPROVED — max fix iterations reached — ${finalVerdict.summary}`
    : `${finalVerdict.status.toUpperCase()} — ${finalVerdict.summary}`

  // A downgraded issue keeps its original severity so the rating survives into
  // the report, but the report must say so — otherwise a downgraded `critical`
  // reads identically to one still holding the loop. Every part of the
  // annotation is composed here from `downgraded`, the orchestrator's own Map
  // of what the LAST pass downgraded. Nothing is read off the issue object:
  // `advisory` and `downgrade_reason` are not in VERDICT_SCHEMA, so a Reviewer
  // can write whatever it likes there, and this text lands verbatim in a
  // persisted report an operator reads to decide whether to merge. The Map is
  // the last pass's, not the run's, because `finalVerdict.issues` is the last
  // pass's issues — a key downgraded on pass 1 and re-raised as blocking on
  // pass 2 must not read as advisory here.
  // One issue is always one line: model-authored text is newline-collapsed so
  // it cannot forge a `## SECTION` header in the prompt below.
  const oneLine = x => String(x ?? '').replace(/\s*\n\s*/g, ' ')
  const renderIssue = iss => {
    // issueKey canonicalizes on insert and on lookup alike, so a newline or a
    // casing difference in the Reviewer's prose can no longer split one entry
    // into two. Exact, never fuzzy: the Map records the orchestrator's decision
    // about these exact objects, and a near hit would print "advisory" beside an
    // issue that is still holding the loop, in a persisted report an operator
    // reads to decide whether to merge.
    const pass = downgraded.get(issueKey(iss))
    const note = pass === undefined ? '' : ` (advisory — new in fix pass ${pass}, not attributed to it)`
    return `[${oneLine(iss.severity)}] ${oneLine(iss.file)}: ${oneLine(iss.what)}${note} → ${oneLine(iss.suggestion)}`
  }

  const issuesBlock = notApproved
    ? `## ISSUES STILL OPEN
${(finalVerdict.issues || []).map(renderIssue).join('; ') || 'none'}

## ISSUES CLOSED ALONG THE WAY
${(finalVerdict.resolved_issues || []).map(iss => `[${oneLine(iss.severity)}] ${oneLine(iss.file)}: ${oneLine(iss.what)} (closed in pass ${oneLine(iss.resolved_in_pass)})`).join('\n') || 'none'}`
    : `## ISSUES
All: ${(finalVerdict.issues || []).map(renderIssue).join('; ') || 'none'}`

  const recordPrompt = WORKTREE_BLOCK + `${opening}

## TASK
${task}

## PLAN
${renderPlan(plan)}

## VERDICT
${verdictLine}

## VERIFICATION
${(finalVerdict.verification?.criteria || []).map((c, i) => `${i + 1}. [${c.status}] ${c.criterion}\n   Evidence: ${c.evidence || '(none)'}`).join('\n')}

## ATTACKS
${(finalVerdict.attacks || []).map((a, i) => `${i + 1}. [${a.outcome}] ${a.vector}\n   Evidence: ${a.evidence || '(none)'}`).join('\n')}

${issuesBlock}

## SECURITY (if any)
${securityReport?.status === 'findings' ? securityReport.findings.map(f => `[${f.severity}] ${f.category}: ${f.what} → ${f.mitigation}`).join('\n') : 'none'}`

  const recordResult = await runAgent(recordPrompt, {
    label: ctx.isMulti ? `${ctx.label}:recorder` : 'recorder',
    phase: 'Record',
    model: models.recorder || 'haiku',
    agentType: 'ldo:recorder',
    schema: RECORD_SCHEMA,
    stallMs: STALL_MS.recorder,
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
      // Capped: on an exhausted run `iteration` has already been incremented
      // past the last pass, so `iteration + 1` would report one Code call more
      // than actually ran.
      coder_passes: Math.min(iteration + 1, MAX_FIX_LOOPS),
      researched: !!researchReport,
      files_mapped: plan.codebase_context?.relevant_files?.length || 0,
      // null, not true, when the Planner returned no sizing block — "unrated"
      // has to stay distinguishable from "rated as fitting".
      fits_one_run: plan.sizing?.fits_one_run ?? null,
    },
    plan,
    researchReport,
    securityReport,
    task,
  }
}

// A separate shape rather than shapeResult with a flag. Every verdict-derived
// field shapeResult carries — approved, verdict, verification, unproven,
// attacks, coder_passes — would be null or a lie here, and a flag parameter
// would still leave `approved` present on the object for a caller to misread
// as "the work happened and was rejected". This object has no `approved` key
// at all: `if (r.approved)` is falsy, and `r.approved === false` — the
// rejected-run test — correctly does not match. `mode` leads as the
// discriminator.
function shapePlanOnly(plan, researchReport, securityReport, surface, models, task, ctx) {
  return {
    mode: 'plan-only',
    label: ctx.label,
    worktree_path: plan.worktree_path || null,
    branch: plan.branch || null,
    stats: {
      complexity: plan.complexity,
      securitySurface: surface,
      securityStatus: securityReport?.status || 'not_run',
      models,
      researched: !!researchReport,
      files_mapped: plan.codebase_context?.relevant_files?.length || 0,
      fits_one_run: plan.sizing?.fits_one_run ?? null,
    },
    suggested_tasks: plan.sizing?.fits_one_run === false
      ? (plan.sizing.suggested_split || []).filter(c => !c.depends_on?.length).map(c => ({ label: c.label, task: c.task }))
      : [],
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

    if (PLAN_ONLY) {
      log(`${logPrefix}⏹ Plan-only run — stopped after Plan${securityReport ? ' + Security' : ''} on purpose. No code was written, no review ran, nothing was recorded.`)
      renderSplitPaste(plan.sizing).forEach(line => log(`${logPrefix}${line}`))
      if (plan.sizing?.fits_one_run !== false) log(`${logPrefix}The Planner rated this as one run — re-issue the same task without planOnly to implement it.`)
      return shapePlanOnly(plan, researchReport, securityReport, surface, models, task, ctx)
    }

    // Phase 4: Code + Review
    const reviewResult = await phaseCodeReview(plan, models, ctx, WORKTREE_BLOCK, CTX, SECURITY_BLOCK, task, logStage, logPrefix)
    if (reviewResult.error) return reviewResult
    const { finalVerdict, iteration, downgraded } = reviewResult

    const approved = finalVerdict.status === 'approved'

    // Phase 5: Record
    const { recordMisplaced } = await phaseRecord(approved, plan, finalVerdict, securityReport, task, ctx, WORKTREE_BLOCK, models, logStage, logPrefix, downgraded)

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

  // Plan-only needs its own summary rather than a conditional threaded through
  // the one below: that one counts `!f.verdict` as failed, and a plan-only
  // feature legitimately has no verdict, so every planned feature would be
  // reported as a failure. There is also nothing to ship, so no /ldo-ship line.
  if (PLAN_ONLY) {
    const planned = features.filter(f => f.mode === 'plan-only').length
    const failed = features.filter(f => f.error).length

    log('')
    log(`Multi-feature plan-only summary: ${planned}/${features.length} planned, ${failed} failed`)
    features.forEach(f => {
      if (f.error) log(`  [${f.label}] ✗ ${f.error}`)
      else if (f.worktree_path) log(`  [${f.label}] ✓ planned in ${f.worktree_path}`)
      else log(`  [${f.label}] ✓ planned`)
    })
    if (budget.total) log(`Budget remaining: ${Math.round(budget.remaining() / 1000)}k`)

    return {
      mode: 'multi-plan-only',
      summary: { total: features.length, planned, failed },
      features,
    }
  }

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

// No Coder runs in plan-only mode and the Planner only reads, so warning the
// operator off their own tree would be telling them something untrue.
if (PLAN_ONLY) log('Plan-only run: nothing will be written to your working tree.')
else log(`⚠ Working tree mode: the Coder edits THIS working tree directly. Avoid editing files here until the run finishes — or pass isolate: true to run in a separate worktree.`)
return await runOneFeature(singleTask, { isMulti: false })
