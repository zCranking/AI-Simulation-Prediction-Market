import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { Market, MarketOutcome } from './types'

export const AI_MODELS = {
  fast: 'claude-haiku-4-5', // cheap scheduled forecasts (cron)
  deep: 'claude-sonnet-5', // admin-triggered deep analysis
} as const
export type AiModelKey = keyof typeof AI_MODELS

// Provider selection: Vultr Serverless Inference (OpenAI-compatible, free
// tier) wins when its key is set; otherwise Anthropic. Same pattern as the
// Signal-to-Ticket-Agent project.
const VULTR_BASE_URL = process.env.VULTR_BASE_URL ?? 'https://api.vultrinference.com/v1/'
const VULTR_MODEL = process.env.VULTR_LLM_MODEL ?? 'deepseek-ai/DeepSeek-V4-Flash'

export function aiProvider(): 'vultr' | 'anthropic' | null {
  if (process.env.VULTR_API_KEY) return 'vultr'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  return null
}

// ponytail: raw service-role client (same pattern as admin/actions.ts) — the
// forecast writer bypasses RLS on purpose; ai_forecasts has no write policies.
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const forecastTool: Anthropic.Messages.Tool = {
  name: 'submit_forecast',
  description:
    'Submit your probability forecast for every outcome in this prediction market.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      outcomes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            outcome_id: { type: 'string', description: 'The outcome id, exactly as given' },
            probability: {
              type: 'number',
              description: 'Win probability for this outcome, 0-100',
            },
            rationale: {
              type: 'string',
              description: 'One or two sentences justifying this probability',
            },
          },
          required: ['outcome_id', 'probability', 'rationale'],
          additionalProperties: false,
        },
      },
    },
    required: ['outcomes'],
    additionalProperties: false,
  },
}

interface ForecastInput {
  outcomes: { outcome_id: string; probability: number; rationale: string }[]
}

function buildPrompt(market: Market, outcomes: MarketOutcome[], pollSummary: string): string {
  const raceTotal = outcomes.reduce((s, o) => s + o.total_points, 0)
  const lines = outcomes.map((o) => {
    const share = raceTotal > 0 ? ((o.total_points / raceTotal) * 100).toFixed(1) : 'n/a'
    return `- id: ${o.id} | ${o.label}${o.party ? ` (${o.party})` : ''} | points staked: ${o.total_points} (${share}% of volume) | admin prior: ${o.base_probability || 'none'}`
  })

  return [
    `You are the "AI Analyst" for a simulated, points-based prediction market (an educational game — outcomes may involve fictional people or events; do not attempt to research them as real-world entities).`,
    ``,
    `Market: ${market.title}`,
    market.description ? `Description: ${market.description}` : '',
    `Type: ${market.market_type}${market.market_type === 'multi_winner' ? ` (top ${market.winners_count} outcomes all win)` : ' (exactly one outcome wins)'}`,
    ``,
    `Outcomes and current crowd activity:`,
    ...lines,
    pollSummary ? `\nCommunity poll signal:\n${pollSummary}` : '',
    ``,
    `Produce your own independent win probability (0-100) for EVERY outcome listed, with a short rationale each. Weigh the crowd's stake distribution and poll signal as evidence but do not simply copy them — apply your own judgment about momentum, concentration, and uncertainty. ${
      market.market_type === 'multi_winner'
        ? `Probabilities are per-outcome chances of finishing in the top ${market.winners_count}, so they should sum to roughly ${market.winners_count * 100}.`
        : `Probabilities across outcomes should sum to roughly 100.`
    }`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Pull a ForecastInput out of a free-text completion (Vultr path). Tolerates
    <think> blocks, code fences, and prose around the JSON. */
function extractForecastJson(text: string): ForecastInput | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1))
    if (!Array.isArray(parsed?.outcomes)) return null
    return parsed as ForecastInput
  } catch {
    return null
  }
}

/** One forecast call, provider-dependent. Returns the forecast and the model
    string to record on the rows. */
