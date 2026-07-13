// Spike: does the AI Analyst produce sane, differentiated probabilities?
// No DB writes — hardcoded fake markets, printed output.
//
// Usage (Vultr, preferred when set):
//   VULTR_API_KEY=...  node scripts/spike-ai-analyst.mjs
// Usage (Anthropic):
//   ANTHROPIC_API_KEY=sk-ant-...  node scripts/spike-ai-analyst.mjs
//
// Pass criteria: parseable forecast every run, probabilities sum close to 100
// (or winners*100 for multi-winner), and the large race shows real
// differentiation (not flat uniform).

const VULTR_KEY = process.env.VULTR_API_KEY
const VULTR_BASE = process.env.VULTR_BASE_URL ?? 'https://api.vultrinference.com/v1/'
const VULTR_MODEL = process.env.VULTR_LLM_MODEL ?? 'deepseek-ai/DeepSeek-V4-Flash'
const ANTHROPIC_MODEL = process.env.SPIKE_MODEL ?? 'claude-haiku-4-5'

if (!VULTR_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.error('Set VULTR_API_KEY or ANTHROPIC_API_KEY first')
  process.exit(1)
}
const MODEL = VULTR_KEY ? VULTR_MODEL : ANTHROPIC_MODEL

const fakeMarkets = [
  {
    title: 'Will it rain on graduation day?',
    type: 'binary',
    winners: 1,
    outcomes: [
      { id: 'yes', label: 'Yes', points: 120 },
      { id: 'no', label: 'No', points: 480 },
    ],
  },
  {
    title: 'Governor — State Primary',
    type: 'single_winner',
    winners: 1,
    outcomes: [
      { id: 'a', label: 'Emma Quintero (Whig)', points: 300 },
      { id: 'b', label: 'Lisa Borowik (Federalist)', points: 150 },
      { id: 'c', label: 'John Han (Whig)', points: 40 },
      { id: 'd', label: 'Leo Le (Federalist)', points: 10 },
      { id: 'e', label: 'Isabel Shen (Whig)', points: 0 },
    ],
  },
  {
    title: 'Supreme Court Justice — top 7 of 20 win',
    type: 'multi_winner',
    winners: 7,
    outcomes: Array.from({ length: 20 }, (_, i) => ({
      id: `j${i}`,
      label: `Justice Candidate ${i + 1}`,
      points: Math.max(0, Math.round(200 * Math.exp(-i / 4))),
    })),
  },
]

// Mirrors extractForecastJson in src/lib/ai.ts
function extractJson(text) {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1))
    return Array.isArray(parsed?.outcomes) ? parsed : null
  } catch {
    return null
  }
}

async function callVultr(prompt) {
  const res = await fetch(`${VULTR_BASE}chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${VULTR_KEY}`, 'Content-Type': 'application/json' },
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
  if (!res.ok) throw new Error(`Vultr ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json()
  return extractJson(body?.choices?.[0]?.message?.content ?? '')
}

async function callAnthropic(prompt) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 8192,
    tools: [
      {
        name: 'submit_forecast',
        description: 'Submit your probability forecast for every outcome.',
        strict: true,
        input_schema: {
          type: 'object',
          properties: {
            outcomes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  outcome_id: { type: 'string' },
                  probability: { type: 'number' },
                  rationale: { type: 'string' },
                },
                required: ['outcome_id', 'probability', 'rationale'],
                additionalProperties: false,
              },
            },
          },
          required: ['outcomes'],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_forecast' },
    messages: [
      { role: 'user', content: `${prompt}\n\nCall submit_forecast exactly once with all outcomes.` },
    ],
  })
  const toolUse = response.content.find((b) => b.type === 'tool_use')
  return toolUse?.input ?? null
}

for (const market of fakeMarkets) {
  const expectedSum = market.winners * 100
  const lines = market.outcomes
    .map((o) => `- id: ${o.id} | ${o.label} | points staked: ${o.points}`)
    .join('\n')
  const prompt = `You are the "AI Analyst" for a simulated, points-based prediction market (educational game with fictional people — do not research them).

Market: ${market.title}
Type: ${market.type}${market.type === 'multi_winner' ? ` (top ${market.winners} all win — probabilities should sum to ~${expectedSum})` : ' (one winner — probabilities should sum to ~100)'}

Outcomes:
${lines}

Give an independent win probability (0-100) and 1-2 sentence rationale for EVERY outcome. Weigh the stake distribution as evidence but apply your own judgment.`

  console.log(`\n=== ${market.title} (${MODEL}) ===`)
  const started = Date.now()
  let forecast
  try {
    forecast = VULTR_KEY ? await callVultr(prompt) : await callAnthropic(prompt)
  } catch (err) {
    console.error(`  FAIL: ${err.message}`)
    continue
  }
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  if (!forecast) {
    console.error('  FAIL: no parseable forecast')
    continue
  }
  const entries = forecast.outcomes
  const sum = entries.reduce((s, e) => s + e.probability, 0)
  const covered = entries.length === market.outcomes.length
  const probs = entries.map((e) => e.probability)
  const spread = Math.max(...probs) - Math.min(...probs)

  console.log(`  ${elapsed}s | ${entries.length}/${market.outcomes.length} outcomes | sum=${sum.toFixed(1)} (expect ~${expectedSum}) | spread=${spread.toFixed(1)}`)
  for (const e of entries.slice(0, 5)) {
    console.log(`  ${e.probability.toFixed(1).padStart(5)}%  ${e.outcome_id}  — ${e.rationale.slice(0, 90)}`)
  }
  if (!covered) console.error('  FAIL: missing outcomes')
  if (Math.abs(sum - expectedSum) > expectedSum * 0.5) console.error('  WARN: sum far from expected')
  if (spread < 2) console.error('  WARN: nearly uniform — no differentiation')
}
