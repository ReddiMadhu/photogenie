import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
} from 'lucide-react'

interface Props {
  groupId: string | null
  onSelectGroup: (id: string) => void
}

export function AdminPage({ groupId, onSelectGroup }: Props) {
  // Mock calibration data
  const calibration = {
    tau_assign: 0.5234,
    tau_search: 0.4102,
    pair_count: 342,
    calibrated_at: '2024-07-18T10:00:00Z',
  }

  const kpis = [
    { label: 'Recall@50', value: '0.962', target: '≥ 0.95', status: 'pass' },
    { label: 'Cluster Purity', value: '0.988', target: '≥ 0.98', status: 'pass' },
    { label: 'Latency p95', value: '67ms', target: '< 100ms', status: 'pass' },
    { label: 'Latency p99', value: '142ms', target: '< 200ms', status: 'pass' },
    { label: 'Small Face Δ', value: '+31%', target: '≥ +25%', status: 'pass' },
    { label: 'Erasure SLA', value: '< 2h', target: '≤ 24h', status: 'pass' },
  ]

  const detPoints = Array.from({ length: 20 }, (_, i) => ({
    fmr: Math.pow(10, -4 + i * 0.2),
    fnmr: Math.max(0.001, 0.15 - i * 0.007 + Math.random() * 0.005),
  }))

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Admin</h2>
          <p className="text-muted-foreground mt-1">
            Evaluation metrics, thresholds, and DET analysis
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="bg-input border border-border rounded-lg px-3 py-2 text-sm"
            value={groupId || ''}
            onChange={(e) => onSelectGroup(e.target.value)}
          >
            <option value="">Select group…</option>
            <option value="1">Wedding 2024</option>
            <option value="2">Corporate Headshots</option>
            <option value="3">Event Photography</option>
          </select>
          <Button variant="secondary" className="gap-2 cursor-pointer">
            <RefreshCw className="h-4 w-4" /> Recalibrate
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 stagger">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="glass-card hover:border-primary/30 transition-all">
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {kpi.label}
              </p>
              <p className="text-xl font-bold gradient-text">{kpi.value}</p>
              <div className="flex items-center justify-center gap-1 mt-1.5">
                <Badge
                  variant={kpi.status === 'pass' ? 'default' : 'destructive'}
                  className="text-[9px] px-1.5 py-0"
                >
                  {kpi.status === 'pass' ? '✓ PASS' : '✗ FAIL'}
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
                <p className="text-xs text-muted-foreground mb-1">τ_assign</p>
                <p className="text-2xl font-bold font-mono gradient-text">
                  {calibration.tau_assign.toFixed(4)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">Online assignment</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground mb-1">τ_search</p>
                <p className="text-2xl font-bold font-mono gradient-text">
                  {calibration.tau_search.toFixed(4)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">Search retrieval</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{calibration.pair_count} feedback pairs</span>
              <span>Last calibrated: {new Date(calibration.calibrated_at).toLocaleDateString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* DET Curve Visualization */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              DET Curve
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
              <span>FMR=10⁻⁴</span>
              <span>FMR=10⁻²</span>
              <span>FMR=10⁰</span>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-1">
              FNMR vs FMR (lower is better)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* System status */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { name: 'API Gateway', status: 'healthy', latency: '2ms', detail: 'Port 8000' },
                { name: 'ML Inference', status: 'healthy', latency: '45ms', detail: 'buffalo_l loaded' },
                { name: 'Identity Service', status: 'healthy', latency: '8ms', detail: 'Port 8002' },
                { name: 'Retrieval Service', status: 'healthy', latency: '12ms', detail: 'Port 8003' },
                { name: 'PostgreSQL', status: 'healthy', latency: '1ms', detail: '16.x' },
                { name: 'Qdrant', status: 'healthy', latency: '3ms', detail: 'faces_v1: 3,420 pts' },
                { name: 'Redis', status: 'healthy', latency: '<1ms', detail: '7.x' },
                { name: 'Celery Workers', status: 'healthy', latency: '-', detail: '2 workers, queue=0' },
              ].map((svc) => (
                <TableRow key={svc.name}>
                  <TableCell className="font-medium">{svc.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-400">
                      {svc.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{svc.latency}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{svc.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
