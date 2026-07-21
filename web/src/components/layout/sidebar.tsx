import type { Page } from '@/App'
import type { Group } from '@/lib/api'
import { Separator } from '@/components/ui/separator'
import {
  Home,
  FolderOpen,
  Search,
  Users,
  Settings,
  Sparkles,
} from 'lucide-react'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
  activeGroup?: Group | null
}

const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Home', icon: <Home className="h-4 w-4" /> },
  { id: 'group', label: 'Projects', icon: <FolderOpen className="h-4 w-4" /> },
  { id: 'search', label: 'Search', icon: <Search className="h-4 w-4" /> },
  { id: 'people', label: 'People', icon: <Users className="h-4 w-4" /> },
  { id: 'admin', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
]

export function Sidebar({ activePage, onNavigate, activeGroup }: SidebarProps) {
  return (
    <aside className="w-64 flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[oklch(0.65_0.2_270)] to-[oklch(0.6_0.18_290)] flex items-center justify-center glow-accent">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-lg font-bold tracking-tight gradient-text">PhotoGenic</h1>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
              transition-all duration-150 cursor-pointer
              ${
                activePage === item.id
                  ? 'bg-accent text-accent-foreground shadow-sm border-l-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }
            `}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* Active project context */}
      {activeGroup && (
        <>
          <Separator />
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">
              Active Project
            </p>
            <p className="text-sm font-medium truncate" title={activeGroup.name}>
              {activeGroup.name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeGroup.active_image_count.toLocaleString()} photos
            </p>
          </div>
        </>
      )}

      <Separator />

      {/* Footer */}
      <div className="px-5 py-4 flex items-center justify-between text-xs text-muted-foreground/60">
        <span>PhotoGenic</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[9px] font-medium text-muted-foreground/80">
          <span>⌘</span>K
        </kbd>
      </div>
    </aside>
  )
}
