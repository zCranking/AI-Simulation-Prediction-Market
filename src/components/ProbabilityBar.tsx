import { partyColor } from '../lib/market'

export default function ProbabilityBar({
  probability,
  party,
}: {
  probability: number
  party: string
}) {
  const spread = probability - 50

  return (
    <div className="w-full">
      <div className="h-2 bg-gray-800 rounded-full relative overflow-hidden">

        {/* center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-gray-600" />

        {/* left/right bar */}
        <div
          className="absolute top-0 h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.abs(spread)}%`,
            left: spread >= 0 ? '50%' : `${50 - Math.abs(spread)}%`,
            backgroundColor: partyColor(party),
          }}
        />
      </div>

      <div className="text-xs text-gray-400 mt-1 text-right">
        {probability.toFixed(1)}%
      </div>
    </div>
  )
}