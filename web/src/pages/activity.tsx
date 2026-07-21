import { useMemo } from 'react'
import type { Group } from '@/lib/api'
import type { HistoryItem } from '@/pages/search'
import { Activity, Search, Upload, Users, Link as LinkIcon, AlertTriangle } from 'lucide-react'

interface Props {
  group: Group
}

type EventKind = 'search' | 'upload' | 'people' | 'source' | 'alert'

interface ActivityEvent {
  id: string
  kind: EventKind
  title: string
  detail: string
  time: string
  ts: number
}

function loadSearchEvents(groupId: string): ActivityEvent[] {
  try {
    const items: HistoryItem[] = JSON.parse(localStorage.getItem('search_history') || '[]')
    return items
      .filter((h) => h.groupId === groupId)
      .map((h) => ({
        id: `search-${h.id}`,
        kind: 'search' as const,
        title: 'Search completed',
        detail: `${h.matchCount} match${h.matchCount === 1 ? '' : 'es'} for ${h.topMatchName}`,
        time: relativeTime(h.timestamp),
        ts: new Date(h.timestamp).getTime(),
      }))
  } catch {
    return []
  }
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  return new Date(iso).toLocaleDateString()
}

const kindIcon = {
  search: Search,
  upload: Upload,
  people: Users,
  source: LinkIcon,
  alert: AlertTriangle,
}

export function ActivityPage({ group }: Props) {
  const events = useMemo(() => {
    const searchEvents = loadSearchEvents(group.id)
    // Project-level awareness from live group state
    const synthetic: ActivityEvent[] = [
      {
        id: 'quota',
        kind: 'upload',
        title: `${group.active_image_count.toLocaleString()} photos in project`,
        detail: `${group.quota_remaining.toLocaleString()} remaining · status ${group.status}`,
        time: 'current',
        ts: Date.now(),
      },
    ]
    return [...searchEvents, ...synthetic].sort((a, b) => b.ts - a.ts)
  }, [group])

  const todaySearches = events.filter((e) => e.kind === 'search' && e.ts > Date.now() - 86400000).length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Activity</h2>
        <p className="text-sm text-muted-foreground mt-1">
          What changed in {group.name}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Photos" value={group.active_image_count.toLocaleString()} />
        <Stat label="Searches (24h)" value={todaySearches.toString()} />
        <Stat label="Quota left" value={group.quota_remaining.toLocaleString()} />
        <Stat label="Status" value={group.status} />
      </div>

      <div className="space-y-0">
        {events.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-border/50 rounded-lg">
            <Activity className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No activity yet</p>
            <p className="text-xs mt-1">Uploads and searches will appear here.</p>
          </div>
        ) : (
          events.map((ev) => {
            const Icon = kindIcon[ev.kind]
            return (
              <div
                key={ev.id}
                className="flex items-start gap-3 py-3.5 border-b border-border/60"
              >
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{ev.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ev.detail}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{ev.time}</span>
              </div>
            )
          })
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Full audit history (merges, syncs, calibration) is available from System when the audit API is connected.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className="text-lg font-semibold mt-0.5 capitalize">{value}</p>
    </div>
  )
}
