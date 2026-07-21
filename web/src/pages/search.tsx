import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, getAssetImageUrl, resolveMediaUrl } from '@/lib/api'
import type { SearchResponse } from '@/lib/api'
import { AuthImage } from '@/components/AuthImage'
import {
  Search,
  Users,
  ArrowRight,
  Loader2,
  Fingerprint,
  History,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  Camera,
  Image as ImageIcon,
} from 'lucide-react'

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

const generateThumbnail = (file: File): Promise<string> =>
  new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const max = 96
        let { width, height } = img
        if (width > height) {
          if (width > max) { height *= max / width; width = max }
        } else if (height > max) {
          width *= max / height; height = max
        }
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.6))
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })

function dataURLtoFile(dataurl: string, filename: string) {
  const arr = dataurl.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bstr = atob(arr[arr.length - 1])
  const u8arr = new Uint8Array(bstr.length)
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i)
  return new File([u8arr], filename, { type: mime })
}

interface Props {
  groupId: string
  projectName: string
}

export function SearchPage({ groupId, projectName }: Props) {
  const [queryFile, setQueryFile] = useState<File | null>(null)
  const [queryPreview, setQueryPreview] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const stored: HistoryItem[] = JSON.parse(localStorage.getItem('search_history') || '[]')
      setHistory(stored.filter((h) => h.groupId === groupId))
    } catch {
      setHistory([])
    }
    setResults(null)
    setQueryFile(null)
    setQueryPreview(null)
    setError(null)
  }, [groupId])

  useEffect(() => {
    const focus = () => fileRef.current?.click()
    window.addEventListener('focus-search-upload', focus)
    return () => window.removeEventListener('focus-search-upload', focus)
  }, [])

  const setFile = (file: File | null) => {
    setQueryFile(file)
    setResults(null)
    setError(null)
    setFeedbackMsg(null)
    if (queryPreview) URL.revokeObjectURL(queryPreview)
    setQueryPreview(file ? URL.createObjectURL(file) : null)
  }

  const runSearch = async (file: File) => {
    setSearching(true)
    setError(null)
    setSelectedIdx(0)
    setFeedbackMsg(null)
    try {
      const response = await api.searchFace(groupId, file)
      setResults(response)
      const top = response.results[0]
      const thumbnail = await generateThumbnail(file)
      const item: HistoryItem = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        queryThumbnail: thumbnail,
        topMatchName: top?.person_name || 'Unnamed person',
        topMatchScore: top?.score || 0,
        matchCount: response.results.length,
        projectName,
        groupId,
      }
      const all: HistoryItem[] = JSON.parse(localStorage.getItem('search_history') || '[]')
      const updated = [item, ...all.filter((h) => h.id !== item.id)].slice(0, 30)
      localStorage.setItem('search_history', JSON.stringify(updated))
      setHistory(updated.filter((h) => h.groupId === groupId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleSearch = () => {
    if (queryFile) runSearch(queryFile)
  }

  const rerunHistory = (item: HistoryItem) => {
    const file = dataURLtoFile(item.queryThumbnail, 'query.jpg')
    setFile(file)
    runSearch(file)
  }

  const clearHistory = () => {
    const all: HistoryItem[] = JSON.parse(localStorage.getItem('search_history') || '[]')
    localStorage.setItem('search_history', JSON.stringify(all.filter((h) => h.groupId !== groupId)))
    setHistory([])
  }

  const confidenceLabel = (score: number) => {
    if (score >= 0.75) return { label: 'Strong match', color: 'text-emerald-400' }
    if (score >= 0.6) return { label: 'Likely match', color: 'text-amber-400' }
    if (score >= 0.45) return { label: 'Possible match', color: 'text-orange-400' }
    return { label: 'Weak match', color: 'text-red-400' }
  }

  const selected = results?.results[selectedIdx]
  const ev = selected?.evidence?.[0]

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setFile(f)
        }}
      />

      {!results && !searching && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-10">
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Find a person</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Add a clear photo. PhotoGenic searches only this project.
              </p>
            </div>

            <div
              className="rounded-xl border border-dashed border-border bg-muted/20 min-h-[240px] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith('image/'))
                if (f) setFile(f)
              }}
              onPaste={(e) => {
                const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
                const f = item?.getAsFile()
                if (f) setFile(f)
              }}
              tabIndex={0}
            >
              {queryPreview ? (
                <img src={queryPreview} alt="Query" className="max-h-48 rounded-lg object-contain" />
              ) : (
                <>
                  <Search className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium">Drop, paste, or choose a face photo</p>
                  <p className="text-xs text-muted-foreground">JPEG, PNG, HEIC · one clear face works best</p>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" className="gap-1.5 cursor-pointer" onClick={() => fileRef.current?.click()}>
                <ImageIcon className="h-3.5 w-3.5" /> Choose photo
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 cursor-pointer" disabled title="Coming soon">
                <Camera className="h-3.5 w-3.5" /> Camera
              </Button>
              {queryFile && (
                <Button className="gap-1.5 cursor-pointer ml-auto" onClick={handleSearch}>
                  Search
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" /> Recent searches
              </h3>
              {history.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs cursor-pointer" onClick={clearHistory}>
                  <Trash2 className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center border border-border/50 rounded-lg">
                Searches in this project will appear here for quick re-run.
              </p>
            ) : (
              <div className="space-y-1">
                {history.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => rerunHistory(item)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer text-left"
                  >
                    <img src={item.queryThumbnail} alt="" className="h-10 w-10 rounded-full object-cover border border-border" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.topMatchName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {item.matchCount} match{item.matchCount === 1 ? '' : 'es'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {searching && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Searching {projectName}…</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {results && !searching && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            {queryPreview && (
              <img src={queryPreview} alt="Query" className="h-12 w-12 rounded-full object-cover border-2 border-primary/40" />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold">Search results</h2>
              <p className="text-xs text-muted-foreground">
                {results.results.length} {results.results.length === 1 ? 'person' : 'people'} ·{' '}
                {results.total_candidates_scanned} candidates · {results.search_time_ms} ms
              </p>
            </div>
            <Button variant="secondary" className="cursor-pointer" onClick={() => { setResults(null); setFile(null) }}>
              New search
            </Button>
          </div>

          {results.results.length === 0 ? (
            <p className="text-center text-muted-foreground py-16">No matches found in this project.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Best match
                </p>
                {results.results.map((r, i) => {
                  const conf = confidenceLabel(r.score)
                  const crop = r.evidence?.[0]?.matched_crop_url
                  return (
                    <button
                      key={r.person_id || i}
                      type="button"
                      onClick={() => setSelectedIdx(i)}
                      className={`w-full flex items-center gap-4 px-3 py-3 rounded-lg text-left transition-colors cursor-pointer ${
                        selectedIdx === i ? 'bg-muted/60 ring-1 ring-primary/30' : 'hover:bg-muted/30'
                      }`}
                    >
                      <div className="h-12 w-12 rounded-full overflow-hidden bg-muted border border-border shrink-0">
                        {crop ? (
                          <AuthImage
                            src={resolveMediaUrl(crop)}
                            alt=""
                            className="h-full w-full object-cover"
                            fallback={<Users className="h-5 w-5 m-auto text-muted-foreground/40" />}
                          />
                        ) : r.asset_ids?.[0] ? (
                          <AuthImage
                            src={getAssetImageUrl(r.asset_ids[0])}
                            alt=""
                            className="h-full w-full object-cover"
                            fallback={<Users className="h-5 w-5 m-auto text-muted-foreground/40" />}
                          />
                        ) : (
                          <Users className="h-5 w-5 m-3.5 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{r.person_name || 'Unnamed person'}</p>
                          {i === 0 && <Badge className="text-[10px] bg-primary/15 text-primary border-0">Best</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{r.face_count} photos</p>
                      </div>
                      <span className={`text-xs font-medium shrink-0 ${conf.color}`}>{conf.label}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    </button>
                  )
                })}
              </div>

              {selected && (
                <div className="rounded-xl border border-border p-5 space-y-4 h-fit sticky top-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Fingerprint className="h-4 w-4 text-primary" /> Why this matched
                  </div>
                  <div className="flex items-center gap-3">
                    {queryPreview && (
                      <img src={queryPreview} alt="" className="h-14 w-14 rounded-full object-cover border border-border" />
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div className="h-14 w-14 rounded-full overflow-hidden bg-muted border border-border">
                      {ev?.matched_crop_url ? (
                        <AuthImage
                          src={resolveMediaUrl(ev.matched_crop_url)}
                          alt=""
                          className="h-full w-full object-cover"
                          fallback={<Users className="h-5 w-5 m-4 text-muted-foreground/40" />}
                        />
                      ) : (
                        <Users className="h-5 w-5 m-4 text-muted-foreground/40" />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Similarity</span>
                      <span className="font-mono">{ev?.cosine_similarity?.toFixed(4) ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Verifier</span>
                      <span className="font-mono">{ev?.verifier_score?.toFixed(4) ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Quality</span>
                      <span className="font-mono">{ev?.quality_score?.toFixed(4) ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Photos</span>
                      <span className="font-mono">{selected.face_count}</span>
                    </div>
                  </div>
                  {selected.asset_ids?.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      {selected.asset_ids.slice(0, 6).map((id) => (
                        <div key={id} className="aspect-square rounded-md overflow-hidden bg-muted">
                          <AuthImage
                            src={getAssetImageUrl(id)}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {ev?.query_face_id && ev?.matched_face_id && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1.5 cursor-pointer"
                        onClick={async () => {
                          try {
                            await api.submitFeedback(groupId, ev.query_face_id!, ev.matched_face_id!, true)
                            setFeedbackMsg('Marked as same person')
                          } catch { /* ignore */ }
                        }}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" /> Same
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 cursor-pointer"
                        onClick={async () => {
                          try {
                            await api.submitFeedback(groupId, ev.query_face_id!, ev.matched_face_id!, false)
                            setFeedbackMsg('Marked as different')
                          } catch { /* ignore */ }
                        }}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" /> Different
                      </Button>
                    </div>
                  )}
                  {feedbackMsg && <p className="text-xs text-muted-foreground">{feedbackMsg}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
