import { useState, useEffect } from 'react'
import './index.css'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from '@/components/layout/sidebar'
import { DashboardPage } from '@/pages/dashboard'
import { GroupPage } from '@/pages/group'
import { SearchPage } from '@/pages/search'
import { PeoplePage } from '@/pages/people'
import { AdminPage } from '@/pages/admin'
import { api } from '@/lib/api'
import type { Group } from '@/lib/api'

export type Page = 'dashboard' | 'group' | 'search' | 'people' | 'admin'

function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])

  // Fetch groups on mount for auto-select and sidebar context
  useEffect(() => {
    api.listGroups()
      .then(data => {
        setGroups(data.groups)
        // Auto-select if user has exactly 1 project
        if (data.groups.length === 1 && !selectedGroupId) {
          setSelectedGroupId(data.groups[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // Listen for Ctrl+K / Cmd+K shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        navigate('search')
        // Dispatch custom event to let the Search page know it should focus
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('focus-search-upload'))
        }, 150)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const navigate = (p: Page, groupId?: string) => {
    setPage(p)
    if (groupId) setSelectedGroupId(groupId)
  }

  // Find the currently active group for sidebar context
  const activeGroup = groups.find(g => g.id === selectedGroupId) || null

  return (
    <TooltipProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <Sidebar activePage={page} onNavigate={navigate} activeGroup={activeGroup} />
        <main className="flex-1 overflow-y-auto relative">
          {/* Ambient glow */}
          <div className="pointer-events-none fixed -top-48 -right-48 w-[600px] h-[600px] rounded-full bg-[oklch(0.65_0.2_270_/_4%)] blur-3xl" />
          <div className="pointer-events-none fixed -bottom-48 -left-48 w-[500px] h-[500px] rounded-full bg-[oklch(0.6_0.18_290_/_3%)] blur-3xl" />

          <div className="relative z-10 p-8">
            {page === 'dashboard' && <DashboardPage onNavigate={navigate} />}
            {page === 'group' && <GroupPage groupId={selectedGroupId} onSelectGroup={setSelectedGroupId} />}
            {page === 'search' && <SearchPage groupId={selectedGroupId} onSelectGroup={setSelectedGroupId} />}
            {page === 'people' && <PeoplePage groupId={selectedGroupId} onSelectGroup={setSelectedGroupId} />}
            {page === 'admin' && <AdminPage groupId={selectedGroupId} onSelectGroup={setSelectedGroupId} />}
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}

export default App
