import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { api, resolveMediaUrl } from '@/lib/api'
import type { Person, PersonFace } from '@/lib/api'
import { AuthImage } from '@/components/AuthImage'
import {
  Users,
  Merge,
  Scissors,
  Pencil,
  Trash2,
  Search,
  CheckCircle,
  Loader2,
  Undo2,
  X,
  LayoutGrid,
  List,
} from 'lucide-react'

type Filter = 'all' | 'unnamed' | 'hidden'
type ViewMode = 'grid' | 'list'

const AVATAR_COLORS = [
  'bg-indigo-500/20 text-indigo-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-amber-500/20 text-amber-300',
  'bg-rose-500/20 text-rose-300',
  'bg-cyan-500/20 text-cyan-300',
]

function avatarColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

interface Props {
  groupId: string
}

export function PeoplePage({ groupId }: Props) {
  const [persons, setPersons] = useState<Person[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [view, setView] = useState<ViewMode>('grid')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [inlineEditName, setInlineEditName] = useState('')
  const [undoToast, setUndoToast] = useState<{ id: string; name: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitFaces, setSplitFaces] = useState<PersonFace[]>([])
  const [splitSelected, setSplitSelected] = useState<Set<string>>(new Set())
  const [splitLoading, setSplitLoading] = useState(false)
  const [splitError, setSplitError] = useState<string | null>(null)
  const inlineInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (offset = 0, append = false) => {
    const data = await api.listPersons(groupId, 50, offset)
    setPersons((prev) => (append ? [...prev, ...data.persons] : data.persons))
    setTotal(data.total)
    if (!append && data.persons.length) {
      setActiveId((current) => current && data.persons.some((p) => p.id === current)
        ? current
        : data.persons[0].id)
    }
  }, [groupId])

  useEffect(() => {
    setLoading(true)
    setSelected(new Set())
    setActiveId(null)
    load(0, false)
      .catch(() => setPersons([]))
      .finally(() => setLoading(false))
  }, [groupId])

  useEffect(() => {
    if (inlineEditId && inlineInputRef.current) {
      inlineInputRef.current.focus()
      inlineInputRef.current.select()
    }
  }, [inlineEditId])

  const filtered = persons.filter((p) => {
    if (filter === 'unnamed' && p.name) return false
    if (filter === 'hidden' && !p.is_hidden) return false
    if (search && !p.name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const unnamedCount = persons.filter((p) => !p.name).length
  const active = persons.find((p) => p.id === activeId) || null

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRename = async (personId: string, newName: string) => {
    if (!newName.trim()) {
      setInlineEditId(null)
      return
    }
    try {
      await api.renamePerson(groupId, personId, newName.trim())
      setPersons((prev) => prev.map((p) => (p.id === personId ? { ...p, name: newName.trim() } : p)))
    } catch { /* ignore */ }
    setInlineEditId(null)
  }

  const handleMerge = async () => {
    if (selected.size < 2) return
    const ids = Array.from(selected)
    await api.mergePerson(groupId, ids[0], ids.slice(1))
    await load(0, false)
    setSelected(new Set())
    setActiveId(ids[0])
  }

  const handleDelete = (personId: string) => {
    if (undoToast) clearTimeout(undoToast.timer)
    const deleted = persons.find((p) => p.id === personId)
    setPersons((prev) => prev.filter((p) => p.id !== personId))
    if (activeId === personId) setActiveId(null)
    const timer = setTimeout(async () => {
      try { await api.deletePerson(groupId, personId) } catch { /* ignore */ }
      setUndoToast(null)
    }, 10000)
    setUndoToast({ id: personId, name: deleted?.name || 'Unnamed person', timer })
  }

  const openSplit = async () => {
    if (!activeId) return
    setSplitOpen(true)
    setSplitSelected(new Set())
    setSplitError(null)
    setSplitLoading(true)
    try {
      const data = await api.listPersonFaces(groupId, activeId)
      setSplitFaces(data.faces)
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : 'Failed to load faces')
      setSplitFaces([])
    } finally {
      setSplitLoading(false)
    }
  }

  const handleSplit = async () => {
    if (!activeId || splitSelected.size === 0) return
    setSplitLoading(true)
    try {
      const result = await api.splitPerson(groupId, activeId, Array.from(splitSelected)) as { new_person_id?: string }
      await load(0, false)
      setSplitOpen(false)
      if (result?.new_person_id) setActiveId(result.new_person_id)
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : 'Split failed')
    } finally {
      setSplitLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">People</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? 'Loading…' : `${total} identities · ${unnamedCount} need names`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <Badge variant="secondary">{selected.size} selected</Badge>
              <Button size="sm" variant="secondary" className="gap-1.5 cursor-pointer" onClick={handleMerge} disabled={selected.size < 2}>
                <Merge className="h-3.5 w-3.5" /> Merge
              </Button>
            </>
          )}
          <div className="flex border border-border rounded-md overflow-hidden">
            <button type="button" className={`px-2 py-1.5 cursor-pointer ${view === 'grid' ? 'bg-muted' : ''}`} onClick={() => setView('grid')}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={`px-2 py-1.5 cursor-pointer ${view === 'list' ? 'bg-muted' : ''}`} onClick={() => setView('list')}>
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Filter people…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {([
          ['all', 'All'],
          ['unnamed', `Needs name · ${unnamedCount}`],
          ['hidden', 'Hidden'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`h-9 px-3 rounded-md text-sm cursor-pointer transition-colors ${
              filter === id ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : persons.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No people identified yet</p>
          <p className="text-sm mt-1">Upload photos to start finding faces.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
          <div>
            {view === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filtered.map((person) => {
                  const initial = (person.name || '?')[0].toUpperCase()
                  const color = avatarColor(person.id)
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => setActiveId(person.id)}
                      onDoubleClick={() => toggle(person.id)}
                      className={`text-center p-3 rounded-xl border transition-all cursor-pointer relative ${
                        activeId === person.id
                          ? 'border-primary bg-muted/40'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      {selected.has(person.id) && (
                        <CheckCircle className="absolute top-2 right-2 h-4 w-4 text-primary" />
                      )}
                      <div className={`h-14 w-14 rounded-full mx-auto mb-2 overflow-hidden flex items-center justify-center ${color}`}>
                        {person.rep_face_url ? (
                          <AuthImage
                            src={resolveMediaUrl(person.rep_face_url)}
                            alt=""
                            className="h-full w-full object-cover"
                            fallback={<span className="text-lg font-bold">{initial}</span>}
                          />
                        ) : (
                          <span className="text-lg font-bold">{initial}</span>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{person.name || 'Unnamed'}</p>
                      <p className="text-xs text-muted-foreground">{person.face_count} photos</p>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filtered.map((person) => {
                  const initial = (person.name || '?')[0].toUpperCase()
                  const color = avatarColor(person.id)
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => setActiveId(person.id)}
                      className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left cursor-pointer ${
                        activeId === person.id ? 'bg-muted/60' : 'hover:bg-muted/30'
                      }`}
                    >
                      <div className={`h-9 w-9 rounded-full overflow-hidden flex items-center justify-center shrink-0 ${color}`}>
                        {person.rep_face_url ? (
                          <AuthImage
                            src={resolveMediaUrl(person.rep_face_url)}
                            alt=""
                            className="h-full w-full object-cover"
                            fallback={<span className="text-sm font-bold">{initial}</span>}
                          />
                        ) : (
                          <span className="text-sm font-bold">{initial}</span>
                        )}
                      </div>
                      <span className="flex-1 font-medium text-sm truncate">{person.name || 'Unnamed'}</span>
                      <span className="text-xs text-muted-foreground">{person.face_count} photos</span>
                      {!person.name && <Badge variant="secondary" className="text-[10px]">Needs name</Badge>}
                    </button>
                  )
                })}
              </div>
            )}
            {persons.length < total && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  className="cursor-pointer"
                  disabled={loadingMore}
                  onClick={async () => {
                    setLoadingMore(true)
                    try { await load(persons.length, true) } finally { setLoadingMore(false) }
                  }}
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Load more
                </Button>
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div className="rounded-xl border border-border p-5 h-fit sticky top-4 space-y-4">
            {!active ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Select a person</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className={`h-14 w-14 rounded-full overflow-hidden flex items-center justify-center ${avatarColor(active.id)}`}>
                    {active.rep_face_url ? (
                      <AuthImage
                        src={resolveMediaUrl(active.rep_face_url)}
                        alt=""
                        className="h-full w-full object-cover"
                        fallback={<span className="text-xl font-bold">{(active.name || '?')[0]}</span>}
                      />
                    ) : (
                      <span className="text-xl font-bold">{(active.name || '?')[0]}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {inlineEditId === active.id ? (
                      <input
                        ref={inlineInputRef}
                        className="text-base font-semibold bg-transparent border-b border-primary outline-none w-full"
                        value={inlineEditName}
                        onChange={(e) => setInlineEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(active.id, inlineEditName)
                          if (e.key === 'Escape') setInlineEditId(null)
                        }}
                        onBlur={() => handleRename(active.id, inlineEditName)}
                      />
                    ) : (
                      <p className="font-semibold truncate">{active.name || 'Unnamed'}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{active.face_count} photos</p>
                  </div>
                  {active.consent_state === 'consented' && (
                    <Badge variant="secondary" className="text-[10px]">Consented</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" className="gap-1.5 cursor-pointer" onClick={() => { setInlineEditId(active.id); setInlineEditName(active.name || '') }}>
                    <Pencil className="h-3.5 w-3.5" /> Rename
                  </Button>
                  <Button size="sm" variant="secondary" className="gap-1.5 cursor-pointer" onClick={openSplit}>
                    <Scissors className="h-3.5 w-3.5" /> Split
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 cursor-pointer" onClick={() => toggle(active.id)}>
                    <Merge className="h-3.5 w-3.5" /> {selected.has(active.id) ? 'Deselect' : 'Select'}
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-destructive cursor-pointer" onClick={() => handleDelete(active.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Split modal */}
      {splitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-semibold">Split person</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Select faces that belong to someone else</p>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 cursor-pointer" onClick={() => setSplitOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {splitLoading && splitFaces.length === 0 ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                  {splitFaces.map((face) => {
                    const on = splitSelected.has(face.id)
                    return (
                      <button
                        key={face.id}
                        type="button"
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer ${on ? 'border-primary' : 'border-border'}`}
                        onClick={() => {
                          setSplitSelected((prev) => {
                            const next = new Set(prev)
                            if (next.has(face.id)) next.delete(face.id)
                            else next.add(face.id)
                            return next
                          })
                        }}
                      >
                        <AuthImage
                          src={face.crop_url ? resolveMediaUrl(face.crop_url) : undefined}
                          alt=""
                          className="w-full h-full object-cover"
                          fallback={<div className="w-full h-full bg-muted" />}
                        />
                        {on && <CheckCircle className="absolute top-1 right-1 h-4 w-4 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              )}
              {splitError && <p className="text-sm text-destructive mt-3">{splitError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <Button variant="ghost" className="cursor-pointer" onClick={() => setSplitOpen(false)}>Cancel</Button>
              <Button className="cursor-pointer" onClick={handleSplit} disabled={splitLoading || splitSelected.size === 0}>
                {splitLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Scissors className="h-4 w-4 mr-2" />}
                Split {splitSelected.size || ''} face{splitSelected.size === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-card border border-border shadow-xl">
            <span className="text-sm"><span className="font-medium">{undoToast.name}</span> deleted</span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-primary cursor-pointer h-7"
              onClick={() => {
                clearTimeout(undoToast.timer)
                load(0, false)
                setUndoToast(null)
              }}
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
