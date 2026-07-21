import { useState } from 'react'
import type { Group } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ChevronDown,
  Plus,
  Search,
  Check,
  Loader2,
  Settings,
  User,
} from 'lucide-react'

export type WorkspaceView = 'search' | 'uploads' | 'people' | 'activity'

interface TopBarProps {
  groups: Group[]
  activeGroup: Group | null
  onSelectGroup: (id: string) => void
  onCreateGroup: (name: string) => Promise<void>
  onFocusSearch: () => void
  onOpenControlCenter: () => void
}

export function TopBar({
  groups,
  activeGroup,
  onSelectGroup,
  onCreateGroup,
  onFocusSearch,
  onOpenControlCenter,
}: TopBarProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      await onCreateGroup(name.trim())
      setName('')
      setCreateOpen(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <header className="h-14 shrink-0 border-b border-border bg-background/95 backdrop-blur px-4 flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center border border-primary/20">
            <span className="text-xs font-bold text-primary">P</span>
          </div>
          <span className="font-semibold tracking-tight hidden sm:inline text-sm">PhotoGenic</span>
        </div>

        {/* Project switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger className="h-9 min-w-[140px] max-w-[200px] justify-between gap-2 px-3 font-normal cursor-pointer inline-flex items-center rounded-md border border-border bg-card hover:bg-muted text-xs">
            <div className="min-w-0 text-left">
              <p className="font-semibold truncate">
                {activeGroup?.name || 'Select project'}
              </p>
            </div>
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 bg-card border-border">
            <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Projects</div>
            {groups.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">No projects yet</p>
            )}
            {groups.map((g) => (
              <DropdownMenuItem
                key={g.id}
                className="cursor-pointer flex items-start gap-2 py-1.5 hover:bg-muted"
                onClick={() => onSelectGroup(g.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-xs truncate">{g.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {g.active_image_count.toLocaleString()} photos
                  </p>
                </div>
                {activeGroup?.id === g.id && <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-xs"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> New project…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Unified Command trigger */}
        <button
          type="button"
          onClick={onFocusSearch}
          className="flex-1 max-w-sm h-8 rounded-md border border-border bg-card px-3 flex items-center gap-2 text-xs text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="truncate">Search or command…</span>
          <kbd className="ml-auto hidden sm:inline-flex h-4 items-center rounded border border-border bg-muted/30 px-1 font-mono text-[9px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-4">
          {/* Status Indicators */}
          <div className="hidden md:flex items-center gap-3 text-[10px] font-mono font-semibold text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
              GPU: ACTIVE
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success"></span>
              SYNC: OK
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/65"></span>
              QUEUE: IDLE
            </div>
          </div>

          <div className="flex items-center gap-1 border-l border-border/40 pl-3">
            {/* Control Center gear icon */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={onOpenControlCenter}
              disabled={!activeGroup}
              title="Control Center"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center cursor-pointer border border-border">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
        </div>
      </header>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              placeholder="e.g. Wedding 2024"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              A project is a photo collection with its own search index.
            </p>
            <Button onClick={handleCreate} disabled={creating || !name.trim()} className="w-full cursor-pointer">
              {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating…</> : 'Create project'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface WorkspaceTabsProps {
  active: WorkspaceView
  onChange: (view: WorkspaceView) => void
  disabled?: boolean
}

export function WorkspaceTabs({ active, onChange, disabled }: WorkspaceTabsProps) {
  const tabs: { id: WorkspaceView; label: string }[] = [
    { id: 'search', label: 'Search' },
    { id: 'people', label: 'Identities' },
    { id: 'uploads', label: 'Ingestion' },
    { id: 'activity', label: 'Timeline' },
  ]

  return (
    <nav className="h-10 shrink-0 border-b border-border px-4 flex items-center gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(tab.id)}
          className={`
            relative h-10 px-3 text-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed
            ${active === tab.id
              ? 'text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'}
          `}
        >
          {tab.label}
          {active === tab.id && (
            <span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
      ))}
    </nav>
  )
}
