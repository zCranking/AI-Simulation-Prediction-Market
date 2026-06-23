'use server'

import { createClient } from '@supabase/supabase-js'

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
    user_metadata: { name: name.trim() },
  })

  if (error) return { error: error.message }

  return { email, password }
}
