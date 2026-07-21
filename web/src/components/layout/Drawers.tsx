import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { Group, EvalResponse, HealthDepsResponse, ConnectorResponse } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Loader2, RefreshCw, Link as LinkIcon } from 'lucide-react'

interface ProjectDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group | null
  onGroupUpdated: (group: Group) => void
}

export function ProjectDrawer({ open, onOpenChange, group, onGroupUpdated }: ProjectDrawerProps) {
  const [connectors, setConnectors] = useState<ConnectorResponse[]>([])
  const [evalData, setEvalData] = useState<EvalResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [calibrating, setCalibrating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [folderId, setFolderId] = useState('')
  const [credentialsText, setCredentialsText] = useState('')
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    if (!open || !group) return
    setLoading(true)
    setMessage(null)
    Promise.all([
      api.listConnectors(group.id).catch(() => []),
      api.getEval(group.id).catch(() => null),
      api.getGroup(group.id),
    ])
      .then(([conns, ev, grp]) => {
        setConnectors(conns)
        setEvalData(ev)
        onGroupUpdated(grp)
      })
      .finally(() => setLoading(false))
  }, [open, group?.id])

  if (!group) return null

  const pct = Math.round((group.active_image_count / group.max_active_images) * 100)

  const handleCalibrate = async () => {
    setCalibrating(true)
    setMessage(null)
    try {
      const result = await api.calibrate(group.id)
      setMessage(result.message || 'Calibration complete')
      setEvalData(await api.getEval(group.id))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Calibration failed')
    } finally {
      setCalibrating(false)
    }
  }

  const handleConnectGDrive = async () => {
    if (!folderId.trim() || !credentialsText.trim()) return
    setConnecting(true)
    setMessage(null)
    try {
      const credentials = JSON.parse(credentialsText)
      await api.createConnector('gdrive', group.id, {
        folder_id: folderId.trim(),
        credentials,
      })
      setFolderId('')
      setCredentialsText('')
      setConnectors(await api.listConnectors(group.id))
      setMessage('Source configured — sync will run in the background')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Project</SheetTitle>
          <SheetDescription>{group.name}</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-8">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quota</h3>
                <div className="flex justify-between text-sm">
                  <span>{group.active_image_count.toLocaleString()} photos</span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <Progress value={pct} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {group.quota_remaining.toLocaleString()} remaining of {group.max_active_images.toLocaleString()}
                </p>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sources</h3>
                {connectors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sources connected</p>
                ) : (
                  <div className="space-y-2">
                    {connectors.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 py-2 border-b border-border/60">
                        <div className="min-w-0">
                          <p className="text-sm font-medium uppercase">{c.kind}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {c.last_error || c.last_sync_at
                              ? (c.last_error || `Last sync ${new Date(c.last_sync_at!).toLocaleString()}`)
                              : 'Awaiting first sync'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {c.kind === 'gdrive' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 cursor-pointer"
                              onClick={() => api.syncConnector(c.id).then(() => setMessage('Sync queued'))}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          )}
                          <Badge variant="secondary" className="text-[10px] capitalize">{c.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <p className="text-xs font-medium flex items-center gap-1.5">
                    <LinkIcon className="h-3.5 w-3.5" /> Connect Google Drive
                  </p>
                  <input
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="Folder ID"
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                  />
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                    rows={4}
                    placeholder='Service account JSON'
                    value={credentialsText}
                    onChange={(e) => setCredentialsText(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="cursor-pointer"
                    disabled={connecting || !folderId.trim() || !credentialsText.trim()}
                    onClick={handleConnectGDrive}
                  >
                    {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    Connect
                  </Button>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accuracy</h3>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-[10px] text-muted-foreground">τ_assign</p>
                    <p className="font-mono text-lg font-semibold">
                      {evalData?.tau_assign?.toFixed(3) ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-[10px] text-muted-foreground">τ_search</p>
                    <p className="font-mono text-lg font-semibold">
                      {evalData?.tau_search?.toFixed(3) ?? '—'}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {evalData?.pair_count ?? 0} feedback pairs
                  {evalData?.calibrated_at
                    ? ` · last calibrated ${new Date(evalData.calibrated_at).toLocaleDateString()}`
                    : ' · never calibrated'}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 cursor-pointer"
                  onClick={handleCalibrate}
                  disabled={calibrating}
                >
                  {calibrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Recalibrate
                </Button>
              </section>

              {message && (
                <p className="text-sm text-muted-foreground border border-border rounded-md px-3 py-2">
                  {message}
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

interface SystemDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SystemDrawer({ open, onOpenChange }: SystemDrawerProps) {
  const [health, setHealth] = useState<HealthDepsResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api.getHealthDeps()
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>System</SheetTitle>
          <SheetDescription>Diagnostics and application status</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Overall</p>
                <Badge
                  variant="secondary"
                  className={
                    health?.status === 'operational'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-amber-500/10 text-amber-400'
                  }
                >
                  {health?.status || 'unknown'}
                </Badge>
              </div>
              <div className="space-y-1">
                {health &&
                  Object.entries(health.dependencies).map(([key, dep]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between py-2 border-b border-border/50"
                    >
                      <div>
                        <p className="text-sm capitalize">{key.replace(/_/g, ' ')}</p>
                        {dep.type && (
                          <p className="text-[10px] text-muted-foreground">{dep.type}</p>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] ${
                          dep.status === 'operational'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {dep.status}
                      </Badge>
                    </div>
                  ))}
                {!health && (
                  <p className="text-sm text-muted-foreground py-4">Unable to reach /health/deps</p>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
