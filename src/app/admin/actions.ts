'use server'

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { Candidate } from '../../lib/types'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function assertAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  if (!process.env.ADMIN_PASSWORD || token !== process.env.ADMIN_PASSWORD) {
    throw new Error('Unauthorized')
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function adminLogin(password: string): Promise<{ error?: string }> {
  if (!process.env.ADMIN_PASSWORD) {
    return { error: 'ADMIN_PASSWORD is not set in .env.local' }
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    return { error: 'Incorrect password' }
  }
  const cookieStore = await cookies()
  cookieStore.set('admin_token', password, {
    httpOnly: true,
    path: '/admin',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax',
  })
  return {}
}

export async function adminLogout(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('admin_token')
}

// ── Candidate CRUD ────────────────────────────────────────────────────────────

export async function updateCandidate(
  id: string,
  name: string,
  party: string,
  position: string,
  seedPoints: number
): Promise<{ error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const { error } = await db
    .from('candidates')
    .update({ name, party, position, seed_points: seedPoints })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/')
  revalidatePath('/admin')
  return {}
}

export async function uploadCandidatePhoto(
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const file = formData.get('photo') as File
  const candidateId = formData.get('candidateId') as string

  if (!file || file.size === 0) return { error: 'No file provided' }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${candidateId}.${ext}`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await db.storage
    .from('candidate-photos')
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadError) return { error: uploadError.message }

  const { data: { publicUrl } } = db.storage.from('candidate-photos').getPublicUrl(path)

  const { error: updateError } = await db
    .from('candidates')
    .update({ photo: publicUrl })
    .eq('id', candidateId)

  if (updateError) return { error: updateError.message }

  revalidatePath('/')
  revalidatePath('/admin')
  return { url: publicUrl }
}

export async function addCandidate(
  formData: FormData
): Promise<{ candidate?: Candidate; error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const name = (formData.get('name') as string)?.trim()
  const party = (formData.get('party') as string)?.trim()
  const position = (formData.get('position') as string)?.trim() ?? ''
  const seedPoints = parseInt(formData.get('seedPoints') as string) || 0
  const file = formData.get('photo') as File | null

  if (!name || !party) return { error: 'Name and party are required' }

  const { data, error } = await db
    .from('candidates')
    .insert({ name, party, photo: '', position, seed_points: seedPoints })
    .select()
    .single()

  if (error) return { error: error.message }

  // Upload photo if provided
  if (file && file.size > 0) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${data.id}.${ext}`
    const buffer = await file.arrayBuffer()
    const { error: uploadError } = await db.storage
      .from('candidate-photos')
      .upload(path, buffer, { contentType: file.type, upsert: true })

    if (!uploadError) {
      const { data: { publicUrl } } = db.storage.from('candidate-photos').getPublicUrl(path)
      await db.from('candidates').update({ photo: publicUrl }).eq('id', data.id)
      data.photo = publicUrl
    }
  }

  revalidatePath('/')
  revalidatePath('/admin')
  return { candidate: data as Candidate }
}

export async function deleteCandidate(id: string): Promise<{ error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const { error } = await db.from('candidates').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/')
  revalidatePath('/admin')
  return {}
}

export async function bulkAddCandidates(
  rows: { name: string; party: string; position?: string }[]
): Promise<{ error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const inserts = rows
    .filter((r) => r.name.trim() && r.party.trim())
    .map((r) => ({ name: r.name.trim(), party: r.party.trim(), photo: '', position: (r.position ?? '').trim(), seed_points: 0 }))

  if (inserts.length === 0) return { error: 'No valid rows to import' }

  const { error } = await db.from('candidates').insert(inserts)
  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath('/admin')
  return {}
}

// ── Election Settings ─────────────────────────────────────────────────────────

export async function updateElectionStatus(
  status: 'active' | 'resolved',
  winnerId?: string
): Promise<{ error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const payload: Record<string, unknown> = { status }
  payload.winner_candidate_id = status === 'resolved' && winnerId ? winnerId : null

  const { error } = await db.from('election_settings').update(payload).eq('id', 1)
  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath('/admin')
  return {}
}
