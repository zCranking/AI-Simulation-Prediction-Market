'use server'

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { Market, MarketOutcome, MarketType } from '../../lib/types'

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

function revalidateAll() {
  revalidatePath('/markets')
  revalidatePath('/results')
  revalidatePath('/leaderboard')
  revalidatePath('/admin')
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// ── Auth ─────────────────────────────────────────────────────

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
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  return {}
}

export async function adminLogout(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('admin_token')
}

// ── Market CRUD ──────────────────────────────────────────────

export async function createMarket(input: {
  title: string
  description: string
  marketType: MarketType
  winnersCount: number
  groupId: string | null
  status: 'draft' | 'active'
}): Promise<{ market?: Market; error?: string }> {
  await assertAdmin()
  const title = input.title.trim()
  if (!title) return { error: 'Title is required' }

  const db = getAdminClient()
  const { data, error } = await db
    .from('markets')
    .insert({
      title,
      slug: slugify(title),
      description: input.description.trim(),
      market_type: input.marketType,
      winners_count: input.marketType === 'multi_winner' ? Math.max(1, input.winnersCount) : 1,
      group_id: input.groupId,
      status: input.status,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  // Binary markets get Yes/No outcomes automatically
  if (input.marketType === 'binary') {
    await db.from('market_outcomes').insert([
      { market_id: data.id, label: 'Yes', sort_order: 0 },
      { market_id: data.id, label: 'No', sort_order: 1 },
    ])
  }

  revalidateAll()
  return { market: data as Market }
}

export async function updateMarket(
  id: string,
  input: { title: string; description: string; status: 'draft' | 'active' }
): Promise<{ error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const { error } = await db
    .from('markets')
    .update({
      title: input.title.trim(),
      description: input.description.trim(),
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['draft', 'active']) // never rewrite resolved/voided markets
  if (error) return { error: error.message }
  revalidateAll()
  return {}
}

export async function deleteMarket(id: string): Promise<{ error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  // Only drafts are deletable — anything live is resolved or voided instead
  const { error } = await db.from('markets').delete().eq('id', id).eq('status', 'draft')
  if (error) return { error: error.message }
  revalidateAll()
  return {}
}

export async function resolveMarket(
  marketId: string,
  winnerOutcomeIds: string[]
): Promise<{ error?: string; message?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const { data, error } = await db.rpc('resolve_market', {
    p_market_id: marketId,
    p_winner_outcome_ids: winnerOutcomeIds,
  })
  if (error) return { error: error.message }
  if (!data?.success) return { error: data?.message ?? 'Resolution failed' }
  revalidateAll()
  return { message: data.message }
}

export async function voidMarket(marketId: string): Promise<{ error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const { data, error } = await db.rpc('void_market', { p_market_id: marketId })
  if (error) return { error: error.message }
  if (!data?.success) return { error: data?.message ?? 'Void failed' }
  revalidateAll()
  return {}
}

// ── Outcome CRUD ─────────────────────────────────────────────

export async function addOutcome(
  formData: FormData
): Promise<{ outcome?: MarketOutcome; error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const marketId = formData.get('marketId') as string
  const label = (formData.get('label') as string)?.trim()
  const party = ((formData.get('party') as string) ?? '').trim()
  const baseProbability = Math.max(
    0,
    Math.min(100, parseFloat(formData.get('baseProbability') as string) || 0)
  )
  const file = formData.get('photo') as File | null

  if (!marketId || !label) return { error: 'Market and label are required' }

  const { data, error } = await db
    .from('market_outcomes')
    .insert({ market_id: marketId, label, party, base_probability: baseProbability })
    .select()
    .single()

  if (error) return { error: error.message }

  if (file && file.size > 0) {
    const url = await uploadPhoto(db, data.id, file)
    if (url) {
      await db.from('market_outcomes').update({ photo_url: url }).eq('id', data.id)
      data.photo_url = url
    }
  }

  revalidateAll()
  return { outcome: data as MarketOutcome }
}

export async function updateOutcome(
  id: string,
  input: { label: string; party: string; baseProbability: number }
): Promise<{ error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const { error } = await db
    .from('market_outcomes')
    .update({
      label: input.label.trim(),
      party: input.party.trim(),
      base_probability: Math.max(0, Math.min(100, input.baseProbability)),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidateAll()
  return {}
}

export async function deleteOutcome(id: string): Promise<{ error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const { error } = await db.from('market_outcomes').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateAll()
  return {}
}

export async function uploadOutcomePhoto(
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  await assertAdmin()
  const db = getAdminClient()
  const file = formData.get('photo') as File
  const outcomeId = formData.get('outcomeId') as string
  if (!file || file.size === 0) return { error: 'No file provided' }

  const url = await uploadPhoto(db, outcomeId, file)
  if (!url) return { error: 'Upload failed' }

  const { error } = await db.from('market_outcomes').update({ photo_url: url }).eq('id', outcomeId)
  if (error) return { error: error.message }

  revalidateAll()
  return { url }
}

async function uploadPhoto(
  db: ReturnType<typeof getAdminClient>,
  outcomeId: string,
  file: File
): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${outcomeId}.${ext}`
  const buffer = await file.arrayBuffer()
  const { error } = await db.storage
    .from('candidate-photos')
    .upload(path, buffer, { contentType: file.type, upsert: true })
  if (error) return null
  const {
    data: { publicUrl },
  } = db.storage.from('candidate-photos').getPublicUrl(path)
  return publicUrl
}
