import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import type { Group, Person, ConnectorResponse } from '@/lib/api'
import {
  Upload,
  Image,
  Users,
  Grid3X3,
  BarChart3,
  Loader2,
  Link,
} from 'lucide-react'

interface Props {
  groupId: string | null
}

export function GroupPage({ groupId }: Props) {
  const [group, setGroup] = useState<Group | null>(null)
  const [persons, setPersons] = useState<Person[]>([])
  const [connectors, setConnectors] = useState<ConnectorResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploads, setUploads] = useState<{ name: string; progress: number; error?: string }[]>([])
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
    ])
      .then(([grp, ppl, conns]) => {
        setGroup(grp)
        setPersons(ppl.persons)
        setConnectors(conns)
        setError(null)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [groupId])

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
    const newUploads = files.map(f => ({ name: f.name, progress: 0 }))
    setUploads(prev => [...prev, ...newUploads])

    for (let i = 0; i < files.length; i++) {
      try {
        setUploads(prev => prev.map((u, idx) =>
          idx === prev.length - files.length + i ? { ...u, progress: 50 } : u
        ))
        await api.uploadAsset(groupId, files[i])
        setUploads(prev => prev.map((u, idx) =>
          idx === prev.length - files.length + i ? { ...u, progress: 100 } : u
        ))
      } catch (err: any) {
        setUploads(prev => prev.map((u, idx) =>
          idx === prev.length - files.length + i ? { ...u, progress: 100, error: err.message } : u
        ))
      }
    }
    // Refresh group data after uploads
    try {
      const grp = await api.getGroup(groupId)
      setGroup(grp)
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
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <Grid3X3 className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <h3 className="text-xl font-semibold">No Group Selected</h3>
          <p className="text-muted-foreground">Select a group from the dashboard to view details.</p>
        </div>
      </div>
    )
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
            {(group.max_active_images - group.active_image_count).toLocaleString()} slots remaining
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
            <Image className="h-4 w-4 mr-2" /> Assets
          </TabsTrigger>
          <TabsTrigger value="connectors" className="cursor-pointer">
            <Link className="h-4 w-4 mr-2" /> Connectors ({connectors.length})
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
              Upload triggers SAHI detection, ArcFace embedding, quality scoring, and person assignment.
            </p>
          </div>

          {uploads.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Processing Queue</h4>
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
              <p className="text-sm mt-1">Upload images to start detecting and clustering faces.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {persons.map((person) => (
                <div
                  key={person.id}
                  className="text-center p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all duration-300 cursor-pointer hover:-translate-y-1 group"
                >
                  <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center border-2 border-border group-hover:border-primary transition-colors">
                    <Users className="h-6 w-6 text-muted-foreground/40" />
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
        <TabsContent value="assets">
          <div className="text-center py-12 text-muted-foreground">
            <Image className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-lg font-medium">{group.active_image_count} images in this group</p>
            <p className="text-sm mt-1">Asset thumbnails will appear here after processing.</p>
          </div>
        </TabsContent>

        {/* Connectors Tab */}
        <TabsContent value="connectors" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in-up">
            {/* Setup Form */}
            <Card className="glass-card">
              <CardContent className="pt-6 space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Link className="h-5 w-5 text-primary" /> Setup Google Drive Connector
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
                  {enabling ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Connecting…</> : 'Enable Connector'}
                </Button>
              </CardContent>
            </Card>

            {/* Status / Existing Connectors */}
            <Card className="glass-card">
              <CardContent className="pt-6 space-y-4">
                <h3 className="text-lg font-semibold">Active Connectors</h3>
                {connectors.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Link className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-sm font-medium">No connectors configured</p>
                    <p className="text-xs mt-1">Configure Google Drive to start syncing files in the background.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {connectors.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-4 rounded-lg bg-card border border-border">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary font-semibold uppercase">
                            {c.kind.substring(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold uppercase">{c.kind} Connector</p>
                            <p className="text-xs text-muted-foreground">Active sync source</p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 capitalize">
                          {c.status}
                        </Badge>
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
