'use client'

import { useState } from 'react'
import {
  calculateShares,
  calculatePayout,
} from '../lib/market'

export default function BetPanel({
  onBet,
}: {
  onBet?: (data: {
    dollars: number
    price: number
    shares: number
  }) => void
}) {
  const [dollars, setDollars] = useState(10)
  const [price, setPrice] = useState(25)
  const [winnerChance, setWinnerChance] = useState(true)

  const shares = calculateShares(dollars, price)
  const payout = calculatePayout(shares, winnerChance)

  return (
    <div className="p-4 bg-gray-900 rounded-xl border border-gray-800 space-y-3">

      <div>
        <label className="text-xs text-gray-400">Bet Amount ($)</label>
        <input
          type="number"
          value={dollars}
          min={1}
          onChange={(e) => setDollars(Number(e.target.value))}
          className="w-full mt-1 p-2 bg-gray-800 rounded text-white"
        />
      </div>

      <div>
        <label className="text-xs text-gray-400">
          Price ($5 - $50)
        </label>
        <input
          type="range"
          min={5}
          max={50}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="w-full"
        />
        <div className="text-sm text-white mt-1">
          ${price.toFixed(2)}
        </div>
      </div>

      <div className="text-sm text-gray-300 space-y-1">
        <div>Shares: {shares.toFixed(2)}</div>
        <div>If correct payout: ${payout.toFixed(2)}</div>
        <div>
          Profit: ${(payout - dollars).toFixed(2)}
        </div>
      </div>

      <button
        onClick={() =>
          onBet?.({ dollars, price, shares })
        }
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded"
      >
        Place Prediction
      </button>
    </div>
  )
}