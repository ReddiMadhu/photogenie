import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import type { Group, Person } from '@/lib/api'
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
} from 'lucide-react'

interface Props {
  groupId: string | null
  onSelectGroup: (id: string) => void
}

// Colors for letter avatars — harmonious, dark-mode-friendly palette
const AVATAR_COLORS = [
  'bg-indigo-500/20 text-indigo-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-amber-500/20 text-amber-300',
  'bg-rose-500/20 text-rose-300',
  'bg-cyan-500/20 text-cyan-300',
  'bg-purple-500/20 text-purple-300',
  'bg-teal-500/20 text-teal-300',
  'bg-orange-500/20 text-orange-300',
]

function getAvatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function PeoplePage({ groupId, onSelectGroup }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [persons, setPersons] = useState<Person[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [inlineEditName, setInlineEditName] = useState('')
  const [undoToast, setUndoToast] = useState<{ id: string; name: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  const inlineInputRef = useRef<HTMLInputElement>(null)

  // Fetch groups for dropdown
  useEffect(() => {
    api.listGroups()
      .then(data => setGroups(data.groups))
      .catch(() => {})
  }, [])

  // Fetch persons when group changes
  useEffect(() => {
    if (!groupId) {
      setPersons([])
      return
    }
    setLoading(true)
    api.listPersons(groupId)
      .then(data => setPersons(data.persons))
      .catch(() => setPersons([]))
      .finally(() => setLoading(false))
  }, [groupId])

  // Focus inline edit input when opened
  useEffect(() => {
    if (inlineEditId && inlineInputRef.current) {
      inlineInputRef.current.focus()
      inlineInputRef.current.select()
    }
  }, [inlineEditId])

  const filtered = persons.filter(p =>
    !search || (p.name?.toLowerCase().includes(search.toLowerCase()))
  )

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Inline rename — click name, edit in-place, Enter to save
  const handleInlineRename = useCallback(async (personId: string, newName: string) => {
    if (!groupId || !newName.trim()) {
      setInlineEditId(null)
      return
    }
    try {
      await api.renamePerson(groupId, personId, newName)
      setPersons(prev => prev.map(p =>
        p.id === personId ? { ...p, name: newName } : p
      ))
    } catch {}
    setInlineEditId(null)
  }, [groupId])

  const handleMerge = async () => {
    if (!groupId || selected.size < 2) return
    const ids = Array.from(selected)
    const target = ids[0]
    const sources = ids.slice(1)
    try {
      await api.mergePerson(groupId, target, sources)
      const data = await api.listPersons(groupId)
      setPersons(data.persons)
      setSelected(new Set())
    } catch {}
  }

  // Soft delete with undo toast
  const handleDelete = async (personId: string) => {
    if (!groupId) return

    // Clear any existing undo toast
    if (undoToast) {
      clearTimeout(undoToast.timer)
    }

    // Optimistically remove from UI
    const deletedPerson = persons.find(p => p.id === personId)
    setPersons(prev => prev.filter(p => p.id !== personId))

    // Set undo toast — delay the actual API call
    const timer = setTimeout(async () => {
      try {
        await api.deletePerson(groupId, personId)
      } catch {}
      setUndoToast(null)
    }, 10000)

    setUndoToast({
      id: personId,
      name: deletedPerson?.name || 'Unnamed person',
      timer,
    })
  }

  const handleUndo = () => {
    if (!undoToast || !groupId) return
    clearTimeout(undoToast.timer)
    // Re-fetch to restore
    api.listPersons(groupId)
      .then(data => setPersons(data.persons))
      .catch(() => {})
    setUndoToast(null)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">People</h2>
          <p className="text-muted-foreground mt-1">
            {loading ? 'Loading…' : `${persons.length} people identified · ${persons.filter(p => !p.name).length} need names`}
          </p>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selected.size} selected</Badge>
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 cursor-pointer"
              onClick={handleMerge}
              disabled={selected.size < 2}
            >
              <Merge className="h-3.5 w-3.5" /> Merge
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5 cursor-pointer"
              onClick={() => {
                selected.forEach(id => handleDelete(id))
                setSelected(new Set())
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      {/* Search + group selector */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search people…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="bg-input border border-border rounded-lg px-3 py-2 text-sm min-w-[200px]"
          value={groupId || ''}
          onChange={(e) => onSelectGroup(e.target.value)}
        >
          <option value="">All projects</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      {/* Person grid */}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading people…
        </div>
      ) : !groupId ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-lg font-medium">Select a project</p>
          <p className="text-sm mt-1">Select a project to see who's been found.</p>
        </div>
      ) : persons.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-lg font-medium">No people identified yet</p>
          <p className="text-sm mt-1">Upload photos to start finding people.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 stagger">
          {filtered.map((person) => {
            const avatarColor = getAvatarColor(person.id)
            const initial = (person.name || '?')[0].toUpperCase()

            return (
              <Card
                key={person.id}
                className={`
                  glass-card cursor-pointer transition-all duration-300 hover:-translate-y-1 group relative
                  ${selected.has(person.id) ? 'border-primary ring-1 ring-primary/30' : 'hover:border-primary/30'}
                `}
                onClick={() => toggle(person.id)}
              >
                {/* Selection indicator */}
                {selected.has(person.id) && (
                  <div className="absolute top-2 right-2 z-10">
                    <CheckCircle className="h-5 w-5 text-primary" />
                  </div>
                )}

                <CardContent className="pt-5 text-center">
                  {/* Letter avatar */}
                  <div className={`h-16 w-16 rounded-full mx-auto mb-3 flex items-center justify-center border-2 border-border group-hover:border-primary transition-colors ${avatarColor}`}>
                    <span className="text-xl font-bold">{initial}</span>
                  </div>

                  {/* Name — inline editable */}
                  {inlineEditId === person.id ? (
                    <input
                      ref={inlineInputRef}
                      className="text-sm font-semibold bg-transparent border-b border-primary text-center w-full outline-none py-0.5"
                      value={inlineEditName}
                      onChange={(e) => setInlineEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleInlineRename(person.id, inlineEditName)
                        if (e.key === 'Escape') setInlineEditId(null)
                      }}
                      onBlur={() => handleInlineRename(person.id, inlineEditName)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p
                      className="text-sm font-semibold group-hover:text-primary transition-colors truncate cursor-text"
                      onClick={(e) => {
                        e.stopPropagation()
                        setInlineEditId(person.id)
                        setInlineEditName(person.name || '')
                      }}
                      title="Click to rename"
                    >
                      {person.name || 'Unnamed'}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground mt-0.5">
                    {person.face_count} photos
                  </p>

                  {/* Consent badge — simplified: only show if consented or withdrawn */}
                  <div className="mt-2 h-5">
                    {person.consent_state === 'consented' && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                        Consented
                      </Badge>
                    )}
                    {person.consent_state === 'withdrawn' && (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />
                        Withdrawn
                      </Badge>
                    )}
                    {/* No badge for 'unknown'/'pending' — reduces visual noise */}
                  </div>

                  {/* Action buttons — larger for Fitts's Law */}
                  <div className="mt-3 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Tooltip>
                      <TooltipTrigger>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            setInlineEditId(person.id)
                            setInlineEditName(person.name || '')
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Rename</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0 cursor-pointer"
                          onClick={(e) => { e.stopPropagation() }}
                        >
                          <Scissors className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Split into separate people</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0 text-destructive cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(person.id)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete person</TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Undo toast */}
      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-card border border-border shadow-xl">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-medium">{undoToast.name}</span> deleted
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-primary cursor-pointer h-7"
              onClick={handleUndo}
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 cursor-pointer"
              onClick={() => {
                clearTimeout(undoToast.timer)
                setUndoToast(null)
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