async function callModel(
  prompt: string,
  modelKey: AiModelKey
): Promise<{ forecast: ForecastInput; model: string } | { error: string }> {
  if (aiProvider() === 'vultr') {
    const callVultr = () =>
      fetch(`${VULTR_BASE_URL}chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.VULTR_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: VULTR_MODEL,
          max_tokens: 8192,
          temperature: 0.2,
          messages: [
            {
              role: 'user',
              content: `${prompt}\n\nRespond with ONLY a JSON object, no other text, in exactly this shape:\n{"outcomes":[{"outcome_id":"<id exactly as given>","probability":<number 0-100>,"rationale":"<1-2 sentences>"}]}\nInclude one entry per outcome.`,
            },
          ],
        }),
      })

    let res = await callVultr()
    // Vultr's serverless inference cold-starts on the first request after
    // idle, which the gateway surfaces as a 502/503/504 — one retry almost
    // always lands on the now-warm instance.
    if (!res.ok && [502, 503, 504].includes(res.status)) {
      res = await callVultr()
    }
    if (!res.ok) {
      return { error: `Vultr API error: ${res.status} ${(await res.text()).slice(0, 300)}` }
    }
    const body = await res.json()
    const text: string = body?.choices?.[0]?.message?.content ?? ''
    const forecast = extractForecastJson(text)
    if (!forecast) return { error: 'Vultr response contained no parseable forecast JSON' }
    return { forecast, model: VULTR_MODEL }
  }

  // Anthropic path — strict forced tool use, always parseable
  const model = AI_MODELS[modelKey]
  const anthropic = new Anthropic()
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    tools: [forecastTool],
    tool_choice: { type: 'tool', name: 'submit_forecast' },
    messages: [
      { role: 'user', content: `${prompt}\n\nCall submit_forecast exactly once with all outcomes.` },
    ],
  })
  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use'
  )
  if (!toolUse) return { error: 'Model returned no forecast' }
  return { forecast: toolUse.input as ForecastInput, model }
}

export interface ForecastResult {
  success: boolean
  message: string
  forecasts?: number
}

/** Generate + persist an AI forecast for one market. */
export async function forecastMarket(
  marketId: string,
  modelKey: AiModelKey = 'fast'
): Promise<ForecastResult> {
  if (!aiProvider()) {
    return { success: false, message: 'Set VULTR_API_KEY or ANTHROPIC_API_KEY to enable the AI Analyst' }
  }

  const db = serviceClient()

  const [{ data: market }, { data: outcomes }, { data: questions }, { data: votes }] =
    await Promise.all([
      db.from('markets').select('*').eq('id', marketId).single(),
      db.from('market_outcomes').select('*').eq('market_id', marketId).order('sort_order'),
      db.from('poll_questions').select('id, title').eq('market_id', marketId).eq('status', 'active'),
      db.from('poll_votes').select('question_id, outcome_id'),
    ])

  if (!market) return { success: false, message: 'Market not found' }
  if (market.status !== 'active') return { success: false, message: 'Market is not active' }
  if (!outcomes || outcomes.length < 2) {
    return { success: false, message: 'Market needs at least 2 outcomes' }
  }

  // Per-question vote tallies by outcome label, for the poll-signal section
  const outcomeById = new Map((outcomes as MarketOutcome[]).map((o) => [o.id, o]))
  const pollSummary = (questions ?? [])
    .map((q) => {
      const qVotes = (votes ?? []).filter((v) => v.question_id === q.id && v.outcome_id)
      if (qVotes.length === 0) return null
      const counts = new Map<string, number>()
      for (const v of qVotes) {
        const label = outcomeById.get(v.outcome_id!)?.label
        if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
      }
      const tally = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, n]) => `${label}: ${n}`)
        .join(', ')
      return `- "${q.title}" (${qVotes.length} votes): ${tally}`
    })
    .filter(Boolean)
    .join('\n')

  const prompt = buildPrompt(market as Market, outcomes as MarketOutcome[], pollSummary)

  let forecast: ForecastInput
  let model: string
  try {
    const result = await callModel(prompt, modelKey)
    if ('error' in result) return { success: false, message: result.error }
    forecast = result.forecast
    model = result.model
  } catch (err) {
    return { success: false, message: `AI API error: ${(err as Error).message}` }
  }

  // Validate: every entry maps to a real outcome, every outcome covered
  const entries = forecast.outcomes.filter((e) => outcomeById.has(e.outcome_id))
  if (entries.length !== outcomes.length) {
    return {
      success: false,
      message: `Forecast covered ${entries.length}/${outcomes.length} outcomes — rejected`,
    }
  }

  // Renormalize so probabilities sum to the expected total
  const expectedSum = market.market_type === 'multi_winner' ? market.winners_count * 100 : 100
  const rawSum = entries.reduce((s, e) => s + Math.max(0, e.probability), 0)
  const scale = rawSum > 0 ? expectedSum / rawSum : 0
  if (scale === 0) return { success: false, message: 'Forecast probabilities were all zero' }

  const rows = entries.map((e) => ({
    market_id: marketId,
    outcome_id: e.outcome_id,
    probability: Math.round(Math.min(100, Math.max(0, e.probability * scale)) * 10) / 10,
    rationale: e.rationale.slice(0, 1000),
    model,
    input_snapshot: { prompt_market: market.title, raw_sum: rawSum } as const,
  }))

  const { error } = await db.from('ai_forecasts').insert(rows)
  if (error) return { success: false, message: `Failed to save forecast: ${error.message}` }

  return { success: true, message: `Forecast saved (${model})`, forecasts: rows.length }
}

/** Forecast all active markets, in small chunks to respect rate limits. */
export async function forecastAllActiveMarkets(): Promise<{
  processed: number
  failed: { marketId: string; message: string }[]
}> {
  const db = serviceClient()
  const { data: markets } = await db.from('markets').select('id').eq('status', 'active')

  const failed: { marketId: string; message: string }[] = []
  let processed = 0

  const CHUNK = 3
  const ids = (markets ?? []).map((m) => m.id)
  for (let i = 0; i < ids.length; i += CHUNK) {
    const results = await Promise.allSettled(
      ids.slice(i, i + CHUNK).map((id) => forecastMarket(id, 'fast'))
    )
    results.forEach((r, j) => {
      const marketId = ids[i + j]
      if (r.status === 'fulfilled' && r.value.success) processed++
      else {
        failed.push({
          marketId,
          message: r.status === 'fulfilled' ? r.value.message : String(r.reason),
        })
      }
    })
  }

  return { processed, failed }
}
