function tokenNumber(usage, names) {
  for (const name of names) if (Number.isFinite(usage?.[name])) return usage[name]
  return null
}

export function summarizeTokenUsage(entries = []) {
  const stages = entries.map(entry => ({
    stage: entry.stage, model: entry.model || null,
    input_tokens: tokenNumber(entry.usage, ['input_tokens', 'inputTokens']),
    cache_creation_input_tokens: tokenNumber(entry.usage, ['cache_creation_input_tokens', 'cacheCreationInputTokens']),
    cached_input_tokens: tokenNumber(entry.usage, ['cached_input_tokens', 'cachedInputTokens', 'cache_read_input_tokens', 'cacheReadInputTokens']),
    output_tokens: tokenNumber(entry.usage, ['output_tokens', 'outputTokens']),
    total_tokens: tokenNumber(entry.usage, ['total_tokens', 'totalTokens']),
  }))
  for (const stage of stages) {
    if (stage.total_tokens === null && ['input_tokens', 'cache_creation_input_tokens', 'cached_input_tokens', 'output_tokens'].every(key => stage[key] !== null)) {
      stage.total_tokens = stage.input_tokens + stage.cache_creation_input_tokens + stage.cached_input_tokens + stage.output_tokens
    }
  }
  const keys = ['input_tokens', 'cache_creation_input_tokens', 'cached_input_tokens', 'output_tokens', 'total_tokens']
  const totals = Object.fromEntries(keys.map(key => [key, stages.length && stages.every(stage => stage[key] !== null) ? stages.reduce((sum, stage) => sum + stage[key], 0) : null]))
  const measured = stages.filter(stage => keys.some(key => stage[key] !== null)).length
  return { status: measured === stages.length && stages.length ? 'measured' : measured ? 'partial' : 'unavailable', ...totals, stages }
}
