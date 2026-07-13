import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import MarketDetail from '../../../components/MarketDetail'
import type {
  Market,
  MarketOutcome,
  PollQuestion,
  PollVote,
  AiForecast,
} from '../../../lib/types'

export const revalidate = 0

export default async function MarketPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: market } = await supabase
    .from('markets')
    .select('*')
    .eq('slug', slug)
    .single()
  if (!market || market.status === 'draft') notFound()

  const [r1, r2, r3, r4, r5, r6] = await Promise.all([
    supabase.from('market_outcomes').select('*').eq('market_id', market.id).order('sort_order'),
    supabase.from('poll_questions').select('*').eq('market_id', market.id).eq('status', 'active'),
    supabase.from('poll_votes').select('*'),
    supabase
      .from('ai_forecasts')
      .select('*')
      .eq('market_id', market.id)
      .order('created_at', { ascending: true }),
    supabase.from('users').select('points_remaining').eq('id', authUser.id).single(),
    supabase
      .from('stakes')
      .select('*')
      .eq('market_id', market.id)
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: false }),
  ])

  return (
    <MarketDetail
      market={market as Market}
      initialOutcomes={(r1.data ?? []) as MarketOutcome[]}
      pollQuestions={(r2.data ?? []) as PollQuestion[]}
      pollVotes={(r3.data ?? []) as PollVote[]}
      initialForecasts={(r4.data ?? []) as AiForecast[]}
      initialBalance={r5.data?.points_remaining ?? 0}
      initialMyStakes={(r6.data ?? []) as import('../../../lib/types').Stake[]}
      userId={authUser.id}
    />
  )
}
