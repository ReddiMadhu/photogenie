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
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Fingerprint,
  ShieldCheck,
  Sparkles,
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
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
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
    setExpandedIdx(null)
  }

  const handleSearch = async () => {
    if (!queryFile || !groupId) return
    setSearching(true)
    setError(null)
    setExpandedIdx(null)
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
          className="drop-zone rounded-xl p-8 text-center cursor-pointer min-h-[280px] flex flex-col items-center justify-center"
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
              {results.results.map((r, i) => {
                const isExpanded = expandedIdx === i
                const ev = r.evidence[0]
                const confidence = r.score >= 0.7 ? 'high' : r.score >= 0.5 ? 'medium' : 'low'
                const confidenceColor = confidence === 'high'
                  ? 'text-emerald-400'
                  : confidence === 'medium'
                    ? 'text-amber-400'
                    : 'text-red-400'

                return (
                  <Card
                    key={r.person_id || i}
                    className={`glass-card transition-all duration-300 cursor-pointer ${
                      isExpanded ? 'border-primary/40 shadow-lg shadow-primary/5' : 'hover:border-primary/30'
                    }`}
                    onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  >
                    <CardContent className="pt-5">
                      {/* Main row */}
                      <div className="flex items-center gap-5">
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
                          <p className="font-semibold transition-colors" style={{ color: isExpanded ? 'hsl(var(--primary))' : undefined }}>
                            {r.person_name || 'Unknown Person'}
                          </p>
                          <p className="text-xs text-muted-foreground">{r.face_count} photos in group</p>
                        </div>

                        {/* Scores */}
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="font-mono text-xs">
                            cos {r.score.toFixed(3)}
                          </Badge>
                          {ev?.verifier_score != null && (
                            <Badge
                              variant={ev.verifier_score > 0.9 ? 'default' : 'secondary'}
                              className="font-mono text-xs"
                            >
                              vrf {ev.verifier_score.toFixed(3)}
                            </Badge>
                          )}
                          {ev?.quality_score != null && (
                            <Badge variant="outline" className="font-mono text-xs">
                              q {ev.quality_score.toFixed(2)}
                            </Badge>
                          )}
                        </div>

                        {/* Expand toggle */}
                        <div className="text-muted-foreground/50">
                          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                      </div>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <div className="mt-5 pt-5 border-t border-border/50 animate-fade-in-up">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Confidence meter */}
                            <div className="space-y-3">
                              <h4 className="text-sm font-medium flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-primary/60" />
                                Confidence
                              </h4>
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Match Score</span>
                                  <span className={confidenceColor}>{(r.score * 100).toFixed(1)}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${Math.min(r.score * 100, 100)}%`,
                                      background: confidence === 'high'
                                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                                        : confidence === 'medium'
                                          ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                          : 'linear-gradient(90deg, #ef4444, #f87171)',
                                    }}
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground capitalize">
                                  {confidence} confidence match
                                </p>
                              </div>
                            </div>

                            {/* Evidence details */}
                            <div className="space-y-3">
                              <h4 className="text-sm font-medium flex items-center gap-2">
                                <Fingerprint className="h-4 w-4 text-primary/60" />
                                Evidence Details
                              </h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Cosine Similarity</span>
                                  <span className="font-mono">{ev?.cosine_similarity?.toFixed(4) ?? '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Verifier Score</span>
                                  <span className="font-mono">{ev?.verifier_score?.toFixed(4) ?? '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Quality Score</span>
                                  <span className="font-mono">{ev?.quality_score?.toFixed(4) ?? '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Face Count</span>
                                  <span className="font-mono">{r.face_count}</span>
                                </div>
                              </div>
                            </div>

                            {/* Matched assets */}
                            <div className="space-y-3">
                              <h4 className="text-sm font-medium flex items-center gap-2">
                                <ImageIcon className="h-4 w-4 text-primary/60" />
                                Matched Assets
                              </h4>
                              {r.asset_ids && r.asset_ids.length > 0 ? (
                                <div className="space-y-1.5">
                                  {r.asset_ids.slice(0, 5).map((assetId, ai) => (
                                    <div
                                      key={ai}
                                      className="text-xs font-mono text-muted-foreground bg-muted/50 rounded px-2 py-1.5 truncate"
                                      title={assetId}
                                    >
                                      <Sparkles className="h-3 w-3 inline mr-1.5 text-primary/40" />
                                      {assetId.slice(0, 8)}…{assetId.slice(-4)}
                                    </div>
                                  ))}
                                  {r.asset_ids.length > 5 && (
                                    <p className="text-xs text-muted-foreground">
                                      +{r.asset_ids.length - 5} more assets
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  {r.face_count} face(s) matched across group
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Person ID */}
                          {r.person_id && (
                            <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                Person ID: <span className="font-mono">{r.person_id}</span>
                              </span>
                              <Badge variant="outline" className={`text-xs ${confidenceColor}`}>
                                {confidence} match
                              </Badge>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
