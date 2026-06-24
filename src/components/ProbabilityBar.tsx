'use client'

export default function ProbabilityBar({
  probability,
  party,
}: {
  probability: number
  party?: string
}) {
  const spread = probability - 50

  let color = '#6366f1'

  if (party?.toLowerCase().includes('whig')) {
    color = '#f59e0b'
  }

  if (party?.toLowerCase().includes('federalist')) {
    color = '#3b82f6'
  }

  return (
    <div className="w-full">
      <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
        {/* center line */}
        <div className="absolute left-1/2 top-0 h-full w-[2px] bg-white/30 z-10" />

        {/* animated spread */}
        <div
          className="absolute top-0 h-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.abs(spread)}%`,
            left:
              spread >= 0
                ? '50%'
                : `${50 - Math.abs(spread)}%`,
            backgroundColor: color,
          }}
        />
      </div>

      <div className="flex justify-between text-xs mt-1">
        <span className="text-gray-500">50%</span>

        <span
          className={`font-semibold ${
            spread >= 0
              ? 'text-green-400'
              : 'text-red-400'
          }`}
        >
          {probability.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}