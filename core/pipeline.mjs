/**
 * The shared LDO phase pipeline. Runtime-specific concerns belong in the
 * adapter passed to createAgentRunner; policy and phase ordering live here.
 */
import { createAgentRunner } from './agent-runner.mjs'

export function createPipeline({ adapter, prompt, schemas, models = {}, retries = 1, onEvent }) {
  if (typeof prompt !== 'function') throw new TypeError('prompt({ role, task, context }) is required')
  if (!schemas?.planner || !schemas?.coder || !schemas?.reviewer) throw new TypeError('planner, coder and reviewer schemas are required')

  const runAgent = createAgentRunner(adapter, { retries, onEvent })

  return async function run({ task, cwd, planOnly = false, security = 'auto' }) {
    const plan = await runAgent({
      role: 'planner', cwd, model: models.planner, schema: schemas.planner,
      prompt: prompt({ role: 'planner', task }),
    })

    const shouldRunSecurity = schemas.security && (security === true || (security === 'auto' && plan.value.security_surface === 'elevated'))
    const securityReport = shouldRunSecurity
      ? await runAgent({
        role: 'security', cwd, model: models.security, schema: schemas.security,
        prompt: prompt({ role: 'security', task, context: { plan: plan.value } }),
      })
      : null

    if (planOnly) return { task, mode: 'plan-only', plan, security: securityReport }

    let coder = await runAgent({
      role: 'coder', cwd, model: models.coder, schema: schemas.coder,
      writable: true, prompt: prompt({ role: 'coder', task, context: { plan: plan.value, security: securityReport?.value } }),
    })

    let review = await runAgent({
      role: 'reviewer', cwd, model: models.reviewer, schema: schemas.reviewer,
      prompt: prompt({ role: 'reviewer', task, context: { plan: plan.value, security: securityReport?.value, coder: coder.value } }),
    })

    if (review.value.status === 'changes_requested') {
      coder = await runAgent({
        role: 'coder', cwd, model: models.coder, schema: schemas.coder,
        writable: true, prompt: prompt({ role: 'coder', task, context: { plan: plan.value, security: securityReport?.value, coder: coder.value, review: review.value } }),
      })
      review = await runAgent({
        role: 'reviewer', cwd, model: models.reviewer, schema: schemas.reviewer,
        prompt: prompt({ role: 'reviewer', task, context: { plan: plan.value, security: securityReport?.value, coder: coder.value, previousReview: review.value } }),
      })
    }

    return { task, plan, security: securityReport, coder, review, approved: review.value.status === 'approved' }
  }
}
