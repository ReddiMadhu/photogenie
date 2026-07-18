import { useState, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Upload,
  Image,
  Users,
  Grid3X3,
  BarChart3,
} from 'lucide-react'

interface Props {
  groupId: string | null
}

// Mock data
const mockAssets = Array.from({ length: 24 }, (_, i) => ({
  id: `asset-${i}`,
  filename: `IMG_${1000 + i}.jpg`,
  status: 'ready' as const,
  face_count: Math.floor(Math.random() * 5) + 1,
}))

export function GroupPage({ groupId }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploads, setUploads] = useState<{ name: string; progress: number }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    simulateUploads(files)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    simulateUploads(files)
  }

  const simulateUploads = (files: File[]) => {
    const newUploads = files.map(f => ({ name: f.name, progress: 0 }))
    setUploads(prev => [...prev, ...newUploads])
    // Simulate progress
    newUploads.forEach((_, idx) => {
      let p = 0
      const interval = setInterval(() => {
        p += Math.random() * 30
        if (p >= 100) {
          p = 100
          clearInterval(interval)
        }
        setUploads(prev => prev.map((u, i) =>
          i === prev.length - newUploads.length + idx ? { ...u, progress: Math.min(p, 100) } : u
        ))
      }, 300)
    })
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

  const group = {
    name: 'Wedding 2024',
    active_image_count: 3420,
    max_active_images: 15000,
    persons: 47,
  }
  const pct = Math.round((group.active_image_count / group.max_active_images) * 100)

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{group.name}</h2>
          <p className="text-muted-foreground mt-1">
            {group.active_image_count.toLocaleString()} images · {group.persons} people identified
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

      <Tabs defaultValue="assets" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="assets" className="cursor-pointer">
            <Image className="h-4 w-4 mr-2" /> Assets
          </TabsTrigger>
          <TabsTrigger value="people" className="cursor-pointer">
            <Users className="h-4 w-4 mr-2" /> People
          </TabsTrigger>
          <TabsTrigger value="upload" className="cursor-pointer">
            <Upload className="h-4 w-4 mr-2" /> Upload
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
                  <Badge variant={u.progress >= 100 ? 'default' : 'secondary'} className="text-[10px]">
                    {u.progress >= 100 ? 'Done' : `${Math.round(u.progress)}%`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Assets Tab */}
        <TabsContent value="assets">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {mockAssets.map((asset) => (
              <div
                key={asset.id}
                className="aspect-square rounded-lg bg-muted flex items-center justify-center text-2xl cursor-pointer border-2 border-transparent hover:border-primary transition-all duration-150 hover:scale-105 group relative overflow-hidden"
              >
                <Image className="h-8 w-8 text-muted-foreground/30" />
                {asset.face_count > 0 && (
                  <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <Users className="h-2.5 w-2.5" /> {asset.face_count}
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* People Tab */}
        <TabsContent value="people">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className="text-center p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all duration-300 cursor-pointer hover:-translate-y-1 group"
              >
                <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center border-2 border-border group-hover:border-primary transition-colors">
                  <Users className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-semibold group-hover:text-primary transition-colors">
                  {i < 5 ? ['Alex Chen', 'Sarah Lee', 'Mike Ross', 'Emma Watson', 'David Kim'][i] : `Person ${i + 1}`}
                </p>
                <p className="text-xs text-muted-foreground">{Math.floor(Math.random() * 40) + 3} photos</p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
