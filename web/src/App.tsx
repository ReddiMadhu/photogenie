import { useState, useEffect, useCallback } from 'react'
import './index.css'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TopBar, WorkspaceTabs, type WorkspaceView } from '@/components/layout/TopBar'
import { ProjectDrawer, SystemDrawer } from '@/components/layout/Drawers'
import { SearchPage } from '@/pages/search'
import { UploadsPage } from '@/pages/uploads'
import { PeoplePage } from '@/pages/people'
import { ActivityPage } from '@/pages/activity'
import { api, ensureAuth } from '@/lib/api'
import type { Group } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Plus } from 'lucide-react'

const PROJECT_KEY = 'photogenic_active_project'
const VIEW_KEY = 'photogenic_active_view'

function App() {
  const [view, setView] = useState<WorkspaceView>(() => {
    const stored = localStorage.getItem(VIEW_KEY) as WorkspaceView | null
    return stored && ['search', 'uploads', 'people', 'activity'].includes(stored) ? stored : 'search'
  })
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    () => localStorage.getItem(PROJECT_KEY),
  )
  const [groups, setGroups] = useState<Group[]>([])
  const [authReady, setAuthReady] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [systemOpen, setSystemOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    ensureAuth().finally(() => setAuthReady(true))
  }, [])

  const refreshGroups = useCallback(async () => {
    const data = await api.listGroups()
    setGroups(data.groups)
    return data.groups
  }, [])

  useEffect(() => {
    if (!authReady) return
    refreshGroups()
      .then((list) => {
        const stored = localStorage.getItem(PROJECT_KEY)
        if (stored && list.some((g) => g.id === stored)) {
          setSelectedGroupId(stored)
        } else if (list.length === 1) {
          setSelectedGroupId(list[0].id)
          localStorage.setItem(PROJECT_KEY, list[0].id)
        } else if (stored && !list.some((g) => g.id === stored)) {
          setSelectedGroupId(null)
          localStorage.removeItem(PROJECT_KEY)
        }
      })
      .catch(() => {})
  }, [authReady, refreshGroups])

  useEffect(() => {
    if (selectedGroupId) localStorage.setItem(PROJECT_KEY, selectedGroupId)
  }, [selectedGroupId])

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view)
  }, [view])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setView('search')
        setTimeout(() => window.dispatchEvent(new CustomEvent('focus-search-upload')), 80)
      }
      if (e.key.toLowerCase() === 'u' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        // skip if typing
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selectGroup = (id: string) => {
    setSelectedGroupId(id)
    localStorage.setItem(PROJECT_KEY, id)
  }

  const createGroup = async (name: string) => {
    const g = await api.createGroup(name)
    setGroups((prev) => [g, ...prev])
    selectGroup(g.id)
    setView('uploads')
  }

  const handleFirstProject = async () => {
    if (!firstName.trim()) return
    setCreating(true)
    try {
      await createGroup(firstName.trim())
      setFirstName('')
    } finally {
      setCreating(false)
    }
  }

  const activeGroup = groups.find((g) => g.id === selectedGroupId) || null

  const onGroupUpdated = useCallback((g: Group) => {
    setGroups((prev) => prev.map((x) => (x.id === g.id ? g : x)))
  }, [])

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
        <TopBar
          groups={groups}
          activeGroup={activeGroup}
          onSelectGroup={selectGroup}
          onCreateGroup={createGroup}
          onFocusSearch={() => {
            setView('search')
            setTimeout(() => window.dispatchEvent(new CustomEvent('focus-search-upload')), 80)
          }}
          onOpenProject={() => setProjectOpen(true)}
          onOpenSystem={() => setSystemOpen(true)}
        />

        {activeGroup && (
          <WorkspaceTabs active={view} onChange={setView} />
        )}

        <main className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8">
            {!authReady ? (
              <div className="flex justify-center py-24">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
            ) : !activeGroup ? (
              <div className="max-w-md mx-auto py-20 text-center space-y-6">
                <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center mx-auto">
                  <span className="text-lg font-bold text-primary">P</span>
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Find anyone in your photos</h1>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Create a project, upload photos, then search by face.
                  </p>
                </div>
                <div className="space-y-3 text-left">
                  <Input
                    placeholder="Name your first project…"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFirstProject()}
                    autoFocus
                  />
                  <Button
                    className="w-full gap-2 cursor-pointer"
                    onClick={handleFirstProject}
                    disabled={creating || !firstName.trim()}
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Create project
                  </Button>
                </div>
                {groups.length > 0 && (
                  <div className="pt-4 border-t border-border text-left space-y-1">
                    <p className="text-xs text-muted-foreground mb-2">Or open an existing project</p>
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => selectGroup(g.id)}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm cursor-pointer"
                      >
                        {g.name}
                        <span className="text-muted-foreground ml-2">
                          {g.active_image_count.toLocaleString()} photos
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {view === 'search' && (
                  <SearchPage groupId={activeGroup.id} projectName={activeGroup.name} />
                )}
                {view === 'uploads' && (
                  <UploadsPage
                    groupId={activeGroup.id}
                    group={activeGroup}
                    onGroupUpdated={onGroupUpdated}
                  />
                )}
                {view === 'people' && <PeoplePage groupId={activeGroup.id} />}
                {view === 'activity' && <ActivityPage group={activeGroup} />}
              </>
            )}
          </div>
        </main>

        <ProjectDrawer
          open={projectOpen}
          onOpenChange={setProjectOpen}
          group={activeGroup}
          onGroupUpdated={onGroupUpdated}
        />
        <SystemDrawer open={systemOpen} onOpenChange={setSystemOpen} />
      </div>
    </TooltipProvider>
  )
}

export default App
