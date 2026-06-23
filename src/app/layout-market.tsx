import { redirect } from 'next/navigation'
import { createClient } from '../lib/supabase/server'
import Nav from '../components/Nav'
import type { User } from '../lib/types'

export default async function MarketLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Nav user={profile as User} />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">{children}</main>
    </div>
  )
}
