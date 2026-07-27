export const meta = {
  name: 'ldo',
  description: 'Lightweight Dev Orchestrator: [Bootstrap→][Research→]Plan→[Security→]Code⇄Review',
  phases: [
    { title: 'Bootstrap', detail: 'Greenfield: research the space, pick a stack, draft a roadmap' },
    { title: 'Research', detail: 'Multi-source web research (opt-in)' },
    { title: 'Plan', detail: 'Read the codebase, plan the change, rate complexity + security surface' },
    { title: 'Security', detail: 'Threat-model the plan before code exists (elevated surface only)' },
    { title: 'Code', detail: 'Set up env, implement, test, document' },
    { title: 'Review', detail: 'Read the diff, drive the app, prove the criteria' },
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
    risks: { type: 'array', items: { type: 'string' } },
    rollback_plan: { type: 'string' },
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
        pre_existing_failures: { type: 'array', items: { type: 'string' } },
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
  },
  required: ['status', 'summary'],
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

const BOOTSTRAP_SCHEMA = {
  type: 'object',
  properties: {
    idea: {
      type: 'object',
      properties: { one_liner: {}, problem: {}, audience: {}, mvp_scope: {} },
      required: ['one_liner', 'problem'],
    },
    research: {
      type: 'object',
      properties: {
        similar_open_source: { type: 'array', items: { type: 'object', properties: { name: {}, url: {}, strengths: {}, gaps: {} }, required: ['name', 'url'] } },
        commercial_competitors: { type: 'array', items: { type: 'object', properties: { name: {}, url: {}, strengths: {}, gaps: {} }, required: ['name', 'url'] } },
      },
    },
    stack: {
      type: 'object',
      properties: {
        language: { type: 'object', properties: { choice: {}, rationale: {}, alternative: {} } },
        framework: { type: 'object', properties: { choice: {}, rationale: {}, alternative: {} } },
        database: { type: 'object', properties: { choice: {}, rationale: {}, alternative: {} } },
        infrastructure: { type: 'object', properties: { choice: {}, rationale: {} } },
        key_libraries: { type: 'array', items: { type: 'object', properties: { name: {}, purpose: {} } } },
      },
    },
    roadmap: { type: 'array', items: { type: 'object', properties: { phase: {}, deliverables: { type: 'array', items: { type: 'string' } } }, required: ['phase', 'deliverables'] } },
    risks: { type: 'array', items: { type: 'string' } },
    next_action: { type: 'string' },
  },
  required: ['idea', 'roadmap', 'next_action'],
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
  if (plan.risks?.length) {
    lines.push('', '### Risks')
    plan.risks.forEach(r => lines.push(`- ${r}`))
  }
  if (plan.rollback_plan) lines.push('', '### Rollback', plan.rollback_plan)
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
  const t = [...(r.tests?.written || []), ...(r.tests?.updated || [])]
  if (t.length) lines.push(`**Test files**: ${t.join(', ')}`)
  if (r.tests?.pre_existing_failures?.length) lines.push(`**Pre-existing failures**: ${r.tests.pre_existing_failures.join('; ')}`)
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
      lines.push(`${i + 1}. [${f.severity}] ${f.category}: ${f.what}`)
      lines.push(`   Mitigation: ${f.mitigation}`)
    })
    return lines.join('\n') + '\n\n'
  }
  if (!sec && plan?.security_notes?.length && plan.security_surface !== 'none') {
    return '## SECURITY NOTES (handle these carefully)\n'
      + plan.security_notes.map(n => `- ${n}`).join('\n') + '\n\n'
  }
  return ''
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

