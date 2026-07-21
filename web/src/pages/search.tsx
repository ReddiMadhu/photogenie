import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, getAssetImageUrl, resolveMediaUrl } from '@/lib/api'
import type { Group, SearchResponse } from '@/lib/api'
import { AuthImage } from '@/components/AuthImage'

import {
  Search,
  Users,
  ArrowRight,
  Database,
  Eye,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Fingerprint,
  Clock,
  History,
  Trash2,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react'

interface Props {
  groupId: string | null
  onSelectGroup: (id: string) => void
}

export interface HistoryItem {
  id: string
  timestamp: string
  queryThumbnail: string
  topMatchName: string
  topMatchScore: number
  matchCount: number
  projectName: string
  groupId: string
}

// Helper to generate a small base64 image thumbnail for localStorage storage
const generateThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const max_size = 96
        let width = img.width
        let height = img.height
        if (width > height) {
          if (width > max_size) {
            height *= max_size / width
            width = max_size
          }
        } else {
          if (height > max_size) {
            width *= max_size / height
            height = max_size
          }
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.6))
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

// Helper to convert base64 back to a File object for re-running search
function dataURLtoFile(dataurl: string, filename: string) {
  const arr = dataurl.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bstr = atob(arr[arr.length - 1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

export function SearchPage({ groupId, onSelectGroup }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [queryFile, setQueryFile] = useState<File | null>(null)
  const [queryPreview, setQueryPreview] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchStage, setSearchStage] = useState(0) // 0=idle, 1=preparing, 2=searching, 3=finalizing
  const [error, setError] = useState<string | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch groups for the dropdown and load history
  useEffect(() => {
    api.listGroups()
      .then(data => setGroups(data.groups))
      .catch(() => {})

    try {
      const stored = JSON.parse(localStorage.getItem('search_history') || '[]')
      setHistory(stored)
    } catch {}
  }, [])

  // Listen for the custom event dispatched on Ctrl+K
  useEffect(() => {
    const handleFocusSearch = () => {
      fileRef.current?.click()
    }
    window.addEventListener('focus-search-upload', handleFocusSearch)
    return () => window.removeEventListener('focus-search-upload', handleFocusSearch)
  }, [])

  const handleFile = (file: File) => {
    setQueryFile(file)
    setQueryPreview(URL.createObjectURL(file))
    setResults(null)
    setError(null)
    setExpandedIdx(null)
  }

  const handleHistoryClick = (item: HistoryItem) => {
    try {
      const file = dataURLtoFile(item.queryThumbnail, `search-${item.id}.jpg`)
      onSelectGroup(item.groupId)
      setQueryFile(file)
      setQueryPreview(item.queryThumbnail)
      setResults(null)
      setError(null)
      setExpandedIdx(null)
    } catch (err) {
      console.error(err)
    }
  }

  const handleClearHistory = () => {
    localStorage.removeItem('search_history')
    setHistory([])
  }

  const handleSearch = async () => {
    if (!queryFile || !groupId) return
    setSearching(true)
    setError(null)
    setExpandedIdx(null)
    setResults(null)
    setSearchStage(1) // Preparing

    // Stage 2 after brief delay
    const stageTimer = setTimeout(() => setSearchStage(2), 500)

    try {
      const response = await api.searchFace(groupId, queryFile)
      clearTimeout(stageTimer)
      setSearchStage(3) // Finalizing
      // Brief pause to show finalizing stage before revealing results
      await new Promise(r => setTimeout(r, 300))
      setResults(response)

      // Add to search history
      try {
        const topResult = response.results[0]
        const thumbnail = await generateThumbnail(queryFile)
        const historyItem: HistoryItem = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          queryThumbnail: thumbnail,
          topMatchName: topResult?.person_name || 'Unnamed person',
          topMatchScore: topResult?.score || 0,
          matchCount: response.results.length,
          projectName: groups.find(g => g.id === groupId)?.name || 'Project',
          groupId,
        }
        setHistory(prev => {
          const updated = [historyItem, ...prev].slice(0, 10)
          localStorage.setItem('search_history', JSON.stringify(updated))
          return updated
        })
      } catch (err) {
        console.error(err)
      }
    } catch (err: any) {
      clearTimeout(stageTimer)
      setError(err.message)
    } finally {
      setSearching(false)
      setSearchStage(0)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Find a Person</h2>
        <p className="text-muted-foreground mt-1">
          Drop a photo to find every image they appear in
        </p>
      </div>

      {/* Group selector */}
      <Card className="glass-card">
        <CardContent className="pt-6 flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Searching in:</span>
          <select
            className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm"
            value={groupId || ''}
            onChange={(e) => onSelectGroup(e.target.value)}
          >
            <option value="">Choose a project…</option>
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
              <h3 className="text-lg font-semibold">Drop a photo here</h3>
              <p className="text-sm text-muted-foreground mt-1">
                A clear, front-facing photo gives the best results
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
                Find This Person
              </>
            )}
          </Button>

          {/* Search progress stages */}
          {searching && (
            <div className="space-y-2 animate-fade-in-up">
              <SearchStage stage={1} currentStage={searchStage} label="Preparing search" />
              <SearchStage stage={2} currentStage={searchStage} label="Searching your photos" />
              <SearchStage stage={3} currentStage={searchStage} label="Finalizing results" />
            </div>
          )}

          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary/60" />
              Finds faces even in large group photos
            </div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary/60" />
              Searches across all your photos instantly
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary/60" />
              Results ranked by match accuracy
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-4 animate-fade-in-up">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">
              {results.results.length > 0
                ? `Found ${results.results.length} matching ${results.results.length === 1 ? 'person' : 'people'}`
                : 'No matches found'}
            </h3>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>in {(results.search_time_ms / 1000).toFixed(1)} seconds</span>
              <span title={`${results.total_candidates_scanned.toLocaleString()} photos compared · ${results.query_faces_detected} face(s) detected in query`} className="cursor-help border-b border-dotted border-muted-foreground/30">
                ⓘ Details
              </span>
            </div>
          </div>

          {results.results.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="pt-8 pb-8">
                <div className="text-center mb-6">
                  <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-lg font-medium">No matches found</p>
                  <p className="text-sm text-muted-foreground mt-1">We searched but couldn't find a confident match. Here's what you can try:</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-xl mx-auto text-sm">
                  <div className="text-center space-y-1 p-3 rounded-lg bg-muted/30">
                    <span className="text-lg">📷</span>
                    <p className="font-medium">Use a different photo</p>
                    <p className="text-xs text-muted-foreground">A clearer, front-facing photo works best</p>
                  </div>
                  <div className="text-center space-y-1 p-3 rounded-lg bg-muted/30">
                    <span className="text-lg">🔍</span>
                    <p className="font-medium">Try another project</p>
                    <p className="text-xs text-muted-foreground">They might be in a different collection</p>
                  </div>
                  <div className="text-center space-y-1 p-3 rounded-lg bg-muted/30">
                    <span className="text-lg">📁</span>
                    <p className="font-medium">Add more photos</p>
                    <p className="text-xs text-muted-foreground">More photos means more chances to match</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 stagger">
              {results.results.map((r, i) => {
                const isExpanded = expandedIdx === i
                const ev = r.evidence[0]
                const isBestMatch = i === 0

                // Confidence label — NO percentages, NO raw scores
                const confidenceLabel = r.score >= 0.75
                  ? 'Strong match'
                  : r.score >= 0.60
                    ? 'Likely match'
                    : r.score >= 0.45
                      ? 'Possible match'
                      : 'Weak match'

                const confidenceColor = r.score >= 0.75
                  ? 'text-emerald-400'
                  : r.score >= 0.60
                    ? 'text-amber-400'
                    : r.score >= 0.45
                      ? 'text-orange-400'
                      : 'text-red-400'

                const barGradient = r.score >= 0.75
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : r.score >= 0.60
                    ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                    : r.score >= 0.45
                      ? 'linear-gradient(90deg, #f97316, #fb923c)'
                      : 'linear-gradient(90deg, #ef4444, #f87171)'

                const barWidth = Math.max(15, Math.min(r.score * 100, 100))

                return (
                  <Card
                    key={r.person_id || i}
                    className={`glass-card transition-all duration-300 cursor-pointer ${
                      isBestMatch
                        ? 'border-primary/40 shadow-lg shadow-primary/5 best-match-card'
                        : isExpanded
                          ? 'border-primary/30 shadow-md shadow-primary/5'
                          : 'hover:border-primary/30'
                    }`}
                    onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  >
                    <CardContent className="pt-5">
                      {/* Best Match badge */}
                      {isBestMatch && (
                        <div className="flex items-center gap-2 mb-3">
                          <Badge className="bg-primary/15 text-primary border-primary/30 text-xs gap-1">
                            ⭐ Best Match
                          </Badge>
                        </div>
                      )}

                      {/* Main row */}
                      <div className="flex items-center gap-5">
                        {/* Face comparison: query → match */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {/* Query face — user's uploaded photo */}
                          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center border-2 border-border overflow-hidden">
                            {queryPreview ? (
                              <img src={queryPreview} alt="Query" className="w-full h-full object-cover" />
                            ) : (
                              <Search className="h-5 w-5 text-muted-foreground/40" />
                            )}
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
                          {/* Matched person — prefer face crop */}
                          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center border-2 border-border overflow-hidden">
                            {ev?.matched_crop_url ? (
                              <AuthImage
                                src={resolveMediaUrl(ev.matched_crop_url)}
                                alt={r.person_name || 'Match'}
                                className="w-full h-full object-cover"
                                fallback={<Users className="h-5 w-5 text-muted-foreground/40" />}
                              />
                            ) : r.asset_ids && r.asset_ids.length > 0 ? (
                              <AuthImage
                                src={getAssetImageUrl(r.asset_ids[0])}
                                alt={r.person_name || 'Match'}
                                className="w-full h-full object-cover"
                                fallback={<Users className="h-5 w-5 text-muted-foreground/40" />}
                              />
                            ) : (
                              <Users className="h-5 w-5 text-muted-foreground/40" />
                            )}
                          </div>
                        </div>

                        {/* Info + confidence */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate" style={{ color: isExpanded ? 'hsl(var(--primary))' : undefined }}>
                            {r.person_name || 'Unnamed person'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {r.person_name
                              ? `${r.person_name} appears in ${r.face_count} photos`
                              : `Appears in ${r.face_count} photos`}
                          </p>

                          {/* Confidence bar */}
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden max-w-[140px]">
                              <div
                                className="h-full rounded-full confidence-fill"
                                style={{
                                  width: `${barWidth}%`,
                                  background: barGradient,
                                }}
                              />
                            </div>
                            <span className={`text-xs font-medium ${confidenceColor}`}>
                              {confidenceLabel}
                            </span>
                          </div>
                        </div>

                        {/* Expand toggle */}
                        <div className="text-muted-foreground/60">
                          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                      </div>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <div className="mt-5 pt-5 border-t border-border/50 animate-fade-in-up">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Matched photos */}
                            <div className="space-y-3">
                              <h4 className="text-sm font-medium flex items-center gap-2">
                                <ImageIcon className="h-4 w-4 text-primary/60" />
                                Matched Photos
                              </h4>
                              {r.asset_ids && r.asset_ids.length > 0 ? (
                                <div>
                                  <div className="grid grid-cols-3 gap-2">
                                    {r.asset_ids.slice(0, 6).map((assetId, ai) => (
                                      <div
                                        key={ai}
                                        className="aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted relative group/thumb"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <AuthImage
                                          src={getAssetImageUrl(assetId)}
                                          alt={`Match ${ai + 1}`}
                                          className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-110"
                                          loading="lazy"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  {r.asset_ids.length > 6 && (
                                    <p className="text-xs text-muted-foreground mt-2">
                                      +{r.asset_ids.length - 6} more photos
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  {r.face_count} photo(s) matched in this project
                                </p>
                              )}
                            </div>

                            {/* Technical details — progressive disclosure */}
                            <div className="space-y-3">
                              <h4 className="text-sm font-medium flex items-center gap-2">
                                <Fingerprint className="h-4 w-4 text-primary/60" />
                                Technical Details
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
                                  <span className="text-muted-foreground">Photos Matched</span>
                                  <span className="font-mono">{r.face_count}</span>
                                </div>
                                {r.person_id && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Person ID</span>
                                    <span className="font-mono text-xs">{r.person_id}</span>
                                  </div>
                                )}
                              </div>
                              {groupId && ev?.query_face_id && ev?.matched_face_id && (
                                <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="gap-1.5 cursor-pointer"
                                    onClick={async () => {
                                      try {
                                        await api.submitFeedback(
                                          groupId,
                                          ev.query_face_id!,
                                          ev.matched_face_id!,
                                          true,
                                        )
                                      } catch { /* ignore */ }
                                    }}
                                  >
                                    <ThumbsUp className="h-3.5 w-3.5" /> Same person
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5 cursor-pointer"
                                    onClick={async () => {
                                      try {
                                        await api.submitFeedback(
                                          groupId,
                                          ev.query_face_id!,
                                          ev.matched_face_id!,
                                          false,
                                        )
                                      } catch { /* ignore */ }
                                    }}
                                  >
                                    <ThumbsDown className="h-3.5 w-3.5" /> Different
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
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

      {/* Search History */}
      {!results && !searching && history.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-border/40 animate-fade-in-up">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <History className="h-5 w-5 text-primary/60" /> Recent Searches
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearHistory}
              className="text-xs text-muted-foreground hover:text-destructive cursor-pointer gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear History
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
            {history.map((item) => (
              <Card
                key={item.id}
                onClick={() => handleHistoryClick(item)}
                className="glass-card cursor-pointer hover:border-primary/30 transition-all duration-300 hover:-translate-y-0.5 group"
              >
                <CardContent className="pt-4 pb-4 flex items-center gap-4">
                  {/* Query preview image */}
                  <div className="h-12 w-12 rounded-full overflow-hidden border border-border flex-shrink-0">
                    <img src={item.queryThumbnail} alt="Query" className="w-full h-full object-cover" />
                  </div>
                  
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                      Top Match: {item.topMatchName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {item.matchCount} {item.matchCount === 1 ? 'match' : 'matches'} found in {item.projectName}
                    </p>
                  </div>
                  
                  {/* Timestamp & action */}
                  <div className="text-right flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-xs text-primary/70 group-hover:text-primary transition-colors font-medium">
                      Search again
                    </span>
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

/** Animated search stage indicator */
function SearchStage({ stage, currentStage, label }: { stage: number; currentStage: number; label: string }) {
  const isComplete = currentStage > stage
  const isActive = currentStage === stage
  const isPending = currentStage < stage

  return (
    <div className={`flex items-center gap-2 text-sm transition-all duration-300 ${
      isPending ? 'text-muted-foreground/40' : isActive ? 'text-foreground' : 'text-muted-foreground'
    }`}>
      {isComplete ? (
        <CheckCircle className="h-4 w-4 text-emerald-400" />
      ) : isActive ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : (
        <div className="h-4 w-4 rounded-full border border-muted-foreground/20" />
      )}
      <span>{label}</span>
    </div>
  )
}
