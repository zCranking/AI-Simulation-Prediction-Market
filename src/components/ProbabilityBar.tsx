'use client'

interface ProbabilityBarProps {
  probability: number
  party: string
  animated?: boolean
}

function partyBarColor(party: string): string {
  const p = party.toLowerCase()
  if (p.includes('whig')) return 'bg-amber-500'
  if (p.includes('federalist')) return 'bg-blue-500'
  return 'bg-indigo-500'
}

export default function ProbabilityBar({ probability, party, animated = true }: ProbabilityBarProps) {
  const pct = Math.round(probability * 10) / 10

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm font-medium">
        <span className="text-gray-400">Chance of winning</span>
        <span className="text-white tabular-nums">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${partyBarColor(party)} ${animated ? 'transition-all duration-700 ease-out' : ''}`}
          style={{ width: `${Math.max(pct, 0.5)}%` }}
        />
      </div>
    </div>
  )
}

