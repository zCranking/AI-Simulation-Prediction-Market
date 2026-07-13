import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import type { LeaderboardEntry } from '../../lib/types'

export const revalidate = 30

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data } = await supabase.rpc('get_leaderboard_v2')
  const entries = ((data ?? []) as LeaderboardEntry[])
    .filter((e) => e.prediction_count > 0 || e.participant_type === 'ai')
    .sort((a, b) => {
      // Scored entries first (lower Brier = better), then by prediction count
      if (a.brier_score !== null && b.brier_score !== null) return a.brier_score - b.brier_score
      if (a.brier_score !== null) return -1
      if (b.brier_score !== null) return 1
      return b.prediction_count - a.prediction_count
    })

  const anyScored = entries.some((e) => e.brier_score !== null)

  return (
    <div className="py-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          Accuracy is scored with a Brier score once markets resolve — lower is better. The 🤖 AI
          Analyst competes on the same terms as everyone else.
        </p>
      </div>

      {!anyScored && (
        <div className="bg-blue-950/30 border border-blue-700/50 rounded-2xl p-4 text-sm text-blue-200">
          No markets have resolved yet — accuracy scores appear once the first market is resolved.
          Until then, entries are ranked by predictions placed.
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3 w-12">#</th>
              <th className="px-4 py-3">Forecaster</th>
              <th className="px-4 py-3 text-right">Predictions</th>
              <th className="px-4 py-3 text-right">Points</th>
              <th className="px-4 py-3 text-right">Brier score</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const isAi = e.participant_type === 'ai'
              const isMe = e.id === authUser.id
              return (
                <tr
                  key={e.id ?? 'ai-analyst'}
                  className={`border-b border-gray-800/50 last:border-0 ${
                    isAi ? 'bg-purple-950/20' : isMe ? 'bg-indigo-950/20' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-gray-500 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3">
                    <span className="text-white font-medium">
                      {isAi ? '🤖 ' : ''}
                      {e.name}
                      {isMe ? ' (you)' : ''}
                    </span>
                    {isAi && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded-md bg-purple-900/50 text-purple-300 border border-purple-700">
                        AI
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums">
                    {e.prediction_count}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums">
                    {e.points_remaining !== null ? e.points_remaining.toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {e.brier_score !== null ? (
                      <span className="text-white font-semibold">{e.brier_score.toFixed(3)}</span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  Nobody has placed a prediction yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
