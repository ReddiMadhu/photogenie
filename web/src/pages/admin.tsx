import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { Group, EvalResponse, HealthDepsResponse } from '@/lib/api'
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
  AlertTriangle,
} from 'lucide-react'

interface Props {
  groupId: string | null
  onSelectGroup: (id: string) => void
}

export function AdminPage({ groupId, onSelectGroup }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [evaluation, setEvaluation] = useState<EvalResponse | null>(null)
  const [health, setHealth] = useState<HealthDepsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [recalibrating, setRecalibrating] = useState(false)
  const [calibrateMsg, setCalibrateMsg] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    api.listGroups()
      .then(data => setGroups(data.groups))
      .catch(() => {})
    api.getHealthDeps()
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

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
    setCalibrateMsg(null)
    try {
      const result = await api.calibrate(groupId)
      setCalibrateMsg(result.message || 'Calibration complete')
      const data = await api.getEval(groupId)
      setEvaluation({
        ...data,
        tau_assign: result.tau_assign,
        tau_search: result.tau_search,
        pair_count: result.pair_count,
      })
    } catch (err) {
      setCalibrateMsg(err instanceof Error ? err.message : 'Calibration failed')
    } finally {
      setRecalibrating(false)
    }
  }

  const kpis = [
    {
      label: 'Search Completeness',
      value: evaluation?.recall_at_50 != null ? `${(evaluation.recall_at_50 * 100).toFixed(1)}%` : '—',
      target: 'Target ≥ 95%',
      status: evaluation?.recall_at_50 != null && evaluation.recall_at_50 >= 0.95 ? 'pass' : 'warn',
    },
    {
      label: 'Grouping Accuracy',
      value: evaluation?.cluster_purity != null ? `${(evaluation.cluster_purity * 100).toFixed(1)}%` : '—',
      target: 'Target ≥ 98%',
      status: evaluation?.cluster_purity != null && evaluation.cluster_purity >= 0.98 ? 'pass' : 'warn',
    },
    {
      label: 'Feedback Points',
      value: evaluation?.pair_count != null ? evaluation.pair_count.toString() : '—',
      target: '≥ 20 for calibration',
      status: (evaluation?.pair_count || 0) >= 20 ? 'pass' : 'warn',
    },
  ]

  const detPoints =
    evaluation?.det_curve && evaluation.det_curve.length > 0
      ? evaluation.det_curve
      : []

  const systems = health
    ? Object.entries(health.dependencies).map(([key, dep]) => ({
        name: key.replace(/_/g, ' '),
        status: dep.status,
        type: dep.type || '',
        detail: dep.detail,
      }))
    : []

  const overallHealthy = health?.status === 'operational'

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
            Recalibrate
          </Button>
        </div>
      </div>

      {calibrateMsg && (
        <p className="text-sm text-muted-foreground border border-border rounded-lg px-3 py-2">
          {calibrateMsg}
        </p>
      )}

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="glass-card">
              <CardContent className="pt-6 flex items-center gap-4">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${overallHealthy ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                  {overallHealthy
                    ? <CheckCircle className="h-5 w-5 text-emerald-400" />
                    : <AlertTriangle className="h-5 w-5 text-amber-400" />}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">System Health</p>
                  <p className="text-base font-semibold mt-0.5 capitalize">
                    {health?.status || 'Unknown'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">τ_search</p>
                  <p className="text-base font-semibold mt-0.5 font-mono">
                    {evaluation?.tau_search?.toFixed(4) ?? '—'}
                  </p>
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

          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="gap-1.5 cursor-pointer text-xs"
            >
              {showAdvanced ? (
                <><ChevronUp className="h-4 w-4" /> Hide Advanced Settings</>
              ) : (
                <><ChevronDown className="h-4 w-4" /> Show Advanced Settings</>
              )}
            </Button>
          </div>

          {showAdvanced && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                        <p className="text-xs text-muted-foreground mb-1">τ_assign</p>
                        <p className="text-2xl font-bold font-mono gradient-text">
                          {evaluation?.tau_assign != null ? evaluation.tau_assign.toFixed(4) : '—'}
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50 text-center">
                        <p className="text-xs text-muted-foreground mb-1">τ_search</p>
                        <p className="text-2xl font-bold font-mono gradient-text">
                          {evaluation?.tau_search != null ? evaluation.tau_search.toFixed(4) : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{evaluation?.pair_count || 0} feedback pairs</span>
                      <span>
                        {evaluation?.calibrated_at
                          ? new Date(evaluation.calibrated_at).toLocaleDateString()
                          : 'Never calibrated'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      DET Curve
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {detPoints.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-12">
                        Run recalibration with ≥20 feedback pairs to generate a DET curve.
                      </p>
                    ) : (
                      <>
                        <div className="h-48 flex items-end gap-0.5 px-4">
                          {detPoints.map((pt, i) => (
                            <div key={i} className="flex-1 flex flex-col justify-end">
                              <div
                                className="bg-gradient-to-t from-primary/80 to-primary/20 rounded-t-sm"
                                style={{ height: `${Math.max(4, Math.min(180, pt.fnmr * 200))}px` }}
                                title={`FMR=${pt.fmr} FNMR=${pt.fnmr}`}
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-center text-muted-foreground mt-2">
                          False non-match rate across operating points (from calibration).
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Server className="h-4 w-4 text-primary" />
                    Services Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {systems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Unable to reach /health/deps</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Service</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {systems.map((svc) => (
                          <TableRow key={svc.name}>
                            <TableCell className="font-medium capitalize">{svc.name}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{svc.type}</TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${
                                  svc.status === 'operational'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-amber-500/10 text-amber-400'
                                }`}
                              >
                                {svc.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
