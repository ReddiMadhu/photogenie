import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
} from 'lucide-react'

interface Props {
  groupId: string | null
  onSelectGroup: (id: string) => void
}

export function PeoplePage({ groupId, onSelectGroup }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [persons, setPersons] = useState<Person[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [saving, setSaving] = useState(false)

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

  const handleRename = async () => {
    if (!renameId || !groupId || !renameName.trim()) return
    setSaving(true)
    try {
      await api.renamePerson(groupId, renameId, renameName)
      setPersons(prev => prev.map(p =>
        p.id === renameId ? { ...p, name: renameName } : p
      ))
      setRenameId(null)
    } catch {
    } finally {
      setSaving(false)
    }
  }

  const handleMerge = async () => {
    if (!groupId || selected.size < 2) return
    const ids = Array.from(selected)
    const target = ids[0]
    const sources = ids.slice(1)
    try {
      await api.mergePerson(groupId, target, sources)
      // Refresh persons
      const data = await api.listPersons(groupId)
      setPersons(data.persons)
      setSelected(new Set())
    } catch {}
  }

  const handleDelete = async (personId: string) => {
    if (!groupId) return
    try {
      await api.deletePerson(groupId, personId)
      setPersons(prev => prev.filter(p => p.id !== personId))
    } catch {}
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">People</h2>
          <p className="text-muted-foreground mt-1">
            {loading ? 'Loading…' : `${persons.length} people identified · ${persons.filter(p => !p.name).length} unnamed`}
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
              <Trash2 className="h-3.5 w-3.5" /> Erase
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
          <option value="">All groups</option>
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
          <p className="text-lg font-medium">Select a group</p>
          <p className="text-sm mt-1">Choose a search group from the dropdown to view identified people.</p>
        </div>
      ) : persons.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-lg font-medium">No people identified yet</p>
          <p className="text-sm mt-1">Upload images to the group to start face detection and clustering.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 stagger">
          {filtered.map((person) => (
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
                <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center border-2 border-border group-hover:border-primary transition-colors overflow-hidden">
                  <Users className="h-6 w-6 text-muted-foreground/40" />
                </div>

                <p className="text-sm font-semibold group-hover:text-primary transition-colors truncate">
                  {person.name || 'Unknown'}
                </p>

                <p className="text-xs text-muted-foreground mt-0.5">
                  {person.face_count} photos
                </p>

                <div className="mt-2">
                  {person.consent_state === 'consented' ? (
                    <Badge variant="secondary" className="text-[10px]">Consented</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">Pending</Badge>
                  )}
                </div>

                {/* Action buttons on hover */}
                <div className="mt-3 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRenameId(person.id)
                      setRenameName(person.name || '')
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 cursor-pointer"
                    onClick={(e) => { e.stopPropagation() }}
                  >
                    <Scissors className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(person.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={renameId !== null} onOpenChange={(o) => !o && setRenameId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Person</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              placeholder="Enter name"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            />
            <Button
              className="w-full cursor-pointer"
              onClick={handleRename}
              disabled={saving}
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : 'Save Name'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
