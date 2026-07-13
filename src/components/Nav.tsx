'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '../lib/supabase/client'
import type { User } from '../lib/types'

const links = [
  { href: '/markets', label: 'Markets' },
  { href: '/results', label: 'Results' },
  { href: '/leaderboard', label: 'Leaderboard' },
]

interface NavProps {
  user: User
}

export default function Nav({ user }: NavProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const [balance, setBalance] = useState(user.points_remaining)

  useEffect(() => {
    const channel = supabase
      .channel('nav-balance')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` },
        (payload) => setBalance((payload.new as { points_remaining: number }).points_remaining)
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, user.id])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link
            href="/markets"
            className="flex items-center gap-2 text-xl font-bold text-white tracking-tight"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-amber-500 to-indigo-600 text-xs font-black text-white">
              TU
            </span>
            Toss&#8209;Up
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(l.href)
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="hidden sm:inline-flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-white tabular-nums"
            title="Your points balance"
          >
            {balance.toLocaleString()} <span className="text-gray-500 font-normal">pts</span>
          </span>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-white">{user.name}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="flex sm:hidden border-t border-gray-800">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex-1 text-center text-xs py-2 font-medium transition-colors ${
              isActive(l.href) ? 'text-indigo-400 bg-indigo-950' : 'text-gray-400'
            }`}
          >
            {l.label}
          </Link>
        ))}
        <span className="flex-1 text-center text-xs py-2 font-semibold text-white tabular-nums">
          {balance.toLocaleString()} pts
        </span>
      </div>
    </nav>
  )
}
