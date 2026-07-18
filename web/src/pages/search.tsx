import { useState, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import {
  Search,
  Users,
  ArrowRight,
  Timer,
  Database,
  Eye,
  CheckCircle,
} from 'lucide-react'

// Mock results
const mockResults = [
  { person_id: 'p1', person_name: 'Alex Chen', score: 0.9423, face_count: 28, verifier: 0.961, quality: 0.87 },
  { person_id: 'p2', person_name: 'Sarah Lee', score: 0.8891, face_count: 15, verifier: 0.912, quality: 0.92 },
  { person_id: 'p3', person_name: null, score: 0.7234, face_count: 3, verifier: 0.745, quality: 0.65 },
  { person_id: 'p4', person_name: 'Mike Ross', score: 0.6812, face_count: 42, verifier: 0.698, quality: 0.78 },
]

interface Props {
  groupId: string | null
  onSelectGroup: (id: string) => void
}

export function SearchPage({ groupId, onSelectGroup }: Props) {
  const [queryFile, setQueryFile] = useState<File | null>(null)
  const [queryPreview, setQueryPreview] = useState<string | null>(null)
  const [results, setResults] = useState<typeof mockResults | null>(null)
  const [searching, setSearching] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    setQueryFile(file)
    setQueryPreview(URL.createObjectURL(file))
    setResults(null)
  }

  const handleSearch = () => {
    if (!queryFile) return
    setSearching(true)
    // Simulated search
    setTimeout(() => {
      setResults(mockResults)
      setSearching(false)
    }, 1200)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Face Search</h2>
        <p className="text-muted-foreground mt-1">
          Upload a photo to find matching people within a search group
        </p>
      </div>

      {/* Group selector */}
      <Card className="glass-card">
        <CardContent className="pt-6 flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Search in:</span>
          <select
            className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm"
            value={groupId || ''}
            onChange={(e) => onSelectGroup(e.target.value)}
          >
            <option value="">Select a group…</option>
            <option value="1">Wedding 2024 (3,420 images)</option>
            <option value="2">Corporate Headshots (890 images)</option>
            <option value="3">Event Photography (12,450 images)</option>
          </select>
        </CardContent>
      </Card>

      {/* Query zone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upload */}
        <div
          className={`drop-zone rounded-xl p-8 text-center cursor-pointer min-h-[280px] flex flex-col items-center justify-center`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file?.type.startsWith('image/')) handleFile(file)
          }}
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {queryPreview ? (
            <div className="space-y-4">
              <img
                src={queryPreview}
                alt="Query"
                className="max-h-48 rounded-lg border border-border mx-auto object-contain"
              />
              <p className="text-sm text-muted-foreground">{queryFile?.name}</p>
            </div>
          ) : (
            <>
              <Search className="h-12 w-12 mb-4 text-muted-foreground/40" />
              <h3 className="text-lg font-semibold">Drop a query photo</h3>
              <p className="text-sm text-muted-foreground mt-1">
                The best-quality face will be used for search
              </p>
            </>
          )}
        </div>

        {/* Search action */}
        <div className="flex flex-col justify-center space-y-6">
          <Button
            size="lg"
            className="w-full py-6 text-base gap-3 cursor-pointer"
            disabled={!queryFile || !groupId || searching}
            onClick={handleSearch}
          >
            {searching ? (
              <>
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Searching…
              </>
            ) : (
              <>
                <Search className="h-5 w-5" />
                Search Faces
              </>
            )}
          </Button>

          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary/60" />
              SAHI tiled detection for small faces
            </div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary/60" />
              ANN oversample → person set aggregation
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary/60" />
              Quality-weighted scoring with evidence
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-4 animate-fade-in-up">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Results</h3>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Timer className="h-3.5 w-3.5" /> 47ms
              </span>
              <span className="flex items-center gap-1">
                <Database className="h-3.5 w-3.5" /> 3,420 scanned
              </span>
            </div>
          </div>

          <div className="space-y-3 stagger">
            {results.map((r, i) => (
              <Card key={r.person_id} className="glass-card hover:border-primary/30 transition-all duration-300 cursor-pointer group">
                <CardContent className="pt-5 flex items-center gap-5">
                  {/* Rank */}
                  <div className="text-2xl font-bold text-muted-foreground/30 w-8 text-center">
                    {i + 1}
                  </div>

                  {/* Crops: query → match */}
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center border border-border text-xl">
                      🔍
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
                    <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center border border-border">
                      <Users className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <p className="font-semibold group-hover:text-primary transition-colors">
                      {r.person_name || 'Unknown Person'}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.face_count} photos in group</p>
                  </div>

                  {/* Scores */}
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-mono text-xs">
                      cos {r.score.toFixed(3)}
                    </Badge>
                    <Badge
                      variant={r.verifier > 0.9 ? 'default' : 'secondary'}
                      className="font-mono text-xs"
                    >
                      vrf {r.verifier.toFixed(3)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="font-mono text-xs"
                    >
                      q {r.quality.toFixed(2)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
