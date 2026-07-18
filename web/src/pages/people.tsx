import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Users,
  Merge,
  Scissors,
  Pencil,
  Trash2,
  Search,
  CheckCircle,
} from 'lucide-react'

const mockPersons = [
  { id: 'p1', name: 'Alex Chen', face_count: 28, consent: 'consented' },
  { id: 'p2', name: 'Sarah Lee', face_count: 15, consent: 'unknown' },
  { id: 'p3', name: null, face_count: 3, consent: 'unknown' },
  { id: 'p4', name: 'Mike Ross', face_count: 42, consent: 'consented' },
  { id: 'p5', name: 'Emma Watson', face_count: 22, consent: 'consented' },
  { id: 'p6', name: null, face_count: 7, consent: 'unknown' },
  { id: 'p7', name: 'David Kim', face_count: 11, consent: 'unknown' },
  { id: 'p8', name: null, face_count: 2, consent: 'unknown' },
  { id: 'p9', name: 'Lisa Park', face_count: 19, consent: 'consented' },
  { id: 'p10', name: null, face_count: 1, consent: 'unknown' },
  { id: 'p11', name: 'John Smith', face_count: 33, consent: 'consented' },
  { id: 'p12', name: null, face_count: 4, consent: 'unknown' },
]

interface Props {
  groupId: string | null
  onSelectGroup: (id: string) => void
}

export function PeoplePage({ groupId, onSelectGroup }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')

  const filtered = mockPersons.filter(p =>
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

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">People</h2>
          <p className="text-muted-foreground mt-1">
            {mockPersons.length} people identified · {mockPersons.filter(p => !p.name).length} unnamed
          </p>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selected.size} selected</Badge>
            <Button variant="secondary" size="sm" className="gap-1.5 cursor-pointer">
              <Merge className="h-3.5 w-3.5" /> Merge
            </Button>
            <Button variant="destructive" size="sm" className="gap-1.5 cursor-pointer">
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
          <option value="1">Wedding 2024</option>
          <option value="2">Corporate Headshots</option>
          <option value="3">Event Photography</option>
        </select>
      </div>

      {/* Person grid */}
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
                {person.consent === 'consented' ? (
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
                  onClick={(e) => { e.stopPropagation() }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
            />
            <Button
              className="w-full cursor-pointer"
              onClick={() => setRenameId(null)}
            >
              Save Name
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
