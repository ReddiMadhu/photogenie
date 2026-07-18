import type { Page } from '@/App'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard,
  FolderOpen,
  Search,
  Users,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'group', label: 'Groups', icon: <FolderOpen className="h-4 w-4" /> },
  { id: 'search', label: 'Search', icon: <Search className="h-4 w-4" /> },
  { id: 'people', label: 'People', icon: <Users className="h-4 w-4" /> },
  { id: 'admin', label: 'Admin', icon: <ShieldCheck className="h-4 w-4" /> },
]

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
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

      <Separator />

      {/* Footer */}
      <div className="px-5 py-4">
        <p className="text-xs text-muted-foreground">Enterprise Face Search</p>
        <p className="text-xs text-muted-foreground/60">v0.1.0 — Phase 1</p>
      </div>
    </aside>
  )
}
