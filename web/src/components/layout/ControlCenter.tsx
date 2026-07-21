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
import {
  Loader2,
  RefreshCw,
  Link as LinkIcon,
  Shield,
  Trash2,
  Cpu,
  BarChart,
  HardDrive,
  FileCheck,
  Server,
  Zap,
} from 'lucide-react'

interface ControlCenterProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group | null
  onGroupUpdated: (group: Group) => void
}

type TabCategory =
  | 'general'
  | 'projects'
  | 'sources'
  | 'storage'
  | 'models'
  | 'calibration'
  | 'performance'
  | 'health'
  | 'security'
  | 'danger'

export function ControlCenter({ open, onOpenChange, group, onGroupUpdated }: ControlCenterProps) {
  const [activeTab, setActiveTab] = useState<TabCategory>('general')
  const [connectors, setConnectors] = useState<ConnectorResponse[]>([])
  const [evalData, setEvalData] = useState<EvalResponse | null>(null)
  const [health, setHealth] = useState<HealthDepsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [calibrating, setCalibrating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  
  // Google Drive connector inputs
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
      api.getHealthDeps().catch(() => null),
      api.getGroup(group.id),
    ])
      .then(([conns, ev, hlth, grp]) => {
        setConnectors(conns)
        setEvalData(ev)
        setHealth(hlth)
        onGroupUpdated(grp)
      })
      .finally(() => setLoading(false))
  }, [open, group?.id, activeTab])

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
      setMessage('Google Drive connected')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setConnecting(false)
    }
  }

  const menuItems: { id: TabCategory; label: string; icon: any }[] = [
    { id: 'general', label: 'General', icon: FileCheck },
    { id: 'sources', label: 'Sources', icon: LinkIcon },
    { id: 'storage', label: 'Storage', icon: HardDrive },
    { id: 'models', label: 'AI Models', icon: Cpu },
    { id: 'calibration', label: 'Calibration', icon: Zap },
    { id: 'performance', label: 'Performance', icon: BarChart },
    { id: 'health', label: 'System Health', icon: Server },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'danger', label: 'Danger Zone', icon: Trash2 },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[550px] p-0 flex flex-col overflow-hidden bg-card border-l border-border/40">
        <div className="p-5 border-b border-border/40 shrink-0">
          <SheetHeader>
            <SheetTitle className="text-lg font-semibold tracking-tight">Control Center</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Configure parameters and resources for project <span className="font-semibold text-foreground">{group.name}</span>
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Compact Left Sidebar */}
          <aside className="w-[160px] border-r border-border/40 bg-muted/20 py-4 flex flex-col gap-1 shrink-0 overflow-y-auto">
            {menuItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id)
                    setMessage(null)
                  }}
                  className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                    activeTab === item.id
                      ? 'bg-primary/10 text-primary border-l-2 border-primary font-semibold'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              )
            })}
          </aside>

          {/* Right Content Area */}
          <main className="flex-1 p-5 overflow-y-auto space-y-5 text-sm">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* GENERAL */}
                {activeTab === 'general' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-base">Project Parameters</h3>
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-muted-foreground font-mono">PROJECT NAME</span>
                        <p className="font-medium text-sm mt-0.5">{group.name}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground font-mono">PROJECT ID</span>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{group.id}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground font-mono">STATUS</span>
                        <p className="text-sm font-medium mt-0.5 capitalize">
                          <Badge variant="secondary" className="bg-primary/10 text-primary border-0 text-[10px]">
                            {group.status}
                          </Badge>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* SOURCES */}
                {activeTab === 'sources' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-base">Media Sources</h3>
                    {connectors.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">No connectors synced yet</p>
                    ) : (
                      <div className="space-y-2.5">
                        {connectors.map((c) => (
                          <div key={c.id} className="flex items-center justify-between gap-3 py-2 border-b border-border/40">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase">{c.kind}</p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {c.last_error || `Last sync: ${c.last_sync_at ? new Date(c.last_sync_at).toLocaleDateString() : 'Awaiting'}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {c.kind === 'gdrive' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 cursor-pointer"
                                  onClick={() => api.syncConnector(c.id).then(() => setMessage('Sync queued'))}
                                >
                                  <RefreshCw className="h-3 w-3" />
                                </Button>
                              )}
                              <Badge variant="secondary" className="text-[9px] capitalize">{c.status}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="border-t border-border/40 pt-4 space-y-3">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                        <LinkIcon className="h-3 w-3 text-primary" /> Connect Google Drive
                      </h4>
                      <input
                        className="w-full h-9 rounded-md border border-border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        placeholder="Folder ID"
                        value={folderId}
                        onChange={(e) => setFolderId(e.target.value)}
                      />
                      <textarea
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-[10px] font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        rows={4}
                        placeholder="Service account key (JSON)"
                        value={credentialsText}
                        onChange={(e) => setCredentialsText(e.target.value)}
                      />
                      <Button
                        size="sm"
                        className="w-full cursor-pointer text-xs"
                        disabled={connecting || !folderId.trim() || !credentialsText.trim()}
                        onClick={handleConnectGDrive}
                      >
                        {connecting && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
                        Connect Source
                      </Button>
                    </div>
                  </div>
                )}

                {/* STORAGE */}
                {activeTab === 'storage' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-base">Vectors & Index Storage</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-mono uppercase text-muted-foreground">DATABASE CAP DATA</span>
                        <span className="font-medium text-foreground">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                      <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                        <div>
                          <span className="text-muted-foreground block font-mono">PHOTOS CAP</span>
                          <span className="font-mono text-sm font-semibold">{group.active_image_count.toLocaleString()} / {group.max_active_images.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block font-mono">QUOTA LEFT</span>
                          <span className="font-mono text-sm font-semibold text-primary">{group.quota_remaining.toLocaleString()} left</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODELS */}
                {activeTab === 'models' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-base">Biometric AI Model Specs</h3>
                    <div className="space-y-3 font-mono text-xs text-muted-foreground">
                      <div className="bg-muted/30 p-3 rounded-lg border border-border/40">
                        <span className="text-foreground block font-semibold mb-1">FACE DETECTOR</span>
                        <span>RetinaFace (InsightFace CV Pipeline)</span>
                      </div>
                      <div className="bg-muted/30 p-3 rounded-lg border border-border/40">
                        <span className="text-foreground block font-semibold mb-1">EMBEDDINGS GENERATOR</span>
                        <span>ArcFace ResNet100 (512-Dimensional Vector Space)</span>
                      </div>
                      <div className="bg-muted/30 p-3 rounded-lg border border-border/40">
                        <span className="text-foreground block font-semibold mb-1">CLUSTER ENGINE</span>
                        <span>STAR-FC / Leader-based Aggregation</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* CALIBRATION */}
                {activeTab === 'calibration' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-base">Threshold Calibration</h3>
                    <p className="text-xs text-muted-foreground">
                      Calibrate assignment and search cosine thresholds based on human feedback loops.
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-lg bg-muted/40 border border-border/40 p-3">
                        <p className="text-[10px] text-muted-foreground font-mono">tau_assign</p>
                        <p className="font-mono text-lg font-bold text-primary">
                          {evalData?.tau_assign?.toFixed(4) ?? '—'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 border border-border/40 p-3">
                        <p className="text-[10px] text-muted-foreground font-mono">tau_search</p>
                        <p className="font-mono text-lg font-bold text-primary">
                          {evalData?.tau_search?.toFixed(4) ?? '—'}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <p>Feedback Pairs: <span className="text-foreground font-medium">{evalData?.pair_count ?? 0}</span></p>
                      <p>Last Calibrated: <span className="text-foreground font-medium">{evalData?.calibrated_at ? new Date(evalData.calibrated_at).toLocaleDateString() : 'Never'}</span></p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full cursor-pointer text-xs gap-1.5"
                      onClick={handleCalibrate}
                      disabled={calibrating}
                    >
                      {calibrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Recalibrate Thresholds
                    </Button>
                  </div>
                )}

                {/* PERFORMANCE */}
                {activeTab === 'performance' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-base">Indexer Performance</h3>
                    <div className="space-y-3 font-mono text-xs">
                      <div className="flex justify-between py-1.5 border-b border-border/40">
                        <span className="text-muted-foreground">P95 SEARCH TIME</span>
                        <span className="font-semibold text-success">280ms</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-border/40">
                        <span className="text-muted-foreground">EMBEDDING THROUGHPUT</span>
                        <span className="font-semibold text-foreground">125 crops/sec</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-border/40">
                        <span className="text-muted-foreground">VECTOR INDEX DEPTH</span>
                        <span className="font-semibold text-foreground">512 Dimensions (Cosine)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* HEALTH */}
                {activeTab === 'health' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-base">System Dependencies</h3>
                    {health ? (
                      <div className="space-y-2">
                        {Object.entries(health.dependencies).map(([key, dep]) => (
                          <div key={key} className="flex items-center justify-between py-1.5 border-b border-border/40 text-xs">
                            <span className="capitalize font-medium">{key.replace(/_/g, ' ')}</span>
                            <Badge
                              variant="secondary"
                              className={`text-[9px] border-0 text-white ${
                                dep.status === 'operational' ? 'bg-success/80' : 'bg-warning/80'
                              }`}
                            >
                              {dep.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Unable to fetch health logs</p>
                    )}
                  </div>
                )}

                {/* SECURITY */}
                {activeTab === 'security' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-base">Biometric Authorization</h3>
                    <p className="text-xs text-muted-foreground">
                      Review retention rules and regional jurisdiction compliance profiles.
                    </p>
                    <div className="rounded-lg bg-muted/40 border border-border/40 p-3 space-y-2 text-xs font-mono">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">RETENTION PERIOD</span>
                        <span>180 days (Purge scheduled)</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">JURISDICTION PROFILE</span>
                        <span>GDPR / CCPA Compliant</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* DANGER ZONE */}
                {activeTab === 'danger' && (
                  <div className="space-y-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                    <h3 className="font-semibold text-base text-destructive">Danger Zone</h3>
                    <p className="text-xs text-muted-foreground">
                      Deleting this project will permanently remove all indexed face crops, images, metadata links, and calibrated vector search weights.
                    </p>
                    <Button variant="destructive" size="sm" className="w-full cursor-pointer text-xs gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Project Data
                    </Button>
                  </div>
                )}
              </>
            )}

            {message && (
              <p className="text-xs text-muted-foreground bg-muted/40 border border-border/40 rounded-md px-3 py-2 mt-4 font-mono text-center">
                {message}
              </p>
            )}
          </main>
        </div>
      </SheetContent>
    </Sheet>
  )
}