function renderBlueprint(bp) {
  const lines = ['## PROJECT BLUEPRINT', bp.idea?.one_liner || '', '']
  if (bp.idea?.mvp_scope) lines.push(`**MVP scope**: ${bp.idea.mvp_scope}`, '')
  const stack = []
  if (bp.stack?.language?.choice) stack.push(`language: ${bp.stack.language.choice}`)
  if (bp.stack?.framework?.choice) stack.push(`framework: ${bp.stack.framework.choice}`)
  if (bp.stack?.database?.choice) stack.push(`database: ${bp.stack.database.choice}`)
  if (bp.stack?.infrastructure?.choice) stack.push(`infra: ${bp.stack.infrastructure.choice}`)
  if (stack.length) lines.push(`**Stack**: ${stack.join(', ')}`, '')
  if (bp.stack?.key_libraries?.length) lines.push(`**Key libraries**: ${bp.stack.key_libraries.map(l => l.name).join(', ')}`, '')
  const phase0 = bp.roadmap?.[0]
  if (phase0) {
    lines.push(`**${phase0.phase}**`)
    phase0.deliverables.forEach(d => lines.push(`- ${d}`))
    lines.push('')
  }
  if (bp.risks?.length) lines.push(`**Risks**: ${bp.risks.join('; ')}`, '')
  return lines.join('\n')
}

// ═══════════════════════════════════════════
// MODEL ROUTING
// ═══════════════════════════════════════════

