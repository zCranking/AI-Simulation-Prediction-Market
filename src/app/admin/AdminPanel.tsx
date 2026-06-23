'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { computeProbabilities } from '../../lib/market'
import {
  updateCandidate,
  uploadCandidatePhoto,
  addCandidate,
  deleteCandidate,
  bulkAddCandidates,
  updateElectionStatus,
  adminLogout,
} from './actions'
import type { Candidate, Prediction, ElectionSettings } from '../../lib/types'

interface Props {
  initialCandidates: Candidate[]
  predictions: Pick<Prediction, 'candidate_id' | 'points_allocated'>[]
  electionSettings: ElectionSettings | null
}

type EditState = { name: string; party: string; position: string; baseProbability: number }

export default function AdminPanel({ initialCandidates, predictions, electionSettings }: Props) {
  const router = useRouter()
  const [candidates, setCandidates] = useState(initialCandidates)
  const [edits, setEdits] = useState<Record<string, EditState>>(
    Object.fromEntries(
      initialCandidates.map((c) => [
        c.id,
        { name: c.name, party: c.party, position: c.position, baseProbability: c.base_probability ?? 0 },
      ])
    )
  )
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({})
  const [savingField, setSavingField] = useState<Record<string, boolean>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Election settings
  const [elecStatus, setElecStatus] = useState<'active' | 'resolved'>(
    electionSettings?.status ?? 'active'
  )
  const [winnerId, setWinnerId] = useState(electionSettings?.winner_candidate_id ?? '')
  const [elecLoading, setElecLoading] = useState(false)

  // Add candidate form
  const [newName, setNewName] = useState('')
  const [newParty, setNewParty] = useState('')
  const [newPosition, setNewPosition] = useState('')
  const [newBaseProbability, setNewBaseProbability] = useState(0)
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null)
  const [newPhotoPreview, setNewPhotoPreview] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')

  // Bulk import
  const [bulkText, setBulkText] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState('')

  const withProb = computeProbabilities(candidates, predictions)
  const probMap = Object.fromEntries(withProb.map((c) => [c.id, c.probability]))

  function updateEdit(id: string, field: keyof EditState, value: string | number) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function handleSave(id: string) {
    setSavingField((p) => ({ ...p, [id]: true }))
    setFieldErrors((p) => ({ ...p, [id]: '' }))
    const e = edits[id]
    const result = await updateCandidate(id, e.name, e.party, e.position, e.baseProbability)
    if (result.error) {
      setFieldErrors((p) => ({ ...p, [id]: result.error! }))
    } else {
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, name: e.name, party: e.party, position: e.position, base_probability: e.baseProbability }
            : c
        )
      )
    }
    setSavingField((p) => ({ ...p, [id]: false }))
  }

  async function handlePhotoSelect(id: string, file: File) {
    setPhotoPreviews((p) => ({ ...p, [id]: URL.createObjectURL(file) }))
    setSavingField((p) => ({ ...p, [id + '_photo']: true }))
    setFieldErrors((p) => ({ ...p, [id]: '' }))

    const fd = new FormData()
    fd.append('photo', file)
    fd.append('candidateId', id)
    const result = await uploadCandidatePhoto(fd)

    if (result.error) {
      setFieldErrors((p) => ({ ...p, [id]: result.error! }))
      setPhotoPreviews((p) => ({ ...p, [id]: '' }))
    } else if (result.url) {
      setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, photo: result.url! } : c)))
    }
    setSavingField((p) => ({ ...p, [id + '_photo']: false }))
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This will also remove all predictions for this candidate and cannot be undone.`)) return
    const result = await deleteCandidate(id)
    if (result.error) {
      alert(result.error)
    } else {
      setCandidates((prev) => prev.filter((c) => c.id !== id))
    }
  }

  async function handleAddCandidate(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setAddError('')
    const fd = new FormData()
    fd.append('name', newName)
    fd.append('party', newParty)
    fd.append('position', newPosition)
    fd.append('baseProbability', String(newBaseProbability))
    if (newPhotoFile) fd.append('photo', newPhotoFile)

    const result = await addCandidate(fd)
    if (result.error) {
      setAddError(result.error)
    } else if (result.candidate) {
      const c = result.candidate
      setCandidates((prev) => [...prev, c])
      setEdits((prev) => ({
        ...prev,
        [c.id]: { name: c.name, party: c.party, position: c.position, baseProbability: c.base_probability ?? 0 },
      }))
      setNewName('')
      setNewParty('')
      setNewPosition('')
      setNewBaseProbability(0)
      setNewPhotoFile(null)
      setNewPhotoPreview('')
    }
    setAddLoading(false)
  }

  async function handleBulkImport() {
    setBulkError('')
    const rows = bulkText
      .trim()
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        const [name = '', party = '', position = ''] = l.split(',').map((p) => p.trim())
        return { name, party, position }
      })

    if (!rows.length) return
    setBulkLoading(true)
    const result = await bulkAddCandidates(rows)
    if (result.error) {
      setBulkError(result.error)
    } else {
      setBulkText('')
      router.refresh()
    }
    setBulkLoading(false)
  }

  async function handleElectionSave() {
    setElecLoading(true)
    const result = await updateElectionStatus(elecStatus, winnerId || undefined)
    if (result.error) alert(result.error)
    setElecLoading(false)
  }

  async function handleLogout() {
    await adminLogout()
    router.push('/admin/login')
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-12">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
          <p className="text-gray-400 text-sm mt-1">Manage candidates, photos, and election settings</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            ← Market
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* ── Candidates ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-white mb-4">
          Candidates
          <span className="ml-2 text-sm text-gray-500 font-normal">({candidates.length})</span>
        </h2>

        {candidates.length === 0 && (
          <p className="text-gray-500 text-sm">No candidates yet. Add one below.</p>
        )}

        <div className="space-y-4">
          {candidates.map((c) => {
            const edit = edits[c.id] ?? {
              name: c.name,
              party: c.party,
              position: c.position,
              baseProbability: c.base_probability ?? 0,
            }
            const photoSrc = photoPreviews[c.id] || c.photo
            const prob = probMap[c.id]

            return (
              <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="flex flex-col sm:flex-row gap-5">

                  {/* Photo upload area */}
                  <label className="cursor-pointer shrink-0 relative group w-20 h-20">
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-800 border-2 border-gray-700 group-hover:border-indigo-500 transition-colors">
                      {photoSrc ? (
                        <img src={photoSrc} alt={c.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs text-center px-1 leading-tight">
                          No photo
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 rounded-xl transition-opacity text-white text-xs font-semibold text-center px-1">
                      {savingField[c.id + '_photo'] ? 'Uploading…' : 'Click to upload'}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handlePhotoSelect(c.id, f)
                      }}
                    />
                  </label>

                  {/* Editable fields */}
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Name</label>
                      <input
                        value={edit.name}
                        onChange={(e) => updateEdit(c.id, 'name', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Party</label>
                      <select
                        value={edit.party}
                        onChange={(e) => updateEdit(c.id, 'party', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Whig">Whig</option>
                        <option value="Federalist">Federalist</option>
                        <option value="Nonpartisan">Nonpartisan</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Position</label>
                      <input
                        value={edit.position}
                        onChange={(e) => updateEdit(c.id, 'position', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="e.g. Governor"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Base percentage
                        {prob !== undefined && (
                          <span className="ml-1 text-indigo-400">→ {prob.toFixed(1)}%</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={edit.baseProbability}
                        onChange={(e) =>
                          updateEdit(c.id, 'baseProbability', parseFloat(e.target.value) || 0)
                        }
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="0"
                      />
                      <p className="text-xs text-gray-600 mt-0.5">Saved directly as a percent</p>
                    </div>
                  </div>
                </div>

                {fieldErrors[c.id] && (
                  <p className="text-red-400 text-sm mt-2">{fieldErrors[c.id]}</p>
                )}

                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => handleSave(c.id)}
                    disabled={savingField[c.id]}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {savingField[c.id] ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, edit.name)}
                    className="text-red-400 hover:text-red-300 text-sm font-medium px-4 py-1.5 rounded-lg border border-transparent hover:border-red-900 hover:bg-red-950 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Add Candidate ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-white mb-4">Add Candidate</h2>
        <form
          onSubmit={handleAddCandidate}
          className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name *</label>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Candidate name"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Party *</label>
              <select
                required
                value={newParty}
                onChange={(e) => setNewParty(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— Select party —</option>
                <option value="Whig">Whig</option>
                <option value="Federalist">Federalist</option>
                <option value="Nonpartisan">Nonpartisan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Position *</label>
              <input
                required
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Governor"
                list="position-suggestions"
              />
              <datalist id="position-suggestions">
                <option value="Attorney General" />
                <option value="Controller" />
                <option value="Governor" />
                <option value="Insurance Commissioner" />
                <option value="Lt. Governor" />
                <option value="Secretary of State" />
                <option value="State Treasurer" />
                <option value="Superintendent of Public Instruction" />
                <option value="Supreme Court Justice" />
              </datalist>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Base percentage</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={newBaseProbability}
                onChange={(e) => setNewBaseProbability(parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Photo <span className="text-gray-600">(optional — can upload later by clicking the photo)</span>
            </label>
            <div className="flex items-center gap-3">
              {newPhotoPreview && (
                <img
                  src={newPhotoPreview}
                  alt="preview"
                  className="w-12 h-12 rounded-lg object-cover border border-gray-700"
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setNewPhotoFile(f)
                    setNewPhotoPreview(URL.createObjectURL(f))
                  }
                }}
                className="text-sm text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-700 file:text-white hover:file:bg-gray-600 cursor-pointer"
              />
            </div>
          </div>

          {addError && (
            <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">
              {addError}
            </p>
          )}

          <button
            type="submit"
            disabled={addLoading}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {addLoading ? 'Adding…' : '+ Add Candidate'}
          </button>
        </form>
      </section>

      {/* ── Bulk Import ────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-white mb-1">Bulk Import</h2>
        <p className="text-sm text-gray-400 mb-3">
          One candidate per line:{' '}
          <code className="text-indigo-400 bg-gray-800 px-1.5 py-0.5 rounded">Name, Party, Position</code>
          {' '}— photos can be uploaded after via the cards above.
        </p>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            placeholder={'Alice Smith, Whig, Governor\nBob Jones, Federalist, Attorney General'}
          />
          {bulkError && (
            <p className="text-red-400 text-sm mt-2">{bulkError}</p>
          )}
          <button
            onClick={handleBulkImport}
            disabled={bulkLoading || !bulkText.trim()}
            className="mt-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {bulkLoading ? 'Importing…' : 'Import All'}
          </button>
        </div>
      </section>

      {/* ── Election Settings ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-white mb-4">Election Settings</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-2">Status</label>
            <div className="flex gap-2">
              {(['active', 'resolved'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setElecStatus(s)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    elecStatus === s
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {s === 'active' ? 'Active (Betting open)' : 'Resolved (Closed)'}
                </button>
              ))}
            </div>
          </div>

          {elecStatus === 'resolved' && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Winner</label>
              <select
                value={winnerId}
                onChange={(e) => setWinnerId(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— Select winner —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.party})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleElectionSave}
            disabled={elecLoading || (elecStatus === 'resolved' && !winnerId)}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {elecLoading ? 'Saving…' : 'Save Election Settings'}
          </button>
        </div>
      </section>
    </div>
  )
}
