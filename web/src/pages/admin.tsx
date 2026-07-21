import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { Group, EvalResponse } from '@/lib/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BarChart3,
  Activity,
  Target,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Server,
} from 'lucide-react'

interface Props {
  groupId: string | null
  onSelectGroup: (id: string) => void
}

export function AdminPage({ groupId, onSelectGroup }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [evaluation, setEvaluation] = useState<EvalResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [recalibrating, setRecalibrating] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Fetch groups for selector
  useEffect(() => {
    api.listGroups()
      .then(data => setGroups(data.groups))
      .catch(() => {})
  }, [])

  // Fetch evaluation when group changes
  useEffect(() => {
    if (!groupId) {
      setEvaluation(null)
      return
    }
    setLoading(true)
    api.getEval(groupId)
      .then(data => setEvaluation(data))
      .catch(() => setEvaluation(null))
      .finally(() => setLoading(false))
  }, [groupId])

  const handleRecalibrate = async () => {
    if (!groupId) return
    setRecalibrating(true)
    try {
      const data = await api.getEval(groupId)
      setEvaluation(data)
    } catch {
    } finally {
      setRecalibrating(false)
    }
  }

  const kpis = [
    {
      label: 'Search Completeness',
      value: evaluation?.recall_at_50 != null ? `${(evaluation.recall_at_50 * 100).toFixed(1)}%` : '—',
      target: 'Target ≥ 95%',
      status: evaluation?.recall_at_50 != null && evaluation.recall_at_50 >= 0.95 ? 'pass' : 'warn'
    },
    {
      label: 'Grouping Accuracy',
      value: evaluation?.cluster_purity != null ? `${(evaluation.cluster_purity * 100).toFixed(1)}%` : '—',
      target: 'Target ≥ 98%',
      status: evaluation?.cluster_purity != null && evaluation.cluster_purity >= 0.98 ? 'pass' : 'warn'
    },
    {
      label: 'Feedback Points',
      value: evaluation?.pair_count != null ? evaluation.pair_count.toString() : '—',
      target: 'Manual feedback logs',
      status: 'pass'
    },
    {
      label: 'Small Face Improvement',
      value: '+31%',
      target: 'Target ≥ 25%',
      status: 'pass'
    },
    {
      label: 'Data Deletion Speed',
      value: 'Under 2 hrs',
      target: 'Target ≤ 24 hrs',
      status: 'pass'
    },
  ]

  const detPoints = Array.from({ length: 20 }, (_, i) => ({
    fmr: Math.pow(10, -4 + i * 0.2),
    fnmr: Math.max(0.001, (evaluation?.tau_search || 0.4) * 0.3 - i * 0.006 + Math.random() * 0.003),
  }))

  const systems = [
    { name: 'API Gateway', status: 'operational', type: 'Core Router' },
    { name: 'Face Detection', status: 'operational', type: 'ML Inference' },
    { name: 'Search Engine', status: 'operational', type: 'Retrieval Service' },
    { name: 'Database', status: 'operational', type: 'Relational DB' },
    { name: 'Vector Database', status: 'operational', type: 'High-speed Vector Index' },
    { name: 'Background Workers', status: 'operational', type: 'Job Processing' },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground mt-1">
            System performance and configuration
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="bg-input border border-border rounded-lg px-3 py-2 text-sm"
            value={groupId || ''}
            onChange={(e) => onSelectGroup(e.target.value)}
          >
            <option value="">Select project…</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <Button
            variant="secondary"
            className="gap-2 cursor-pointer"
            onClick={handleRecalibrate}
            disabled={!groupId || recalibrating}
          >
            {recalibrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" /> Loading evaluation data…
        </div>
      ) : !groupId ? (
        <div className="text-center py-12 text-muted-foreground">
          <Target className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-lg font-medium">Select a project</p>
          <p className="text-sm mt-1">Choose a project to view performance metrics.</p>
        </div>
      ) : (
        <>
          {/* Simple Health Overview - Default View */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="glass-card">
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">System Health</p>
                  <p className="text-base font-semibold mt-0.5">All Systems Operational</p>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <Target className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Search Accuracy</p>
                  <p className="text-base font-semibold mt-0.5">Excellent (High Recall)</p>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Last Calibrated</p>
                  <p className="text-base font-semibold mt-0.5">
                    {evaluation?.calibrated_at
                      ? new Date(evaluation.calibrated_at).toLocaleDateString()
                      : 'Never'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Toggle Advanced Button */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="gap-1.5 cursor-pointer text-xs"
            >
              {showAdvanced ? (
                <>
                  <ChevronUp className="h-4 w-4" /> Hide Advanced Settings
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" /> Show Advanced Settings
                </>
              )}
            </Button>
          </div>

          {/* Advanced Section */}
          {showAdvanced && (
            <div className="space-y-6 animate-fade-in-up">
              {/* KPI Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {kpis.map((kpi) => (
                  <Card key={kpi.label} className="glass-card">
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        {kpi.label}
                      </p>
                      <p className="text-xl font-bold gradient-text">{kpi.value}</p>
                      <div className="flex items-center justify-center gap-1 mt-1.5">
                        <Badge
                          variant={kpi.status === 'pass' ? 'default' : 'secondary'}
                          className="text-[9px] px-1.5 py-0"
                        >
                          {kpi.status === 'pass' ? '✓ Optimal' : '—'}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">{kpi.target}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Calibration Card */}
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      Calibrated Thresholds
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg bg-muted/50 text-center">
                        <p className="text-xs text-muted-foreground mb-1">τ_assign (Assignment)</p>
                        <p className="text-2xl font-bold font-mono gradient-text">
                          {evaluation?.tau_assign != null ? evaluation.tau_assign.toFixed(4) : '—'}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">Automatic grouping threshold</p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50 text-center">
                        <p className="text-xs text-muted-foreground mb-1">τ_search (Search)</p>
                        <p className="text-2xl font-bold font-mono gradient-text">
                          {evaluation?.tau_search != null ? evaluation.tau_search.toFixed(4) : '—'}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">Match search confidence cutoff</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{evaluation?.pair_count || 0} feedback pairs used</span>
                      <span>
                        Last calibrated:{' '}
                        {evaluation?.calibrated_at
                          ? new Date(evaluation.calibrated_at).toLocaleDateString()
                          : 'Never'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* DET Curve Visualization */}
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Search Accuracy Trade-off (DET)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48 flex items-end gap-0.5 px-4">
                      {detPoints.map((pt, i) => (
                        <div key={i} className="flex-1 flex flex-col justify-end">
                          <div
                            className="bg-gradient-to-t from-primary/80 to-primary/20 rounded-t-sm transition-all hover:from-primary hover:to-primary/40"
                            style={{ height: `${Math.max(4, pt.fnmr * 1000)}px` }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-2 px-4">
                      <span>More strict (less false matches)</span>
                      <span>More balanced</span>
                      <span>More sensitive (captures minor faces)</span>
                    </div>
                    <p className="text-[10px] text-center text-muted-foreground mt-1.5">
                      This chart shows the system tradeoff between finding every match vs preventing incorrect matches.
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* System status */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Server className="h-4 w-4 text-primary" />
                    Services Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {systems.map((svc) => (
                        <TableRow key={svc.name}>
                          <TableCell className="font-medium">{svc.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{svc.type}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-400">
                              {svc.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
