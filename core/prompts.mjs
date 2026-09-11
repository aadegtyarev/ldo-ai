import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(new URL('..', import.meta.url).pathname)

export function roleInstructions(role) {
  const path = join(ROOT, 'agents', `${role}.md`)
  return readFileSync(path, 'utf8')
}

export function buildPrompt({ role, task, context }) {
  const sections = [
    `You are LDO's ${role}.`,
    'You are an LDO subagent. Do not invoke the LDO orchestrator or start another LDO pipeline; complete only this assigned role.',
    'Follow the role instructions below. Work only in the current repository.',
    '',
    '## ROLE INSTRUCTIONS',
    roleInstructions(role),
    '',
    '## TASK',
    task,
  ]
  const { isolation, ...prior } = context || {}
  if (isolation?.path && isolation?.branch) {
    sections.push('', '## ISOLATION', `Your worktree is \`${isolation.path}\` on branch \`${isolation.branch}\`. Work only there; verify it with \`git rev-parse --show-toplevel\` before writing.`)
  }
  if (Object.keys(prior).length) {
    sections.push('', '## PRIOR PHASE RESULTS', JSON.stringify(prior, null, 2))
  }
  sections.push('', 'Return only JSON that conforms to the supplied output schema. Do not wrap it in Markdown.')
  return sections.join('\n')
}

// Codex launches each role as a fresh CLI session, so every handoff is paid as
// new input. Keep the legacy builder above untouched for Claude Code; this
// projection is deliberately opt-in from the Codex runner. It removes only
// fields that the receiving role cannot act on, rather than asking a model to
// remember not to use them.
const MAX_ITEMS = 20
const MAX_TEXT = 1600

function text(value, limit = MAX_TEXT) {
  if (typeof value !== 'string') return value
  return value.length <= limit ? value : `${value.slice(0, limit)}… [truncated for handoff]`
}

function list(value, map = item => item) {
  if (!Array.isArray(value)) return []
  const items = value.slice(0, MAX_ITEMS).map(map)
  if (value.length > MAX_ITEMS) items.push(`… ${value.length - MAX_ITEMS} additional item(s) omitted from handoff`)
  return items
}

function planHandoff(plan) {
  if (!plan || typeof plan !== 'object') return plan
  const codebase = plan.codebase_context || {}
  return {
    complexity: plan.complexity,
    security_surface: plan.security_surface,
    summary: text(plan.summary),
    steps: list(plan.steps, step => ({
      what: text(step?.what), files: list(step?.files, file => text(file, 300)),
      acceptance: text(step?.acceptance), user_facing: step?.user_facing,
    })),
    risks: list(plan.risks, risk => text(risk)),
    codebase_context: {
      stack: text(codebase.stack), conventions: text(codebase.conventions),
      relevant_files: list(codebase.relevant_files, file => ({ path: text(file?.path, 300), role: text(file?.role, 120), note: text(file?.note, 500) })),
      test_command: text(codebase.test_command, 500), run_command: text(codebase.run_command, 500),
    },
  }
}

function securityHandoff(report) {
  if (!report || typeof report !== 'object') return report
  return {
    status: report.status, summary: text(report.summary), threat_model_notes: text(report.threat_model_notes),
    findings: list(report.findings, finding => ({
      severity: finding?.severity, category: finding?.category, plan_step: text(finding?.plan_step, 400),
      what: text(finding?.what), exploit_scenario: text(finding?.exploit_scenario), mitigation: text(finding?.mitigation), cwe: finding?.cwe,
    })),
  }
}

function coderHandoff(report) {
  if (!report || typeof report !== 'object') return report
  return {
    summary: text(report.summary), files_changed: list(report.files_changed, file => text(file, 300)),
    tests: report.tests && { result: text(report.tests.result, 500), command: text(report.tests.command, 500) },
    docs_updated: list(report.docs_updated, file => text(file, 300)), deviations: list(report.deviations, note => text(note)),
  }
}

function reviewHandoff(report) {
  if (!report || typeof report !== 'object') return report
  return {
    status: report.status, summary: text(report.summary),
    issues: list(report.issues, issue => ({ file: text(issue?.file, 300), severity: issue?.severity, what: text(issue?.what), suggestion: text(issue?.suggestion) })),
    verification: report.verification && {
      verdict: report.verification.verdict,
      criteria: list(report.verification.criteria, criterion => ({ criterion: text(criterion?.criterion), status: criterion?.status, evidence: text(criterion?.evidence), note: text(criterion?.note) })),
      blockers: list(report.verification.blockers, blocker => text(blocker)),
    },
    attacks: list(report.attacks, attack => ({ vector: text(attack?.vector), outcome: attack?.outcome, evidence: text(attack?.evidence) })),
  }
}

function researchHandoff(report) {
  if (!report || typeof report !== 'object') return report
  return {
    summary: text(report.summary),
    findings: list(report.findings, finding => ({ claim: text(finding?.claim), confidence: finding?.confidence, sources: list(finding?.sources, source => text(source, 500)), contradictions: text(finding?.contradictions) })),
    recommendations: list(report.recommendations, item => text(item)), gaps: list(report.gaps, item => text(item)),
  }
}

export function compactCodexContext(role, context) {
  const { isolation, research, plan, security, coder, review, previousReview } = context || {}
  const compact = isolation ? { isolation } : {}
  if (role === 'planner' && research) compact.research = researchHandoff(research)
  if (['security', 'coder', 'reviewer', 'recorder'].includes(role) && plan) compact.plan = planHandoff(plan)
  if (['coder', 'reviewer', 'recorder'].includes(role) && security) compact.security = securityHandoff(security)
  if (['reviewer', 'recorder'].includes(role) && coder) compact.coder = coderHandoff(coder)
  if (role === 'coder' && review) compact.review = reviewHandoff(review)
  if (role === 'reviewer' && previousReview) compact.previousReview = reviewHandoff(previousReview)
  if (role === 'recorder' && review) compact.review = reviewHandoff(review)
  return compact
}

export function buildCodexPrompt({ role, task, context }) {
  return buildPrompt({ role, task, context: compactCodexContext(role, context) })
}