// Six roles, and the reason the protocol exists: Reviewer can run on a stronger
// model than Coder. Model names mean whatever your setup routes them to — no
// assumption is made about which is more capable.
const DEFAULT_MODELS = {
  trivial: { planner: 'sonnet', coder: 'sonnet', reviewer: 'opus', security: 'opus', researcher: 'sonnet', bootstrapper: 'opus' },
  medium:  { planner: 'sonnet', coder: 'sonnet', reviewer: 'opus', security: 'opus', researcher: 'opus',   bootstrapper: 'opus' },
  complex: { planner: 'opus',   coder: 'sonnet', reviewer: 'opus', security: 'opus', researcher: 'opus',   bootstrapper: 'opus' },
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

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

const CONFIG = args?.config || {}
const MAX_FIX_LOOPS = CONFIG.maxFixLoops || 3
const BLOCKING_SEVERITIES = CONFIG.blockingSeverities || ['critical', 'major']
const MODE = args?.mode || 'brownfield'
const DO_RESEARCH = args?.research ?? CONFIG.researchByDefault ?? false

// Security is gated on attack surface, not task size — a one-line change to an
// auth check is trivial work with elevated risk. The Planner rates this; the
// dedicated agent runs only when that rating is `elevated`.
function securityEnabled(plan) {
  if (args?.security !== undefined) return args.security
  if (CONFIG.securityByDefault !== undefined) return CONFIG.securityByDefault
  return plan.security_surface === 'elevated'
}

const prePlanModels = routeModels(MODE === 'greenfield' ? 'complex' : 'medium', CONFIG)

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

let task = args?.task || (typeof args === 'string' ? args : null)

if (!task) {
  log('ERROR: No task provided. Workflow({name:"ldo", args:{task:"..."}})')
  return { error: 'No task provided' }
}

log(`Mode: ${MODE}  |  Budget: ${budget.total ? Math.round(budget.remaining() / 1000) + 'k' : 'unlimited'}`)
log(`Task: ${task.slice(0, 200)}${task.length > 200 ? '...' : ''}`)

// ── BOOTSTRAP (greenfield only) ─────────────

let blueprint = null

if (MODE === 'greenfield') {
  phase('Bootstrap')

  blueprint = await agentWithRetry(
    `Turn this idea into a concrete, researched project blueprint.\n\n## IDEA\n${task}`,
    { label: 'bootstrapper', phase: 'Bootstrap', model: prePlanModels.bootstrapper, agentType: 'bootstrapper', schema: BOOTSTRAP_SCHEMA }
  )

  if (!blueprint) {
    log('ERROR: Bootstrapper failed.')
    return { error: 'Bootstrapper failed' }
  }

  log(`Blueprint: ${blueprint.idea?.one_liner || '?'}`)
  log(`Stack: ${blueprint.stack?.language?.choice || '?'} + ${blueprint.stack?.framework?.choice || '?'}`)
  log(`Next: ${blueprint.next_action || '?'}`)

  task = `${renderBlueprint(blueprint)}## FIRST TASK\n${blueprint.next_action || 'Scaffold Phase 0: repo, CI, basic structure.'}`
}

// ── RESEARCH (opt-in) ───────────────────────

let researchReport = null

if (DO_RESEARCH) {
  phase('Research')

  researchReport = await agent(
    `Deep-research this topic. Cross-verify claims across independent sources.\n\n## TOPIC\n${task}`,
    { label: 'researcher', phase: 'Research', model: prePlanModels.researcher, agentType: 'researcher', schema: RESEARCH_SCHEMA }
  )

  if (researchReport) {
    const high = researchReport.findings?.filter(f => f.confidence === 'high').length || 0
    log(`Research: ${researchReport.findings?.length || 0} findings (${high} high-confidence), ${researchReport.recommendations?.length || 0} recommendations`)
  } else {
    log('⚠ Research returned nothing — proceeding without it.')
  }
}

// ── PLAN ────────────────────────────────────

phase('Plan')

const plan = await agentWithRetry(
  renderResearch(researchReport) + `Read the codebase and plan this task.\n\n## TASK\n${task}`,
  { label: 'planner', phase: 'Plan', model: prePlanModels.planner, agentType: 'planner', schema: PLAN_SCHEMA }
)

if (!plan) {
  log('ERROR: Planner failed.')
  return { error: 'Planner failed' }
}

const models = routeModels(plan.complexity, CONFIG)
const CTX = renderContext(plan.codebase_context)
const surface = plan.security_surface || 'unrated'
const DO_SECURITY = securityEnabled(plan)

log(`Complexity: ${plan.complexity}  |  Security surface: ${surface}  |  Coder:${models.coder}  Reviewer:${models.reviewer}`)
if (surface !== 'none' && plan.security_notes?.length) {
  plan.security_notes.forEach(n => log(`  ⚠ ${n}`))
}
log(`Plan: ${plan.steps.length} step(s), ${plan.codebase_context?.relevant_files?.length || 0} files mapped`)
plan.steps.forEach(s => log(`  • ${s.what}`))

// ── SECURITY (elevated surface only) ────────

let securityReport = null

if (DO_SECURITY) {
  phase('Security')

  const flagged = plan.security_notes?.length
    ? `\n\n## SURFACE THE PLANNER FLAGGED\n${plan.security_notes.map(n => `- ${n}`).join('\n')}\n\nStart from these, then look for what the Planner missed.`
    : ''

  securityReport = await agent(
    CTX + `Threat-model this implementation plan. No code exists yet — identify risks before they are written.\n\n${renderPlan(plan)}${flagged}`,
    { label: 'security', phase: 'Security', model: models.security, agentType: 'security', schema: SECURITY_SCHEMA }
  )

  if (securityReport) {
    log(`Security: ${securityReport.status} — ${securityReport.summary}`)
    securityReport.findings?.forEach(f => log(`  [${f.severity}] ${f.category}: ${f.what}`))
  } else {
    log('⚠ Security returned nothing — proceeding without threat model.')
  }
}

const SECURITY_BLOCK = renderSecurity(securityReport, plan)

// ── CODE ⇄ REVIEW ───────────────────────────

let iteration = 0
let reviewIssues = []
let finalVerdict = null
let lastIssues = []

while (iteration < MAX_FIX_LOOPS) {
  const isFirstPass = iteration === 0

  phase('Code')

  const coderPrompt = isFirstPass
    ? CTX + SECURITY_BLOCK + `Set up the environment, then execute this plan. The PROJECT CONTEXT above is your map — don't re-scan the repo.\n\n${renderPlan(plan)}`
    : `Fix the review issues below. Narrow pass — touch only these files.\n\n## ISSUES\n${reviewIssues.map((iss, i) => `${i + 1}. [${iss.severity}] ${iss.file}: ${iss.what}\n   → ${iss.suggestion}`).join('\n\n')}\n\n## PLAN (context)\n${renderPlanCompact(plan)}`

  const coderResult = await agent(coderPrompt, {
    label: isFirstPass ? 'coder' : `coder-fix-${iteration}`,
    phase: 'Code',
    model: models.coder,
    agentType: 'coder',
    schema: CODER_SCHEMA,
  })

  if (coderResult?.tests?.result) log(`Coder pass ${iteration + 1}: ${coderResult.tests.result}`)
  else log(`Coder pass ${iteration + 1} complete`)
  if (coderResult?.env?.unresolved?.length) log(`  ⚠ Env: ${coderResult.env.unresolved.join('; ')}`)

  phase('Review')

  const reviewerPrompt = isFirstPass
    ? CTX + SECURITY_BLOCK + `Review this implementation against the plan, then drive the app to prove the acceptance criteria.\n\n${renderPlan(plan)}\n\n## CODER'S SUMMARY\n${renderCoderSummary(coderResult)}`
    : `Verify these fixes landed, and scan for new problems introduced by them.\n\n## ISSUES TO VERIFY\n${reviewIssues.map((iss, i) => `${i + 1}. [${iss.severity}] ${iss.file}: ${iss.what}`).join('\n')}\n\n## CODER'S FIX SUMMARY\n${renderCoderSummary(coderResult)}`

  const verdict = await agent(reviewerPrompt, {
    label: isFirstPass ? 'reviewer' : `reviewer-${iteration}`,
    phase: 'Review',
    model: models.reviewer,
    agentType: 'reviewer',
    schema: VERDICT_SCHEMA,
  })

  if (!verdict) {
    log('ERROR: Reviewer failed.')
    return { error: 'Reviewer failed', plan }
  }

  const v = verdict.verification
  if (v) {
    const passed = v.criteria?.filter(c => c.status === 'passed').length || 0
    const total = v.criteria?.length || 0
    log(`Verification: ${v.verdict}${total ? ` — ${passed}/${total} criteria proven` : ''}`)
    v.criteria?.filter(c => c.status === 'failed').forEach(c => log(`  ✗ ${c.criterion}`))
    if (v.blockers?.length) log(`  ⚠ Blockers: ${v.blockers.join('; ')}`)
  }

  lastIssues = verdict.issues || []

  if (verdict.status === 'approved') {
    finalVerdict = verdict
    log(`✓ APPROVED — ${verdict.summary}`)
    break
  }

  // Only critical/major buy another pass; minor and nit ride along in the report
  const blocking = lastIssues.filter(i => BLOCKING_SEVERITIES.includes(i.severity))
  const advisory = lastIssues.filter(i => !BLOCKING_SEVERITIES.includes(i.severity))

  log(`✗ ${lastIssues.length} issue(s): ${blocking.length} blocking, ${advisory.length} advisory`)
  lastIssues.forEach(iss => log(`  [${iss.severity}] ${iss.file}: ${iss.what}`))

  if (blocking.length === 0) {
    finalVerdict = { ...verdict, status: 'approved', summary: `${verdict.summary} (${advisory.length} advisory issue(s) left unfixed)` }
    log('✓ APPROVED — no blocking issues remain')
    break
  }

  reviewIssues = blocking
  iteration++
}

if (!finalVerdict) {
  log(`⚠ Max fix loops (${MAX_FIX_LOOPS}) exhausted.`)
  finalVerdict = { status: 'changes_requested', summary: `Max ${MAX_FIX_LOOPS} fix iterations reached.`, issues: lastIssues }
}

// ── RESULT ──────────────────────────────────

return {
  task: MODE === 'greenfield' ? { original_idea: args?.task, blueprint } : task,
  plan,
  verdict: finalVerdict,
  researchReport,
  securityReport,
  stats: {
    complexity: plan.complexity,
    securitySurface: surface,
    securityStatus: securityReport?.status || 'not_run',
    models,
    coder_passes: iteration + 1,
    approved: finalVerdict.status === 'approved',
    verification: finalVerdict.verification?.verdict || 'not_run',
    researched: !!researchReport,
    files_mapped: plan.codebase_context?.relevant_files?.length || 0,
  },
}
