import DOMPurify from 'dompurify'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

/** Render announcement HTML after sanitising it. */
export function RichText({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }), [html])
  return <div className={cn('prose-announcement', className)} dangerouslySetInnerHTML={{ __html: clean }} />
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(DOMPurify.sanitize(html), 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}
