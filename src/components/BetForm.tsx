'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase/client'

interface BetFormProps {
  candidateId: string
  candidateName: string
  electionStatus: 'active' | 'resolved'
}

export default function BetForm({
  candidateId,
  candidateName,
  electionStatus,
}: BetFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResult(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('place_prediction', {
      p_candidate_id: candidateId,
      p_points: 1,
    })

    if (error) {
      setResult({ success: false, message: error.message })
    } else {
      const r = data as { success: boolean; message: string }
      setResult({ success: r.success, message: r.message })
      if (r.success) {
        router.refresh()
      }
    }
    setLoading(false)
  }

  if (electionStatus === 'resolved') {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
        <p className="text-gray-400">The election has closed. No more predictions can be placed.</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5"
    >
      <h3 className="text-lg font-semibold text-white">Place a Prediction</h3>
      <p className="text-sm text-gray-400">
        Predict on <span className="text-white font-medium">{candidateName}</span>
      </p>

      <p className="text-sm text-gray-400">
        Submit one prediction for this candidate. You can submit again later as new information appears.
      </p>

      {result && (
        <p
          className={`text-sm rounded-lg px-4 py-2 ${
            result.success
              ? 'bg-green-950 border border-green-700 text-green-400'
              : 'bg-red-950 border border-red-800 text-red-400'
          }`}
        >
          {result.message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {loading ? 'Placing…' : `Place prediction on ${candidateName}`}
      </button>

      <p className="text-xs text-gray-500 text-center">
        Predictions are recorded immediately.
      </p>
    </form>
  )
}
