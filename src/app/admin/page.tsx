import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import AdminPanel from './AdminPanel'
import type { Candidate, Prediction, ElectionSettings } from '../../lib/types'

export default async function AdminPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value

  if (!process.env.ADMIN_PASSWORD || token !== process.env.ADMIN_PASSWORD) {
    redirect('/admin/login')
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [r1, r2, r3] = await Promise.all([
    db.from('candidates').select('*').order('created_at'),
    db.from('predictions').select('candidate_id, points_allocated'),
    db.from('election_settings').select('*').eq('id', 1).single(),
  ])

  return (
    <AdminPanel
      initialCandidates={(r1.data ?? []) as Candidate[]}
      predictions={(r2.data ?? []) as Pick<Prediction, 'candidate_id' | 'points_allocated'>[]}
      electionSettings={r3.data as ElectionSettings | null}
    />
  )
}
