'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../lib/supabase/server'

export async function createGuestUser(name: string): Promise<{ email: string; password: string } | { error: string }> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return { error: 'Server is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local' }
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const email = `guest-${crypto.randomUUID()}@noreply.internal`
  const password = crypto.randomUUID()

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name.trim(), setup_completed: false },
  })

  if (error) return { error: error.message }

  return { email, password }
}

export async function ensureCurrentUserProfile(preferredName?: string): Promise<{ success: true } | { error: string }> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return { error: 'Server is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local' }
  }

  const supabase = await createServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'You must be signed in to continue.' }
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const fallbackName =
    preferredName?.trim() ||
    `${user.user_metadata?.name ?? ''}`.trim() ||
    user.email?.split('@')[0] ||
    'Anonymous'

  const { error } = await supabaseAdmin.from('users').upsert(
    {
      id: user.id,
      name: fallbackName,
      points_remaining: 1000,
    },
    { onConflict: 'id' }
  )

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}
