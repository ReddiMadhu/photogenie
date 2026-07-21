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
  FolderCog,
  User,
} from 'lucide-react'

export type WorkspaceView = 'search' | 'uploads' | 'people' | 'activity'

interface TopBarProps {
  groups: Group[]
  activeGroup: Group | null
  onSelectGroup: (id: string) => void
  onCreateGroup: (name: string) => Promise<void>
  onFocusSearch: () => void
  onOpenProject: () => void
  onOpenSystem: () => void
}

export function TopBar({
  groups,
  activeGroup,
  onSelectGroup,
  onCreateGroup,
  onFocusSearch,
  onOpenProject,
  onOpenSystem,
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
      <header className="h-14 shrink-0 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 px-4 flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-7 w-7 rounded-md bg-primary/15 flex items-center justify-center">
            <span className="text-xs font-bold text-primary">P</span>
          </div>
          <span className="font-semibold tracking-tight hidden sm:inline">PhotoGenic</span>
        </div>

        {/* Project switcher — single source of truth */}
        <DropdownMenu>
          <DropdownMenuTrigger className="h-9 min-w-[160px] max-w-[240px] justify-between gap-2 px-3 font-normal cursor-pointer inline-flex items-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm">
            <div className="min-w-0 text-left">
              <p className="text-sm font-medium truncate">
                {activeGroup?.name || 'Select project'}
              </p>
              {activeGroup && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {activeGroup.active_image_count.toLocaleString()} photos
                  {activeGroup.status === 'active' ? ' · Indexed' : ` · ${activeGroup.status}`}
                </p>
              )}
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Projects</div>
            {groups.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">No projects yet</p>
            )}
            {groups.map((g) => (
              <DropdownMenuItem
                key={g.id}
                className="cursor-pointer flex items-start gap-2 py-2"
                onClick={() => onSelectGroup(g.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.active_image_count.toLocaleString()} photos · quota {g.quota_remaining.toLocaleString()} left
                  </p>
                </div>
                {activeGroup?.id === g.id && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" /> New project…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Global search affordance */}
        <button
          type="button"
          onClick={onFocusSearch}
          className="flex-1 max-w-md h-9 rounded-md border border-border bg-muted/40 px-3 flex items-center gap-2 text-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="truncate">Search a person…</span>
          <kbd className="ml-auto hidden sm:inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 cursor-pointer text-muted-foreground"
            onClick={onOpenProject}
            disabled={!activeGroup}
            title="Project settings"
          >
            <FolderCog className="h-4 w-4" />
            <span className="hidden md:inline">Project</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="h-9 w-9 rounded-full cursor-pointer inline-flex items-center justify-center hover:bg-accent">
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Account</div>
              <DropdownMenuItem className="cursor-pointer gap-2" onClick={onOpenSystem}>
                <Settings className="h-4 w-4" /> System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
    { id: 'uploads', label: 'Uploads' },
    { id: 'people', label: 'People' },
    { id: 'activity', label: 'Activity' },
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
