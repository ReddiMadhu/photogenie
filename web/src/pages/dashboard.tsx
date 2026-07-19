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
  Users,
  Activity,
  Plus,
  ArrowRight,
  Zap,
  Shield,
  Brain,
  Loader2,
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
  const avgQuota = groups.length > 0
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
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground mt-1">Enterprise face search overview</p>
        </div>
        <Button className="gap-2 cursor-pointer" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> New Group
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Search Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input
                placeholder="Group name (e.g., Wedding 2024)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              />
              <p className="text-xs text-muted-foreground">
                Each group holds up to 15,000 images with isolated face search.
              </p>
              <Button onClick={handleCreateGroup} className="w-full cursor-pointer" disabled={creating}>
                {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating…</> : 'Create Group'}
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <StatsCard
          label="Search Groups"
          value={loading ? '—' : groups.length.toString()}
          subtitle="Active groups"
          icon={<FolderOpen className="h-5 w-5" />}
        />
        <StatsCard
          label="Total Images"
          value={loading ? '—' : totalImages.toLocaleString()}
          subtitle="Across all groups"
          icon={<Image className="h-5 w-5" />}
        />
        <StatsCard
          label="People Identified"
          value="—"
          subtitle="Select a group to view"
          icon={<Users className="h-5 w-5" />}
        />
        <StatsCard
          label="Avg Quota Usage"
          value={loading ? '—' : `${avgQuota}%`}
          subtitle="Of 15K limit"
          icon={<Activity className="h-5 w-5" />}
        />
      </div>

      {/* Features highlight */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger">
        <Card className="glass-card group hover:border-primary/30 transition-all duration-300 hover:-translate-y-1">
          <CardContent className="pt-6 space-y-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold">SAHI Detection</h3>
            <p className="text-sm text-muted-foreground">
              Tiled multi-scale detection recovers small faces in group photos — +25% recall over baseline.
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card group hover:border-primary/30 transition-all duration-300 hover:-translate-y-1">
          <CardContent className="pt-6 space-y-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold">Group Isolation</h3>
            <p className="text-sm text-muted-foreground">
              Every search is scoped to one group. Cross-group leakage is architecturally impossible.
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card group hover:border-primary/30 transition-all duration-300 hover:-translate-y-1">
          <CardContent className="pt-6 space-y-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold">Quality-Weighted</h3>
            <p className="text-sm text-muted-foreground">
              CR-FIQA scoring gates indexing and weights search aggregation — no blurry-face noise.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Groups list */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Search Groups</h3>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading groups…
          </div>
        ) : groups.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="pt-6 text-center text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-lg font-medium">No search groups yet</p>
              <p className="text-sm mt-1">Create your first group to start uploading images and searching faces.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                onClick={() => onNavigate('group', group.id)}
              />
            ))}
          </div>
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
              {group.active_image_count.toLocaleString()} images
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {group.status}
          </Badge>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Quota usage</span>
            <span className={quotaColor}>{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
          <p className="text-xs text-muted-foreground/60">
            {group.quota_remaining.toLocaleString()} remaining of {group.max_active_images.toLocaleString()}
          </p>
        </div>

        <div className="mt-4 flex items-center text-xs text-primary/70 group-hover:text-primary transition-colors">
          View group <ArrowRight className="h-3 w-3 ml-1" />
        </div>
      </CardContent>
    </Card>
  )
}
