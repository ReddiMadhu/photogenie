import { useState, useEffect } from 'react'
import type { Page } from '@/App'
import type { Group } from '@/lib/api'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  FolderOpen,
  Image,
  Search,
  Activity,
  Plus,
  ArrowRight,
  Loader2,
  Sparkles,
  Upload,
} from 'lucide-react'

interface Props {
  onNavigate: (page: Page, groupId?: string) => void
}

export function DashboardPage({ onNavigate }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.listGroups()
      .then(data => {
        setGroups(data.groups)
        setError(null)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const totalImages = groups.reduce((sum, g) => sum + g.active_image_count, 0)
  const totalQuotaUsed = groups.length > 0
    ? Math.round(groups.reduce((sum, g) => sum + (g.active_image_count / g.max_active_images) * 100, 0) / groups.length)
    : 0

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return
    setCreating(true)
    try {
      const newGroup = await api.createGroup(newGroupName)
      setGroups([newGroup, ...groups])
      setNewGroupName('')
      setDialogOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Home</h2>
          <p className="text-muted-foreground mt-1">Your projects and recent activity</p>
        </div>
        <Button className="gap-2 cursor-pointer" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> New Project
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a New Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input
                placeholder="Project name (e.g., Wedding 2024)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              />
              <p className="text-xs text-muted-foreground">
                A project holds up to 15,000 photos with its own search index.
              </p>
              <Button onClick={handleCreateGroup} className="w-full cursor-pointer" disabled={creating}>
                {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating…</> : 'Create Project'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Stats — only show when there are groups */}
      {!loading && groups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          <StatsCard
            label="Projects"
            value={groups.length.toString()}
            subtitle="Active projects"
            icon={<FolderOpen className="h-5 w-5" />}
          />
          <StatsCard
            label="Total Photos"
            value={totalImages.toLocaleString()}
            subtitle="Across all projects"
            icon={<Image className="h-5 w-5" />}
          />
          <StatsCard
            label="Storage Used"
            value={`${totalQuotaUsed}%`}
            subtitle="Average across projects"
            icon={<Activity className="h-5 w-5" />}
          />
        </div>
      )}

      {/* Projects list */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading projects…
          </div>
        ) : groups.length === 0 ? (
          /* Welcome experience for first-time users */
          <div className="space-y-8">
            <Card className="glass-card overflow-hidden">
              <CardContent className="pt-8 pb-8">
                <div className="text-center max-w-lg mx-auto space-y-4">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[oklch(0.65_0.2_270)] to-[oklch(0.6_0.18_290)] flex items-center justify-center mx-auto glow-accent">
                    <Sparkles className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight">Welcome to PhotoGenic</h3>
                  <p className="text-muted-foreground">
                    Find anyone across thousands of photos in seconds.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 max-w-2xl mx-auto">
                  <div className="text-center space-y-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                      <FolderOpen className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium">1. Create a project</p>
                    <p className="text-xs text-muted-foreground">
                      A project is a collection of photos you want to search through.
                    </p>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                      <Upload className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium">2. Add your photos</p>
                    <p className="text-xs text-muted-foreground">
                      Drag and drop, or connect Google Drive. We find every face automatically.
                    </p>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                      <Search className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium">3. Search for people</p>
                    <p className="text-xs text-muted-foreground">
                      Upload a photo of someone and find every image they appear in.
                    </p>
                  </div>
                </div>

                <div className="text-center mt-8">
                  <Button size="lg" className="gap-2 cursor-pointer px-8" onClick={() => setDialogOpen(true)}>
                    <Plus className="h-4 w-4" /> Create Your First Project
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="pt-6">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Example use cases</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-start gap-3">
                    <span className="text-lg">📸</span>
                    <div>
                      <p className="font-medium">Event photography</p>
                      <p className="text-muted-foreground text-xs">Find all photos of a specific guest across an event</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-lg">🔍</span>
                    <div>
                      <p className="font-medium">Investigations</p>
                      <p className="text-muted-foreground text-xs">Search surveillance footage for a person of interest</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-lg">🗂️</span>
                    <div>
                      <p className="font-medium">Media libraries</p>
                      <p className="text-muted-foreground text-xs">Organize and search large photo collections by person</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            <h3 className="text-xl font-semibold">Your Projects</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
              {groups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onClick={() => onNavigate('group', group.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatsCard({ label, value, subtitle, icon }: {
  label: string; value: string; subtitle: string; icon: React.ReactNode
}) {
  return (
    <Card className="glass-card group relative overflow-hidden hover:border-primary/30 transition-all duration-300 hover:-translate-y-0.5">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary to-[oklch(0.6_0.18_290)] opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <div className="text-muted-foreground/60">{icon}</div>
        </div>
        <p className="text-3xl font-extrabold tracking-tight gradient-text">{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  )
}

function GroupCard({ group, onClick }: { group: Group; onClick: () => void }) {
  const pct = Math.round((group.active_image_count / group.max_active_images) * 100)
  const quotaColor = pct > 90 ? 'text-red-400' : pct > 70 ? 'text-amber-400' : 'text-emerald-400'

  return (
    <Card
      className="glass-card cursor-pointer hover:border-primary/30 transition-all duration-300 hover:-translate-y-1 group"
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="font-semibold text-lg group-hover:text-primary transition-colors">
              {group.name}
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              {group.active_image_count.toLocaleString()} photos
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {group.status}
          </Badge>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Storage</span>
            <span className={quotaColor}>{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
          <p className="text-xs text-muted-foreground/60">
            {group.quota_remaining.toLocaleString()} photos remaining
          </p>
        </div>

        <div className="mt-4 flex items-center text-xs text-primary/70 group-hover:text-primary transition-colors">
          Open <ArrowRight className="h-3 w-3 ml-1" />
        </div>
      </CardContent>
    </Card>
  )
}
