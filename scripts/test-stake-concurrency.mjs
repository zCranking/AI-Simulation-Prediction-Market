// Regression test: place_stake must not allow overspending under
// concurrent calls. Fires N concurrent stakes that together exceed
// the user's balance and asserts exactly the affordable number succeed.
//
// Usage (PowerShell):
//   $env:SUPABASE_URL='https://xxx.supabase.co'
//   $env:SUPABASE_ANON_KEY='...'
//   $env:TEST_OUTCOME_ID='<uuid of an outcome on an ACTIVE market>'
//   node scripts/test-stake-concurrency.mjs
//
// The script signs up a throwaway user (balance 1000 via the
// handle_new_user trigger) and stakes 100 x 20 concurrently.
// Expected: exactly 10 succeed, final balance exactly 0.
// Cleanup of the throwaway user/stakes is manual (or via admin SQL).

import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const outcomeId = process.env.TEST_OUTCOME_ID

if (!url || !anonKey || !outcomeId) {
  console.error('Set SUPABASE_URL, SUPABASE_ANON_KEY, TEST_OUTCOME_ID')
  process.exit(1)
}

const email = process.env.TEST_EMAIL ?? `stake-test-${crypto.randomUUID()}@gmail.com`
const password = process.env.TEST_PASSWORD ?? crypto.randomUUID()

const supabase = createClient(url, anonKey)

let session
if (process.env.TEST_EMAIL) {
  // Re-running against an already-confirmed test user
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    console.error('signIn failed:', error.message)
    process.exit(1)
  }
  session = data
} else {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: 'Concurrency Test' } },
  })
  if (error) {
    console.error('signUp failed:', error.message)
    process.exit(1)
  }
  if (!data.session) {
    console.error(
      'No session returned (email confirmation required). Confirm via SQL:\n' +
        `  UPDATE auth.users SET email_confirmed_at = now() WHERE email = '${email}';\n` +
        'then re-run with TEST_EMAIL and TEST_PASSWORD set to:'
    )
    console.error(`  TEST_EMAIL=${email}`)
    console.error(`  TEST_PASSWORD=${password}`)
    process.exit(2)
  }
  session = data
}

const userId = session.user.id
console.log('Test user:', userId, email)

const STAKE = 100
const CALLS = 20

const results = await Promise.all(
  Array.from({ length: CALLS }, () =>
    supabase.rpc('place_stake', { p_outcome_id: outcomeId, p_points: STAKE })
  )
)

const successes = results.filter((r) => r.data?.success === true).length
const failures = results.filter((r) => r.data?.success === false)
const rpcErrors = results.filter((r) => r.error)

console.log(`successes: ${successes}, failures: ${failures.length}, rpc errors: ${rpcErrors.length}`)
for (const f of failures.slice(0, 3)) console.log('  sample failure:', f.data.message)
for (const e of rpcErrors.slice(0, 3)) console.log('  sample error:', e.error.message)

const { data: me } = await supabase
  .from('users')
  .select('points_remaining')
  .eq('id', userId)
  .single()

console.log('final balance:', me?.points_remaining)

assert.strictEqual(successes, 10, `expected exactly 10 successes, got ${successes}`)
assert.strictEqual(me?.points_remaining, 0, `expected balance 0, got ${me?.points_remaining}`)
assert.strictEqual(rpcErrors.length, 0, 'no calls should hard-error')

console.log('PASS: no overspend under 20 concurrent calls')
console.log('cleanup hint: test user id =', userId)
