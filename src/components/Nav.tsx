'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '../lib/supabase/client'
import type { User } from '../lib/types'

interface NavProps {
  user: User
}

export default function Nav({ user }: NavProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const links = [
    { href: '/', label: 'Market' },
    { href: '/results', label: 'Results' },
  ]

  return (
    <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold text-white tracking-tight">
            ElectionMarket
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname === l.href
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
              pathname === l.href ? 'text-indigo-400 bg-indigo-950' : 'text-gray-400'
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
