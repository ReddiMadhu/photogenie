import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import type { Group, SearchResponse } from '@/lib/api'

import {
  Search,
  Users,
  ArrowRight,
  Timer,
  Database,
  Eye,
  CheckCircle,
  Loader2,
} from 'lucide-react'

interface Props {
  groupId: string | null
  onSelectGroup: (id: string) => void
}

export function SearchPage({ groupId, onSelectGroup }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [queryFile, setQueryFile] = useState<File | null>(null)
  const [queryPreview, setQueryPreview] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch groups for the dropdown
  useEffect(() => {
    api.listGroups()
      .then(data => setGroups(data.groups))
      .catch(() => {})
  }, [])

  const handleFile = (file: File) => {
    setQueryFile(file)
    setQueryPreview(URL.createObjectURL(file))
    setResults(null)
    setError(null)
  }

  const handleSearch = async () => {
    if (!queryFile || !groupId) return
    setSearching(true)
    setError(null)
    try {
      const response = await api.searchFace(groupId, queryFile)
      setResults(response)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
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
            {groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.active_image_count.toLocaleString()} images)
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Error banner */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

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
                <Loader2 className="h-5 w-5 animate-spin" />
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
            <h3 className="text-xl font-semibold">
              {results.results.length > 0 ? 'Results' : 'No Matches Found'}
            </h3>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Timer className="h-3.5 w-3.5" /> {results.search_time_ms}ms
              </span>
              <span className="flex items-center gap-1">
                <Database className="h-3.5 w-3.5" /> {results.total_candidates_scanned.toLocaleString()} scanned
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {results.query_faces_detected} face(s) detected
              </span>
            </div>
          </div>

          {results.results.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="pt-6 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <p>No matching people found in this group.</p>
                <p className="text-sm mt-1">Try a different photo or search in another group.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 stagger">
              {results.results.map((r, i) => (
                <Card key={r.person_id || i} className="glass-card hover:border-primary/30 transition-all duration-300 cursor-pointer group">
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
                      {r.evidence.verifier_score != null && (
                        <Badge
                          variant={r.evidence.verifier_score > 0.9 ? 'default' : 'secondary'}
                          className="font-mono text-xs"
                        >
                          vrf {r.evidence.verifier_score.toFixed(3)}
                        </Badge>
                      )}
                      {r.evidence.quality_score != null && (
                        <Badge
                          variant="outline"
                          className="font-mono text-xs"
                        >
                          q {r.evidence.quality_score.toFixed(2)}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
