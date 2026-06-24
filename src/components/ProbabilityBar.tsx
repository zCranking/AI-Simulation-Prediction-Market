import { priceToProbability } from '../lib/market'

export default function ProbabilityBar({
  price,
}: {
  price: number
}) {
  const probability = priceToProbability(price)

  return (
    <div className="w-full">
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${probability}%` }}
        />
      </div>

      <div className="text-xs text-gray-400 mt-1 text-right">
        ${price.toFixed(2)} → {probability.toFixed(1)}%
      </div>
    </div>
  )
}