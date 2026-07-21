import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from 'react'
import { fetchAuthenticatedMedia } from '@/lib/api'

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null
  fallback?: ReactNode
}

/**
 * Loads ACL-protected media with Authorization header via blob URL.
 */
export function AuthImage({ src, fallback, alt, ...rest }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    setFailed(false)
    setBlobUrl(null)

    if (!src) {
      setFailed(true)
      return
    }

    fetchAuthenticatedMedia(src)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setBlobUrl(url)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  if (failed || !src) {
    return <>{fallback ?? null}</>
  }

  if (!blobUrl) {
    return (
      <div
        className={`animate-pulse bg-muted ${rest.className || ''}`}
        aria-hidden
      />
    )
  }

  return <img src={blobUrl} alt={alt || ''} {...rest} />
}
