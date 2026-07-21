import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { api, getAssetImageUrl } from '@/lib/api'
import type { Group, Asset, ConnectorResponse } from '@/lib/api'
import { AuthImage } from '@/components/AuthImage'
import {
  Upload,
  Loader2,
  Trash2,
  AlertTriangle,
  FolderOpen,
  Link as LinkIcon,
} from 'lucide-react'

type Collection = 'all' | 'recent' | 'processing' | 'errors' | 'sources'

interface Props {
  groupId: string
  group: Group
  onGroupUpdated: (g: Group) => void
}

export function UploadsPage({ groupId, group, onGroupUpdated }: Props) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [total, setTotal] = useState(0)
  const [connectors, setConnectors] = useState<ConnectorResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploads, setUploads] = useState<{ name: string; progress: number; error?: string }[]>([])
  const [collection, setCollection] = useState<Collection>('all')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const [asts, conns, grp] = await Promise.all([
      api.listAssets(groupId, 50, 0),
      api.listConnectors(groupId).catch(() => []),
      api.getGroup(groupId),
    ])
    setAssets(asts.assets)
    setTotal(asts.total)
    setConnectors(conns)
    onGroupUpdated(grp)
  }, [groupId, onGroupUpdated])

  useEffect(() => {
    setLoading(true)
    refresh()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [groupId, refresh])

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return
    const entries = files.map((f) => ({ name: f.name, progress: 0 }))
    setUploads((prev) => [...prev, ...entries])
    for (let i = 0; i < files.length; i++) {
      try {
        setUploads((prev) =>
          prev.map((u) => (u.name === files[i].name ? { ...u, progress: 40 } : u)),
        )
        await api.uploadAsset(groupId, files[i])
        setUploads((prev) =>
          prev.map((u) => (u.name === files[i].name ? { ...u, progress: 100 } : u)),
        )
      } catch (err) {
        setUploads((prev) =>
          prev.map((u) =>
            u.name === files[i].name
              ? { ...u, progress: 100, error: err instanceof Error ? err.message : 'Failed' }
              : u,
          ),
        )
      }
    }
    await refresh().catch(() => {})
    setTimeout(() => setUploads([]), 2500)
  }

  const processing = assets.filter((a) => a.status === 'reserved' || a.status === 'processing')
  const failed = assets.filter((a) => a.status === 'failed')
  const ready = assets.filter((a) => a.status === 'ready')

  const visible =
    collection === 'processing' ? processing
      : collection === 'errors' ? failed
        : collection === 'recent' ? ready.slice(0, 24)
          : assets

  const nav: { id: Collection; label: string; count?: number }[] = [
    { id: 'all', label: 'All photos', count: total },
    { id: 'recent', label: 'Recent uploads', count: ready.length },
    { id: 'processing', label: 'Processing', count: processing.length },
    { id: 'errors', label: 'Errors', count: failed.length },
    { id: 'sources', label: 'Sources', count: connectors.length },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Uploads</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add, monitor, and organize media in {group.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="gap-1.5 cursor-pointer"
            onClick={() => setCollection('sources')}
          >
            <LinkIcon className="h-4 w-4" /> Sources
          </Button>
          <Button className="gap-1.5 cursor-pointer" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Upload photos
          </Button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
      />

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {/* Drop zone / processing cards */}
      <div
        className={`rounded-xl border border-dashed p-8 text-center transition-colors cursor-pointer ${
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/10 hover:bg-muted/20'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          uploadFiles(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/')))
        }}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-7 w-7 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm font-medium">Drop photos here to upload</p>
        <p className="text-xs text-muted-foreground mt-1">
          Quota {group.active_image_count.toLocaleString()} / {group.max_active_images.toLocaleString()}
        </p>
      </div>

      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u) => (
            <div key={u.name} className="flex items-center gap-3 text-sm">
              <span className="truncate flex-1">{u.name}</span>
              {u.error ? (
                <span className="text-destructive text-xs">{u.error}</span>
              ) : (
                <Progress value={u.progress} className="w-32 h-1.5" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatusCard
          title="Ready"
          value={ready.length.toString()}
          detail={`${total} total in project`}
        />
        <StatusCard
          title="Processing"
          value={processing.length.toString()}
          detail={processing.length ? 'Indexing faces…' : 'Idle'}
        />
        <StatusCard
          title="Needs attention"
          value={failed.length.toString()}
          detail={failed.length ? 'Review failed uploads' : 'No issues'}
          warn={failed.length > 0}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8">
        <aside className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">
            Collections
          </p>
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCollection(item.id)}
              className={`w-full text-left px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${
                collection === item.id ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              {item.label}
              {item.count != null && (
                <span className="text-muted-foreground ml-1">· {item.count}</span>
              )}
            </button>
          ))}
        </aside>

        <div>
          {collection === 'sources' ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Sources</h3>
              {connectors.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center border border-border/50 rounded-lg">
                  Connect Google Drive from Project settings.
                </p>
              ) : (
                connectors.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-3 border-b border-border">
                    <div>
                      <p className="text-sm font-medium uppercase">{c.kind}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.last_error || c.status}
                      </p>
                    </div>
                    <Badge variant="secondary" className="capitalize text-[10px]">{c.status}</Badge>
                  </div>
                ))
              )}
            </div>
          ) : loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nothing here yet</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {visible.map((asset) => (
                  <div
                    key={asset.id}
                    className="group relative rounded-lg overflow-hidden border border-border bg-card"
                  >
                    <div className="aspect-square bg-muted">
                      {asset.status === 'ready' ? (
                        <AuthImage
                          src={getAssetImageUrl(asset.id)}
                          alt={asset.filename || ''}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
                          {asset.status === 'failed' ? (
                            <AlertTriangle className="h-5 w-5 text-amber-400" />
                          ) : (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          )}
                          <span className="text-[10px] uppercase">{asset.status}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-2 text-xs">
                      <p className="truncate font-medium">{asset.filename || 'Photo'}</p>
                      <p className="text-muted-foreground">
                        {asset.face_count} face{asset.face_count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 cursor-pointer"
                      onClick={async () => {
                        if (!confirm('Delete this photo?')) return
                        await api.deleteAsset(groupId, asset.id)
                        await refresh()
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {collection === 'all' && assets.length < total && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    className="cursor-pointer"
                    disabled={loadingMore}
                    onClick={async () => {
                      setLoadingMore(true)
                      try {
                        const data = await api.listAssets(groupId, 50, assets.length)
                        setAssets((prev) => [...prev, ...data.assets])
                        setTotal(data.total)
                      } finally {
                        setLoadingMore(false)
                      }
                    }}
                  >
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Load more ({assets.length} of {total})
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusCard({
  title,
  value,
  detail,
  warn,
}: {
  title: string
  value: string
  detail: string
  warn?: boolean
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground font-medium">{title}</p>
      <p className={`text-2xl font-semibold mt-1 ${warn ? 'text-amber-400' : ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{detail}</p>
    </div>
  )
}
