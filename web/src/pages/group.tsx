import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, getAssetImageUrl, resolveMediaUrl } from '@/lib/api'
import type { Group, Person, ConnectorResponse, Asset } from '@/lib/api'
import { AuthImage } from '@/components/AuthImage'
import {
  Upload,
  Image,
  Users,
  BarChart3,
  Loader2,
  Link,
  FolderOpen,
  ArrowRight,
  Trash2,
  RefreshCw,
} from 'lucide-react'

interface Props {
  groupId: string | null
  onSelectGroup?: (id: string) => void
}

export function GroupPage({ groupId, onSelectGroup }: Props) {
  const [group, setGroup] = useState<Group | null>(null)
  const [persons, setPersons] = useState<Person[]>([])
  const [connectors, setConnectors] = useState<ConnectorResponse[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetsTotal, setAssetsTotal] = useState(0)
  const [loadingMoreAssets, setLoadingMoreAssets] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploads, setUploads] = useState<{ name: string; progress: number; error?: string }[]>([])
  const [uploadSummary, setUploadSummary] = useState<{ total: number; success: number; failed: number } | null>(null)
  const [folderId, setFolderId] = useState('')
  const [credentialsText, setCredentialsText] = useState('')
  const [enabling, setEnabling] = useState(false)
  const [connectorError, setConnectorError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!groupId) return
    setLoading(true)
    Promise.all([
      api.getGroup(groupId),
      api.listPersons(groupId).catch(() => ({ persons: [], total: 0 })),
      api.listConnectors(groupId).catch(() => []),
      api.listAssets(groupId).catch(() => ({ assets: [], total: 0 })),
    ])
      .then(([grp, ppl, conns, asts]) => {
        setGroup(grp)
        setPersons(ppl.persons)
        setConnectors(conns)
        setAssets(asts.assets)
        setAssetsTotal(asts.total)
        setError(null)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [groupId])

  const loadMoreAssets = async () => {
    if (!groupId || loadingMoreAssets || assets.length >= assetsTotal) return
    setLoadingMoreAssets(true)
    try {
      const data = await api.listAssets(groupId, 50, assets.length)
      setAssets(prev => [...prev, ...data.assets])
      setAssetsTotal(data.total)
    } catch {
    } finally {
      setLoadingMoreAssets(false)
    }
  }

  const handleDeleteAsset = async (assetId: string) => {
    if (!groupId) return
    if (!confirm('Delete this photo? Faces and vectors will be removed.')) return
    try {
      await api.deleteAsset(groupId, assetId)
      setAssets(prev => prev.filter(a => a.id !== assetId))
      setAssetsTotal(t => Math.max(0, t - 1))
      const grp = await api.getGroup(groupId)
      setGroup(grp)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    uploadFiles(files)
  }, [groupId])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    uploadFiles(files)
  }

  const uploadFiles = async (files: File[]) => {
    if (!groupId) return
    setUploadSummary(null)
    const newUploads = files.map(f => ({ name: f.name, progress: 0 }))
    setUploads(prev => [...prev, ...newUploads])

    let success = 0
    let failed = 0

    for (let i = 0; i < files.length; i++) {
      try {
        setUploads(prev => prev.map((u, idx) =>
          idx === prev.length - files.length + i ? { ...u, progress: 50 } : u
        ))
        await api.uploadAsset(groupId, files[i])
        success++
        setUploads(prev => prev.map((u, idx) =>
          idx === prev.length - files.length + i ? { ...u, progress: 100 } : u
        ))
      } catch (err: any) {
        failed++
        setUploads(prev => prev.map((u, idx) =>
          idx === prev.length - files.length + i ? { ...u, progress: 100, error: err.message } : u
        ))
      }
    }

    setUploadSummary({ total: files.length, success, failed })

    // Refresh group data, assets and persons after uploads
    try {
      const grp = await api.getGroup(groupId)
      setGroup(grp)
      const asts = await api.listAssets(groupId)
      setAssets(asts.assets)
      const ppl = await api.listPersons(groupId)
      setPersons(ppl.persons)
    } catch {}
  }

  const handleEnableGDrive = async () => {
    if (!groupId || !folderId.trim() || !credentialsText.trim()) return
    setEnabling(true)
    setConnectorError(null)
    try {
      const parsedCreds = JSON.parse(credentialsText)
      const newConn = await api.createConnector('gdrive', groupId, {
        folder_id: folderId,
        credentials: parsedCreds,
      })
      setConnectors([...connectors, newConn])
      setFolderId('')
      setCredentialsText('')
    } catch (err: any) {
      setConnectorError(err.message || 'Failed to parse JSON credentials')
    } finally {
      setEnabling(false)
    }
  }

  if (!groupId) {
    return <ProjectSelector onSelect={onSelectGroup} />
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !group) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <p className="text-destructive">{error || 'Group not found'}</p>
        </div>
      </div>
    )
  }

  const pct = Math.round((group.active_image_count / group.max_active_images) * 100)

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{group.name}</h2>
          <p className="text-muted-foreground mt-1">
            {group.active_image_count.toLocaleString()} images · {persons.length} people identified
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="gap-2 cursor-pointer">
            <BarChart3 className="h-4 w-4" /> Analytics
          </Button>
        </div>
      </div>

      {/* Quota bar */}
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Quota Usage</span>
            <span className="text-sm text-muted-foreground">
              {group.active_image_count.toLocaleString()} / {group.max_active_images.toLocaleString()} images
            </span>
          </div>
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {(group.max_active_images - group.active_image_count).toLocaleString()} photos remaining
            {pct > 90 && <Badge variant="destructive" className="ml-2 text-[10px]">Near Limit</Badge>}
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="upload" className="cursor-pointer">
            <Upload className="h-4 w-4 mr-2" /> Upload
          </TabsTrigger>
          <TabsTrigger value="people" className="cursor-pointer">
            <Users className="h-4 w-4 mr-2" /> People ({persons.length})
          </TabsTrigger>
          <TabsTrigger value="assets" className="cursor-pointer">
            <Image className="h-4 w-4 mr-2" /> Photos
          </TabsTrigger>
          <TabsTrigger value="connectors" className="cursor-pointer">
            <Link className="h-4 w-4 mr-2" /> Sources ({connectors.length})
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-6">
          <div
            className={`drop-zone rounded-xl p-12 text-center cursor-pointer transition-all ${dragging ? 'active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
            />
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold">Drop images here</h3>
            <p className="text-sm text-muted-foreground mt-2">
              or click to browse · JPEG, PNG, HEIC, WebP
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              We'll automatically find every face and organize people.
            </p>
          </div>

          {uploadSummary && (
            <Card className="border-emerald-500/20 bg-emerald-500/5 mt-4">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-emerald-400">✅ All done!</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Uploaded {uploadSummary.success} of {uploadSummary.total} {uploadSummary.total === 1 ? 'photo' : 'photos'} successfully
                    {uploadSummary.failed > 0 && ` (${uploadSummary.failed} failed)`}. Organizing faces in the background…
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setUploadSummary(null)
                    setUploads([])
                  }}
                  className="text-xs hover:bg-emerald-500/10 cursor-pointer"
                >
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          )}

          {uploads.length > 0 && !uploadSummary && (
            <div className="space-y-3 mt-4">
              <h4 className="text-sm font-medium">Upload Progress</h4>
              {uploads.map((u, i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-card border border-border">
                  <Image className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{u.name}</p>
                    <Progress value={u.progress} className="h-1 mt-1.5" />
                  </div>
                  <Badge
                    variant={u.error ? 'destructive' : u.progress >= 100 ? 'default' : 'secondary'}
                    className="text-[10px]"
                  >
                    {u.error ? 'Error' : u.progress >= 100 ? 'Done' : `${Math.round(u.progress)}%`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* People Tab */}
        <TabsContent value="people">
          {persons.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-lg font-medium">No people identified yet</p>
              <p className="text-sm mt-1">Upload photos to start finding and organizing faces.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {persons.map((person) => (
                <div
                  key={person.id}
                  className="text-center p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all duration-300 cursor-pointer hover:-translate-y-1 group"
                >
                  <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center border-2 border-border group-hover:border-primary transition-colors overflow-hidden">
                    {person.rep_face_url ? (
                      <AuthImage
                        src={person.rep_face_url.startsWith('http') ? person.rep_face_url : `${window.location.protocol}//${window.location.hostname}:8000${person.rep_face_url}`}
                        alt={person.name || 'Person'}
                        className="h-full w-full object-cover"
                        fallback={<Users className="h-6 w-6 text-muted-foreground/40" />}
                      />
                    ) : (
                      <Users className="h-6 w-6 text-muted-foreground/40" />
                    )}
                  </div>
                  <p className="text-sm font-semibold group-hover:text-primary transition-colors">
                    {person.name || 'Unknown'}
                  </p>
                  <p className="text-xs text-muted-foreground">{person.face_count} photos</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Assets Tab */}
        <TabsContent value="assets" className="space-y-4">
          {assets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Image className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-lg font-medium">No photos uploaded yet</p>
              <p className="text-sm mt-1">Drag and drop photos to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 transition-all duration-300 relative group"
                >
                  <div className="aspect-square bg-muted relative overflow-hidden flex items-center justify-center">
                    {asset.status === 'ready' && asset.id ? (
                      <AuthImage
                        src={getAssetImageUrl(asset.id)}
                        alt={asset.filename || 'Asset'}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        loading="lazy"
                      />
                    ) : (
                      <div className="text-center p-3">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary/40 mb-1" />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{asset.status}</span>
                      </div>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      onClick={() => handleDeleteAsset(asset.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="p-3 bg-muted/20 border-t border-border/50 text-xs">
                    <p className="font-medium truncate" title={asset.filename}>{asset.filename || 'Unnamed Image'}</p>
                    <p className="text-muted-foreground text-[10px] mt-0.5">
                      {asset.face_count} face{asset.face_count === 1 ? '' : 's'} detected
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {assets.length < assetsTotal && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" onClick={loadMoreAssets} disabled={loadingMoreAssets} className="cursor-pointer">
                  {loadingMoreAssets ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Load more ({assets.length} of {assetsTotal})
                </Button>
              </div>
            )}
          )}
        </TabsContent>

        {/* Connectors Tab */}
        <TabsContent value="connectors" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in-up">
            {/* Setup Form */}
            <Card className="glass-card">
              <CardContent className="pt-6 space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Link className="h-5 w-5 text-primary" /> Connect Google Drive
                </h3>
                <p className="text-sm text-muted-foreground">
                  Sync photos automatically from a Google Drive folder.
                </p>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Folder ID</label>
                  <input
                    type="text"
                    placeholder="e.g. 1aBCdEfGhIjKlMnOpQrStUvWxYz"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Service Account Key (JSON)</label>
                  <textarea
                    placeholder='{ "type": "service_account", ... }'
                    rows={6}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                    value={credentialsText}
                    onChange={(e) => setCredentialsText(e.target.value)}
                  />
                </div>

                {connectorError && (
                  <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg">
                    {connectorError}
                  </p>
                )}

                <Button
                  className="w-full cursor-pointer"
                  onClick={handleEnableGDrive}
                  disabled={enabling || !folderId.trim() || !credentialsText.trim()}
                >
                  {enabling ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Connecting…</> : 'Connect'}
                </Button>
              </CardContent>
            </Card>

            {/* Status / Existing Connectors */}
            <Card className="glass-card">
              <CardContent className="pt-6 space-y-4">
                <h3 className="text-lg font-semibold">Configured Sources</h3>
                {connectors.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Link className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-sm font-medium">No sources configured</p>
                    <p className="text-xs mt-1">Connect Google Drive to sync files in the background.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {connectors.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-4 rounded-lg bg-card border border-border gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary font-semibold uppercase flex-shrink-0">
                            {c.kind.substring(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold uppercase">{c.kind} Connector</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {c.status === 'configured' && 'Configured — awaiting first sync'}
                              {c.status === 'synced' && `Last sync: ${c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : 'recently'}`}
                              {c.status === 'error' && (c.last_error || 'Sync error')}
                              {c.status === 'active' && 'Active'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {c.kind === 'gdrive' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 cursor-pointer"
                              onClick={async () => {
                                try {
                                  await api.syncConnector(c.id)
                                  const refreshed = await api.listConnectors(groupId!)
                                  setConnectors(refreshed)
                                } catch (err) {
                                  setConnectorError(err instanceof Error ? err.message : 'Sync failed')
                                }
                              }}
                            >
                              <RefreshCw className="h-3.5 w-3.5" /> Sync now
                            </Button>
                          )}
                          <Badge
                            variant="secondary"
                            className={`capitalize ${
                              c.status === 'error'
                                ? 'bg-destructive/10 text-destructive'
                                : c.status === 'synced' || c.status === 'active'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-amber-500/10 text-amber-400'
                            }`}
                          >
                            {c.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Inline project selector shown when no project is active — replaces dead-end. */
function ProjectSelector({ onSelect }: { onSelect?: (id: string) => void }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.listGroups()
      .then(data => setGroups(data.groups))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Projects</h2>
        <p className="text-muted-foreground mt-1">Choose a project to manage photos and people</p>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading projects…
        </div>
      ) : groups.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="pt-6 text-center text-muted-foreground">
            <FolderOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-lg font-medium">No projects yet</p>
            <p className="text-sm mt-1">Create your first project from the Home page to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
          {groups.map(g => (
            <Card
              key={g.id}
              className="glass-card cursor-pointer hover:border-primary/30 transition-all duration-300 hover:-translate-y-1 group"
              onClick={() => onSelect?.(g.id)}
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-lg group-hover:text-primary transition-colors">{g.name}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{g.active_image_count.toLocaleString()} photos</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">{g.status}</Badge>
                </div>
                <div className="mt-4 flex items-center text-xs text-primary/70 group-hover:text-primary transition-colors">
                  Open <ArrowRight className="h-3 w-3 ml-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
